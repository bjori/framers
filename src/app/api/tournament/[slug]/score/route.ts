import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { calculateElo } from "@/lib/elo";
import { track } from "@/lib/analytics";

interface ScoreBody {
  matchId: string;
  score1Sets: number[];
  score2Sets: number[];
  winnerId: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const body = (await request.json()) as ScoreBody;
  const { matchId, score1Sets, score2Sets, winnerId } = body;

  if (!matchId || !score1Sets || !score2Sets || !winnerId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db = await getDB();

  const tournament = await db
    .prepare("SELECT id, match_type FROM tournaments WHERE slug = ?")
    .bind(slug)
    .first<{ id: string; match_type: string }>();

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  const match = await db
    .prepare(
      `SELECT tm.*, tp1.player_id as p1_player_id, tp2.player_id as p2_player_id
       FROM tournament_matches tm
       LEFT JOIN tournament_participants tp1 ON tp1.id = tm.participant1_id
       LEFT JOIN tournament_participants tp2 ON tp2.id = tm.participant2_id
       WHERE tm.id = ? AND tm.tournament_id = ?`
    )
    .bind(matchId, tournament.id)
    .first<{
      id: string; participant1_id: string; participant2_id: string;
      p1_player_id: string; p2_player_id: string; status: string;
    }>();

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const isParticipant = session.player_id === match.p1_player_id || session.player_id === match.p2_player_id;
  const isAdmin = session.is_admin === 1;
  if (!isParticipant && !isAdmin) {
    return NextResponse.json({ error: "Only match participants or admins can submit scores" }, { status: 403 });
  }

  if (winnerId !== match.participant1_id && winnerId !== match.participant2_id) {
    return NextResponse.json({ error: "Invalid winner" }, { status: 400 });
  }

  const isEdit = match.status === "completed";

  await db
    .prepare(
      `UPDATE tournament_matches
       SET score1_sets = ?, score2_sets = ?, winner_participant_id = ?,
           status = 'completed', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE id = ?`
    )
    .bind(JSON.stringify(score1Sets), JSON.stringify(score2Sets), winnerId, matchId)
    .run();

  // Log change
  await db
    .prepare(
      `INSERT INTO match_changelog (id, match_type, match_id, changed_by_player_id, changed_by_name, field_name, old_value, new_value)
       VALUES (?, 'tournament', ?, ?, ?, 'score', ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      matchId,
      session.player_id,
      session.name,
      isEdit ? "edited" : "none",
      JSON.stringify({ score1Sets, score2Sets, winnerId })
    )
    .run();

  // ELO update
  const isDoublesMatch = tournament.match_type === "doubles";
  const eloType = isDoublesMatch ? "doubles" : "singles";
  const eloCol = isDoublesMatch ? "doubles_elo" : "singles_elo";

  const winnerPlayerId = winnerId === match.participant1_id ? match.p1_player_id : match.p2_player_id;
  const loserPlayerId = winnerId === match.participant1_id ? match.p2_player_id : match.p1_player_id;

  const winner = await db.prepare(`SELECT ${eloCol} as elo FROM players WHERE id = ?`).bind(winnerPlayerId).first<{ elo: number }>();
  const loser = await db.prepare(`SELECT ${eloCol} as elo FROM players WHERE id = ?`).bind(loserPlayerId).first<{ elo: number }>();

  if (winner && loser) {
    const winnerMatchCount = (
      await db.prepare("SELECT count(*) as cnt FROM elo_history WHERE player_id = ? AND type = ?").bind(winnerPlayerId, eloType).first<{ cnt: number }>()
    )?.cnt ?? 0;
    const loserMatchCount = (
      await db.prepare("SELECT count(*) as cnt FROM elo_history WHERE player_id = ? AND type = ?").bind(loserPlayerId, eloType).first<{ cnt: number }>()
    )?.cnt ?? 0;

    const wSets = winnerId === match.participant1_id ? score1Sets : score2Sets;
    const lSets = winnerId === match.participant1_id ? score2Sets : score1Sets;
    let setsWon = 0, setsLost = 0;
    for (let i = 0; i < wSets.length; i++) {
      if (wSets[i] > lSets[i]) setsWon++;
      else setsLost++;
    }

    const elo = calculateElo(
      winner.elo, loser.elo, true,
      winnerMatchCount, loserMatchCount,
      { setsWonByWinner: setsWon, setsWonByLoser: setsLost }
    );

    const stmts = [
      db.prepare(`UPDATE players SET ${eloCol} = ? WHERE id = ?`).bind(elo.newRatingA, winnerPlayerId),
      db.prepare(`UPDATE players SET ${eloCol} = ? WHERE id = ?`).bind(elo.newRatingB, loserPlayerId),
      db.prepare(
        "INSERT INTO elo_history (id, player_id, type, old_elo, new_elo, delta, source, source_id) VALUES (?,?,?,?,?,?,?,?)"
      ).bind(crypto.randomUUID(), winnerPlayerId, eloType, winner.elo, elo.newRatingA, elo.deltaA, "tournament_match", matchId),
      db.prepare(
        "INSERT INTO elo_history (id, player_id, type, old_elo, new_elo, delta, source, source_id) VALUES (?,?,?,?,?,?,?,?)"
      ).bind(crypto.randomUUID(), loserPlayerId, eloType, loser.elo, elo.newRatingB, elo.deltaB, "tournament_match", matchId),
    ];

    if (isDoublesMatch) {
      const winnerPart = await db.prepare("SELECT partner_id FROM tournament_participants WHERE id = ?")
        .bind(winnerId === match.participant1_id ? match.participant1_id : match.participant2_id).first<{ partner_id: string | null }>();
      const loserPart = await db.prepare("SELECT partner_id FROM tournament_participants WHERE id = ?")
        .bind(winnerId === match.participant1_id ? match.participant2_id : match.participant1_id).first<{ partner_id: string | null }>();

      if (winnerPart?.partner_id) {
        const wp = await db.prepare("SELECT doubles_elo FROM players WHERE id = ?").bind(winnerPart.partner_id).first<{ doubles_elo: number }>();
        if (wp) {
          stmts.push(
            db.prepare("UPDATE players SET doubles_elo = ? WHERE id = ?").bind(wp.doubles_elo + elo.deltaA, winnerPart.partner_id),
            db.prepare(
              "INSERT INTO elo_history (id, player_id, type, old_elo, new_elo, delta, source, source_id) VALUES (?,?,?,?,?,?,?,?)"
            ).bind(crypto.randomUUID(), winnerPart.partner_id, "doubles", wp.doubles_elo, wp.doubles_elo + elo.deltaA, elo.deltaA, "tournament_match", matchId)
          );
        }
      }
      if (loserPart?.partner_id) {
        const lp = await db.prepare("SELECT doubles_elo FROM players WHERE id = ?").bind(loserPart.partner_id).first<{ doubles_elo: number }>();
        if (lp) {
          stmts.push(
            db.prepare("UPDATE players SET doubles_elo = ? WHERE id = ?").bind(lp.doubles_elo + elo.deltaB, loserPart.partner_id),
            db.prepare(
              "INSERT INTO elo_history (id, player_id, type, old_elo, new_elo, delta, source, source_id) VALUES (?,?,?,?,?,?,?,?)"
            ).bind(crypto.randomUUID(), loserPart.partner_id, "doubles", lp.doubles_elo, lp.doubles_elo + elo.deltaB, elo.deltaB, "tournament_match", matchId)
          );
        }
      }
    }

    await db.batch(stmts);
  }

  await track("score_submitted", { playerId: session.player_id, detail: `tournament:${matchId}` });
  return NextResponse.json({ ok: true });
}
