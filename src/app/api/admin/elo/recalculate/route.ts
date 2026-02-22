import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { calculateElo, seedElo } from "@/lib/elo";

export async function POST() {
  const session = await getSession();
  if (!session || session.is_admin !== 1) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const db = await getDB();

  // Reset all ELO to seed values based on NTRP
  const players = (
    await db.prepare("SELECT id, ntrp_rating FROM players").all<{ id: string; ntrp_rating: number }>()
  ).results;

  await db.batch(
    players.map((p) =>
      db.prepare("UPDATE players SET singles_elo = ?, doubles_elo = ? WHERE id = ?")
        .bind(seedElo(p.ntrp_rating), seedElo(p.ntrp_rating), p.id)
    )
  );

  // Clear existing ELO history
  await db.prepare("DELETE FROM elo_history").run();

  // Process all completed tournament matches in chronological order
  const matches = (
    await db
      .prepare(
        `SELECT tm.id, tm.winner_participant_id, tm.participant1_id, tm.participant2_id,
                tm.score1_sets, tm.score2_sets,
                tp1.player_id as p1_player_id, tp2.player_id as p2_player_id
         FROM tournament_matches tm
         JOIN tournament_participants tp1 ON tp1.id = tm.participant1_id
         JOIN tournament_participants tp2 ON tp2.id = tm.participant2_id
         WHERE tm.status = 'completed' AND tm.bye = 0 AND tm.winner_participant_id IS NOT NULL
         ORDER BY tm.scheduled_date ASC, tm.scheduled_time ASC`
      )
      .all<{
        id: string; winner_participant_id: string;
        participant1_id: string; participant2_id: string;
        score1_sets: string; score2_sets: string;
        p1_player_id: string; p2_player_id: string;
      }>()
  ).results;

  const currentElo: Record<string, number> = {};
  const matchCount: Record<string, number> = {};
  for (const p of players) {
    currentElo[p.id] = seedElo(p.ntrp_rating);
    matchCount[p.id] = 0;
  }

  const eloInserts: { playerId: string; type: string; oldElo: number; newElo: number; delta: number; matchId: string }[] = [];

  for (const m of matches) {
    const winnerPid = m.winner_participant_id === m.participant1_id ? m.p1_player_id : m.p2_player_id;
    const loserPid = m.winner_participant_id === m.participant1_id ? m.p2_player_id : m.p1_player_id;

    const wElo = currentElo[winnerPid] ?? 1500;
    const lElo = currentElo[loserPid] ?? 1500;

    let s1: number[] = [], s2: number[] = [];
    try { s1 = JSON.parse(m.score1_sets); } catch { /* */ }
    try { s2 = JSON.parse(m.score2_sets); } catch { /* */ }

    const wSets = m.winner_participant_id === m.participant1_id ? s1 : s2;
    const lSets = m.winner_participant_id === m.participant1_id ? s2 : s1;
    let setsWon = 0, setsLost = 0;
    for (let i = 0; i < wSets.length; i++) {
      if ((wSets[i] ?? 0) > (lSets[i] ?? 0)) setsWon++;
      else setsLost++;
    }

    const elo = calculateElo(
      wElo, lElo, true,
      matchCount[winnerPid] ?? 0, matchCount[loserPid] ?? 0,
      { setsWonByWinner: setsWon, setsWonByLoser: setsLost }
    );

    eloInserts.push({ playerId: winnerPid, type: "singles", oldElo: wElo, newElo: elo.newRatingA, delta: elo.deltaA, matchId: m.id });
    eloInserts.push({ playerId: loserPid, type: "singles", oldElo: lElo, newElo: elo.newRatingB, delta: elo.deltaB, matchId: m.id });

    currentElo[winnerPid] = elo.newRatingA;
    currentElo[loserPid] = elo.newRatingB;
    matchCount[winnerPid] = (matchCount[winnerPid] ?? 0) + 1;
    matchCount[loserPid] = (matchCount[loserPid] ?? 0) + 1;
  }

  // Write ELO history in batches of 20
  for (let i = 0; i < eloInserts.length; i += 20) {
    const batch = eloInserts.slice(i, i + 20);
    await db.batch(
      batch.map((e) =>
        db.prepare(
          "INSERT INTO elo_history (id, player_id, type, old_elo, new_elo, delta, source, source_id) VALUES (?,?,?,?,?,?,?,?)"
        ).bind(crypto.randomUUID(), e.playerId, e.type, e.oldElo, e.newElo, e.delta, "tournament_match", e.matchId)
      )
    );
  }

  // Update final ELO on players
  const updateBatch = Object.entries(currentElo).map(([pid, elo]) =>
    db.prepare("UPDATE players SET singles_elo = ? WHERE id = ?").bind(elo, pid)
  );
  for (let i = 0; i < updateBatch.length; i += 20) {
    await db.batch(updateBatch.slice(i, i + 20));
  }

  return NextResponse.json({
    ok: true,
    matchesProcessed: matches.length,
    eloUpdates: eloInserts.length,
  });
}
