import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession, canAccessAdmin } from "@/lib/auth";
import { HISTORICAL_2025_MATCHES, type HistoricalLine } from "@/lib/historical-2025-data";

function lineWonByUs(line: HistoricalLine, homeTeam: "us" | "them"): boolean {
  if (line.winReversed) return false;
  if (line.isDefault) {
    if (homeTeam === "us") return line.winner === "home";
    return line.winner === "visitor";
  }
  if (homeTeam === "us") return line.winner === "home";
  return line.winner === "visitor";
}

function ourPlayersForLine(line: HistoricalLine, homeTeam: "us" | "them"): string[] {
  const players = homeTeam === "us" ? line.homePlayers : line.visitorPlayers;
  return players.filter((p): p is string => p !== null);
}

function scoreForSide(line: HistoricalLine, side: "home" | "visitor"): string {
  const sets = line.score.split(",").map((s) => {
    const parts = s.trim().split("-").map(Number);
    return side === "home" ? parts[0] : parts[1];
  });
  return sets.join(",");
}

export async function POST() {
  const session = await getSession();
  if (!session || !(await canAccessAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const db = await getDB();
  const results: string[] = [];

  const existingMatches = (
    await db.prepare("SELECT id FROM league_matches WHERE id LIKE 'hist-2025-%'").all<{ id: string }>()
  ).results;
  if (existingMatches.length > 0) {
    await db.prepare("DELETE FROM league_match_results WHERE match_id LIKE 'hist-2025-%'").run();
    await db.prepare("DELETE FROM lineups WHERE match_id LIKE 'hist-2025-%'").run();
    await db.prepare("DELETE FROM league_matches WHERE id LIKE 'hist-2025-%'").run();
    results.push(`Cleared ${existingMatches.length} existing historical matches`);
  }

  for (let i = 0; i < HISTORICAL_2025_MATCHES.length; i++) {
    const match = HISTORICAL_2025_MATCHES[i];
    const matchId = `hist-2025-${String(i + 1).padStart(2, "0")}`;
    const isHome = match.homeTeam === "us" ? 1 : 0;

    await db.prepare(
      `INSERT INTO league_matches (id, team_id, round_number, opponent_team, match_date, is_home, team_result, team_score, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed')`
    ).bind(
      matchId,
      match.teamId,
      i + 1,
      match.opponent,
      match.date,
      isHome,
      match.ourScore > match.theirScore ? "win" : match.ourScore === match.theirScore ? "tie" : "loss",
      `${match.ourScore}-${match.theirScore}`
    ).run();

    const lineInserts = match.lines.map((line, li) => {
      const resultId = `${matchId}-line-${li + 1}`;
      const won = lineWonByUs(line, match.homeTeam) ? 1 : 0;
      const players = ourPlayersForLine(line, match.homeTeam);
      const ourSide = match.homeTeam === "us" ? "home" : "visitor";
      const oppSide = match.homeTeam === "us" ? "visitor" : "home";
      const position = `${line.type === "singles" ? "S" : "D"}${line.position}`;

      return db.prepare(
        `INSERT INTO league_match_results (id, match_id, position, won, our_score, opp_score, player1_id, player2_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        resultId,
        matchId,
        position,
        won,
        scoreForSide(line, ourSide),
        scoreForSide(line, oppSide),
        players[0] ?? null,
        players[1] ?? null
      );
    });

    for (let j = 0; j < lineInserts.length; j += 20) {
      await db.batch(lineInserts.slice(j, j + 20));
    }

    results.push(`Imported match ${matchId}: ${match.date} vs ${match.opponent} (${match.ourScore}-${match.theirScore})`);
  }

  return NextResponse.json({
    ok: true,
    matchesImported: HISTORICAL_2025_MATCHES.length,
    results,
  });
}
