import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function POST(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const db = env.DB;
    const body = (await request.json()) as { action?: string };

    if (body.action === "fix-email") {
      await db.prepare("UPDATE players SET email = ? WHERE id = ?")
        .bind("hannes.magnusson@gmail.com", "8dbc87ab-f415-40ee-9fed-e7857445f998")
        .run();
      const player = await db.prepare("SELECT id, name, email FROM players WHERE id = ?")
        .bind("8dbc87ab-f415-40ee-9fed-e7857445f998").first();
      return NextResponse.json({ ok: true, player });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

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
