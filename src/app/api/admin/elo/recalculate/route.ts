import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession, canAccessAdmin } from "@/lib/auth";
import { calculateElo, seedElo } from "@/lib/elo";

const ASSUMED_OPPONENT_ELO = 1500;

export async function POST() {
  const session = await getSession();
  if (!session || !(await canAccessAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const db = await getDB();

  const players = (
    await db.prepare("SELECT id, ntrp_rating FROM players").all<{ id: string; ntrp_rating: number }>()
  ).results;

  await db.batch(
    players.map((p) =>
      db.prepare("UPDATE players SET singles_elo = ?, doubles_elo = ? WHERE id = ?")
        .bind(seedElo(p.ntrp_rating), seedElo(p.ntrp_rating), p.id)
    )
  );

  await db.prepare("DELETE FROM elo_history").run();

  const singlesElo: Record<string, number> = {};
  const doublesElo: Record<string, number> = {};
  const singlesCount: Record<string, number> = {};
  const doublesCount: Record<string, number> = {};
  for (const p of players) {
    const seed = seedElo(p.ntrp_rating);
    singlesElo[p.id] = seed;
    doublesElo[p.id] = seed;
    singlesCount[p.id] = 0;
    doublesCount[p.id] = 0;
  }

  const eloInserts: { playerId: string; type: string; oldElo: number; newElo: number; delta: number; source: string; matchId: string }[] = [];

  // 1) Tournament matches (singles, both players known)
  const tourneyMatches = (
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

  for (const m of tourneyMatches) {
    const winnerPid = m.winner_participant_id === m.participant1_id ? m.p1_player_id : m.p2_player_id;
    const loserPid = m.winner_participant_id === m.participant1_id ? m.p2_player_id : m.p1_player_id;

    const wElo = singlesElo[winnerPid] ?? 1500;
    const lElo = singlesElo[loserPid] ?? 1500;

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
      singlesCount[winnerPid] ?? 0, singlesCount[loserPid] ?? 0,
      { setsWonByWinner: setsWon, setsWonByLoser: setsLost }
    );

    eloInserts.push({ playerId: winnerPid, type: "singles", oldElo: wElo, newElo: elo.newRatingA, delta: elo.deltaA, source: "tournament_match", matchId: m.id });
    eloInserts.push({ playerId: loserPid, type: "singles", oldElo: lElo, newElo: elo.newRatingB, delta: elo.deltaB, source: "tournament_match", matchId: m.id });

    singlesElo[winnerPid] = elo.newRatingA;
    singlesElo[loserPid] = elo.newRatingB;
    singlesCount[winnerPid] = (singlesCount[winnerPid] ?? 0) + 1;
    singlesCount[loserPid] = (singlesCount[loserPid] ?? 0) + 1;
  }

  // 2) League match results (singles + doubles, opponent ELO assumed)
  const leagueResults = (
    await db
      .prepare(
        `SELECT lmr.id, lmr.match_id, lmr.position, lmr.player1_id, lmr.player2_id,
                lmr.won, lmr.our_score, lmr.opp_score, lm.match_date
         FROM league_match_results lmr
         JOIN league_matches lm ON lm.id = lmr.match_id
         WHERE lm.status = 'completed' AND lmr.is_default_win = 0 AND lmr.won IS NOT NULL
         ORDER BY lm.match_date ASC, lmr.position ASC`
      )
      .all<{
        id: string; match_id: string; position: string;
        player1_id: string; player2_id: string | null;
        won: number; our_score: string | null; opp_score: string | null;
        match_date: string;
      }>()
  ).results;

  let leagueProcessed = 0;
  for (const r of leagueResults) {
    if (!r.player1_id) continue;
    const isDoubles = r.position.startsWith("D");
    const aWon = r.won === 1;

    let setsWon = 0, setsLost = 0;
    if (r.our_score && r.opp_score) {
      const ours = r.our_score.split(",").map(Number);
      const theirs = r.opp_score.split(",").map(Number);
      for (let i = 0; i < ours.length; i++) {
        if ((ours[i] ?? 0) > (theirs[i] ?? 0)) setsWon++;
        else setsLost++;
      }
    }
    const margin = (setsWon + setsLost) > 0
      ? { setsWonByWinner: aWon ? setsWon : setsLost, setsWonByLoser: aWon ? setsLost : setsWon }
      : undefined;

    if (isDoubles) {
      const playerIds = [r.player1_id, r.player2_id].filter(Boolean) as string[];
      for (const pid of playerIds) {
        const oldElo = doublesElo[pid] ?? 1500;
        const elo = calculateElo(
          oldElo, ASSUMED_OPPONENT_ELO, aWon,
          doublesCount[pid] ?? 0, 10,
          margin
        );
        doublesElo[pid] = elo.newRatingA;
        doublesCount[pid] = (doublesCount[pid] ?? 0) + 1;
        eloInserts.push({ playerId: pid, type: "doubles", oldElo, newElo: elo.newRatingA, delta: elo.deltaA, source: "league_match", matchId: r.id });
      }
    } else {
      const pid = r.player1_id;
      const oldElo = singlesElo[pid] ?? 1500;
      const elo = calculateElo(
        oldElo, ASSUMED_OPPONENT_ELO, aWon,
        singlesCount[pid] ?? 0, 10,
        margin
      );
      singlesElo[pid] = elo.newRatingA;
      singlesCount[pid] = (singlesCount[pid] ?? 0) + 1;
      eloInserts.push({ playerId: pid, type: "singles", oldElo, newElo: elo.newRatingA, delta: elo.deltaA, source: "league_match", matchId: r.id });
    }
    leagueProcessed++;
  }

  // Write ELO history in batches
  for (let i = 0; i < eloInserts.length; i += 20) {
    const batch = eloInserts.slice(i, i + 20);
    await db.batch(
      batch.map((e) =>
        db.prepare(
          "INSERT INTO elo_history (id, player_id, type, old_elo, new_elo, delta, source, source_id) VALUES (?,?,?,?,?,?,?,?)"
        ).bind(crypto.randomUUID(), e.playerId, e.type, e.oldElo, e.newElo, e.delta, e.source, e.matchId)
      )
    );
  }

  // Update final ELO on players (both singles and doubles)
  const updateBatch = players.map((p) =>
    db.prepare("UPDATE players SET singles_elo = ?, doubles_elo = ? WHERE id = ?")
      .bind(singlesElo[p.id] ?? 1500, doublesElo[p.id] ?? 1500, p.id)
  );
  for (let i = 0; i < updateBatch.length; i += 20) {
    await db.batch(updateBatch.slice(i, i + 20));
  }

  return NextResponse.json({
    ok: true,
    tournamentMatchesProcessed: tourneyMatches.length,
    leagueResultsProcessed: leagueProcessed,
    eloUpdates: eloInserts.length,
  });
}
