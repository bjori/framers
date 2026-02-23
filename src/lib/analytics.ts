import { getDB } from "@/lib/db";

/**
 * Fire-and-forget event tracking. Never throws -- failures are silently logged.
 * Use for login attempts, RSVPs, score entries, page views, etc.
 */
export async function track(
  event: string,
  opts?: { playerId?: string | null; detail?: string; ip?: string }
): Promise<void> {
  try {
    const db = await getDB();
    await db
      .prepare(
        "INSERT INTO app_events (event, player_id, detail, ip) VALUES (?, ?, ?, ?)"
      )
      .bind(event, opts?.playerId ?? null, opts?.detail ?? null, opts?.ip ?? null)
      .run();
  } catch (e) {
    console.error("[analytics]", event, e);
  }
}
