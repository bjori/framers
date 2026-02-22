import Link from "next/link";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import CalendarSubscribe from "@/components/calendar-subscribe";

export const dynamic = "force-dynamic";

interface UpcomingTournamentMatch {
  tournament_name: string;
  tournament_slug: string;
  opponent_name: string;
  scheduled_date: string;
  scheduled_time: string;
  court: string;
  status: string;
}

interface UpcomingLeagueMatch {
  team_name: string;
  team_slug: string;
  opponent_team: string;
  match_date: string;
  match_time: string | null;
  location: string | null;
  is_home: number;
}

export default async function DashboardPage() {
  const session = await getSession();
  const db = await getDB();

  let tournamentMatches: UpcomingTournamentMatch[] = [];
  let leagueMatches: UpcomingLeagueMatch[] = [];

  if (session) {
    tournamentMatches = (
      await db
        .prepare(
          `SELECT t.name as tournament_name, t.slug as tournament_slug,
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
          `SELECT te.name as team_name, te.slug as team_slug,
                  lm.opponent_team, lm.match_date, lm.match_time,
                  lm.location, lm.is_home
           FROM league_matches lm
           JOIN teams te ON te.id = lm.team_id
           JOIN team_memberships mem ON mem.team_id = te.id AND mem.player_id = ?
           WHERE lm.status = 'open'
           ORDER BY lm.match_date ASC
           LIMIT 5`
        )
        .bind(session.player_id)
        .all<UpcomingLeagueMatch>()
    ).results;
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

  const hasUpcoming = tournamentMatches.length > 0 || leagueMatches.length > 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {session ? `Welcome, ${session.name.split(" ")[0]}` : "My Dashboard"}
      </h1>

      <section className="bg-surface-alt rounded-xl border border-border p-4 sm:p-6">
        <h2 className="text-lg font-semibold mb-3">Next Matches</h2>
        {!session ? (
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            <Link href="/login" className="text-primary-light hover:underline">Sign in</Link> to see your upcoming matches.
          </p>
        ) : !hasUpcoming ? (
          <p className="text-slate-500 dark:text-slate-400 text-sm">No upcoming matches right now.</p>
        ) : (
          <div className="space-y-2">
            {tournamentMatches.map((m, i) => (
              <Link
                key={`t-${i}`}
                href={`/tournament/${m.tournament_slug}`}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <div>
                  <p className="font-medium text-sm">vs {m.opponent_name}</p>
                  <p className="text-xs text-slate-500">{m.tournament_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold">
                    {new Date(m.scheduled_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                  <p className="text-[11px] text-slate-400">{m.scheduled_time} · {m.court}</p>
                </div>
              </Link>
            ))}
            {leagueMatches.map((m, i) => (
              <Link
                key={`l-${i}`}
                href={`/team/${m.team_slug}`}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <div>
                  <p className="font-medium text-sm">
                    {m.is_home ? "vs" : "@"} {m.opponent_team}
                  </p>
                  <p className="text-xs text-slate-500">{m.team_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold">
                    {new Date(m.match_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {m.match_time ?? ""}{m.location ? ` · ${m.location}` : ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {session && <CalendarSubscribe />}

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
