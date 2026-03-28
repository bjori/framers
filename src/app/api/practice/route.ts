import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { filterPracticeSessionsStillOnSchedule } from "@/lib/practice-schedule";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDB();

  type Row = {
    id: string; team_id: string; title: string; session_date: string;
    start_time: string; end_time: string; location: string; notes: string | null;
    cancelled: number; team_name: string; team_slug: string;
    yes_count: number; maybe_count: number;
  };

  const candidates = (
    await db.prepare(
      `SELECT ps.*, t.name as team_name, t.slug as team_slug,
              (SELECT COUNT(*) FROM practice_rsvp pr WHERE pr.session_id = ps.id AND pr.status = 'yes') as yes_count,
              (SELECT COUNT(*) FROM practice_rsvp pr WHERE pr.session_id = ps.id AND pr.status = 'maybe') as maybe_count
       FROM practice_sessions ps
       JOIN teams t ON t.id = ps.team_id
       WHERE ps.session_date >= date('now', '-60 days')
       ORDER BY ps.session_date ASC, ps.start_time ASC
       LIMIT 120`
    ).all<Row>()
  ).results;

  const sessions = filterPracticeSessionsStillOnSchedule(candidates).slice(0, 20);

  const rsvps = (
    await db.prepare(
      `SELECT pr.session_id, pr.status FROM practice_rsvp pr
       WHERE pr.player_id = ?`
    ).bind(session.player_id).all<{ session_id: string; status: string }>()
  ).results;

  return NextResponse.json({ sessions, rsvps });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { sessionId: string; status: "yes" | "no" | "maybe" };
  if (!body.sessionId || !["yes", "no", "maybe"].includes(body.status)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const db = await getDB();

  const ps = await db.prepare("SELECT id FROM practice_sessions WHERE id = ?")
    .bind(body.sessionId).first();
  if (!ps) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  await db.prepare(
    `INSERT INTO practice_rsvp (player_id, session_id, status, responded_at)
     VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     ON CONFLICT (player_id, session_id)
     DO UPDATE SET status = excluded.status, responded_at = excluded.responded_at`
  ).bind(session.player_id, body.sessionId, body.status).run();

  await track("rsvp_practice", { playerId: session.player_id, detail: `${body.sessionId}:${body.status}` });
  return NextResponse.json({ ok: true });
}
