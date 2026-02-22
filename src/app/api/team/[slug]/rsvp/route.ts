import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";

interface RsvpBody {
  matchId: string;
  status: "yes" | "no" | "maybe";
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
  const body = (await request.json()) as RsvpBody;

  if (!body.matchId || !["yes", "no", "maybe"].includes(body.status)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const db = await getDB();

  // Verify team membership
  const team = await db
    .prepare("SELECT id FROM teams WHERE slug = ?")
    .bind(slug)
    .first<{ id: string }>();

  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const membership = await db
    .prepare("SELECT 1 FROM team_memberships WHERE player_id = ? AND team_id = ?")
    .bind(session.player_id, team.id)
    .first();

  if (!membership) {
    return NextResponse.json({ error: "Not a team member" }, { status: 403 });
  }

  // Verify the match belongs to this team
  const match = await db
    .prepare("SELECT id, rsvp_deadline FROM league_matches WHERE id = ? AND team_id = ?")
    .bind(body.matchId, team.id)
    .first<{ id: string; rsvp_deadline: string | null }>();

  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const beforeDeadline = match.rsvp_deadline
    ? new Date() < new Date(match.rsvp_deadline) ? 1 : 0
    : 1;

  await db
    .prepare(
      `INSERT INTO availability (player_id, match_id, status, responded_at, is_before_deadline)
       VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), ?)
       ON CONFLICT (player_id, match_id)
       DO UPDATE SET status = excluded.status, responded_at = excluded.responded_at`
    )
    .bind(session.player_id, body.matchId, body.status, beforeDeadline)
    .run();

  return NextResponse.json({ ok: true });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const db = await getDB();

  const team = await db
    .prepare("SELECT id FROM teams WHERE slug = ?")
    .bind(slug)
    .first<{ id: string }>();

  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const matchId = request.nextUrl.searchParams.get("matchId");

  if (matchId) {
    const responses = (
      await db
        .prepare(
          `SELECT a.player_id, a.status, p.name
           FROM availability a
           JOIN players p ON p.id = a.player_id
           WHERE a.match_id = ?
           ORDER BY p.name`
        )
        .bind(matchId)
        .all<{ player_id: string; status: string; name: string }>()
    ).results;
    return NextResponse.json({ responses });
  }

  // All availability for upcoming matches
  const availability = (
    await db
      .prepare(
        `SELECT a.player_id, a.match_id, a.status
         FROM availability a
         JOIN league_matches lm ON lm.id = a.match_id
         WHERE lm.team_id = ? AND lm.status = 'open'`
      )
      .bind(team.id)
      .all<{ player_id: string; match_id: string; status: string }>()
  ).results;

  return NextResponse.json({ availability });
}
