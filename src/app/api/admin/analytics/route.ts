import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession, canAccessAdmin } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || !(await canAccessAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const db = await getDB();

  const [summary7d, summary30d, recentEvents, loginAttempts, dailyActivity, dailyByEvent, topUsers, calendarSubscribers] =
    await Promise.all([
      db
        .prepare(
          `SELECT event, count(*) as cnt
           FROM app_events
           WHERE created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')
           GROUP BY event ORDER BY cnt DESC`
        )
        .all<{ event: string; cnt: number }>(),

      db
        .prepare(
          `SELECT event, count(*) as cnt
           FROM app_events
           WHERE created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days')
           GROUP BY event ORDER BY cnt DESC`
        )
        .all<{ event: string; cnt: number }>(),

      db
        .prepare(
          `SELECT e.event, e.player_id, p.name as player_name, e.detail, e.ip, e.created_at
           FROM app_events e LEFT JOIN players p ON p.id = e.player_id
           WHERE e.event NOT IN ('email.delivered','email.opened','email.clicked','email.bounced','email.complained','calendar_fetched')
           ORDER BY e.created_at DESC LIMIT 100`
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
          `SELECT substr(created_at, 1, 10) as day, count(*) as cnt
           FROM app_events
           WHERE created_at >= strftime('%Y-%m-%dT00:00:00Z', 'now', '-30 days')
           GROUP BY substr(created_at, 1, 10)
           ORDER BY day`
        )
        .all<{ day: string; cnt: number }>(),

      db
        .prepare(
          `SELECT substr(created_at, 1, 10) as day, event, count(*) as cnt
           FROM app_events
           WHERE created_at >= strftime('%Y-%m-%dT00:00:00Z', 'now', '-30 days')
           GROUP BY substr(created_at, 1, 10), event
           ORDER BY day, cnt DESC`
        )
        .all<{ day: string; event: string; cnt: number }>(),

      db
        .prepare(
          `SELECT e.player_id, p.name as player_name, count(*) as cnt
           FROM app_events e JOIN players p ON p.id = e.player_id
           WHERE e.created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days') AND e.player_id IS NOT NULL
           GROUP BY e.player_id ORDER BY cnt DESC LIMIT 15`
        )
        .all<{ player_id: string; player_name: string; cnt: number }>(),

      db
        .prepare(
          `SELECT e.player_id, p.name as player_name, max(e.created_at) as last_fetched_at
           FROM app_events e
           JOIN players p ON p.id = e.player_id
           WHERE e.event = 'calendar_fetched' AND e.player_id IS NOT NULL
           GROUP BY e.player_id
           ORDER BY last_fetched_at DESC`
        )
        .all<{ player_id: string; player_name: string; last_fetched_at: string }>(),
    ]);

  return NextResponse.json({
    summary7d: summary7d.results,
    summary30d: summary30d.results,
    recentEvents: recentEvents.results,
    loginAttempts: loginAttempts.results,
    dailyActivity: dailyActivity.results,
    dailyByEvent: dailyByEvent.results,
    topUsers: topUsers.results,
    calendarSubscribers: calendarSubscribers.results,
  });
}
