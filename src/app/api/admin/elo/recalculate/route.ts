import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession, canAccessAdmin } from "@/lib/auth";
import { recalculateElo } from "@/lib/elo-recalc";
import { track } from "@/lib/analytics";

export async function POST() {
  const session = await getSession();
  if (!session || !(await canAccessAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const db = await getDB();
  const result = await recalculateElo(db);

  track("elo_recalculated", {
    playerId: session.player_id,
    detail: `tourney:${result.tournamentMatches},league:${result.leagueResults},updates:${result.eloUpdates}`,
  });

  return NextResponse.json({
    ok: true,
    tournamentMatchesProcessed: result.tournamentMatches,
    leagueResultsProcessed: result.leagueResults,
    eloUpdates: result.eloUpdates,
  });
}
