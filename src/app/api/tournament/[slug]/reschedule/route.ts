import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";

interface RescheduleBody {
  matchId: string;
  scheduledDate: string;
  scheduledTime: string;
  court?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const body = (await request.json()) as RescheduleBody;
  const { matchId, scheduledDate, scheduledTime, court } = body;

  if (!matchId || !scheduledDate) {
    return NextResponse.json({ error: "matchId and scheduledDate are required" }, { status: 400 });
  }

  const db = await getDB();

  const tournament = await db
    .prepare("SELECT id FROM tournaments WHERE slug = ?")
    .bind(slug)
    .first<{ id: string }>();

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  const match = await db
    .prepare(
      `SELECT tm.id, tm.scheduled_date, tm.scheduled_time, tm.court, tm.status,
              tp1.player_id as p1_player_id, tp2.player_id as p2_player_id
       FROM tournament_matches tm
       LEFT JOIN tournament_participants tp1 ON tp1.id = tm.participant1_id
       LEFT JOIN tournament_participants tp2 ON tp2.id = tm.participant2_id
       WHERE tm.id = ? AND tm.tournament_id = ?`
    )
    .bind(matchId, tournament.id)
    .first<{
      id: string; scheduled_date: string; scheduled_time: string; court: string;
      status: string; p1_player_id: string; p2_player_id: string;
    }>();

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  if (match.status === "completed") {
    return NextResponse.json({ error: "Cannot reschedule a completed match" }, { status: 400 });
  }

  const isParticipant = session.player_id === match.p1_player_id || session.player_id === match.p2_player_id;
  const isAdmin = session.is_admin === 1;
  if (!isParticipant && !isAdmin) {
    return NextResponse.json({ error: "Only match participants or admins can reschedule" }, { status: 403 });
  }

  const oldDate = match.scheduled_date;
  const oldTime = match.scheduled_time;
  const oldCourt = match.court;

  await db
    .prepare(
      `UPDATE tournament_matches
       SET scheduled_date = ?, scheduled_time = ?, court = COALESCE(?, court),
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE id = ?`
    )
    .bind(scheduledDate, scheduledTime || "", court || null, matchId)
    .run();

  await db
    .prepare(
      `INSERT INTO match_changelog (id, match_type, match_id, changed_by_player_id, changed_by_name, field_name, old_value, new_value)
       VALUES (?, 'tournament', ?, ?, ?, 'schedule', ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      matchId,
      session.player_id,
      session.name,
      JSON.stringify({ date: oldDate, time: oldTime, court: oldCourt }),
      JSON.stringify({ date: scheduledDate, time: scheduledTime, court: court || oldCourt })
    )
    .run();

  return NextResponse.json({ ok: true });
}
