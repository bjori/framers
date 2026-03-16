import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sendEmail, sendEmailBatch, emailTemplate, matchThreadHeaders } from "@/lib/email";
import { track } from "@/lib/analytics";

const POSITION_LABELS: Record<string, string> = {
  D1A: "Doubles 1", D1B: "Doubles 1", D2A: "Doubles 2", D2B: "Doubles 2",
  D3A: "Doubles 3", D3B: "Doubles 3", S1: "Singles 1", S2: "Singles 2",
};

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

  // Check if all starters have confirmed — send "lineup locked" to whole team
  if (body.response === "confirm") {
    const ackStatus = await db.prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN acknowledged = 1 THEN 1 ELSE 0 END) as confirmed
       FROM lineup_slots WHERE lineup_id = ? AND is_alternate = 0`
    ).bind(lineup.id).first<{ total: number; confirmed: number }>();

    if (ackStatus && ackStatus.confirmed === ackStatus.total) {
      // Dedup: use a version key based on the set of player IDs in the lineup
      const starterIds = (await db.prepare(
        "SELECT player_id FROM lineup_slots WHERE lineup_id = ? AND is_alternate = 0 ORDER BY position"
      ).bind(lineup.id).all<{ player_id: string }>()).results.map((r) => r.player_id);
      const lineupHash = starterIds.join(",").slice(0, 100);
      const dedupDetail = `${body.matchId}|${lineupHash}`;

      const alreadySent = (await db.prepare(
        "SELECT COUNT(*) as cnt FROM app_events WHERE event = 'lineup_all_confirmed' AND detail = ?"
      ).bind(dedupDetail).first<{ cnt: number }>())?.cnt ?? 0;

      if (alreadySent === 0) {
        await sendLineupLockedEmail(db, body.matchId, lineup.id, team, slug);
        await db.prepare("INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)")
          .bind("lineup_all_confirmed", dedupDetail, now).run();
      }
    }
  }

  const trackEvent = body.response === "confirm" ? "lineup_confirmed_player" : "lineup_declined_player";
  track(trackEvent, { playerId: session.player_id, detail: `match:${body.matchId},pos:${slot.position}` });

  return NextResponse.json({ ok: true, response: body.response });
}

async function sendLineupLockedEmail(
  db: D1Database,
  matchId: string,
  lineupId: string,
  team: { id: string; name: string },
  slug: string,
) {
  const matchInfo = await db.prepare(
    "SELECT opponent_team, match_date, match_time, location, notes, is_home FROM league_matches WHERE id = ?"
  ).bind(matchId).first<{
    opponent_team: string; match_date: string; match_time: string | null;
    location: string | null; notes: string | null; is_home: number;
  }>();
  if (!matchInfo) return;

  const dateStr = new Date(matchInfo.match_date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  let timeStr = "";
  if (matchInfo.match_time) {
    const [h, m] = matchInfo.match_time.split(":").map(Number);
    timeStr = `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
  }

  const slots = (await db.prepare(
    `SELECT ls.position, ls.is_alternate, p.name
     FROM lineup_slots ls JOIN players p ON p.id = ls.player_id
     WHERE ls.lineup_id = ? ORDER BY ls.position`
  ).bind(lineupId).all<{ position: string; is_alternate: number; name: string }>()).results;

  const starters = slots.filter((s) => s.is_alternate === 0);
  const alternates = slots.filter((s) => s.is_alternate === 1);

  const lineupRows = starters.map((s) => {
    const label = POSITION_LABELS[s.position] || s.position;
    return `<tr><td style="padding: 6px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #475569;">${label}</td><td style="padding: 6px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${s.name}</td></tr>`;
  }).join("");

  const altHtml = alternates.length > 0
    ? `<p style="margin: 8px 0 0 0; font-size: 13px; color: #64748b;">Alternates: ${alternates.map((a) => a.name).join(", ")}</p>`
    : "";

  const logisticsHtml = `
    <table role="presentation" style="width: 100%; margin: 16px 0; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; border-spacing: 0;">
      <tr>
        <td style="padding: 12px 16px; border-right: 1px solid #e2e8f0; width: 50%;">
          <p style="margin: 0 0 2px 0; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px;">When</p>
          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #1e293b;">${dateStr}${timeStr ? ` · ${timeStr}` : ""}</p>
        </td>
        <td style="padding: 12px 16px; width: 50%;">
          <p style="margin: 0 0 2px 0; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px;">Where</p>
          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #1e293b;">${matchInfo.location || "TBD"}</p>
        </td>
      </tr>
      ${matchInfo.notes ? `<tr><td colspan="2" style="padding: 8px 16px; border-top: 1px solid #e2e8f0;"><p style="margin: 0; font-size: 13px; color: #475569;">${matchInfo.notes}</p></td></tr>` : ""}
    </table>`;

  const lineupTableHtml = `
    <table role="presentation" style="width: 100%; margin: 12px 0; border: 1px solid #e2e8f0; border-radius: 8px; border-spacing: 0; border-collapse: collapse;">
      <tr style="background: #f1f5f9;">
        <th style="padding: 8px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Position</th>
        <th style="padding: 8px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Player</th>
      </tr>
      ${lineupRows}
    </table>
    ${altHtml}`;

  const matchUrl = `https://framers.app/team/${slug}/match/${matchId}`;
  const subject = `Lineup locked: ${team.name} vs ${matchInfo.opponent_team}`;

  const teamMembers = (await db.prepare(
    `SELECT p.id, p.email, p.name FROM team_memberships tm
     JOIN players p ON p.id = tm.player_id
     WHERE tm.team_id = ? AND tm.active = 1`
  ).bind(team.id).all<{ id: string; email: string; name: string }>()).results;

  const batch = teamMembers.map((m) => ({
    to: m.email,
    subject,
    html: emailTemplate(
      `<h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0c4a6e;">Lineup locked, ${m.name.split(" ")[0]}!</h2>
       <p>All players have confirmed for <strong>${matchInfo.opponent_team}</strong> (${matchInfo.is_home ? "Home" : "Away"}).</p>
       ${logisticsHtml}
       <h3 style="font-size: 14px; color: #64748b; margin: 20px 0 8px 0;">Confirmed Lineup</h3>
       ${lineupTableHtml}`,
      { heading: "Lineup Locked", ctaUrl: matchUrl, ctaLabel: "View Match" }
    ),
    headers: matchThreadHeaders(matchId),
  }));

  await sendEmailBatch(batch);
}
