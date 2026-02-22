import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDB();
  const player = await db.prepare("SELECT id, ics_token FROM players WHERE id = ?")
    .bind(session.player_id).first<{ id: string; ics_token: string | null }>();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  if (player.ics_token) {
    return NextResponse.json({ token: player.ics_token });
  }

  const token = crypto.randomUUID();
  await db.prepare("UPDATE players SET ics_token = ? WHERE id = ?")
    .bind(token, player.id).run();

  return NextResponse.json({ token });
}
