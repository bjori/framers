import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession, canAccessAdmin } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { syncUstaTeam } from "@/lib/usta-sync";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !(await canAccessAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json()) as { teamSlug?: string };
  const db = await getDB();

  if (!body.teamSlug) {
    return NextResponse.json({ error: "teamSlug required" }, { status: 400 });
  }

  const result = await syncUstaTeam(db, body.teamSlug);

  track("usta_synced", {
    playerId: session.player_id,
    detail: `scorecards:${result.scorecards},updated:${result.updated},roster:${result.rosterSynced}`,
  });

  return NextResponse.json({
    ok: true,
    ...result,
  });
}
