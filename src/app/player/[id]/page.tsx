import { getDB } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";

interface Player {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  ntrp_rating: number;
  ntrp_type: string;
  singles_elo: number;
  doubles_elo: number;
  is_admin: number;
  tennisrecord_rating: number | null;
  tournament_form: string | null;
  league_form: string | null;
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

  // League match results
  const leagueResults = (
    await db
      .prepare(
        `SELECT lmr.position, lmr.won, lmr.our_score, lmr.opp_score, lmr.is_default_win,
                lm.match_date, lm.opponent_team, lm.id as match_id,
                te.name as team_name, te.slug as team_slug,
                p2.name as partner_name
         FROM league_match_results lmr
         JOIN league_matches lm ON lm.id = lmr.match_id
         JOIN teams te ON te.id = lm.team_id
         LEFT JOIN players p2 ON p2.id = CASE
           WHEN lmr.player1_id = ? THEN lmr.player2_id
           WHEN lmr.player2_id = ? THEN lmr.player1_id
           ELSE NULL END
         WHERE lmr.player1_id = ? OR lmr.player2_id = ?
         ORDER BY lm.match_date DESC`
      )
      .bind(id, id, id, id)
      .all<{
        position: string; won: number | null; our_score: string | null; opp_score: string | null;
        is_default_win: number; match_date: string; opponent_team: string; match_id: string;
        team_name: string; team_slug: string; partner_name: string | null;
      }>()
  ).results;

  const leagueWins = leagueResults.filter((r) => r.won === 1).length;
  const leagueLosses = leagueResults.filter((r) => r.won === 0).length;

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
  const totalWins = wins + leagueWins;
  const totalLosses = losses + leagueLosses;
  const totalMatches = totalWins + totalLosses;

  const eloHistory = (
    await db
      .prepare("SELECT type, old_elo, new_elo, delta, source, created_at FROM elo_history WHERE player_id = ? ORDER BY created_at DESC LIMIT 20")
      .bind(id)
      .all<{ type: string; old_elo: number; new_elo: number; delta: number; source: string; created_at: string }>()
  ).results;

  const recentSinglesDelta = eloHistory
    .filter((e) => e.type === "singles")
    .slice(0, 5)
    .reduce((sum, e) => sum + e.delta, 0);
  const recentDoublesDelta = eloHistory
    .filter((e) => e.type === "doubles")
    .slice(0, 5)
    .reduce((sum, e) => sum + e.delta, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{player.name}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          NTRP {player.ntrp_type}
          {player.tennisrecord_rating != null && (
            <a
              href={`https://www.tennisrecord.com/adult/profile.aspx?playername=${encodeURIComponent(player.name)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 text-xs font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-sky-700 dark:text-sky-400 hover:underline"
            >
              TR {player.tennisrecord_rating.toFixed(2)}
            </a>
          )}
          {player.is_admin ? " · Admin" : ""}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">
          <a href={`mailto:${player.email}`} className="text-sky-700 dark:text-sky-400 hover:underline flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            {player.email}
          </a>
          {player.phone && (
            <a href={`tel:${player.phone}`} className="text-sky-700 dark:text-sky-400 hover:underline flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
              {player.phone}
            </a>
          )}
        </div>
      </div>

      {/* Form Summaries */}
      {(player.tournament_form || player.league_form) && (
        <div className="space-y-2">
          {player.tournament_form && (
            <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold uppercase text-sky-600 dark:text-sky-400 tracking-wider mb-1">Tournament Form</p>
              <p className="text-sm italic text-sky-900 dark:text-sky-200">{player.tournament_form}</p>
            </div>
          )}
          {player.league_form && (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400 tracking-wider mb-1">League Form</p>
              <p className="text-sm italic text-emerald-900 dark:text-emerald-200">{player.league_form}</p>
            </div>
          )}
        </div>
      )}

      {/* ELO Ratings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface-alt rounded-xl border border-border p-4 text-center">
          <p className="text-xs uppercase font-semibold text-slate-500 mb-1">Singles ELO</p>
          <p className="text-3xl font-bold">{player.singles_elo}</p>
          {recentSinglesDelta !== 0 && (
            <p className={`text-sm font-semibold mt-1 ${recentSinglesDelta > 0 ? "text-accent" : "text-danger"}`}>
              {recentSinglesDelta > 0 ? "\u25B2" : "\u25BC"} {recentSinglesDelta > 0 ? "+" : ""}{recentSinglesDelta}
            </p>
          )}
        </div>
        <div className="bg-surface-alt rounded-xl border border-border p-4 text-center">
          <p className="text-xs uppercase font-semibold text-slate-500 mb-1">Doubles ELO</p>
          <p className="text-3xl font-bold">{player.doubles_elo}</p>
          {recentDoublesDelta !== 0 && (
            <p className={`text-sm font-semibold mt-1 ${recentDoublesDelta > 0 ? "text-accent" : "text-danger"}`}>
              {recentDoublesDelta > 0 ? "\u25B2" : "\u25BC"} {recentDoublesDelta > 0 ? "+" : ""}{recentDoublesDelta}
            </p>
          )}
        </div>
      </div>

      {/* Record */}
      <div className="bg-surface-alt rounded-xl border border-border p-4">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs uppercase font-semibold text-slate-500">Overall Record</p>
            <p className="text-xl font-bold">{totalWins}-{totalLosses}</p>
          </div>
          <div>
            <p className="text-xs uppercase font-semibold text-slate-500">Win Rate</p>
            <p className="text-xl font-bold">
              {totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0}%
            </p>
          </div>
          <div>
            <p className="text-xs uppercase font-semibold text-slate-500">Matches</p>
            <p className="text-xl font-bold">{totalMatches}</p>
          </div>
        </div>
        {(wins > 0 || losses > 0) && (leagueWins > 0 || leagueLosses > 0) && (
          <div className="flex gap-4 mt-2 text-xs text-slate-400 border-t border-border pt-2">
            <span>Tournament: {wins}-{losses}</span>
            <span>League: {leagueWins}-{leagueLosses}</span>
          </div>
        )}
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
                    {t.role === "captain" ? "Captain" : t.role === "co-captain" ? "Co-Captain" : t.season_year}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* League Match History */}
      {leagueResults.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">League Matches</h2>
          <div className="bg-surface-alt rounded-xl border border-border overflow-hidden divide-y divide-border">
            {leagueResults.map((r, i) => (
              <Link
                key={i}
                href={`/team/${r.team_slug}/match/${r.match_id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${r.won ? "bg-accent" : "bg-danger"}`} />
                    <span className="font-medium text-sm">
                      {r.position} vs {r.opponent_team}
                      {r.is_default_win ? " (Default)" : ""}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 ml-3.5">
                    {r.partner_name ? `w/ ${r.partner_name} · ` : ""}{r.our_score} - {r.opp_score}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">
                    {new Date(r.match_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                  <p className="text-[10px] text-slate-400">{r.team_name}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Tournament Match History */}
      {matches.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Tournament Matches</h2>
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
