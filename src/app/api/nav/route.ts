import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";

export async function GET() {
  const db = await getDB();

  const teams = (
    await db
      .prepare(
        `SELECT name, slug, status FROM teams
         WHERE status IN ('active','upcoming')
         ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'upcoming' THEN 1 END, name`
      )
      .all<{ name: string; slug: string; status: string }>()
  ).results;

  const tournaments = (
    await db
      .prepare(
        `SELECT name, slug, status FROM tournaments
         WHERE status IN ('active','upcoming')
         ORDER BY start_date DESC`
      )
      .all<{ name: string; slug: string; status: string }>()
  ).results;

  const history = (
    await db
      .prepare(
        `SELECT name, slug, 'team' as kind FROM teams WHERE status = 'completed'
         UNION ALL
         SELECT name, slug, 'tournament' as kind FROM tournaments WHERE status = 'completed'
         ORDER BY name`
      )
      .all<{ name: string; slug: string; kind: string }>()
  ).results;

  return NextResponse.json({ teams, tournaments, history });
}
