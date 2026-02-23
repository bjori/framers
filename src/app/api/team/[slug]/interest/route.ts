import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const db = await getDB();

  const team = await db
    .prepare("SELECT id, name, status FROM teams WHERE slug = ?")
    .bind(slug)
    .first<{ id: string; name: string; status: string }>();

  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const body = (await request.json()) as {
    name: string;
    email: string;
    phone?: string;
    ntrpRating?: number;
    ntrpType?: string;
    notes?: string;
  };

  if (!body.name || !body.email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  const existing = await db
    .prepare("SELECT id FROM team_interest WHERE team_id = ? AND email = ?")
    .bind(team.id, body.email.toLowerCase().trim())
    .first();

  if (existing) {
    return NextResponse.json({ error: "You have already signed up for this team" }, { status: 409 });
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO team_interest (id, team_id, name, email, phone, ntrp_rating, ntrp_type, notes) VALUES (?,?,?,?,?,?,?,?)"
    )
    .bind(
      id, team.id, body.name.trim(), body.email.toLowerCase().trim(),
      body.phone || null, body.ntrpRating || null, body.ntrpType || null, body.notes || null
    )
    .run();

  return NextResponse.json({ ok: true, id });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const session = await getSession();
  const db = await getDB();

  const team = await db
    .prepare("SELECT id FROM teams WHERE slug = ?")
    .bind(slug)
    .first<{ id: string }>();

  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  // Only admin/captain can see the full list
  const isAdmin = session?.is_admin === 1;
  let isCaptain = false;
  if (session && !isAdmin) {
    const membership = await db
      .prepare("SELECT role FROM team_memberships WHERE player_id = ? AND team_id = ?")
      .bind(session.player_id, team.id)
      .first<{ role: string }>();
    isCaptain = membership?.role === "captain" || membership?.role === "co-captain";
  }

  if (!isAdmin && !isCaptain) {
    // Public: just return the count
    const count = await db
      .prepare("SELECT count(*) as cnt FROM team_interest WHERE team_id = ?")
      .bind(team.id)
      .first<{ cnt: number }>();
    return NextResponse.json({ count: count?.cnt ?? 0 });
  }

  const signups = (
    await db
      .prepare(
        "SELECT * FROM team_interest WHERE team_id = ? ORDER BY created_at DESC"
      )
      .bind(team.id)
      .all()
  ).results;

  return NextResponse.json({ signups });
}
