import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { optimizeLineup, type AvailablePlayer } from "@/lib/lineup-optimizer";
import { sendEmail } from "@/lib/email";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getSession();
  if (!session || session.is_admin !== 1) {
    return NextResponse.json({ error: "Admin/captain only" }, { status: 403 });
  }

  const { slug } = await params;
  const body = (await request.json()) as { matchId: string; action: "generate" | "confirm" | "save"; slots?: { position: string; playerId: string }[] };
  const db = await getDB();

  const team = await db.prepare("SELECT * FROM teams WHERE slug = ?").bind(slug)
    .first<{ id: string; match_format: string; min_matches_goal: number }>();
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const match = await db.prepare("SELECT * FROM league_matches WHERE id = ? AND team_id = ?")
    .bind(body.matchId, team.id)
    .first<{ id: string }>();
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const format = JSON.parse(team.match_format || '{"singles":1,"doubles":3}');

  if (body.action === "generate") {
    const available = (
      await db
        .prepare(
          `SELECT p.id, p.name, p.singles_elo as singlesElo, p.doubles_elo as doublesElo,
                  a.status as rsvp_status, a.is_before_deadline,
                  p.reliability_score,
                  (SELECT count(*) FROM lineup_slots ls
                   JOIN lineups l ON l.id = ls.lineup_id
                   JOIN league_matches lm ON lm.id = l.match_id
                   WHERE ls.player_id = p.id AND lm.team_id = ?) as matchesPlayed,
                  COALESCE(tm2.preferences, '{}') as preferences
           FROM team_memberships tm2
           JOIN players p ON p.id = tm2.player_id
           LEFT JOIN availability a ON a.player_id = p.id AND a.match_id = ?
           WHERE tm2.team_id = ? AND tm2.active = 1
             AND (a.status IS NULL OR a.status != 'no')`
        )
        .bind(team.id, body.matchId, team.id)
        .all<{
          id: string; name: string; singlesElo: number; doublesElo: number;
          rsvp_status: string | null; is_before_deadline: number;
          reliability_score: number; matchesPlayed: number; preferences: string;
        }>()
    ).results;

    const players: AvailablePlayer[] = available.map((p) => {
      const prefs = JSON.parse(p.preferences || "{}");
      let rsvpStatus: AvailablePlayer["rsvpStatus"] = "call_last";
      if (p.rsvp_status === "yes") rsvpStatus = "yes";
      else if (p.rsvp_status === "maybe") rsvpStatus = "maybe";
      else if (prefs.doublesOnly) rsvpStatus = "doubles_only";

      return {
        id: p.id,
        name: p.name,
        singlesElo: p.singlesElo,
        doublesElo: p.doublesElo,
        matchesPlayedThisSeason: p.matchesPlayed,
        minMatchesGoal: team.min_matches_goal,
        preferences: { doublesOnly: prefs.doublesOnly },
        rsvpStatus,
        rsvpBeforeDeadline: p.is_before_deadline === 1,
        reliabilityScore: p.reliability_score,
      };
    });

    const result = optimizeLineup(players, format);
    return NextResponse.json({ lineup: result });
  }

  if (body.action === "save" || body.action === "confirm") {
    if (!body.slots || body.slots.length === 0) {
      return NextResponse.json({ error: "No lineup slots provided" }, { status: 400 });
    }

    // Upsert lineup
    let lineupId = (await db.prepare("SELECT id FROM lineups WHERE match_id = ?").bind(body.matchId).first<{ id: string }>())?.id;

    if (lineupId) {
      await db.prepare("DELETE FROM lineup_slots WHERE lineup_id = ?").bind(lineupId).run();
      await db.prepare("UPDATE lineups SET status = ?, confirmed_at = ? WHERE id = ?")
        .bind(body.action === "confirm" ? "confirmed" : "draft", body.action === "confirm" ? new Date().toISOString() : null, lineupId).run();
    } else {
      lineupId = crypto.randomUUID();
      await db.prepare("INSERT INTO lineups (id, match_id, status, generated_at, confirmed_at) VALUES (?,?,?,?,?)")
        .bind(lineupId, body.matchId, body.action === "confirm" ? "confirmed" : "draft", new Date().toISOString(), body.action === "confirm" ? new Date().toISOString() : null).run();
    }

    await db.batch(
      body.slots.map((s, i) =>
        db.prepare("INSERT INTO lineup_slots (id, lineup_id, position, player_id, is_alternate) VALUES (?,?,?,?,?)")
          .bind(crypto.randomUUID(), lineupId, s.position, s.playerId, i >= (format.singles + format.doubles * 2) ? 1 : 0)
      )
    );

    if (body.action === "confirm") {
      const matchInfo = await db.prepare(
        "SELECT opponent_team, match_date, is_home FROM league_matches WHERE id = ?"
      ).bind(body.matchId).first<{ opponent_team: string; match_date: string; is_home: number }>();

      if (matchInfo) {
        const dateStr = new Date(matchInfo.match_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
        const playerIds = body.slots.map((s) => s.playerId);
        const uniqueIds = [...new Set(playerIds)];

        const players = (
          await db.prepare(
            `SELECT id, name, email FROM players WHERE id IN (${uniqueIds.map(() => "?").join(",")})`
          ).bind(...uniqueIds).all<{ id: string; name: string; email: string }>()
        ).results;

        const lineupHtml = body.slots.map((s) => {
          const p = players.find((pl) => pl.id === s.playerId);
          return `<li><strong>${s.position}</strong>: ${p?.name ?? "TBD"}</li>`;
        }).join("");

        for (const p of players) {
          const myPositions = body.slots.filter((s) => s.playerId === p.id).map((s) => s.position).join(", ");
          await sendEmail({
            to: p.email,
            subject: `Lineup confirmed: ${matchInfo.opponent_team} on ${dateStr}`,
            html: `
              <h2>You're playing, ${p.name.split(" ")[0]}!</h2>
              <p>The lineup for ${matchInfo.opponent_team} on <strong>${dateStr}</strong> (${matchInfo.is_home ? "Home" : "Away"}) has been confirmed.</p>
              <p>Your position(s): <strong>${myPositions}</strong></p>
              <h3>Full Lineup:</h3>
              <ul>${lineupHtml}</ul>
              <p><a href="https://framers.app/team/${slug}/match/${body.matchId}" style="display:inline-block;padding:12px 24px;background:#0c4a6e;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">View Match Details</a></p>
              <p>Good luck!<br>Greenbrook Framers</p>
            `,
          });
        }
      }
    }

    return NextResponse.json({ ok: true, lineupId });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
