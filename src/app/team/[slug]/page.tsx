import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notFound } from "next/navigation";
import { TeamTabs } from "@/components/team-tabs";
import { LineupChat } from "@/components/lineup-chat";
import { Suspense } from "react";

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
  doubles_elo: number;
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
        `SELECT tm.player_id, p.name, tm.role, p.ntrp_rating, p.ntrp_type, p.singles_elo, p.doubles_elo, tm.preferences
         FROM team_memberships tm
         JOIN players p ON p.id = tm.player_id
         WHERE tm.team_id = ? AND tm.active = 1
         ORDER BY MAX(p.singles_elo, p.doubles_elo) DESC`
      )
      .bind(team.id)
      .all<TeamMember>()
  ).results;

  const format = JSON.parse(team.match_format || "{}");
  const totalLines = (format.singles || 0) + (format.doubles || 0);
  const wins = matches.filter((m) => m.team_result === "win").length;
  const losses = matches.filter((m) => m.team_result === "loss").length;
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

  const neededPlayers = (format.singles || 0) + (format.doubles || 0) * 2;

  const emptyScheduleMessage = matches.length === 0 && team.status === "upcoming"
    ? "Schedule is TBD, likely available March 20th. Check back soon!"
    : undefined;

  const isAdmin = session?.is_admin === 1;
  let canManage = isAdmin;
  if (session && !isAdmin) {
    const membership = roster.find((r) => r.player_id === session.player_id);
    canManage = membership?.role === "captain" || membership?.role === "co-captain";
  }

  return (
    <div className="space-y-5">
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

      <Suspense>
        <TeamTabs
          slug={slug}
          matches={matches}
          roster={roster}
          availability={availability}
          isReadOnly={isReadOnly}
          isMember={isMember}
          neededPlayers={neededPlayers}
          currentPlayerId={session?.player_id ?? null}
          emptyScheduleMessage={emptyScheduleMessage}
        />
      </Suspense>

      {canManage && !isReadOnly && <LineupChat slug={slug} />}
    </div>
  );
}
