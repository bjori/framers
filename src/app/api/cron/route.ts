import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkAutoTransitions } from "@/lib/match-lifecycle";
import { sendEmailBatch, emailTemplate } from "@/lib/email";
import { syncUstaTeam } from "@/lib/usta-sync";
import { recalculateElo } from "@/lib/elo-recalc";

/**
 * Cron endpoint - call via GET /api/cron?key=CRON_SECRET
 * Runs daily to:
 * 1. Auto-transition match statuses (close RSVPs past deadline, flag low-availability)
 * 2. Send RSVP reminders for matches 2-5 days out with < 50% response (once per match per day)
 * 3. Tournament score reminders for overdue matches (once per match, then every 3 days)
 * 4. USTA sync (scores, roster, schedule) + ELO recalculation for all active teams
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
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

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
    const alreadySentToday = (
      await db.prepare("SELECT COUNT(*) as cnt FROM app_events WHERE event = 'rsvp_reminder' AND detail LIKE ? AND created_at >= ?")
        .bind(`${match.id}|%`, today + "T00:00:00Z").first<{ cnt: number }>()
    )?.cnt ?? 0;
    if (alreadySentToday > 0) continue;

    const memberCount = (
      await db.prepare("SELECT COUNT(*) as cnt FROM team_memberships WHERE team_id = ? AND active = 1")
        .bind(match.team_id).first<{ cnt: number }>()
    )?.cnt ?? 0;

    const rsvpCount = (
      await db.prepare("SELECT COUNT(*) as cnt FROM availability WHERE match_id = ? AND status IN ('yes','no','maybe')")
        .bind(match.id).first<{ cnt: number }>()
    )?.cnt ?? 0;

    if (memberCount > 0 && rsvpCount / memberCount < 0.5) {
      const nonResponders = (
        await db.prepare(
          `SELECT p.email, p.name FROM team_memberships tm
           JOIN players p ON p.id = tm.player_id
           LEFT JOIN availability a ON a.player_id = p.id AND a.match_id = ?
           WHERE tm.team_id = ? AND tm.active = 1 AND a.status IS NULL`
        ).bind(match.id, match.team_id).all<{ email: string; name: string }>()
      ).results;

      const dateStr = new Date(match.match_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

      const batch = nonResponders.map((m) => ({
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
      }));
      await sendEmailBatch(batch);

      await db.prepare("INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)")
        .bind("rsvp_reminder", `${match.id}|${nonResponders.length} recipients`, now.toISOString())
        .run();

      log.push(`[RSVP reminder] ${match.opponent_team} on ${match.match_date}: sent to ${nonResponders.length} non-responders`);
    }
  }

  // 3. Tournament score reminders: matches past scheduled date without a score
  //    Only nudge once, then again every 3 days if still no score.
  const overdueMatches = (
    await db.prepare(
      `SELECT tm.id, tm.scheduled_date, tm.week, tm.tournament_id,
              t.name as tournament_name, t.slug as tournament_slug,
              tp1.player_id as p1_player_id, p1.name as p1_name, p1.email as p1_email,
              tp2.player_id as p2_player_id, p2.name as p2_name, p2.email as p2_email
       FROM tournament_matches tm
       JOIN tournaments t ON t.id = tm.tournament_id
       LEFT JOIN tournament_participants tp1 ON tp1.id = tm.participant1_id
       LEFT JOIN players p1 ON p1.id = tp1.player_id
       LEFT JOIN tournament_participants tp2 ON tp2.id = tm.participant2_id
       LEFT JOIN players p2 ON p2.id = tp2.player_id
       WHERE tm.status = 'scheduled'
         AND tm.scheduled_date < ?
         AND tm.score1_sets IS NULL
         AND tm.bye = 0`
    ).bind(today).all<{
      id: string; scheduled_date: string; week: number; tournament_id: string;
      tournament_name: string; tournament_slug: string;
      p1_player_id: string; p1_name: string; p1_email: string;
      p2_player_id: string; p2_name: string; p2_email: string;
    }>()
  ).results;

  const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString();

  for (const m of overdueMatches) {
    const lastNudge = await db.prepare(
      "SELECT created_at FROM app_events WHERE event = 'score_reminder' AND detail LIKE ? ORDER BY created_at DESC LIMIT 1"
    ).bind(`${m.id}|%`).first<{ created_at: string }>();

    if (lastNudge && lastNudge.created_at > threeDaysAgo) continue;

    const dateStr = new Date(m.scheduled_date + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric",
    });
    const matchUrl = `https://framers.app/tournament/${m.tournament_slug}/match/${m.id}`;

    const batch = [m.p1_email, m.p2_email]
      .filter(Boolean)
      .map((email) => {
        const firstName = (email === m.p1_email ? m.p1_name : m.p2_name).split(" ")[0];
        const opponent = email === m.p1_email ? m.p2_name : m.p1_name;
        return {
          to: email,
          subject: `Score needed: ${m.tournament_name} — Week ${m.week}`,
          html: emailTemplate(
            `<p>Hey ${firstName},</p>
             <p>Your Week ${m.week} match against <strong>${opponent}</strong> was scheduled for <strong>${dateStr}</strong> but we don&rsquo;t have a score yet.</p>
             <p>If the match was played, please enter the score. If it wasn&rsquo;t, you can reschedule it from the match page.</p>`,
            {
              heading: m.tournament_name,
              ctaUrl: matchUrl,
              ctaLabel: "Enter Score or Reschedule",
            }
          ),
        };
      });

    if (batch.length > 0) {
      await sendEmailBatch(batch);
      await db.prepare("INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)")
        .bind("score_reminder", `${m.id}|${batch.length} recipients`, now.toISOString())
        .run();
      log.push(`[Score reminder] Week ${m.week} ${m.p1_name} vs ${m.p2_name}: sent ${batch.length} emails`);
    }
  }

  // 4. USTA sync for all active/upcoming teams + ELO recalculation
  const ustaTeams = (
    await db.prepare("SELECT slug FROM teams WHERE status IN ('active','upcoming') AND usta_team_id IS NOT NULL")
      .all<{ slug: string }>()
  ).results;

  let totalScorecards = 0;
  let totalUpdated = 0;
  for (const t of ustaTeams) {
    try {
      const result = await syncUstaTeam(db, t.slug);
      totalScorecards += result.scorecards;
      totalUpdated += result.updated;
      if (result.updated > 0 || result.rosterSynced > 0) {
        log.push(`[USTA sync] ${t.slug}: ${result.scorecards} scorecards, ${result.updated} updated, ${result.rosterSynced} rostered`);
      }
    } catch (e) {
      log.push(`[USTA sync] ${t.slug}: error — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (totalUpdated > 0) {
    try {
      const eloResult = await recalculateElo(db);
      log.push(`[ELO] recalculated: ${eloResult.eloUpdates} updates (${eloResult.tournamentMatches} tourney, ${eloResult.leagueResults} league)`);
    } catch (e) {
      log.push(`[ELO] error — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({ ok: true, ran: new Date().toISOString(), log });
}
