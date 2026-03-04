import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { TeamSchedule } from "@/components/team-schedule";
import AvailabilityGrid from "@/components/availability-grid";
import { PlayerPreferences } from "@/components/player-preferences";

interface LeagueMatch {
  id: string;
  round_number: number;
  opponent_team: string;
  match_date: string;
  match_time: string | null;
  location: string | null;
  is_home: number;
  team_result: string | null;
  team_score: string | null;
  status: string;
}

interface TeamMember {
  player_id: string;
  name: string;
  role: string;
  ntrp_rating: number;
  ntrp_type: string;
  singles_elo: number;
  preferences: string | null;
}

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await getDB();

  const team = await db
    .prepare("SELECT * FROM teams WHERE slug = ?")
    .bind(slug)
    .first<{
      id: string; name: string; slug: string; league: string; season_year: number;
      match_format: string; usta_team_id: string; status: string;
    }>();

  if (!team) notFound();

  const matches = (
    await db
      .prepare("SELECT * FROM league_matches WHERE team_id = ? ORDER BY match_date ASC")
      .bind(team.id)
      .all<LeagueMatch>()
  ).results;

  const roster = (
    await db
      .prepare(
        `SELECT tm.player_id, p.name, tm.role, p.ntrp_rating, p.ntrp_type, p.singles_elo, tm.preferences
         FROM team_memberships tm
         JOIN players p ON p.id = tm.player_id
         WHERE tm.team_id = ? AND tm.active = 1
         ORDER BY p.singles_elo DESC`
      )
      .bind(team.id)
      .all<TeamMember>()
  ).results;

  const format = JSON.parse(team.match_format || "{}");
  const totalLines = (format.singles || 0) + (format.doubles || 0);
  const wins = matches.filter((m: LeagueMatch) => m.team_result === "win").length;
  const losses = matches.filter((m: LeagueMatch) => m.team_result === "loss").length;
  const record = `${wins}-${losses}`;
  const isReadOnly = team.status === "completed";
  const session = await getSession();
  const isMember = session ? roster.some((r) => r.player_id === session.player_id) : false;

  const availability = (
    await db
      .prepare(
        `SELECT a.player_id, p.name as player_name, a.match_id, a.status
         FROM availability a
         JOIN players p ON p.id = a.player_id
         WHERE a.match_id IN (SELECT id FROM league_matches WHERE team_id = ?)`
      )
      .bind(team.id)
      .all<{ player_id: string; player_name: string; match_id: string; status: string | null }>()
  ).results;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{team.name}</h1>
          {isReadOnly && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-200 dark:bg-slate-700 text-slate-500">
              Archive
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {team.league} &middot; {team.season_year} &middot; {totalLines} lines &middot; Record: {record}
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Roster ({roster.length})</h2>
        <div className="bg-surface-alt rounded-xl border border-border overflow-hidden">
          <div className="divide-y divide-border">
            {roster.map((p: TeamMember) => (
              <div key={p.player_id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Link href={`/player/${p.player_id}`} className="font-medium text-primary-light hover:underline">
                    {p.name}
                  </Link>
                  {(p.role === "captain" || p.role === "co-captain") && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300">
                      {p.role === "captain" ? "Captain" : "Co-Captain"}
                    </span>
                  )}
                  {(() => { try { return JSON.parse(p.preferences || "{}").doublesOnly; } catch { return false; } })() && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-warning/10 text-warning">
                      Doubles
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-slate-400">{p.singles_elo}</span>
                  <span className="text-xs text-slate-500">{p.ntrp_type}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {!isReadOnly && isMember && (
        <PlayerPreferences slug={slug} />
      )}

      {!isReadOnly && (
        <AvailabilityGrid
          roster={roster.map((p) => ({ player_id: p.player_id, name: p.name }))}
          matches={matches.map((m) => ({ id: m.id, match_date: m.match_date, opponent_team: m.opponent_team }))}
          availability={availability}
          neededPlayers={(format.singles || 0) + (format.doubles || 0) * 2}
        />
      )}

      <TeamSchedule matches={matches} isReadOnly={isReadOnly} slug={slug} />
    </div>
  );
}
