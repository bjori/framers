import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMatchScoutingReport } from "@/lib/tr-scouting";
import { tennisRecordTeamNameFromSlug } from "@/lib/tr-team-aliases";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const opponent = request.nextUrl.searchParams.get("opponent");
  if (!opponent) {
    return NextResponse.json({ error: "opponent required" }, { status: 400 });
  }

  const teamSlug = request.nextUrl.searchParams.get("team");
  const ourTrTeam =
    (teamSlug && tennisRecordTeamNameFromSlug(teamSlug)) ?? "GREENBROOK RS 40AM3.0A";

  try {
    const report = await getMatchScoutingReport(ourTrTeam, opponent);
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
