import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSession } from "@/lib/auth";

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT, password_hash TEXT, ntrp_rating REAL, ntrp_type TEXT, singles_elo INTEGER NOT NULL DEFAULT 1500, doubles_elo INTEGER NOT NULL DEFAULT 1500, avatar_url TEXT, ics_token TEXT UNIQUE, reliability_score REAL NOT NULL DEFAULT 1.0, is_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
  `CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, league TEXT, season_year INTEGER, season_start TEXT, season_end TEXT, match_format TEXT, usta_team_id TEXT, min_matches_goal INTEGER NOT NULL DEFAULT 3, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
  `CREATE TABLE IF NOT EXISTS team_memberships (player_id TEXT NOT NULL REFERENCES players(id), team_id TEXT NOT NULL REFERENCES teams(id), role TEXT NOT NULL DEFAULT 'player', preferences TEXT, active INTEGER NOT NULL DEFAULT 1, usta_registered INTEGER NOT NULL DEFAULT 0, joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), PRIMARY KEY (player_id, team_id))`,
  `CREATE TABLE IF NOT EXISTS league_matches (id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id), round_number INTEGER, opponent_team TEXT, match_date TEXT NOT NULL, match_time TEXT, location TEXT, is_home INTEGER NOT NULL DEFAULT 0, notes TEXT, team_result TEXT, team_score TEXT, status TEXT NOT NULL DEFAULT 'open', rsvp_deadline TEXT, lock_time TEXT, usta_url TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
  `CREATE TABLE IF NOT EXISTS availability (player_id TEXT NOT NULL REFERENCES players(id), match_id TEXT NOT NULL REFERENCES league_matches(id), status TEXT NOT NULL DEFAULT 'pending', responded_at TEXT, is_before_deadline INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (player_id, match_id))`,
  `CREATE TABLE IF NOT EXISTS lineups (id TEXT PRIMARY KEY, match_id TEXT NOT NULL UNIQUE REFERENCES league_matches(id), status TEXT NOT NULL DEFAULT 'draft', generated_at TEXT, confirmed_at TEXT, locked_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS lineup_slots (id TEXT PRIMARY KEY, lineup_id TEXT NOT NULL REFERENCES lineups(id), position TEXT NOT NULL, player_id TEXT NOT NULL REFERENCES players(id), is_alternate INTEGER NOT NULL DEFAULT 0, acknowledged INTEGER, acknowledged_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS league_match_results (id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES league_matches(id), position TEXT NOT NULL, won INTEGER, our_score TEXT, opp_score TEXT, player1_id TEXT REFERENCES players(id), player2_id TEXT REFERENCES players(id), is_default_win INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS tournaments (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, format TEXT NOT NULL, match_type TEXT NOT NULL DEFAULT 'singles', scoring_format TEXT DEFAULT 'best_of_3', status TEXT NOT NULL DEFAULT 'upcoming', start_date TEXT, end_date TEXT, created_by TEXT REFERENCES players(id), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
  `CREATE TABLE IF NOT EXISTS tournament_participants (id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL REFERENCES tournaments(id), player_id TEXT NOT NULL REFERENCES players(id), partner_id TEXT REFERENCES players(id), seed INTEGER, UNIQUE(tournament_id, player_id))`,
  `CREATE TABLE IF NOT EXISTS tournament_matches (id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL REFERENCES tournaments(id), round INTEGER, match_number INTEGER, week INTEGER, participant1_id TEXT REFERENCES tournament_participants(id), participant2_id TEXT REFERENCES tournament_participants(id), winner_participant_id TEXT REFERENCES tournament_participants(id), score1_sets TEXT, score2_sets TEXT, scheduled_date TEXT, scheduled_time TEXT, court TEXT, status TEXT NOT NULL DEFAULT 'scheduled', updated_at TEXT, bye INTEGER NOT NULL DEFAULT 0, is_forfeit INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS elo_history (id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id), type TEXT NOT NULL, old_elo INTEGER NOT NULL, new_elo INTEGER NOT NULL, delta INTEGER NOT NULL, source TEXT NOT NULL, source_id TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), expires_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id), endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
  `CREATE TABLE IF NOT EXISTS match_changelog (id TEXT PRIMARY KEY, match_type TEXT NOT NULL, match_id TEXT NOT NULL, changed_by_player_id TEXT NOT NULL REFERENCES players(id), changed_by_name TEXT NOT NULL, field_name TEXT NOT NULL, old_value TEXT, new_value TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
  `CREATE TABLE IF NOT EXISTS fees (id TEXT PRIMARY KEY, context_type TEXT NOT NULL, context_id TEXT NOT NULL, label TEXT NOT NULL, amount_cents INTEGER NOT NULL, due_date TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
  `CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id), fee_id TEXT NOT NULL REFERENCES fees(id), amount_cents INTEGER NOT NULL, paid_at TEXT NOT NULL, recorded_by TEXT REFERENCES players(id), notes TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
  `CREATE TABLE IF NOT EXISTS team_interest (id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id), name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, ntrp_rating REAL, ntrp_type TEXT, notes TEXT, status TEXT NOT NULL DEFAULT 'pending', player_id TEXT REFERENCES players(id), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
  `CREATE TABLE IF NOT EXISTS announcements (id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id), subject TEXT NOT NULL, body_html TEXT NOT NULL, sent_by TEXT NOT NULL REFERENCES players(id), recipient_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
  `CREATE TABLE IF NOT EXISTS practice_sessions (id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id), title TEXT NOT NULL DEFAULT 'Practice', session_date TEXT NOT NULL, start_time TEXT NOT NULL DEFAULT '19:30', end_time TEXT NOT NULL DEFAULT '21:00', location TEXT DEFAULT 'Greenbrook Tennis Courts', notes TEXT, cancelled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
  `CREATE TABLE IF NOT EXISTS practice_rsvp (player_id TEXT NOT NULL REFERENCES players(id), session_id TEXT NOT NULL REFERENCES practice_sessions(id), status TEXT NOT NULL DEFAULT 'pending', responded_at TEXT, PRIMARY KEY (player_id, session_id))`,
  `CREATE TABLE IF NOT EXISTS app_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, player_id TEXT, detail TEXT, ip TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
  `CREATE INDEX IF NOT EXISTS idx_app_events_event ON app_events(event)`,
  `CREATE INDEX IF NOT EXISTS idx_app_events_created ON app_events(created_at)`,
];

const MIGRATIONS = [
  `ALTER TABLE team_memberships ADD COLUMN usta_registered INTEGER NOT NULL DEFAULT 0`,
];

export async function GET() {
  const session = await getSession();
  // Allow unauthenticated only if no players exist yet (initial setup)
  if (session && session.is_admin !== 1) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const { env } = await getCloudflareContext({ async: true });
    const db = env.DB;
    await db.batch(SCHEMA_STATEMENTS.map((s) => db.prepare(s)));

    const migrationResults: string[] = [];
    for (const sql of MIGRATIONS) {
      try {
        await db.prepare(sql).run();
        migrationResults.push(`OK: ${sql.slice(0, 60)}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("duplicate column")) {
          migrationResults.push(`SKIP (exists): ${sql.slice(0, 60)}`);
        } else {
          migrationResults.push(`ERR: ${msg}`);
        }
      }
    }

    const tables = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all();
    return NextResponse.json({ ok: true, tables: tables.results, migrations: migrationResults });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
