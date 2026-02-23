import Link from "next/link";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import CalendarSubscribe from "@/components/calendar-subscribe";
import { DashboardRsvp } from "@/components/dashboard-rsvp";
import DashboardPracticeCard from "@/components/dashboard-practice-card";

export const dynamic = "force-dynamic";

interface UpcomingTournamentMatch {
  match_id: string;
  tournament_name: string;
  tournament_slug: string;
  opponent_name: string;
  scheduled_date: string;
  scheduled_time: string;
  court: string;
  status: string;
}

interface UpcomingLeagueMatch {
  match_id: string;
  team_name: string;
  team_slug: string;
  opponent_team: string;
  match_date: string;
  match_time: string | null;
  location: string | null;
  is_home: number;
  rsvp_status: string | null;
  lineup_status: string | null;
  lineup_position: string | null;
}

interface UnscoredMatch {
  match_id: string;
  tournament_slug: string;
  opponent_name: string;
  scheduled_date: string;
}

interface OwedFee {
  fee_id: string;
  label: string;
  amount_cents: number;
  paid_cents: number;
}

interface UpcomingPractice {
  id: string;
  session_date: string;
  start_time: string;
  yes_count: number;
  my_rsvp: string | null;
}

interface TimelineEvent {
  kind: "tournament" | "league" | "practice";
  date: string;
  data: UpcomingTournamentMatch | UpcomingLeagueMatch | UpcomingPractice;
}

