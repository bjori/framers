import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { track } from "@/lib/analytics";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug, id } = await params;
  const db = await getDB();

  const team = await db.prepare("SELECT id FROM teams WHERE slug = ?").bind(slug).first<{ id: string }>();
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const isAdmin = session.is_admin === 1;
  if (!isAdmin) {
    const membership = await db
      .prepare("SELECT role FROM team_memberships WHERE player_id = ? AND team_id = ?")
      .bind(session.player_id, team.id)
      .first<{ role: string }>();
    if (!membership || (membership.role !== "captain" && membership.role !== "co-captain")) {
      return NextResponse.json({ error: "Only captains and admins can edit match details" }, { status: 403 });
    }
  }

  const body = (await request.json()) as {
    match_time?: string | null;
    location?: string | null;
    notes?: string | null;
  };

  await db
    .prepare(
      "UPDATE league_matches SET match_time = ?, location = ?, notes = ? WHERE id = ? AND team_id = ?"
    )
    .bind(body.match_time ?? null, body.location ?? null, body.notes ?? null, id, team.id)
    .run();

  track("match_details_edited", { playerId: session.player_id, detail: `match:${id}` });
  return NextResponse.json({ ok: true });
}
