import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT, password_hash TEXT, ntrp_rating REAL, ntrp_type TEXT, singles_elo INTEGER NOT NULL DEFAULT 1500, doubles_elo INTEGER NOT NULL DEFAULT 1500, avatar_url TEXT, ics_token TEXT UNIQUE, reliability_score REAL NOT NULL DEFAULT 1.0, is_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
  `CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, league TEXT, season_year INTEGER, season_start TEXT, season_end TEXT, match_format TEXT, usta_team_id TEXT, min_matches_goal INTEGER NOT NULL DEFAULT 3, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
  `CREATE TABLE IF NOT EXISTS team_memberships (player_id TEXT NOT NULL REFERENCES players(id), team_id TEXT NOT NULL REFERENCES teams(id), role TEXT NOT NULL DEFAULT 'player', preferences TEXT, active INTEGER NOT NULL DEFAULT 1, joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), PRIMARY KEY (player_id, team_id))`,
  `CREATE TABLE IF NOT EXISTS league_matches (id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id), round_number INTEGER, opponent_team TEXT, match_date TEXT NOT NULL, match_time TEXT, location TEXT, is_home INTEGER NOT NULL DEFAULT 0, notes TEXT, team_result TEXT, team_score TEXT, status TEXT NOT NULL DEFAULT 'open', rsvp_deadline TEXT, lock_time TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
  `CREATE TABLE IF NOT EXISTS availability (player_id TEXT NOT NULL REFERENCES players(id), match_id TEXT NOT NULL REFERENCES league_matches(id), status TEXT NOT NULL DEFAULT 'pending', responded_at TEXT, is_before_deadline INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (player_id, match_id))`,
  `CREATE TABLE IF NOT EXISTS lineups (id TEXT PRIMARY KEY, match_id TEXT NOT NULL UNIQUE REFERENCES league_matches(id), status TEXT NOT NULL DEFAULT 'draft', generated_at TEXT, confirmed_at TEXT, locked_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS lineup_slots (id TEXT PRIMARY KEY, lineup_id TEXT NOT NULL REFERENCES lineups(id), position TEXT NOT NULL, player_id TEXT NOT NULL REFERENCES players(id), is_alternate INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS league_match_results (id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES league_matches(id), position TEXT NOT NULL, won INTEGER, our_score TEXT, opp_score TEXT, player1_id TEXT REFERENCES players(id), player2_id TEXT REFERENCES players(id))`,
  `CREATE TABLE IF NOT EXISTS tournaments (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, format TEXT NOT NULL, match_type TEXT NOT NULL DEFAULT 'singles', scoring_format TEXT DEFAULT 'best_of_3', status TEXT NOT NULL DEFAULT 'upcoming', start_date TEXT, end_date TEXT, created_by TEXT REFERENCES players(id), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
  `CREATE TABLE IF NOT EXISTS tournament_participants (id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL REFERENCES tournaments(id), player_id TEXT NOT NULL REFERENCES players(id), partner_id TEXT REFERENCES players(id), seed INTEGER, UNIQUE(tournament_id, player_id))`,
  `CREATE TABLE IF NOT EXISTS tournament_matches (id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL REFERENCES tournaments(id), round INTEGER, match_number INTEGER, week INTEGER, participant1_id TEXT REFERENCES tournament_participants(id), participant2_id TEXT REFERENCES tournament_participants(id), winner_participant_id TEXT REFERENCES tournament_participants(id), score1_sets TEXT, score2_sets TEXT, scheduled_date TEXT, scheduled_time TEXT, court TEXT, status TEXT NOT NULL DEFAULT 'scheduled', updated_at TEXT, bye INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS elo_history (id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id), type TEXT NOT NULL, old_elo INTEGER NOT NULL, new_elo INTEGER NOT NULL, delta INTEGER NOT NULL, source TEXT NOT NULL, source_id TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), expires_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id), endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
  `CREATE TABLE IF NOT EXISTS match_changelog (id TEXT PRIMARY KEY, match_type TEXT NOT NULL, match_id TEXT NOT NULL, changed_by_player_id TEXT NOT NULL REFERENCES players(id), changed_by_name TEXT NOT NULL, field_name TEXT NOT NULL, old_value TEXT, new_value TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
];

export async function GET() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const db = env.DB;

    // Create tables
    await db.batch(SCHEMA_STATEMENTS.map((s) => db.prepare(s)));

    // Check tables
    const tables = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all();

    return NextResponse.json({ ok: true, tables: tables.results });
  } catch (err) {
    return NextResponse.json({ error: String(err), stack: err instanceof Error ? err.stack : undefined }, { status: 500 });
  }
}
