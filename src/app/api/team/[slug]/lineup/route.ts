import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { optimizeLineup, type AvailablePlayer } from "@/lib/lineup-optimizer";

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

    return NextResponse.json({ ok: true, lineupId });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
