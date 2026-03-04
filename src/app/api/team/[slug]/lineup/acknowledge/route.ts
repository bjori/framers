import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sendEmail, emailTemplate } from "@/lib/email";
import { track } from "@/lib/analytics";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const body = (await request.json()) as { matchId: string; response: "confirm" | "decline" };
  const db = await getDB();

  const team = await db.prepare("SELECT id, name FROM teams WHERE slug = ?").bind(slug).first<{ id: string; name: string }>();
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const lineup = await db.prepare("SELECT id, status FROM lineups WHERE match_id = ?").bind(body.matchId).first<{ id: string; status: string }>();
  if (!lineup || lineup.status !== "confirmed") {
    return NextResponse.json({ error: "No confirmed lineup for this match" }, { status: 400 });
  }

  const slot = await db.prepare(
    "SELECT id, position, is_alternate FROM lineup_slots WHERE lineup_id = ? AND player_id = ? AND is_alternate = 0"
  ).bind(lineup.id, session.player_id).first<{ id: string; position: string; is_alternate: number }>();

  if (!slot) return NextResponse.json({ error: "You are not in this lineup" }, { status: 400 });

  const now = new Date().toISOString();
  const ackValue = body.response === "confirm" ? 1 : 0;

  await db.prepare(
    "UPDATE lineup_slots SET acknowledged = ?, acknowledged_at = ? WHERE id = ?"
  ).bind(ackValue, now, slot.id).run();

  if (body.response === "decline") {
    await db.prepare("UPDATE lineup_slots SET is_alternate = -1 WHERE id = ?").bind(slot.id).run();

    const matchId = body.matchId;
    await db.prepare(
      "INSERT INTO availability (player_id, match_id, status, responded_at) VALUES (?, ?, 'no', ?) ON CONFLICT(player_id, match_id) DO UPDATE SET status = 'no', responded_at = ?"
    ).bind(session.player_id, matchId, now, now).run();

    // Notify captains
    const match = await db.prepare(
      "SELECT opponent_team, match_date FROM league_matches WHERE id = ?"
    ).bind(body.matchId).first<{ opponent_team: string; match_date: string }>();

    const captains = (await db.prepare(
      `SELECT p.email, p.name FROM team_memberships tm
       JOIN players p ON p.id = tm.player_id
       WHERE tm.team_id = ? AND tm.role IN ('captain','co-captain')`
    ).bind(team.id).all<{ email: string; name: string }>()).results;

    const dateStr = match
      ? new Date(match.match_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
      : "";

    for (const c of captains) {
      await sendEmail({
        to: c.email,
        subject: `${session.name} can't make it — ${match?.opponent_team ?? "upcoming match"}`,
        html: emailTemplate(
          `<p><strong>${session.name}</strong> has declined their lineup spot (<strong>${slot.position}</strong>) for the match against <strong>${match?.opponent_team}</strong> on <strong>${dateStr}</strong>.</p>
           <p>You may need to update the lineup and notify an alternate.</p>`,
          {
            heading: "Lineup Change Needed",
            ctaUrl: `https://framers.app/team/${slug}/match/${body.matchId}`,
            ctaLabel: "Update Lineup",
          }
        ),
      });
    }
  }

  const trackEvent = body.response === "confirm" ? "lineup_confirmed_player" : "lineup_declined_player";
  track(trackEvent, { playerId: session.player_id, detail: `match:${body.matchId},pos:${slot.position}` });

  return NextResponse.json({ ok: true, response: body.response });
}
