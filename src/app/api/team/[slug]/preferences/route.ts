import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const db = await getDB();

  const team = await db
    .prepare("SELECT id FROM teams WHERE slug = ?")
    .bind(slug)
    .first<{ id: string }>();
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const membership = await db
    .prepare("SELECT preferences FROM team_memberships WHERE player_id = ? AND team_id = ?")
    .bind(session.player_id, team.id)
    .first<{ preferences: string | null }>();
  if (!membership) return NextResponse.json({ error: "Not a team member" }, { status: 403 });

  const body = (await request.json()) as { doublesOnly?: boolean };
  const current = JSON.parse(membership.preferences || "{}");
  const updated = { ...current, doublesOnly: body.doublesOnly ?? false };

  await db
    .prepare("UPDATE team_memberships SET preferences = ? WHERE player_id = ? AND team_id = ?")
    .bind(JSON.stringify(updated), session.player_id, team.id)
    .run();

  return NextResponse.json({ ok: true, preferences: updated });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const db = await getDB();

  const team = await db
    .prepare("SELECT id FROM teams WHERE slug = ?")
    .bind(slug)
    .first<{ id: string }>();
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const membership = await db
    .prepare("SELECT preferences FROM team_memberships WHERE player_id = ? AND team_id = ?")
    .bind(session.player_id, team.id)
    .first<{ preferences: string | null }>();
  if (!membership) return NextResponse.json({ error: "Not a team member" }, { status: 403 });

  return NextResponse.json({ preferences: JSON.parse(membership.preferences || "{}") });
}
