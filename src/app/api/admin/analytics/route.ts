import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession, canAccessAdmin } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || !(await canAccessAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const db = await getDB();

  const [summary7d, summary30d, recentEvents, loginAttempts, dailyActivity, topUsers] =
    await Promise.all([
      db
        .prepare(
          `SELECT event, count(*) as cnt
           FROM app_events
           WHERE created_at > datetime('now', '-7 days')
           GROUP BY event ORDER BY cnt DESC`
        )
        .all<{ event: string; cnt: number }>(),

      db
        .prepare(
          `SELECT event, count(*) as cnt
           FROM app_events
           WHERE created_at > datetime('now', '-30 days')
           GROUP BY event ORDER BY cnt DESC`
        )
        .all<{ event: string; cnt: number }>(),

      db
        .prepare(
          `SELECT e.event, e.player_id, p.name as player_name, e.detail, e.ip, e.created_at
           FROM app_events e LEFT JOIN players p ON p.id = e.player_id
           ORDER BY e.created_at DESC LIMIT 50`
        )
        .all<{
          event: string;
          player_id: string | null;
          player_name: string | null;
          detail: string | null;
          ip: string | null;
          created_at: string;
        }>(),

      db
        .prepare(
          `SELECT event, detail, ip, created_at
           FROM app_events
           WHERE event IN ('login_requested', 'login_failed', 'login_success', 'login_verify_failed')
           ORDER BY created_at DESC LIMIT 100`
        )
        .all<{ event: string; detail: string | null; ip: string | null; created_at: string }>(),

      db
        .prepare(
          `SELECT date(created_at) as day, count(*) as cnt
           FROM app_events
           WHERE created_at > datetime('now', '-30 days')
           GROUP BY day ORDER BY day DESC`
        )
        .all<{ day: string; cnt: number }>(),

      db
        .prepare(
          `SELECT e.player_id, p.name as player_name, count(*) as cnt
           FROM app_events e JOIN players p ON p.id = e.player_id
           WHERE e.created_at > datetime('now', '-30 days') AND e.player_id IS NOT NULL
           GROUP BY e.player_id ORDER BY cnt DESC LIMIT 15`
        )
        .all<{ player_id: string; player_name: string; cnt: number }>(),
    ]);

  return NextResponse.json({
    summary7d: summary7d.results,
    summary30d: summary30d.results,
    recentEvents: recentEvents.results,
    loginAttempts: loginAttempts.results,
    dailyActivity: dailyActivity.results,
    topUsers: topUsers.results,
  });
}
