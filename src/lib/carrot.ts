/**
 * USTA forfeited-line behavior (verified 2026-05-02 against `usta-sync.ts` + prod D1):
 * when *we* forfeit a line, our player IDs are NEVER in `league_match_results`.
 * Singles: no row is written — the regex at usta-sync.ts:418 needs both home and
 * visitor player links. Doubles: the `dDefaultRegex` fallback at usta-sync.ts:452
 * blindly captures the 2 names in the row (the opponent's pair, since we fielded
 * nobody) and runs them through `resolvePlayer` at line 462, which only matches our
 * `PLAYER_NAME_MAP` — so both resolve to `null` and the row stores
 * `player1_id = player2_id = NULL`. Prod: `hist-2025-10` (S1+D3 null IDs),
 * `lm-sf26-08` (3 of 5 lines recorded).
 *
 * Implication for `countFollowThrough` below: spec case (b) — "row with our player
 * IDs populated and won=0" — does NOT occur, so the join on
 * `player_id IN (player1_id, player2_id)` cannot false-positive on a conceded line.
 * No extra `our_score='0' AND opp_score!='0'` exclusion needed; the spec's
 * `is_default_win = 0` filter is sufficient.
 *
 * Spec: docs/superpowers/specs/2026-05-02-team-showup-model-design.md (§ Risks).
 */
import { getDB } from "@/lib/db";

/**
 * Compute the Beta-smoothed follow-through rate from raw counts.
 *
 * Formula: Beta(α=1.5, β=1.5) prior — a new player with zero history
 * sits at 0.5 (neutral). One bad day doesn't hard-zero a player; one
 * good day doesn't crown them either. A stalwart with 10 kept and 0
 * ghosted lands around 0.88; a chronic ghost with 0 kept and 5 ghosted
 * lands around 0.19.
 *
 * See docs/superpowers/specs/2026-05-02-team-showup-model-design.md
 * for the calibration table and design rationale.
 */
export function computeFollowThroughRate(kept: number, ghosted: number): number {
  const alpha = 1.5;
  const beta = 1.5;
  return (kept + alpha) / (kept + ghosted + alpha + beta);
}

interface FollowThroughCounts {
  followedThrough: number;
  ghosted: number;
}

/**
 * Count, for one player on one team, how many league matches they
 * said yes to AND played (followed through; the "kept" input to
 * computeFollowThroughRate) versus said yes to AND had a lineup slot
 * for AND did not appear in results (ghosted).
 *
 * Excluded from both: default-win lines, matches where they didn't
 * have a lineup slot at all, and any RSVP status other than 'yes'.
 *
 * USTA-forfeited-by-us lines are safe — see the file header comment
 * for why neither the followed-through nor the ghosted query
 * false-positives on them.
 */
async function countFollowThrough(
  playerId: string,
  teamId: string,
): Promise<FollowThroughCounts> {
  const db = await getDB();

  const followedThrough = (
    await db
      .prepare(
        `SELECT COUNT(DISTINCT lm.id) as cnt
         FROM league_matches lm
         JOIN availability av ON av.match_id = lm.id AND av.player_id = ? AND av.status = 'yes'
         JOIN league_match_results lmr ON lmr.match_id = lm.id
           AND (lmr.player1_id = ? OR lmr.player2_id = ?)
           AND lmr.is_default_win = 0
         WHERE lm.team_id = ?`,
      )
      .bind(playerId, playerId, playerId, teamId)
      .first<{ cnt: number }>()
  )?.cnt ?? 0;

  const ghosted = (
    await db
      .prepare(
        `SELECT COUNT(DISTINCT lm.id) as cnt
         FROM league_matches lm
         JOIN availability av ON av.match_id = lm.id AND av.player_id = ? AND av.status = 'yes'
         JOIN lineups lu ON lu.match_id = lm.id
         JOIN lineup_slots ls ON ls.lineup_id = lu.id AND ls.player_id = ?
         WHERE lm.team_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM league_match_results lmr
             WHERE lmr.match_id = lm.id
               AND (lmr.player1_id = ? OR lmr.player2_id = ?)
           )`,
      )
      .bind(playerId, playerId, teamId, playerId, playerId)
      .first<{ cnt: number }>()
  )?.cnt ?? 0;

  return { followedThrough, ghosted };
}

