import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const db = env.DB;

    if (!db) {
      return NextResponse.json({ error: "DB binding not found", envKeys: Object.keys(env) });
    }

    const result = await db
      .prepare("SELECT count(*) as cnt FROM players")
      .first<{ cnt: number }>();

    const tournaments = await db
      .prepare("SELECT id, name, slug FROM tournaments LIMIT 5")
      .all();

    return NextResponse.json({
      ok: true,
      playerCount: result?.cnt,
      tournaments: tournaments.results,
    });
  } catch (err) {
    return NextResponse.json({
      error: String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }, { status: 500 });
  }
}
