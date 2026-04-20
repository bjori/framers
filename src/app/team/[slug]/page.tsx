import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notFound } from "next/navigation";
import { TeamTabs } from "@/components/team-tabs";
import { LineupChat } from "@/components/lineup-chat";
import { NextMatchCard, type NextMatchData } from "@/components/next-match-card";
import { Suspense } from "react";
import { expectedStarterPositions } from "@/lib/lineup-positions";
import { starterFormatFromTeamJson, vacantLinesLabelFromStarterSlots } from "@/lib/lineup-vacancy";

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
  notes: string | null;
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

  const rawMatches = (
    await db
      .prepare("SELECT * FROM league_matches WHERE team_id = ? ORDER BY match_date ASC")
      .bind(team.id)
      .all<LeagueMatch>()
  ).results;

  const { loadLineSchedulesBatch, groupLinesBySlot } = await import("@/lib/line-schedule");
  const scheduleOverridesByMatch = await loadLineSchedulesBatch(db, rawMatches.map((m) => m.id));
  const starterFormatForMatches = starterFormatFromTeamJson(team.match_format || "{}");
  const matches = rawMatches.map((m) => {
    const blocks = groupLinesBySlot(
      { match_date: m.match_date, match_time: m.match_time },
      scheduleOverridesByMatch.get(m.id) ?? [],
      starterFormatForMatches,
    );
    return { ...m, schedule_blocks: blocks };
  });

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

  const starterFormat = starterFormatFromTeamJson(team.match_format || "{}");
  const totalLines = starterFormat.singles + starterFormat.doubles;
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

  const neededPlayers = starterFormat.singles + starterFormat.doubles * 2;

  const emptyScheduleMessage = matches.length === 0 && team.status === "upcoming"
    ? "Schedule is TBD, likely available March 20th. Check back soon!"
    : undefined;

  // Next upcoming match with lineup and preview data
  let nextMatchData: NextMatchData | null = null;
  const nextMatch = matches.find((m) => m.status !== "completed" && m.status !== "cancelled" && m.match_date >= new Date().toISOString().slice(0, 10));
  if (nextMatch) {
    const lineup = await db.prepare(
      "SELECT id, status, confirmed_at, locked_at FROM lineups WHERE match_id = ?"
    ).bind(nextMatch.id).first<{ id: string; status: string; confirmed_at: string | null; locked_at: string | null }>();

    let lineupSlots: { position: string; player_name: string | null; player_id: string | null; acknowledged: number | null }[] = [];
    let vacantLinesLabel: string | null = null;
    if (lineup) {
      const rawSlots = (
        await db.prepare(
          `SELECT ls.position, p.name as player_name, ls.player_id, ls.acknowledged
           FROM lineup_slots ls
           LEFT JOIN players p ON p.id = ls.player_id
           WHERE ls.lineup_id = ? AND ls.is_alternate = 0`,
        )
          .bind(lineup.id)
          .all<{ position: string; player_name: string | null; player_id: string | null; acknowledged: number | null }>()
      ).results;
      vacantLinesLabel = vacantLinesLabelFromStarterSlots(
        rawSlots.map((r) => ({ position: r.position, player_id: r.player_id })),
        starterFormat,
      );

      const byPos = new Map(rawSlots.map((r) => [r.position, r]));
      lineupSlots = expectedStarterPositions(starterFormat).map((position) => {
        const r = byPos.get(position);
        return {
          position,
          player_name: r?.player_name ?? null,
          player_id: r?.player_id ?? null,
          acknowledged: r?.acknowledged ?? null,
        };
      });
    }

    const rsvpCounts = await db.prepare(
      `SELECT
        COUNT(CASE WHEN status = 'yes' THEN 1 END) as yes_count,
        COUNT(CASE WHEN status = 'maybe' THEN 1 END) as maybe_count,
        COUNT(CASE WHEN status = 'no' THEN 1 END) as no_count
       FROM availability WHERE match_id = ?`
    ).bind(nextMatch.id).first<{ yes_count: number; maybe_count: number; no_count: number }>();

    let preview: { quip: string; lineInsights: { position: string; players: string; insight: string }[]; generatedAt: string } | null = null;
    try {
      const raw = await db.prepare("SELECT pre_match_preview FROM league_matches WHERE id = ?")
        .bind(nextMatch.id).first<{ pre_match_preview: string | null }>();
      if (raw?.pre_match_preview) {
        preview = JSON.parse(raw.pre_match_preview);
      }
    } catch { /* column may not exist yet */ }

    const allConfirmed =
      lineupSlots.length > 0 && lineupSlots.every((s) => s.player_id && s.acknowledged === 1);

    let lineupStatusLabel = "Awaiting lineup";
    if (lineup) {
      if (lineup.status === "locked" || allConfirmed) lineupStatusLabel = "Lineup locked";
      else if (lineup.status === "confirmed") lineupStatusLabel = "Lineup confirmed";
      else if (lineup.status === "draft") lineupStatusLabel = "Lineup draft";
    }

    nextMatchData = {
      matchId: nextMatch.id,
      opponentTeam: nextMatch.opponent_team,
      matchDate: nextMatch.match_date,
      matchTime: nextMatch.match_time,
      location: nextMatch.location,
      isHome: !!nextMatch.is_home,
      status: nextMatch.status,
      lineupStatus: lineupStatusLabel,
      lineupSlots: lineupSlots.map((s) => ({
        position: s.position,
        playerName: s.player_name,
        playerId: s.player_id ?? "",
        acknowledged: s.acknowledged === 1,
      })),
      vacantLinesLabel,
      rsvp: rsvpCounts ? { yes: rsvpCounts.yes_count, maybe: rsvpCounts.maybe_count, no: rsvpCounts.no_count } : { yes: 0, maybe: 0, no: 0 },
      preview,
      slug,
    };
  }

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

      {nextMatchData && <NextMatchCard data={nextMatchData} />}

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
