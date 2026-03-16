import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkAutoTransitions } from "@/lib/match-lifecycle";
import { sendEmailBatch, emailTemplate, matchThreadHeaders, listSender } from "@/lib/email";
import { syncUstaTeam } from "@/lib/usta-sync";
import { recalculateElo } from "@/lib/elo-recalc";
import { gatherDigestData, generateDigestNarrative, buildDigestEmailHtml } from "@/lib/tournament-digest";
import { generatePreMatchCommentary, generatePostMatchCommentary } from "@/lib/league-commentary";

const POSITION_LABELS: Record<string, string> = {
  D1A: "Doubles 1", D1B: "Doubles 1", D2A: "Doubles 2", D2B: "Doubles 2",
  D3A: "Doubles 3", D3B: "Doubles 3", S1: "Singles 1", S2: "Singles 2",
};

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

      const sender = listSender(match.team_slug, match.team_name);
      const batch = nonResponders.map((m) => ({
        to: m.email,
        subject: `RSVP reminder: ${match.team_name} vs ${match.opponent_team}`,
        ...sender,
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
        headers: matchThreadHeaders(match.id),
      }));
      await sendEmailBatch(batch);

      await db.prepare("INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)")
        .bind("rsvp_reminder", `${match.id}|${nonResponders.length} recipients`, now.toISOString())
        .run();

      log.push(`[RSVP reminder] ${match.opponent_team} on ${match.match_date}: sent to ${nonResponders.length} non-responders`);
    }
  }

  // 3. Pre-match emails: good luck + unconfirmed player nudges (matches tomorrow)
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  const tomorrowMatches = (await db.prepare(
    `SELECT lm.id, lm.opponent_team, lm.match_date, lm.match_time, lm.location,
            lm.is_home, lm.notes, lm.status,
            t.id as team_id, t.name as team_name, t.slug as team_slug,
            l.id as lineup_id, l.status as lineup_status
     FROM league_matches lm
     JOIN teams t ON t.id = lm.team_id
     LEFT JOIN lineups l ON l.match_id = lm.id
     WHERE lm.match_date = ? AND lm.status NOT IN ('completed','cancelled')`
  ).bind(tomorrow).all<{
    id: string; opponent_team: string; match_date: string; match_time: string | null;
    location: string | null; is_home: number; notes: string | null; status: string;
    team_id: string; team_name: string; team_slug: string;
    lineup_id: string | null; lineup_status: string | null;
  }>()).results;

  for (const match of tomorrowMatches) {
    const alreadySent = (await db.prepare(
      "SELECT COUNT(*) as cnt FROM app_events WHERE event = 'prematch_email' AND detail = ?"
    ).bind(match.id).first<{ cnt: number }>())?.cnt ?? 0;
    if (alreadySent > 0) continue;

    const dateStr = new Date(match.match_date + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric",
    });
    let timeStr = "";
    if (match.match_time) {
      const [h, m] = match.match_time.split(":").map(Number);
      timeStr = `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
    }
    const matchUrl = `https://framers.app/team/${match.team_slug}/match/${match.id}`;
    const sender = listSender(match.team_slug, match.team_name);
    const lineupConfirmed = match.lineup_status === "confirmed" || match.lineup_status === "locked";

    // Get our season record
    const seasonRecord = await db.prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN team_result = 'Won' THEN 1 ELSE 0 END) as wins,
              SUM(CASE WHEN team_result = 'Lost' THEN 1 ELSE 0 END) as losses
       FROM league_matches WHERE team_id = ? AND status = 'completed'`
    ).bind(match.team_id).first<{ total: number; wins: number; losses: number }>();

    // Check for past results against this opponent
    const pastResults = (await db.prepare(
      `SELECT team_score, team_result, match_date
       FROM league_matches
       WHERE team_id = ? AND opponent_team = ? AND status = 'completed'
       ORDER BY match_date DESC LIMIT 3`
    ).bind(match.team_id, match.opponent_team).all<{ team_score: string; team_result: string; match_date: string }>()).results;

    const seasonStr = seasonRecord && seasonRecord.total > 0
      ? `Season record: <strong>${seasonRecord.wins}-${seasonRecord.losses}</strong>`
      : "";

    const historyHtml = pastResults.length > 0
      ? `<p style="margin: 8px 0; font-size: 13px; color: #475569;">Previous results vs ${match.opponent_team}: ${pastResults.map((r) => `${r.team_result} ${r.team_score}`).join(", ")}</p>`
      : "";

    // Check how many matches remain after this one
    const remainingAfterThis = (await db.prepare(
      "SELECT COUNT(*) as cnt FROM league_matches WHERE team_id = ? AND status NOT IN ('completed','cancelled') AND match_date > ?"
    ).bind(match.team_id, match.match_date).first<{ cnt: number }>())?.cnt ?? 0;
    const isFinalMatch = remainingAfterThis === 0;

    const logisticsHtml = `
      <table role="presentation" style="width: 100%; margin: 16px 0; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; border-spacing: 0;">
        <tr>
          <td style="padding: 12px 16px; border-right: 1px solid #e2e8f0; width: 50%;">
            <p style="margin: 0 0 2px 0; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px;">When</p>
            <p style="margin: 0; font-size: 14px; font-weight: 600; color: #1e293b;">${dateStr}${timeStr ? ` · ${timeStr}` : ""}</p>
          </td>
          <td style="padding: 12px 16px; width: 50%;">
            <p style="margin: 0 0 2px 0; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px;">Where</p>
            <p style="margin: 0; font-size: 14px; font-weight: 600; color: #1e293b;">${match.location || "TBD"}</p>
          </td>
        </tr>
        ${match.notes ? `<tr><td colspan="2" style="padding: 8px 16px; border-top: 1px solid #e2e8f0;"><p style="margin: 0; font-size: 13px; color: #475569;">${match.notes}</p></td></tr>` : ""}
      </table>`;

    // Get lineup slots if lineup exists
    let lineupHtml = "";
    let unconfirmedPlayers: { email: string; name: string; position: string }[] = [];
    if (match.lineup_id && lineupConfirmed) {
      const slots = (await db.prepare(
        `SELECT ls.position, ls.is_alternate, ls.acknowledged, p.id as player_id, p.name, p.email
         FROM lineup_slots ls JOIN players p ON p.id = ls.player_id
         WHERE ls.lineup_id = ? ORDER BY ls.position`
      ).bind(match.lineup_id).all<{
        position: string; is_alternate: number; acknowledged: number | null;
        player_id: string; name: string; email: string;
      }>()).results;

      const starters = slots.filter((s) => s.is_alternate === 0);
      unconfirmedPlayers = starters
        .filter((s) => s.acknowledged !== 1)
        .map((s) => ({ email: s.email, name: s.name, position: s.position }));

      const lineupRows = starters.map((s) => {
        const label = POSITION_LABELS[s.position] || s.position;
        const ackIcon = s.acknowledged === 1 ? ' <span style="color: #16a34a;">&#10003;</span>' : ' <span style="color: #f59e0b;">?</span>';
        return `<tr><td style="padding: 4px 10px; font-weight: 600; color: #475569;">${label}</td><td style="padding: 4px 10px; color: #1e293b;">${s.name}${ackIcon}</td></tr>`;
      }).join("");

      lineupHtml = `
        <h3 style="font-size: 14px; color: #64748b; margin: 16px 0 6px 0;">Lineup</h3>
        <table role="presentation" style="width: 100%; font-size: 13px;">${lineupRows}</table>`;
    }

    const teamMembers = (await db.prepare(
      `SELECT p.id, p.email, p.name FROM team_memberships tm
       JOIN players p ON p.id = tm.player_id
       WHERE tm.team_id = ? AND tm.active = 1`
    ).bind(match.team_id).all<{ id: string; email: string; name: string }>()).results;

    // Send "haven't confirmed" nudge to unconfirmed players
    if (unconfirmedPlayers.length > 0) {
      const nudgeBatch = unconfirmedPlayers.map((p) => ({
        to: p.email,
        subject: `Action needed: ${match.team_name} vs ${match.opponent_team}`,
        ...sender,
        html: emailTemplate(
          `<h2 style="margin: 0 0 12px 0; font-size: 18px; color: #dc2626;">Hey ${p.name.split(" ")[0]}, you haven't confirmed!</h2>
           <p>You're in the lineup at <strong>${POSITION_LABELS[p.position] || p.position}</strong> for tomorrow's match against <strong>${match.opponent_team}</strong>, but you haven't confirmed yet.</p>
           <p>If you can't make it, please let us know ASAP so we can find a replacement.</p>
           ${logisticsHtml}`,
          { heading: "Confirmation Needed", ctaUrl: matchUrl, ctaLabel: "Confirm I'll Be There", secondaryCtaUrl: matchUrl, secondaryCtaLabel: "Can't Make It" }
        ),
        headers: matchThreadHeaders(match.id),
      }));
      await sendEmailBatch(nudgeBatch);
      log.push(`[Unconfirmed nudge] ${match.opponent_team}: sent to ${unconfirmedPlayers.length} unconfirmed players`);

      // Alert the team about missing confirmations
      const unconfNames = unconfirmedPlayers.map((p) => p.name.split(" ")[0]).join(", ");
      const alertBatch = teamMembers
        .filter((m) => !unconfirmedPlayers.some((u) => u.email === m.email))
        .map((m) => ({
          to: m.email,
          subject: `Missing confirmations: ${match.team_name} vs ${match.opponent_team}`,
          ...sender,
          html: emailTemplate(
            `<p>Heads up — we're still waiting on confirmation from <strong>${unconfNames}</strong> for tomorrow's match against <strong>${match.opponent_team}</strong>.</p>
             <p>If you're available as a backup, let the captain know!</p>
             ${logisticsHtml}`,
            { heading: "Confirmation Alert", ctaUrl: matchUrl, ctaLabel: "View Match" }
          ),
          headers: matchThreadHeaders(match.id),
        }));
      await sendEmailBatch(alertBatch);
      log.push(`[Confirmation alert] ${match.opponent_team}: sent to ${alertBatch.length} team members`);
    }

    // Generate AI pre-match commentary
    const lineupForCommentary = match.lineup_id && lineupConfirmed
      ? (await db.prepare(
          `SELECT ls.position, p.name FROM lineup_slots ls
           JOIN players p ON p.id = ls.player_id
           WHERE ls.lineup_id = ? AND ls.is_alternate = 0 ORDER BY ls.position`
        ).bind(match.lineup_id).all<{ position: string; name: string }>()).results.map((s) => ({
          name: s.name, position: POSITION_LABELS[s.position] || s.position,
        }))
      : [];

    // Load scouting data for pre-match commentary
    let preMatchScouting: Parameters<typeof generatePreMatchCommentary>[0]["scouting"];
    try {
      const { getCachedTeam, getHeadToHead, predictMatchOutcome } = await import("@/lib/tr-scouting");
      const oppPlayers = await getCachedTeam(match.opponent_team);
      if (oppPlayers.length > 0) {
        const h2h = await getHeadToHead("GREENBROOK RS 40AM3.0A", match.opponent_team);
        const prediction = predictMatchOutcome(
          lineupForCommentary.map((l) => ({ position: l.position, playerName: l.name, trRating: null })),
          oppPlayers.map((p) => ({ name: p.player_name, trRating: p.tr_rating, trDynamicRating: p.tr_dynamic_rating })),
        );
        preMatchScouting = {
          players: oppPlayers.map((p) => ({
            name: p.player_name,
            rating: p.tr_dynamic_rating ?? p.tr_rating ?? 0,
            record: p.season_record ?? "",
            streak: p.current_streak,
            avgOppRating: p.avg_opponent_rating,
          })),
          predictedScore: prediction.predictedResult,
          headToHead: h2h.slice(0, 5).map((h) => ({
            ourPlayer: h.ourPlayer, opponent: h.opponent,
            result: h.result ?? "", score: h.score, date: h.date,
          })),
        };
      }
    } catch (e) {
      console.error("[Pre-match scouting]", e);
    }

    const preMatchNarrative = await generatePreMatchCommentary({
      teamName: match.team_name,
      opponentTeam: match.opponent_team,
      seasonRecord: { wins: seasonRecord?.wins ?? 0, losses: seasonRecord?.losses ?? 0, total: seasonRecord?.total ?? 0 },
      pastResults,
      isHome: match.is_home === 1,
      isFinalMatch,
      matchDate: match.match_date,
      lineup: lineupForCommentary,
      remainingMatches: remainingAfterThis,
      scouting: preMatchScouting,
    });

    const narrativeHtml = preMatchNarrative
      ? `<div style="margin: 16px 0; padding: 16px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; font-size: 14px; line-height: 1.7; color: #0c4a6e;">${preMatchNarrative}</div>`
      : "";

    // Send good luck email to everyone
    const subjectPrefix = isFinalMatch ? "Season finale" : "Good luck tomorrow";
    const goodLuckBatch = teamMembers.map((m) => ({
      to: m.email,
      subject: `${subjectPrefix}: ${match.team_name} vs ${match.opponent_team}`,
      ...sender,
      html: emailTemplate(
        `<h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0c4a6e;">${isFinalMatch ? "Season finale tomorrow!" : "Match day tomorrow!"}</h2>
         <p><strong>${match.team_name}</strong> takes on <strong>${match.opponent_team}</strong> ${match.is_home ? "at home" : "away"}.</p>
         ${logisticsHtml}
         ${seasonStr ? `<p style="font-size: 14px; color: #1e293b;">${seasonStr}</p>` : ""}
         ${historyHtml}
         ${narrativeHtml}
         ${lineupHtml}
         <p style="margin-top: 16px; font-size: 15px; font-weight: 600; color: #0c4a6e;">Let's go Framers!</p>`,
        { heading: isFinalMatch ? "Season Finale" : "Match Day", ctaUrl: matchUrl, ctaLabel: "View Match Details" }
      ),
      headers: matchThreadHeaders(match.id),
    }));
    await sendEmailBatch(goodLuckBatch);

    // Generate/refresh the match preview card for the team page
    if (lineupConfirmed) {
      try {
        const { generateMatchPreview } = await import("@/lib/league-match-preview");
        await generateMatchPreview(match.id);
        log.push(`[Match preview] ${match.opponent_team}: generated`);
      } catch (e) {
        log.push(`[Match preview] ${match.opponent_team}: error — ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await db.prepare("INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)")
      .bind("prematch_email", match.id, now.toISOString()).run();
    log.push(`[Pre-match] ${match.opponent_team} tomorrow: sent to ${teamMembers.length} members`);
  }

  // 4. Tournament score reminders: matches past scheduled date without a score

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
    const tourneySender = listSender(m.tournament_slug, m.tournament_name);

    const batch = [m.p1_email, m.p2_email]
      .filter(Boolean)
      .map((email) => {
        const firstName = (email === m.p1_email ? m.p1_name : m.p2_name).split(" ")[0];
        const opponent = email === m.p1_email ? m.p2_name : m.p1_name;
        return {
          to: email,
          subject: `Score needed: ${m.tournament_name} — Week ${m.week}`,
          ...tourneySender,
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

  // 5. USTA sync for all active/upcoming teams + ELO recalculation
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

  // 5.4 Generate league form summaries for players in recently completed matches
  if (totalUpdated > 0) {
    try {
      const { generateLeagueForm } = await import("@/lib/player-form");
      const recentPlayers = (await db.prepare(
        `SELECT DISTINCT lmr.player1_id, lmr.player2_id
         FROM league_match_results lmr
         JOIN league_matches lm ON lm.id = lmr.match_id
         WHERE lm.status = 'completed' AND lm.match_date >= ?`
      ).bind(new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10)).all<{ player1_id: string | null; player2_id: string | null }>()).results;

      const playerIds = new Set<string>();
      for (const r of recentPlayers) {
        if (r.player1_id) playerIds.add(r.player1_id);
        if (r.player2_id) playerIds.add(r.player2_id);
      }

      let formCount = 0;
      for (const pid of playerIds) {
        await generateLeagueForm(pid);
        formCount++;
      }
      if (formCount > 0) log.push(`[League form] Generated for ${formCount} players`);
    } catch (e) {
      log.push(`[League form] error — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 5.5 TennisRecord scouting: quick-scout just-completed opponents + deep-scout upcoming
  try {
    const { quickScoutOpponent, scoutOpponent, scoutOwnTeam, isCacheFresh } = await import("@/lib/tr-scouting");

    // Quick-scout any recently completed matches whose opponents aren't cached
    const justCompletedOpponents = (await db.prepare(
      `SELECT DISTINCT opponent_team FROM league_matches
       WHERE status = 'completed' AND team_score IS NOT NULL
       AND match_date >= ? AND opponent_team IS NOT NULL`
    ).bind(new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10)).all<{ opponent_team: string }>()).results;

    for (const opp of justCompletedOpponents) {
      const fresh = await isCacheFresh(opp.opponent_team);
      if (!fresh) {
        await quickScoutOpponent(opp.opponent_team, now.getFullYear());
        log.push(`[TR scout] Quick-scouted ${opp.opponent_team}`);
      }
    }

    // Deep-scout one upcoming opponent (next 7 days) if not cached
    const upcomingOpp = (await db.prepare(
      `SELECT DISTINCT opponent_team FROM league_matches
       WHERE status NOT IN ('completed','cancelled')
       AND match_date BETWEEN ? AND ?
       AND opponent_team IS NOT NULL
       LIMIT 1`
    ).bind(today, new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10)).all<{ opponent_team: string }>()).results;

    for (const opp of upcomingOpp) {
      const fresh = await isCacheFresh(opp.opponent_team);
      if (!fresh) {
        await scoutOpponent(opp.opponent_team, now.getFullYear());
        log.push(`[TR scout] Deep-scouted upcoming opponent ${opp.opponent_team}`);
      }
    }

    // Refresh own team ratings weekly
    const ownTeamNames = (await db.prepare(
      "SELECT name FROM teams WHERE status IN ('active','upcoming') AND usta_team_id IS NOT NULL"
    ).all<{ name: string }>()).results;

    // Map to TR team names via known mapping
    const trNameMap: Record<string, string> = {
      "Senior Framers 2026": "GREENBROOK RS 40AM3.0A",
      "Junior Framers 2026": "GREENBROOK RS 18AM3.0A",
    };

    for (const t of ownTeamNames) {
      const trName = trNameMap[t.name];
      if (!trName) continue;
      const fresh = await isCacheFresh(trName);
      if (!fresh) {
        await scoutOwnTeam(trName, now.getFullYear());
        log.push(`[TR scout] Synced own team ${trName}`);
      }
    }
  } catch (e) {
    log.push(`[TR scout] error — ${e instanceof Error ? e.message : String(e)}`);
  }

  // 6. Post-match results emails for recently completed league matches (last 7 days only)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const recentlyCompleted = (await db.prepare(
    `SELECT lm.id, lm.opponent_team, lm.match_date, lm.match_time, lm.location,
            lm.is_home, lm.team_result, lm.team_score, lm.usta_url,
            t.id as team_id, t.name as team_name, t.slug as team_slug
     FROM league_matches lm
     JOIN teams t ON t.id = lm.team_id
     WHERE lm.status = 'completed' AND lm.team_score IS NOT NULL
       AND lm.match_date >= ?`
  ).bind(sevenDaysAgo).all<{
    id: string; opponent_team: string; match_date: string; match_time: string | null;
    location: string | null; is_home: number; team_result: string; team_score: string;
    usta_url: string | null; team_id: string; team_name: string; team_slug: string;
  }>()).results;

  for (const match of recentlyCompleted) {
    const alreadyEmailed = (await db.prepare(
      "SELECT COUNT(*) as cnt FROM app_events WHERE event = 'match_results_emailed' AND detail = ?"
    ).bind(match.id).first<{ cnt: number }>())?.cnt ?? 0;
    if (alreadyEmailed > 0) continue;

    const lineResults = (await db.prepare(
      `SELECT lmr.position, lmr.won, lmr.our_score, lmr.opp_score,
              lmr.player1_id, lmr.player2_id, lmr.is_default_win,
              p1.name as player1_name, p2.name as player2_name
       FROM league_match_results lmr
       LEFT JOIN players p1 ON p1.id = lmr.player1_id
       LEFT JOIN players p2 ON p2.id = lmr.player2_id
       WHERE lmr.match_id = ?
       ORDER BY lmr.position`
    ).bind(match.id).all<{
      position: string; won: number | null; our_score: string | null; opp_score: string | null;
      player1_id: string | null; player2_id: string | null; is_default_win: number;
      player1_name: string | null; player2_name: string | null;
    }>()).results;

    if (lineResults.length === 0) continue;

    const dateStr = new Date(match.match_date + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric",
    });

    const isWin = match.team_result === "Won";
    const resultBadge = isWin
      ? '<span style="background: #dcfce7; color: #166534; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 6px;">WIN</span>'
      : '<span style="background: #fef2f2; color: #991b1b; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 6px;">LOSS</span>';

    const lineRows = lineResults.map((lr) => {
      const label = POSITION_LABELS[lr.position] || lr.position;
      const players = [lr.player1_name, lr.player2_name].filter(Boolean).join(" & ");
      const wonCell = lr.is_default_win
        ? '<span style="color: #94a3b8;">Default</span>'
        : lr.won === 1
          ? '<span style="color: #166534; font-weight: 600;">W</span>'
          : lr.won === 0
            ? '<span style="color: #991b1b; font-weight: 600;">L</span>'
            : '<span style="color: #94a3b8;">—</span>';
      const score = lr.our_score && lr.opp_score ? `${lr.our_score}` : "";
      return `<tr>
        <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #475569;">${label}</td>
        <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${players || "—"}</td>
        <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${wonCell}</td>
        <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; color: #475569; font-family: monospace;">${score}</td>
      </tr>`;
    }).join("");

    const resultsTableHtml = `
      <table role="presentation" style="width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; border-spacing: 0; border-collapse: collapse; font-size: 13px;">
        <tr style="background: #f1f5f9;">
          <th style="padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b;">Line</th>
          <th style="padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b;">Player(s)</th>
          <th style="padding: 8px 10px; text-align: center; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b;">Result</th>
          <th style="padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b;">Score</th>
        </tr>
        ${lineRows}
      </table>`;

    const matchUrl = `https://framers.app/team/${match.team_slug}/match/${match.id}`;
    const postSender = listSender(match.team_slug, match.team_name);
    const subject = `Results: ${match.team_name} vs ${match.opponent_team}`;
    const threadHeaders = matchThreadHeaders(match.id);

    // Season context for commentary
    const postSeasonRecord = await db.prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN team_result = 'Won' THEN 1 ELSE 0 END) as wins,
              SUM(CASE WHEN team_result = 'Lost' THEN 1 ELSE 0 END) as losses
       FROM league_matches WHERE team_id = ? AND status = 'completed'`
    ).bind(match.team_id).first<{ total: number; wins: number; losses: number }>();

    const postPastResults = (await db.prepare(
      `SELECT team_score, team_result, match_date FROM league_matches
       WHERE team_id = ? AND opponent_team = ? AND status = 'completed'
       ORDER BY match_date DESC LIMIT 3`
    ).bind(match.team_id, match.opponent_team).all<{ team_score: string; team_result: string; match_date: string }>()).results;

    const postRemainingMatches = (await db.prepare(
      "SELECT COUNT(*) as cnt FROM league_matches WHERE team_id = ? AND status NOT IN ('completed','cancelled') AND match_date > ?"
    ).bind(match.team_id, match.match_date).first<{ cnt: number }>())?.cnt ?? 0;

    // Load scouting data for post-match commentary
    let postMatchScouting: Parameters<typeof generatePostMatchCommentary>[0]["scouting"];
    try {
      const { getCachedTeam, getHeadToHead } = await import("@/lib/tr-scouting");
      const oppPlayers = await getCachedTeam(match.opponent_team);
      if (oppPlayers.length > 0) {
        const h2h = await getHeadToHead("GREENBROOK RS 40AM3.0A", match.opponent_team);
        postMatchScouting = {
          players: oppPlayers.map((p) => ({
            name: p.player_name,
            rating: p.tr_dynamic_rating ?? p.tr_rating ?? 0,
            record: p.season_record ?? "",
            streak: p.current_streak,
            avgOppRating: p.avg_opponent_rating,
          })),
          headToHead: h2h.slice(0, 5).map((h) => ({
            ourPlayer: h.ourPlayer, opponent: h.opponent,
            result: h.result ?? "", score: h.score, date: h.date,
          })),
        };
      }
    } catch (e) {
      console.error("[Post-match scouting]", e);
    }

    const postMatchNarrative = await generatePostMatchCommentary({
      teamName: match.team_name,
      opponentTeam: match.opponent_team,
      seasonRecord: { wins: postSeasonRecord?.wins ?? 0, losses: postSeasonRecord?.losses ?? 0, total: postSeasonRecord?.total ?? 0 },
      pastResults: postPastResults,
      isHome: match.is_home === 1,
      isFinalMatch: postRemainingMatches === 0,
      matchDate: match.match_date,
      teamScore: match.team_score,
      teamResult: match.team_result,
      lineResults: lineResults.map((lr) => ({
        position: POSITION_LABELS[lr.position] || lr.position,
        players: [lr.player1_name, lr.player2_name].filter(Boolean).join(" & "),
        won: lr.won === 1,
        score: lr.our_score && lr.opp_score ? lr.our_score : "",
        isDefault: lr.is_default_win === 1,
      })),
      scouting: postMatchScouting,
    });

    const postNarrativeHtml = postMatchNarrative
      ? `<div style="margin: 16px 0; padding: 16px; background: ${isWin ? "#f0fdf4" : "#fefce8"}; border: 1px solid ${isWin ? "#bbf7d0" : "#fde68a"}; border-radius: 8px; font-size: 14px; line-height: 1.7; color: #1e293b;">${postMatchNarrative}</div>`
      : "";

    const teamMembers = (await db.prepare(
      `SELECT p.email, p.name FROM team_memberships tm
       JOIN players p ON p.id = tm.player_id
       WHERE tm.team_id = ? AND tm.active = 1`
    ).bind(match.team_id).all<{ email: string; name: string }>()).results;

    const batch = teamMembers.map((m) => ({
      to: m.email,
      subject,
      ...postSender,
      html: emailTemplate(
        `<h2 style="margin: 0 0 8px 0; font-size: 18px; color: #0c4a6e;">Match Results ${resultBadge}</h2>
         <p><strong>${match.team_name}</strong> vs <strong>${match.opponent_team}</strong> (${match.is_home ? "Home" : "Away"}) — <strong>${match.team_score}</strong></p>
         <p style="font-size: 13px; color: #64748b;">${dateStr}${match.location ? ` · ${match.location}` : ""}</p>
         ${postNarrativeHtml}
         <h3 style="font-size: 14px; color: #64748b; margin: 20px 0 8px 0;">Line-by-Line Results</h3>
         ${resultsTableHtml}
         ${match.usta_url ? `<p style="margin-top: 16px; font-size: 13px;"><a href="${match.usta_url}" style="color: #0369a1;">View USTA Scorecard</a></p>` : ""}`,
        { heading: `${match.team_score} — ${match.team_result}`, ctaUrl: matchUrl, ctaLabel: "View Match Details" }
      ),
      headers: threadHeaders,
    }));

    await sendEmailBatch(batch);
    await db.prepare("INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)")
      .bind("match_results_emailed", match.id, now.toISOString()).run();
    log.push(`[Match results] ${match.team_name} vs ${match.opponent_team} (${match.team_score}): sent to ${teamMembers.length} members`);
  }

  // 7. Weekly tournament digest — Sundays only
  const pacificHour = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const isSunday = pacificHour.getDay() === 0;

  if (isSunday) {
    const activeTournaments = (await db.prepare(
      "SELECT slug FROM tournaments WHERE status = 'active'"
    ).all<{ slug: string }>()).results;

    for (const t of activeTournaments) {
      const digestDedup = `${t.slug}|${today}`;
      const alreadySent = (await db.prepare(
        "SELECT COUNT(*) as cnt FROM app_events WHERE event = 'tournament_weekly_digest' AND detail = ?"
      ).bind(digestDedup).first<{ cnt: number }>())?.cnt ?? 0;
      if (alreadySent > 0) continue;

      try {
        // Regenerate match quips before building digest
        try {
          const { regenerateAllQuips } = await import("@/lib/match-predictions");
          const tournamentId = (await db.prepare("SELECT id FROM tournaments WHERE slug = ?").bind(t.slug).first<{ id: string }>())?.id;
          if (tournamentId) {
            const quipCount = await regenerateAllQuips(tournamentId);
            if (quipCount > 0) log.push(`[Quips] ${t.slug}: regenerated ${quipCount} match predictions`);
          }
        } catch (e) {
          log.push(`[Quips] ${t.slug}: error — ${e instanceof Error ? e.message : String(e)}`);
        }

        const data = await gatherDigestData(db, t.slug);
        if (!data) {
          log.push(`[Digest] ${t.slug}: no results this week, skipping`);
          continue;
        }

        const narrative = await generateDigestNarrative(data);
        const html = buildDigestEmailHtml(data, narrative);

        const participants = (await db.prepare(
          `SELECT p.email, p.name FROM tournament_participants tp
           JOIN players p ON p.id = tp.player_id
           WHERE tp.tournament_id = (SELECT id FROM tournaments WHERE slug = ?)`
        ).bind(t.slug).all<{ email: string; name: string }>()).results;

        const digestSender = listSender(t.slug, data.tournamentName);
        const subject = `${data.tournamentName} — ${data.weekLabel} Recap`;
        const batch = participants.map((p) => ({ to: p.email, subject, ...digestSender, html }));

        await sendEmailBatch(batch);
        await db.prepare("INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)")
          .bind("tournament_weekly_digest", digestDedup, now.toISOString()).run();
        log.push(`[Digest] ${t.slug}: ${data.weekLabel} sent to ${participants.length} participants`);
      } catch (e) {
        log.push(`[Digest] ${t.slug}: error — ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return NextResponse.json({ ok: true, ran: new Date().toISOString(), log });
}
