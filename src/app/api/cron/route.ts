import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkAutoTransitions } from "@/lib/match-lifecycle";
import { sendEmail, emailTemplate } from "@/lib/email";

/**
 * Cron endpoint - call via GET /api/cron?key=CRON_SECRET
 * Runs daily to:
 * 1. Auto-transition match statuses (close RSVPs past deadline, flag low-availability)
 * 2. Send RSVP reminders for matches 2-5 days out with < 50% response
 */
export async function GET(request: NextRequest) {
  const { env } = await getCloudflareContext({ async: true });
  const cronSecret = env.CRON_SECRET;
  const providedKey = request.nextUrl.searchParams.get("key");

  if (cronSecret && providedKey !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await getDB();
  const log: string[] = [];

  // 1. Auto-transition all active teams
  const teams = (
    await db.prepare("SELECT id, name FROM teams WHERE status IN ('active','upcoming')").all<{ id: string; name: string }>()
  ).results;

  for (const team of teams) {
    const transitions = await checkAutoTransitions(team.id);
    if (transitions.length > 0) {
      log.push(`[${team.name}] ${transitions.join("; ")}`);
    }
  }

  // 2. RSVP reminders: matches 2-5 days out with < 50% response rate
  const now = new Date();
  const remindStart = new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10);
  const remindEnd = new Date(now.getTime() + 5 * 86400000).toISOString().slice(0, 10);

  const upcomingMatches = (
    await db.prepare(
      `SELECT lm.id, lm.opponent_team, lm.match_date, lm.team_id,
              t.name as team_name, t.slug as team_slug
       FROM league_matches lm
       JOIN teams t ON t.id = lm.team_id
       WHERE lm.status IN ('open', 'needs_players')
         AND lm.match_date BETWEEN ? AND ?`
    ).bind(remindStart, remindEnd).all<{
      id: string; opponent_team: string; match_date: string; team_id: string;
      team_name: string; team_slug: string;
    }>()
  ).results;

  for (const match of upcomingMatches) {
    const memberCount = (
      await db.prepare("SELECT COUNT(*) as cnt FROM team_memberships WHERE team_id = ? AND active = 1")
        .bind(match.team_id).first<{ cnt: number }>()
    )?.cnt ?? 0;

    const rsvpCount = (
      await db.prepare("SELECT COUNT(*) as cnt FROM availability WHERE match_id = ? AND status IN ('yes','no','maybe')")
        .bind(match.id).first<{ cnt: number }>()
    )?.cnt ?? 0;

    if (memberCount > 0 && rsvpCount / memberCount < 0.5) {
      // Get members who haven't responded
      const nonResponders = (
        await db.prepare(
          `SELECT p.email, p.name FROM team_memberships tm
           JOIN players p ON p.id = tm.player_id
           LEFT JOIN availability a ON a.player_id = p.id AND a.match_id = ?
           WHERE tm.team_id = ? AND tm.active = 1 AND a.status IS NULL`
        ).bind(match.id, match.team_id).all<{ email: string; name: string }>()
      ).results;

      const dateStr = new Date(match.match_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

      for (const m of nonResponders) {
        await sendEmail({
          to: m.email,
          subject: `RSVP reminder: ${match.opponent_team} on ${dateStr}`,
          html: emailTemplate(
            `<p>Hey ${m.name.split(" ")[0]},</p>
             <p>We still need your RSVP for <strong>${match.opponent_team}</strong> on <strong>${dateStr}</strong>.</p>
             <p>Please let us know if you can make it so we can finalize the lineup!</p>`,
            {
              heading: match.team_name,
              ctaUrl: `https://framers.app/team/${match.team_slug}/match/${match.id}`,
              ctaLabel: "RSVP Now",
            }
          ),
        });
      }

      log.push(`[RSVP reminder] ${match.opponent_team} on ${match.match_date}: sent to ${nonResponders.length} non-responders`);
    }
  }

  return NextResponse.json({ ok: true, ran: new Date().toISOString(), log });
}
