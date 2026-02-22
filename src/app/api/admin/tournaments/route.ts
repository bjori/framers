import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";

interface CreateTournamentBody {
  name: string;
  format: string;
  matchType: string;
  playerIds: string;
}

function generateRoundRobin(playerIds: string[]): { p1: number; p2: number }[] {
  const n = playerIds.length;
  const matches: { p1: number; p2: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      matches.push({ p1: i, p2: j });
    }
  }
  return matches;
}

function assignWeeks(matchCount: number, playersPerRound: number): number[] {
  const weeks: number[] = [];
  let week = 1;
  let count = 0;
  for (let i = 0; i < matchCount; i++) {
    weeks.push(week);
    count++;
    if (count >= playersPerRound) {
      week++;
      count = 0;
    }
  }
  return weeks;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.is_admin !== 1) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json()) as CreateTournamentBody;
  if (!body.name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const db = await getDB();
  const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const tournamentId = crypto.randomUUID();

  const existing = await db.prepare("SELECT id FROM tournaments WHERE slug = ?").bind(slug).first();
  if (existing) {
    return NextResponse.json({ error: "Tournament with similar name already exists" }, { status: 409 });
  }

  await db.prepare(
    `INSERT INTO tournaments (id, name, slug, format, match_type, scoring_format, status, start_date, created_by)
     VALUES (?, ?, ?, ?, ?, 'best_of_3', 'upcoming', date('now'), ?)`
  ).bind(tournamentId, body.name, slug, body.format, body.matchType, session.player_id).run();

  let matchCount = 0;

  if (body.playerIds?.trim()) {
    const playerIds = body.playerIds.split(",").map((s) => s.trim()).filter(Boolean);

    const participants: { id: string; index: number }[] = [];
    for (let i = 0; i < playerIds.length; i++) {
      const participantId = crypto.randomUUID();
      await db.prepare(
        "INSERT INTO tournament_participants (id, tournament_id, player_id, seed) VALUES (?, ?, ?, ?)"
      ).bind(participantId, tournamentId, playerIds[i], i + 1).run();
      participants.push({ id: participantId, index: i });
    }

    if (body.format === "round_robin") {
      const pairs = generateRoundRobin(playerIds);
      const matchesPerWeek = Math.floor(playerIds.length / 2);
      const weeks = assignWeeks(pairs.length, matchesPerWeek);

      for (let i = 0; i < pairs.length; i++) {
        const matchId = crypto.randomUUID();
        await db.prepare(
          `INSERT INTO tournament_matches (id, tournament_id, round, match_number, week, participant1_id, participant2_id, scheduled_date, status)
           VALUES (?, ?, 1, ?, ?, ?, ?, date('now', '+' || ? || ' days'), 'scheduled')`
        ).bind(
          matchId, tournamentId, i + 1, weeks[i],
          participants[pairs[i].p1].id, participants[pairs[i].p2].id,
          (weeks[i] - 1) * 7
        ).run();
        matchCount++;
      }
    }
  }

  return NextResponse.json({
    tournament: { id: tournamentId, slug },
    matchCount,
  });
}
