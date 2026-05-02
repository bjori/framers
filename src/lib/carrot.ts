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

  const totalMatchCount = (
    await db.prepare(
      "SELECT COUNT(*) as cnt FROM league_matches WHERE team_id = ? AND status IN ('completed', 'open')"
    ).bind(teamId).first<{ cnt: number }>()
  )?.cnt ?? 0;

  if (totalMatchCount === 0) return;

  for (const p of roster) {
    const responded = (
      await db.prepare(
        `SELECT COUNT(*) as cnt FROM availability
         WHERE player_id = ? AND match_id IN (SELECT id FROM league_matches WHERE team_id = ?)`
      ).bind(p.id, teamId).first<{ cnt: number }>()
    )?.cnt ?? 0;

    const earlyResponded = (
      await db.prepare(
        `SELECT COUNT(*) as cnt FROM availability
         WHERE player_id = ? AND is_before_deadline = 1
         AND match_id IN (SELECT id FROM league_matches WHERE team_id = ?)`
      ).bind(p.id, teamId).first<{ cnt: number }>()
    )?.cnt ?? 0;

    const responseRate = responded / totalMatchCount;
    const earlyRate = responded > 0 ? earlyResponded / responded : 0;
    const score = Math.min(1, responseRate * 0.6 + earlyRate * 0.4);

    await db.prepare("UPDATE players SET reliability_score = ? WHERE id = ?")
      .bind(Math.round(score * 100) / 100, p.id).run();
  }
}
