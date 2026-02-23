import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = await getDB();

  const ps = await db.prepare(
    `SELECT ps.*, t.name as team_name FROM practice_sessions ps
     JOIN teams t ON t.id = ps.team_id WHERE ps.id = ?`
  ).bind(id).first<{
    id: string; team_id: string; title: string; session_date: string;
    start_time: string; end_time: string; location: string; notes: string | null;
    cancelled: number; team_name: string;
  }>();

  if (!ps) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const attendees = (
    await db.prepare(
      `SELECT pr.status, p.name, p.id as player_id
       FROM practice_rsvp pr
       JOIN players p ON p.id = pr.player_id
       WHERE pr.session_id = ?
       ORDER BY
         CASE pr.status WHEN 'yes' THEN 0 WHEN 'maybe' THEN 1 WHEN 'no' THEN 2 END,
         p.name`
    ).bind(id).all<{ status: string; name: string; player_id: string }>()
  ).results;

  return NextResponse.json({ session: ps, attendees });
}