export default async function DashboardPage() {
  const session = await getSession();
  const db = await getDB();

  let tournamentMatches: UpcomingTournamentMatch[] = [];
  let leagueMatches: UpcomingLeagueMatch[] = [];
  let unscoredMatches: UnscoredMatch[] = [];
  let pendingRsvpCount = 0;
  let owedFees: OwedFee[] = [];
  let nextPractice: UpcomingPractice | null = null;
  const allEvents: TimelineEvent[] = [];

  if (session) {
    tournamentMatches = (
      await db
        .prepare(
          `SELECT tm.id as match_id, t.name as tournament_name, t.slug as tournament_slug,
                  COALESCE(opp_p.name, 'TBD') as opponent_name,
                  tm.scheduled_date, tm.scheduled_time, tm.court, tm.status
           FROM tournament_matches tm
           JOIN tournaments t ON t.id = tm.tournament_id
           JOIN tournament_participants my_tp ON my_tp.id IN (tm.participant1_id, tm.participant2_id)
           LEFT JOIN tournament_participants opp_tp ON opp_tp.id = CASE
             WHEN my_tp.id = tm.participant1_id THEN tm.participant2_id
             ELSE tm.participant1_id END
           LEFT JOIN players opp_p ON opp_p.id = opp_tp.player_id
           WHERE my_tp.player_id = ? AND tm.status IN ('scheduled','needs_score')
           ORDER BY tm.scheduled_date ASC, tm.scheduled_time ASC
           LIMIT 5`
        )
        .bind(session.player_id)
        .all<UpcomingTournamentMatch>()
    ).results;

    leagueMatches = (
      await db
        .prepare(
          `SELECT lm.id as match_id, te.name as team_name, te.slug as team_slug,
                  lm.opponent_team, lm.match_date, lm.match_time,
                  lm.location, lm.is_home,
                  a.status as rsvp_status,
                  CASE
                    WHEN ls.is_alternate = -1 THEN 'withdrawn'
                    WHEN ls.is_alternate = 1 THEN 'alternate'
                    WHEN ls.position IS NOT NULL THEN 'selected'
                    ELSE NULL
                  END as lineup_status,
                  ls.position as lineup_position
           FROM league_matches lm
           JOIN teams te ON te.id = lm.team_id
           JOIN team_memberships mem ON mem.team_id = te.id AND mem.player_id = ?
           LEFT JOIN availability a ON a.player_id = ? AND a.match_id = lm.id
           LEFT JOIN lineups lu ON lu.match_id = lm.id
           LEFT JOIN lineup_slots ls ON ls.lineup_id = lu.id AND ls.player_id = ?
           WHERE lm.status != 'completed' AND lm.status != 'cancelled'
           ORDER BY lm.match_date ASC
           LIMIT 5`
        )
        .bind(session.player_id, session.player_id, session.player_id)
        .all<UpcomingLeagueMatch>()
    ).results;

    pendingRsvpCount = leagueMatches.filter((m) => !m.rsvp_status).length;

    unscoredMatches = (
      await db
        .prepare(
          `SELECT tm.id as match_id, t.slug as tournament_slug,
                  COALESCE(opp_p.name, 'TBD') as opponent_name,
                  tm.scheduled_date
           FROM tournament_matches tm
           JOIN tournaments t ON t.id = tm.tournament_id
           JOIN tournament_participants my_tp ON my_tp.id IN (tm.participant1_id, tm.participant2_id)
           LEFT JOIN tournament_participants opp_tp ON opp_tp.id = CASE
             WHEN my_tp.id = tm.participant1_id THEN tm.participant2_id
             ELSE tm.participant1_id END
           LEFT JOIN players opp_p ON opp_p.id = opp_tp.player_id
           WHERE my_tp.player_id = ? AND tm.status = 'scheduled'
             AND tm.scheduled_date < date('now')
             AND tm.bye = 0
           ORDER BY tm.scheduled_date ASC
           LIMIT 5`
        )
        .bind(session.player_id)
        .all<UnscoredMatch>()
    ).results;

    // Check for owed fees
    try {
      owedFees = (
        await db
          .prepare(
            `SELECT f.id as fee_id, f.label, f.amount_cents,
                    COALESCE((SELECT SUM(p2.amount_cents) FROM payments p2 WHERE p2.fee_id = f.id AND p2.player_id = ?), 0) as paid_cents
             FROM fees f
             WHERE f.context_id IN (
               SELECT team_id FROM team_memberships WHERE player_id = ?
               UNION
               SELECT tournament_id FROM tournament_participants WHERE player_id = ?
             )`
          )
          .bind(session.player_id, session.player_id, session.player_id)
          .all<OwedFee>()
      ).results.filter((f) => f.paid_cents < f.amount_cents);
    } catch {
      // fees table might not exist yet
    }

    try {
      const np = await db.prepare(
        `SELECT ps.id, ps.session_date, ps.start_time,
                (SELECT COUNT(*) FROM practice_rsvp pr WHERE pr.session_id = ps.id AND pr.status = 'yes') as yes_count,
                (SELECT status FROM practice_rsvp pr2 WHERE pr2.session_id = ps.id AND pr2.player_id = ?) as my_rsvp
         FROM practice_sessions ps
         WHERE ps.session_date >= date('now') AND ps.cancelled = 0
         ORDER BY ps.session_date ASC LIMIT 1`
      ).bind(session.player_id).first<{ id: string; session_date: string; start_time: string; yes_count: number; my_rsvp: string | null }>();
      if (np) nextPractice = np;
    } catch {
      // practice tables might not exist yet
    }

    try {
      const practices = (await db.prepare(
        `SELECT ps.id, ps.session_date, ps.start_time,
                (SELECT COUNT(*) FROM practice_rsvp pr WHERE pr.session_id = ps.id AND pr.status = 'yes') as yes_count,
                (SELECT status FROM practice_rsvp pr2 WHERE pr2.session_id = ps.id AND pr2.player_id = ?) as my_rsvp
         FROM practice_sessions ps
         WHERE ps.session_date >= date('now') AND ps.cancelled = 0
         ORDER BY ps.session_date ASC LIMIT 8`
      ).bind(session.player_id).all<UpcomingPractice>()).results;

      for (const p of practices) {
        allEvents.push({ kind: "practice", date: p.session_date, data: p });
      }
    } catch { /* table may not exist */ }

    for (const m of tournamentMatches) {
      allEvents.push({ kind: "tournament", date: m.scheduled_date, data: m });
    }
    for (const m of leagueMatches) {
      allEvents.push({ kind: "league", date: m.match_date, data: m });
    }

    allEvents.sort((a, b) => a.date.localeCompare(b.date));
  }

  const teams = (
    await db
      .prepare("SELECT name, slug, status, league, season_year FROM teams WHERE status IN ('active','upcoming') ORDER BY status, name")
      .all<{ name: string; slug: string; status: string; league: string; season_year: number }>()
  ).results;

  const tournaments = (
    await db
      .prepare("SELECT name, slug, status FROM tournaments WHERE status IN ('active','upcoming') ORDER BY start_date DESC")
      .all<{ name: string; slug: string; status: string }>()
  ).results;

  const hasUpcoming = allEvents.length > 0;
  const hasActionItems = pendingRsvpCount > 0 || unscoredMatches.length > 0 || owedFees.length > 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {session ? `Welcome, ${session.name.split(" ")[0]}` : "My Dashboard"}
      </h1>

      {/* Action Items */}
      {session && hasActionItems && (
        <section className="bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-300 dark:border-amber-700/50 p-4">
          <h2 className="text-sm font-bold uppercase text-amber-700 dark:text-amber-400 mb-2">Action Needed</h2>
          <div className="space-y-1.5 text-slate-800 dark:text-slate-200">
            {pendingRsvpCount > 0 && (
              <p className="text-sm">
                <span className="font-semibold">{pendingRsvpCount} match{pendingRsvpCount > 1 ? "es" : ""}</span> awaiting your RSVP
              </p>
            )}
            {unscoredMatches.map((m) => (
              <Link key={m.match_id} href={`/tournament/${m.tournament_slug}`} className="block text-sm text-sky-700 dark:text-sky-400 hover:underline">
                Score needed: vs {m.opponent_name} ({new Date(m.scheduled_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })})
              </Link>
            ))}
            {owedFees.map((f) => (
              <div key={f.fee_id} className="text-sm flex items-center gap-2">
                <span>Owed: ${((f.amount_cents - f.paid_cents) / 100).toFixed(0)} for {f.label}</span>
                <a
                  href="https://account.venmo.com/u/bjori"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold bg-[#008CFF] text-white px-2 py-0.5 rounded hover:bg-[#0074D4] transition-colors"
                >
                  Pay via Venmo
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-surface-alt rounded-xl border border-border p-4 sm:p-6">
        <h2 className="text-lg font-semibold mb-3">Coming Up</h2>
        {!session ? (
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            <Link href="/login" className="text-primary-light hover:underline">Sign in</Link> to see your upcoming matches.
          </p>
        ) : !hasUpcoming ? (
          <p className="text-slate-500 dark:text-slate-400 text-sm">No upcoming matches right now.</p>
        ) : (
          <div className="space-y-2">
            {allEvents.map((ev) => {
              if (ev.kind === "tournament") {
                const m = ev.data as UpcomingTournamentMatch;
                return (
                  <Link
                    key={`t-${m.match_id}`}
                    href={`/tournament/${m.tournament_slug}/match/${m.match_id}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm">vs {m.opponent_name}</p>
                      <p className="text-xs text-slate-500">{m.tournament_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold">
                        {new Date(m.scheduled_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </p>
                      <p className="text-[11px] text-slate-400">{m.scheduled_time}{m.court ? ` · ${m.court}` : ""}</p>
                    </div>
                  </Link>
                );
              }
              if (ev.kind === "league") {
                const m = ev.data as UpcomingLeagueMatch;
                const faded = m.rsvp_status === "no" && !m.lineup_status;
                const needsRsvp = !m.rsvp_status;
                return (
                  <div
                    key={`l-${m.match_id}`}
                    className={`flex items-center overflow-hidden rounded-lg bg-slate-50 dark:bg-slate-800/50 transition-colors ${faded ? "opacity-40" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                  >
                    <Link href={`/team/${m.team_slug}/match/${m.match_id}`} className="flex items-center gap-2 flex-1 min-w-0 p-3">
                      {m.lineup_status === "selected" ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0 ring-2 ring-sky-300 dark:ring-sky-700" title="In Lineup" />
                      ) : m.lineup_status === "alternate" ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-sky-400/50 shrink-0" title="Alternate" />
                      ) : m.rsvp_status === "yes" ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-accent shrink-0" title="RSVP: Yes" />
                      ) : m.rsvp_status === "maybe" ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-warning shrink-0" title="RSVP: Maybe" />
                      ) : m.rsvp_status === "no" ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-danger shrink-0" title="RSVP: No" />
                      ) : (
                        <span className="w-2.5 h-2.5 rounded-full bg-danger/50 animate-pulse shrink-0" title="RSVP needed" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-medium text-sm">{m.is_home ? "vs" : "@"} {m.opponent_team}</p>
                          {m.lineup_status === "selected" && (
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300">
                              {m.lineup_position ?? "Lineup"}
                            </span>
                          )}
                          {m.lineup_status === "alternate" && (
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                              Alt
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          {m.team_name}
                          {(m.rsvp_status === "yes" || m.rsvp_status === "maybe") && !m.lineup_status && (
                            <span className="ml-1.5 text-slate-400 dark:text-slate-500 italic">
                              &middot; Lineup pending
                            </span>
                          )}
                        </p>
                      </div>
                    </Link>
                    {!needsRsvp && (
                      <div className="text-right pr-3 shrink-0">
                        <p className="text-xs font-semibold">
                          {new Date(m.match_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {m.match_time ?? ""}{m.location ? ` · ${m.location}` : ""}
                        </p>
                      </div>
                    )}
                    {needsRsvp && (
                      <>
                        <div className="text-right pr-2 shrink-0">
                          <p className="text-xs font-semibold">
                            {new Date(m.match_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {m.match_time ?? ""}{m.location ? ` · ${m.location}` : ""}
                          </p>
                        </div>
                        <DashboardRsvp slug={m.team_slug} matchId={m.match_id} />
                      </>
                    )}
                  </div>
                );
              }
              if (ev.kind === "practice") {
                const p = ev.data as UpcomingPractice;
                return (
                  <DashboardPracticeCard
                    key={`p-${p.id}`}
                    id={p.id}
                    sessionDate={p.session_date}
                    startTime={p.start_time}
                    initialYes={p.yes_count}
                    myRsvp={p.my_rsvp}
                  />
                );
              }
              return null;
            })}
          </div>
        )}
      </section>

      {session && <CalendarSubscribe />}

      {/* Quick links */}
      {session && (
        <Link
          href={`/player/${session.player_id}`}
          className="block bg-surface-alt rounded-xl border border-border p-4 hover:border-primary-light transition-colors"
        >
          <h3 className="font-semibold">My Profile</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">View your stats, ELO, and match history</p>
        </Link>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {tournaments.map((t) => (
          <Link
            key={t.slug}
            href={`/tournament/${t.slug}`}
            className="bg-surface-alt rounded-xl border border-border p-4 hover:border-primary-light transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-block w-2 h-2 rounded-full ${t.status === "active" ? "bg-accent" : "bg-warning"}`} />
              <h3 className="font-semibold">{t.name}</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t.status === "active" ? "In progress" : "Upcoming"}
            </p>
          </Link>
        ))}
        {teams.map((t) => (
          <Link
            key={t.slug}
            href={`/team/${t.slug}`}
            className="bg-surface-alt rounded-xl border border-border p-4 hover:border-primary-light transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-block w-2 h-2 rounded-full ${t.status === "active" ? "bg-accent" : "bg-warning"}`} />
              <h3 className="font-semibold">{t.name}</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t.league} · {t.season_year}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
