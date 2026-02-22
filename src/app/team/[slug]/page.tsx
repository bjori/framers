import { getDB } from "@/lib/db";
import { notFound } from "next/navigation";
import { TeamSchedule } from "@/components/team-schedule";

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
}

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getDB();

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
        `SELECT tm.player_id, p.name, tm.role, p.ntrp_rating, p.ntrp_type
         FROM team_memberships tm
         JOIN players p ON p.id = tm.player_id
         WHERE tm.team_id = ? AND tm.active = 1
         ORDER BY tm.role DESC, p.name ASC`
      )
      .bind(team.id)
      .all<TeamMember>()
  ).results;

  const format = JSON.parse(team.match_format || "{}");
  const totalLines = (format.singles || 0) + (format.doubles || 0);
  const record = matches.filter((m: LeagueMatch) => m.team_result === "Won").length + "-" + matches.filter((m: LeagueMatch) => m.team_result === "Lost").length;
  const isReadOnly = team.status === "completed";

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
                  <a href={`/player/${p.player_id}`} className="font-medium text-primary-light hover:underline">
                    {p.name}
                  </a>
                  {p.role === "captain" && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-primary/10 text-primary">
                      Captain
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-500">{p.ntrp_type}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <TeamSchedule matches={matches} isReadOnly={isReadOnly} />
    </div>
  );
}
