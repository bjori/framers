import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDB } from "@/lib/db";
import { scoutOpponent, scoutOwnTeam, getCachedTeam } from "@/lib/tr-scouting";
import { tennisRecordTeamNameFromDisplayName } from "@/lib/tr-team-aliases";
import { emptyTeamRosterReason, fetchTennisRecord, parseTeamRoster } from "@/lib/tennisrecord";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.is_admin) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json()) as {
    teamName?: string;
    year?: number;
    isOwnTeam?: boolean;
    force?: boolean;
    backfillAll?: boolean;
  };

  const year = body.year ?? 2026;

  if (body.backfillAll) {
    return handleBackfillAll(year, body.force ?? false);
  }

  if (!body.teamName) {
    return NextResponse.json({ error: "teamName required" }, { status: 400 });
  }

  try {
    const logs: string[] = [];

    const scoutTargetName = body.isOwnTeam
      ? tennisRecordTeamNameFromDisplayName(body.teamName)
      : body.teamName;

    if (body.isOwnTeam) {
      await scoutOwnTeam(scoutTargetName, year, {
        force: body.force,
        onProgress: (p) => logs.push(`[${p.phase}] ${p.current}/${p.total} ${p.player ?? ""} ${p.error ?? ""}`),
      });
    } else {
      await scoutOpponent(scoutTargetName, year, {
        force: body.force,
        onProgress: (p) => logs.push(`[${p.phase}] ${p.current}/${p.total} ${p.player ?? ""} ${p.error ?? ""}`),
      });
    }

    const cached = await getCachedTeam(scoutTargetName);
    let emptyHint: string | null = null;
    if (cached.length === 0) {
      const path = `/adult/teamprofile.aspx?year=${year}&teamname=${encodeURIComponent(scoutTargetName)}`;
      const html = await fetchTennisRecord(path);
      const parsed = html ? parseTeamRoster(html).length : 0;
      emptyHint = emptyTeamRosterReason(html, parsed);
    }

    return NextResponse.json({
      ok: true,
      teamName: body.teamName,
      scoutTargetName,
      playerCount: cached.length,
      emptyHint,
      logs,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

async function handleBackfillAll(year: number, force: boolean) {
  const db = await getDB();

  const ownTeams = (
    await db
      .prepare("SELECT name FROM teams WHERE status IN ('active','upcoming') AND usta_team_id IS NOT NULL")
      .all<{ name: string }>()
  ).results;

  const oppTeams = (
    await db
      .prepare(
        `SELECT DISTINCT opponent_team FROM league_matches
         WHERE team_id IN (SELECT id FROM teams WHERE status IN ('active','upcoming'))
         AND opponent_team IS NOT NULL`
      )
      .all<{ opponent_team: string }>()
  ).results;

  const allTeams = [
    ...ownTeams.map((t) => ({ name: t.name, isOwn: true })),
    ...oppTeams.map((t) => ({ name: t.opponent_team, isOwn: false })),
  ];

  const results: { team: string; isOwn: boolean; playerCount: number; error?: string }[] = [];

  for (const team of allTeams) {
    try {
      const scoutName = team.isOwn ? tennisRecordTeamNameFromDisplayName(team.name) : team.name;
      if (team.isOwn) {
        await scoutOwnTeam(scoutName, year, { force });
      } else {
        await scoutOpponent(scoutName, year, { force });
      }
      const cached = await getCachedTeam(scoutName);
      results.push({ team: team.name, isOwn: team.isOwn, playerCount: cached.length });

      // 10-second delay between teams to avoid rate limits
      if (allTeams.indexOf(team) < allTeams.length - 1) {
        await new Promise((r) => setTimeout(r, 10000));
      }
    } catch (e) {
      results.push({ team: team.name, isOwn: team.isOwn, playerCount: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ ok: true, results });
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.is_admin) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const db = await getDB();

  // Get all team summaries from tr_players
  const teamStats = (
    await db
      .prepare(
        `SELECT team_name, COUNT(*) as player_count,
                MIN(fetched_at) as oldest_fetch,
                MAX(fetched_at) as newest_fetch,
                AVG(tr_rating) as avg_rating
         FROM tr_players
         GROUP BY team_name
         ORDER BY team_name`
      )
      .all<{
        team_name: string;
        player_count: number;
        oldest_fetch: string;
        newest_fetch: string;
        avg_rating: number | null;
      }>()
  ).results;

  // Get our teams and all opponent teams for the complete list
  const ownTeams = (
    await db
      .prepare("SELECT name FROM teams WHERE status IN ('active','upcoming') AND usta_team_id IS NOT NULL")
      .all<{ name: string }>()
  ).results;

  const oppTeams = (
    await db
      .prepare(
        `SELECT DISTINCT opponent_team FROM league_matches
         WHERE team_id IN (SELECT id FROM teams WHERE status IN ('active','upcoming'))
         AND opponent_team IS NOT NULL`
      )
      .all<{ opponent_team: string }>()
  ).results;

  // History counts
  const historyCounts = (
    await db
      .prepare(
        `SELECT trp.team_name, COUNT(DISTINCT tmh.player_name) as players_with_history
         FROM tr_players trp
         LEFT JOIN tr_match_history tmh ON LOWER(tmh.player_name) = LOWER(trp.player_name)
         GROUP BY trp.team_name`
      )
      .all<{ team_name: string; players_with_history: number }>()
  ).results;

  const historyMap = new Map(historyCounts.map((h) => [h.team_name, h.players_with_history]));

  return NextResponse.json({
    teamStats: teamStats.map((t) => ({
      ...t,
      playersWithHistory: historyMap.get(t.team_name) ?? 0,
    })),
    ownTeams: ownTeams.map((t) => t.name),
    oppTeams: oppTeams.map((t) => t.opponent_team),
  });
}
