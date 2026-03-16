import { getDB } from "@/lib/db";
import {
  deepScoutTeam,
  quickScoutTeam,
  findHeadToHead,
  predictMatchOutcome,
  type TRTeamScouting,
  type TRTeamPlayer,
  type TRMatchHistoryEntry,
  type HeadToHeadMatch,
  type MatchPrediction,
  type ScoutProgress,
} from "@/lib/tennisrecord";

export { predictMatchOutcome } from "@/lib/tennisrecord";

// ── Types ──────────────────────────────────────────────────────────

export interface CachedPlayer {
  player_name: string;
  team_name: string;
  ntrp: string | null;
  tr_rating: number | null;
  tr_dynamic_rating: number | null;
  season_record: string | null;
  local_singles: string | null;
  local_doubles: string | null;
  local_record: string | null;
  current_streak: string | null;
  longest_win_streak: number | null;
  longest_lose_streak: number | null;
  avg_opponent_rating: number | null;
  win_pct: number | null;
  yearly_records: string | null;
  team_memberships: string | null;
  fetched_at: string;
}

export interface ScoutResult {
  teamName: string;
  players: CachedPlayer[];
  headToHead: HeadToHeadMatch[];
  prediction: MatchPrediction | null;
  fromCache: boolean;
}

// ── Cache Helpers ──────────────────────────────────────────────────

const STALE_DAYS = 7;

function isStale(fetchedAt: string): boolean {
  const fetched = new Date(fetchedAt).getTime();
  const cutoff = Date.now() - STALE_DAYS * 86400000;
  return fetched < cutoff;
}

export async function getCachedTeam(teamName: string): Promise<CachedPlayer[]> {
  const db = await getDB();
  return (
    await db
      .prepare("SELECT * FROM tr_players WHERE team_name = ? ORDER BY tr_rating DESC")
      .bind(teamName)
      .all<CachedPlayer>()
  ).results;
}

export async function isCacheFresh(teamName: string): Promise<boolean> {
  const players = await getCachedTeam(teamName);
  if (players.length === 0) return false;
  return players.every((p) => !isStale(p.fetched_at));
}

// ── Persist Scouting Data ──────────────────────────────────────────

