import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession, canAccessAdmin } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || !(await canAccessAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const db = await getDB();
  const players = (
    await db.prepare("SELECT id, name, email, ntrp_rating, ntrp_type, singles_elo, doubles_elo, is_admin FROM players ORDER BY name")
      .all()
  ).results;

  return NextResponse.json({ players });
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session || !(await canAccessAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json()) as {
    id: string;
    name?: string;
    email?: string;
    ntrp_rating?: number;
    ntrp_type?: string;
  };

  if (!body.id) return NextResponse.json({ error: "Missing player id" }, { status: 400 });

  const db = await getDB();
  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (body.name) { updates.push("name = ?"); values.push(body.name); }
  if (body.email) { updates.push("email = ?"); values.push(body.email); }
  if (body.ntrp_rating !== undefined) { updates.push("ntrp_rating = ?"); values.push(body.ntrp_rating); }
  if (body.ntrp_type) { updates.push("ntrp_type = ?"); values.push(body.ntrp_type); }

  if (updates.length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  values.push(body.id);
  await db.prepare(`UPDATE players SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();

  return NextResponse.json({ ok: true });
}
