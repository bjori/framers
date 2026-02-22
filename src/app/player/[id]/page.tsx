import { getDB } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";

interface Player {
  id: string;
  name: string;
  email: string;
  ntrp_rating: number;
  ntrp_type: string;
  singles_elo: number;
  doubles_elo: number;
  is_admin: number;
}

interface MatchRecord {
  id: string;
  context_name: string;
  context_slug: string;
  context_type: string;
  opponent_name: string;
  date: string;
  won: number;
  score_display: string;
}

function parseScore(s: string | null): number[] {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDB();

  const player = await db
    .prepare("SELECT * FROM players WHERE id = ?")
    .bind(id)
    .first<Player>();

  if (!player) notFound();

  // Tournament matches
  const tMatches = (
    await db
      .prepare(
        `SELECT tm.id, t.name as context_name, t.slug as context_slug,
                'tournament' as context_type,
                COALESCE(opp_p.name, 'BYE') as opponent_name,
                tm.scheduled_date as date,
                CASE WHEN tm.winner_participant_id = my_tp.id THEN 1 ELSE 0 END as won,
                tm.score1_sets, tm.score2_sets,
                tm.participant1_id, my_tp.id as my_tp_id
         FROM tournament_matches tm
         JOIN tournaments t ON t.id = tm.tournament_id
         JOIN tournament_participants my_tp ON my_tp.player_id = ? AND my_tp.id IN (tm.participant1_id, tm.participant2_id)
         LEFT JOIN tournament_participants opp_tp ON opp_tp.id = CASE
           WHEN my_tp.id = tm.participant1_id THEN tm.participant2_id ELSE tm.participant1_id END
         LEFT JOIN players opp_p ON opp_p.id = opp_tp.player_id
         WHERE tm.status = 'completed' AND tm.bye = 0
         ORDER BY tm.scheduled_date DESC`
      )
      .bind(id)
      .all<MatchRecord & { score1_sets: string | null; score2_sets: string | null; participant1_id: string; my_tp_id: string }>()
  ).results;

  const matches: MatchRecord[] = tMatches.map((m) => {
    const s1 = parseScore(m.score1_sets);
    const s2 = parseScore(m.score2_sets);
    const isP1 = m.my_tp_id === m.participant1_id;
    const myScores = isP1 ? s1 : s2;
    const oppScores = isP1 ? s2 : s1;
    const scoreDisplay = myScores.map((g, i) => `${g}-${oppScores[i] ?? 0}`).join(", ");
    return {
      id: m.id,
      context_name: m.context_name,
      context_slug: m.context_slug,
      context_type: m.context_type,
      opponent_name: m.opponent_name,
      date: m.date,
      won: m.won,
      score_display: scoreDisplay,
    };
  });

  const teamMemberships = (
    await db
      .prepare(
        `SELECT te.name, te.slug, te.league, te.season_year, te.status, tm.role
         FROM team_memberships tm
         JOIN teams te ON te.id = tm.team_id
         WHERE tm.player_id = ?
         ORDER BY te.season_year DESC, te.name`
      )
      .bind(id)
      .all<{ name: string; slug: string; league: string; season_year: number; status: string; role: string }>()
  ).results;

  const wins = matches.filter((m) => m.won).length;
  const losses = matches.length - wins;

  const eloHistory = (
    await db
      .prepare("SELECT type, old_elo, new_elo, delta, source, created_at FROM elo_history WHERE player_id = ? ORDER BY created_at DESC LIMIT 20")
      .bind(id)
      .all<{ type: string; old_elo: number; new_elo: number; delta: number; source: string; created_at: string }>()
  ).results;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{player.name}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          NTRP {player.ntrp_type}
          {player.is_admin ? " · Admin" : ""}
        </p>
      </div>

      {/* ELO Ratings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface-alt rounded-xl border border-border p-4 text-center">
          <p className="text-xs uppercase font-semibold text-slate-500 mb-1">Singles ELO</p>
          <p className="text-3xl font-bold">{player.singles_elo}</p>
        </div>
        <div className="bg-surface-alt rounded-xl border border-border p-4 text-center">
          <p className="text-xs uppercase font-semibold text-slate-500 mb-1">Doubles ELO</p>
          <p className="text-3xl font-bold">{player.doubles_elo}</p>
        </div>
      </div>

      {/* Record */}
      <div className="bg-surface-alt rounded-xl border border-border p-4">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs uppercase font-semibold text-slate-500">Record</p>
            <p className="text-xl font-bold">{wins}-{losses}</p>
          </div>
          <div>
            <p className="text-xs uppercase font-semibold text-slate-500">Win Rate</p>
            <p className="text-xl font-bold">
              {matches.length > 0 ? Math.round((wins / matches.length) * 100) : 0}%
            </p>
          </div>
          <div>
            <p className="text-xs uppercase font-semibold text-slate-500">Matches</p>
            <p className="text-xl font-bold">{matches.length}</p>
          </div>
        </div>
      </div>

      {/* Teams */}
      {teamMemberships.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Teams</h2>
          <div className="space-y-2">
            {teamMemberships.map((t) => (
              <Link
                key={t.slug}
                href={`/team/${t.slug}`}
                className="flex items-center justify-between bg-surface-alt rounded-xl border border-border p-3 hover:border-primary-light transition-colors"
              >
                <div>
                  <p className="font-medium text-sm">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.league}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    t.status === "active" ? "bg-accent/10 text-accent" :
                    t.status === "upcoming" ? "bg-warning/10 text-warning" :
                    "bg-slate-200 dark:bg-slate-700 text-slate-500"
                  }`}>
                    {t.role === "captain" ? "Captain" : t.season_year}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Match History */}
      {matches.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Match History</h2>
          <div className="bg-surface-alt rounded-xl border border-border overflow-hidden divide-y divide-border">
            {matches.map((m) => (
              <Link
                key={m.id}
                href={`/tournament/${m.context_slug}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${m.won ? "bg-accent" : "bg-danger"}`} />
                    <span className="font-medium text-sm">vs {m.opponent_name}</span>
                  </div>
                  <p className="text-xs text-slate-500 ml-3.5">{m.score_display}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">
                    {new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                  <p className="text-[10px] text-slate-400">{m.context_name}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ELO History */}
      {eloHistory.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">ELO History</h2>
          <div className="bg-surface-alt rounded-xl border border-border overflow-hidden divide-y divide-border">
            {eloHistory.map((e, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium capitalize">{e.type}</p>
                  <p className="text-xs text-slate-500">{e.source}</p>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-bold ${e.delta > 0 ? "text-accent" : e.delta < 0 ? "text-danger" : ""}`}>
                    {e.delta > 0 ? "+" : ""}{e.delta}
                  </span>
                  <p className="text-[11px] text-slate-400">{e.old_elo} → {e.new_elo}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