async function persistScoutingData(scouting: TRTeamScouting): Promise<void> {
  const db = await getDB();
  const now = new Date().toISOString();

  for (const player of scouting.roster) {
    const id = `${scouting.teamName}::${player.name}`;

    await db
      .prepare(
        `INSERT INTO tr_players (id, player_name, team_name, ntrp, tr_rating, tr_dynamic_rating,
          season_record, local_singles, local_doubles, local_record,
          current_streak, longest_win_streak, longest_lose_streak,
          avg_opponent_rating, win_pct, yearly_records, team_memberships, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(team_name, player_name) DO UPDATE SET
          ntrp = excluded.ntrp, tr_rating = excluded.tr_rating, tr_dynamic_rating = excluded.tr_dynamic_rating,
          season_record = excluded.season_record, local_singles = excluded.local_singles,
          local_doubles = excluded.local_doubles, local_record = excluded.local_record,
          current_streak = excluded.current_streak, longest_win_streak = excluded.longest_win_streak,
          longest_lose_streak = excluded.longest_lose_streak, avg_opponent_rating = excluded.avg_opponent_rating,
          win_pct = excluded.win_pct, yearly_records = excluded.yearly_records,
          team_memberships = excluded.team_memberships, fetched_at = excluded.fetched_at`
      )
      .bind(
        id,
        player.name,
        scouting.teamName,
        player.ntrp,
        player.rating,
        player.profile?.dynamicRating ?? null,
        player.seasonRecord,
        player.localSingles,
        player.localDoubles,
        player.localRecord,
        player.stats?.currentStreak ?? null,
        player.stats?.longestWinStreak ?? null,
        player.stats?.longestLoseStreak ?? null,
        player.stats?.avgOpponentRating ?? null,
        player.stats?.winPct ?? null,
        player.profile?.yearlyRecords ? JSON.stringify(player.profile.yearlyRecords) : null,
        player.profile?.teams ? JSON.stringify(player.profile.teams) : null,
        now
      )
      .run();

    // Persist match history
    if (player.matchHistory.length > 0) {
      // Delete old history for this player then insert fresh
      await db.prepare("DELETE FROM tr_match_history WHERE player_name = ?").bind(player.name).run();

      for (const entry of player.matchHistory) {
        await db
          .prepare(
            `INSERT INTO tr_match_history (id, player_name, match_date, league_type, team_name,
              court_position, partner_name, opponent_names, result, score, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            crypto.randomUUID(),
            player.name,
            entry.date,
            entry.leagueType,
            entry.team,
            entry.court,
            entry.partner,
            JSON.stringify(entry.opponents),
            entry.result,
            entry.score,
            now
          )
          .run();
      }
    }
  }
}

async function persistQuickScout(teamName: string, roster: TRTeamPlayer[]): Promise<void> {
  const db = await getDB();
  const now = new Date().toISOString();

  for (const player of roster) {
    const id = `${teamName}::${player.name}`;
    await db
      .prepare(
        `INSERT INTO tr_players (id, player_name, team_name, ntrp, tr_rating,
          season_record, local_singles, local_doubles, local_record, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(team_name, player_name) DO UPDATE SET
          ntrp = excluded.ntrp, tr_rating = excluded.tr_rating,
          season_record = excluded.season_record, local_singles = excluded.local_singles,
          local_doubles = excluded.local_doubles, local_record = excluded.local_record,
          fetched_at = excluded.fetched_at`
      )
      .bind(id, player.name, teamName, player.ntrp, player.rating, player.seasonRecord, player.localSingles, player.localDoubles, player.localRecord, now)
      .run();
  }
}

// ── Main Scouting Functions ────────────────────────────────────────

export async function scoutOpponent(
  opponentTeam: string,
  year: number,
  options?: { force?: boolean; onProgress?: (p: ScoutProgress) => void },
): Promise<CachedPlayer[]> {
  if (!options?.force) {
    const fresh = await isCacheFresh(opponentTeam);
    if (fresh) {
      return getCachedTeam(opponentTeam);
    }
  }

  const scouting = await deepScoutTeam(opponentTeam, year, options?.onProgress);
  if (scouting.roster.length > 0) {
    await persistScoutingData(scouting);
  }

  return getCachedTeam(opponentTeam);
}

export async function quickScoutOpponent(
  opponentTeam: string,
  year: number,
): Promise<CachedPlayer[]> {
  const cached = await getCachedTeam(opponentTeam);
  if (cached.length > 0) return cached;

  const roster = await quickScoutTeam(opponentTeam, year);
  if (roster.length > 0) {
    await persistQuickScout(opponentTeam, roster);
  }

  return getCachedTeam(opponentTeam);
}

export async function scoutOwnTeam(
  teamName: string,
  year: number,
  options?: { force?: boolean; onProgress?: (p: ScoutProgress) => void },
): Promise<void> {
  const players = await scoutOpponent(teamName, year, options);

  // Sync TR ratings to our players table
  const db = await getDB();
  for (const p of players) {
    if (p.tr_dynamic_rating || p.tr_rating) {
      const rating = p.tr_dynamic_rating ?? p.tr_rating;
      await db
        .prepare("UPDATE players SET tennisrecord_rating = ? WHERE LOWER(name) = LOWER(?)")
        .bind(rating, p.player_name)
        .run();
    }
  }
}

// ── Head-to-Head from Cache ────────────────────────────────────────

export async function getHeadToHead(
  ourTeamName: string,
  opponentTeamName: string,
): Promise<HeadToHeadMatch[]> {
  const db = await getDB();

  // Get our players' names
  const ourPlayers = (
    await db
      .prepare("SELECT player_name FROM tr_players WHERE team_name = ?")
      .bind(ourTeamName)
      .all<{ player_name: string }>()
  ).results;

  // Get opponent player names
  const oppPlayers = (
    await db
      .prepare("SELECT player_name FROM tr_players WHERE team_name = ?")
      .bind(opponentTeamName)
      .all<{ player_name: string }>()
  ).results;

  if (ourPlayers.length === 0 || oppPlayers.length === 0) return [];

  const oppNames = new Set(oppPlayers.map((p) => p.player_name));

  // Load our players' match histories from DB
  const ourHistories = new Map<string, TRMatchHistoryEntry[]>();
  for (const p of ourPlayers) {
    const rows = (
      await db
        .prepare("SELECT * FROM tr_match_history WHERE player_name = ? ORDER BY match_date DESC")
        .bind(p.player_name)
        .all<{
          player_name: string;
          match_date: string;
          league_type: string;
          team_name: string;
          court_position: string;
          partner_name: string | null;
          opponent_names: string;
          result: string | null;
          score: string;
        }>()
    ).results;

    const entries: TRMatchHistoryEntry[] = rows.map((r) => ({
      date: r.match_date,
      leagueType: r.league_type,
      team: r.team_name,
      court: r.court_position,
      partner: r.partner_name,
      opponents: JSON.parse(r.opponent_names || "[]"),
      result: r.result as "W" | "L" | null,
      score: r.score,
    }));

    ourHistories.set(p.player_name, entries);
  }

  return findHeadToHead(ourHistories, oppNames);
}

// ── Full Scouting Report for a Match ───────────────────────────────

export async function getMatchScoutingReport(
  ourTeamName: string,
  opponentTeam: string,
  ourLineup?: { position: string; playerName: string }[],
): Promise<ScoutResult> {
  const players = await getCachedTeam(opponentTeam);
  const headToHead = await getHeadToHead(ourTeamName, opponentTeam);

  let prediction: MatchPrediction | null = null;
  if (ourLineup && ourLineup.length > 0) {
    const ourWithRatings = await Promise.all(
      ourLineup.map(async (l) => {
        const db = await getDB();
        const p = await db
          .prepare("SELECT tennisrecord_rating FROM players WHERE LOWER(name) = LOWER(?)")
          .bind(l.playerName)
          .first<{ tennisrecord_rating: number | null }>();
        return {
          position: l.position,
          playerName: l.playerName,
          trRating: p?.tennisrecord_rating ?? null,
        };
      })
    );

    prediction = predictMatchOutcome(
      ourWithRatings,
      players.map((p) => ({
        name: p.player_name,
        trRating: p.tr_rating,
        trDynamicRating: p.tr_dynamic_rating,
      }))
    );
  }

  return {
    teamName: opponentTeam,
    players,
    headToHead,
    prediction,
    fromCache: players.length > 0,
  };
}
