import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { calculateCarrotScores } from "@/lib/carrot";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const db = await getDB();

  const team = await db.prepare("SELECT id FROM teams WHERE slug = ?")
    .bind(slug).first<{ id: string }>();

  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const scores = await calculateCarrotScores(team.id);
  return NextResponse.json({ scores });
}
