import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const db = await getDB();

  const team = await db
    .prepare("SELECT name, slug, league, season_year, season_start, status FROM teams WHERE slug = ?")
    .bind(slug)
    .first<{ name: string; slug: string; league: string; season_year: number; season_start: string; status: string }>();

  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ team });
}