export interface PlayerCarrot {
  playerId: string;
  name: string;
  matchesPlayed: number;
  matchesAvailable: number;
  reliabilityScore: number;
  onTrackForMinimum: boolean;
  minMatchesGoal: number;
  earlyRsvpCount: number;
  totalRsvpCount: number;
  followedThroughCount: number;
  ghostedCount: number;
}

export async function calculateCarrotScores(teamId: string): Promise<PlayerCarrot[]> {
  const db = await getDB();

  const team = await db.prepare("SELECT min_matches_goal FROM teams WHERE id = ?")
    .bind(teamId).first<{ min_matches_goal: number }>();
  const minGoal = team?.min_matches_goal ?? 3;

  const roster = (
    await db.prepare(
      `SELECT p.id, p.name, p.reliability_score FROM players p
       JOIN team_memberships tm ON tm.player_id = p.id AND tm.team_id = ? AND tm.active = 1
       ORDER BY p.name`
    ).bind(teamId).all<{ id: string; name: string; reliability_score: number }>()
  ).results;

  const completedMatches = (
    await db.prepare(
      "SELECT COUNT(*) as cnt FROM league_matches WHERE team_id = ? AND status = 'completed'"
    ).bind(teamId).first<{ cnt: number }>()
  )?.cnt ?? 0;

  const totalMatches = (
    await db.prepare(
      "SELECT COUNT(*) as cnt FROM league_matches WHERE team_id = ?"
    ).bind(teamId).first<{ cnt: number }>()
  )?.cnt ?? 0;

  const remainingMatches = totalMatches - completedMatches;

  const results: PlayerCarrot[] = [];

  for (const player of roster) {
    const played = (
      await db.prepare(
        `SELECT COUNT(DISTINCT lmr.match_id) as cnt
         FROM league_match_results lmr
         JOIN league_matches lm ON lm.id = lmr.match_id AND lm.team_id = ?
         WHERE lmr.player1_id = ? OR lmr.player2_id = ?`
      ).bind(teamId, player.id, player.id).first<{ cnt: number }>()
    )?.cnt ?? 0;

    const available = (
      await db.prepare(
        `SELECT COUNT(*) as cnt FROM availability
         WHERE player_id = ? AND status = 'yes'
         AND match_id IN (SELECT id FROM league_matches WHERE team_id = ?)`
      ).bind(player.id, teamId).first<{ cnt: number }>()
    )?.cnt ?? 0;

    const earlyRsvp = (
      await db.prepare(
        `SELECT COUNT(*) as cnt FROM availability
         WHERE player_id = ? AND is_before_deadline = 1
         AND match_id IN (SELECT id FROM league_matches WHERE team_id = ?)`
      ).bind(player.id, teamId).first<{ cnt: number }>()
    )?.cnt ?? 0;

    const totalRsvp = (
      await db.prepare(
        `SELECT COUNT(*) as cnt FROM availability
         WHERE player_id = ?
         AND match_id IN (SELECT id FROM league_matches WHERE team_id = ?)`
      ).bind(player.id, teamId).first<{ cnt: number }>()
    )?.cnt ?? 0;

    const { followedThrough, ghosted } = await countFollowThrough(player.id, teamId);

    const canStillReachGoal = played + remainingMatches >= minGoal;

    results.push({
      playerId: player.id,
      name: player.name,
      matchesPlayed: played,
      matchesAvailable: available,
      reliabilityScore: player.reliability_score,
      onTrackForMinimum: canStillReachGoal && (played >= minGoal || remainingMatches > 0),
      minMatchesGoal: minGoal,
      earlyRsvpCount: earlyRsvp,
      totalRsvpCount: totalRsvp,
      followedThroughCount: followedThrough,
      ghostedCount: ghosted,
    });
  }

  return results;
}

export async function updateReliabilityScores(teamId: string): Promise<void> {
  const db = await getDB();

  const roster = (
    await db.prepare(
      `SELECT p.id FROM players p
       JOIN team_memberships tm ON tm.player_id = p.id AND tm.team_id = ? AND tm.active = 1`
    ).bind(teamId).all<{ id: string }>()
  ).results;

  for (const p of roster) {
    const { followedThrough, ghosted } = await countFollowThrough(p.id, teamId);
    const score = computeFollowThroughRate(followedThrough, ghosted);
    await db
      .prepare("UPDATE players SET reliability_score = ? WHERE id = ?")
      .bind(Math.round(score * 100) / 100, p.id)
      .run();
  }
}
