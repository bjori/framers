import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sendEmail, emailTemplate } from "@/lib/email";
import { buildCaptainNoteHtml } from "@/lib/email-logistics";
import { track } from "@/lib/analytics";

interface RsvpBody {
  matchId: string;
  status: "yes" | "no" | "maybe";
  /**
   * When set, the RSVP applies to a single slot of a split-schedule match.
   * When omitted, this is the player's "overall" RSVP (applies to every
   * slot by default).
   */
  slotDate?: string | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const body = (await request.json()) as RsvpBody;

  if (!body.matchId || !["yes", "no", "maybe"].includes(body.status)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const db = await getDB();

  // Verify team membership
  const team = await db
    .prepare("SELECT id FROM teams WHERE slug = ?")
    .bind(slug)
    .first<{ id: string }>();

  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const membership = await db
    .prepare("SELECT 1 FROM team_memberships WHERE player_id = ? AND team_id = ? AND active = 1")
    .bind(session.player_id, team.id)
    .first();

  if (!membership) {
    return NextResponse.json({ error: "Not an active team member" }, { status: 403 });
  }

  // Verify the match belongs to this team and is confirmed (time posted)
  const match = await db
    .prepare("SELECT id, rsvp_deadline, notes FROM league_matches WHERE id = ? AND team_id = ?")
    .bind(body.matchId, team.id)
    .first<{ id: string; rsvp_deadline: string | null; notes: string | null }>();

  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const confirmed = !!(match.notes && match.notes.trim());
  if (!confirmed) {
    return NextResponse.json(
      { error: "Match date is not confirmed yet. Availability opens once the opponent posts the time." },
      { status: 400 }
    );
  }

  const beforeDeadline = match.rsvp_deadline
    ? new Date() < new Date(match.rsvp_deadline) ? 1 : 0
    : 1;

  // Check previous status
  const prevRsvp = await db
    .prepare("SELECT status FROM availability WHERE player_id = ? AND match_id = ?")
    .bind(session.player_id, body.matchId)
    .first<{ status: string }>();

  const slotDate = body.slotDate ?? null;

  if (slotDate) {
    // Per-slot override. If the new status matches the player's overall
    // answer, drop the override so the row simply inherits. Otherwise
    // upsert the override. This keeps the table sparse and predictable.
    if (prevRsvp?.status === body.status) {
      await db
        .prepare("DELETE FROM availability_slots WHERE player_id = ? AND match_id = ? AND slot_date = ?")
        .bind(session.player_id, body.matchId, slotDate)
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO availability_slots (player_id, match_id, slot_date, status, responded_at, is_before_deadline)
           VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), ?)
           ON CONFLICT (player_id, match_id, slot_date)
           DO UPDATE SET status = excluded.status, responded_at = excluded.responded_at, is_before_deadline = excluded.is_before_deadline`,
        )
        .bind(session.player_id, body.matchId, slotDate, body.status, beforeDeadline)
        .run();
    }
    // Keep the overall row present (pending) so the player has a record;
    // this is cheap and makes the UI flow smoother when they later go
    // back to set an overall answer.
    await db
      .prepare(
        `INSERT INTO availability (player_id, match_id, status, responded_at, is_before_deadline)
         VALUES (?, ?, 'pending', NULL, ?)
         ON CONFLICT (player_id, match_id) DO NOTHING`,
      )
      .bind(session.player_id, body.matchId, beforeDeadline)
      .run();
    await track("rsvp_league_slot", { playerId: session.player_id, detail: `${body.matchId}|${slotDate}:${body.status}` });
    return NextResponse.json({ ok: true, scope: "slot", slot_date: slotDate, status: body.status });
  }

  await db
    .prepare(
      `INSERT INTO availability (player_id, match_id, status, responded_at, is_before_deadline)
       VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), ?)
       ON CONFLICT (player_id, match_id)
       DO UPDATE SET status = excluded.status, responded_at = excluded.responded_at`
    )
    .bind(session.player_id, body.matchId, body.status, beforeDeadline)
    .run();

  // Setting a new overall answer clears any per-slot overrides that now
  // agree with it (to keep the table sparse). Overrides that still diverge
  // are preserved — the player has explicitly said "this slot is different".
  await db
    .prepare(
      "DELETE FROM availability_slots WHERE player_id = ? AND match_id = ? AND status = ?",
    )
    .bind(session.player_id, body.matchId, body.status)
    .run();

  await track("rsvp_league", { playerId: session.player_id, detail: `${body.matchId}:${body.status}` });

  // If player stepped up (changed to "yes" after lineup was already confirmed), thank them and notify captains
  if (body.status === "yes" && prevRsvp?.status !== "yes") {
    const matchDetails = await db.prepare(
      `SELECT lm.status as match_status, lm.opponent_team, lm.match_date, lm.captain_notes,
              t.slug as team_slug, t.name as team_name
       FROM league_matches lm
       JOIN teams t ON t.id = lm.team_id
       WHERE lm.id = ?`
    ).bind(body.matchId).first<{
      match_status: string; opponent_team: string; match_date: string; captain_notes: string | null; team_slug: string; team_name: string;
    }>();

    if (matchDetails && ["lineup_confirmed", "locked"].includes(matchDetails.match_status)) {
      const dateStr = new Date(matchDetails.match_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const matchUrl = `https://framers.app/team/${matchDetails.team_slug}/match/${body.matchId}`;

      const captains = (
        await db.prepare(
          `SELECT p.email, p.name FROM team_memberships tm
           JOIN players p ON p.id = tm.player_id
           WHERE tm.team_id = ? AND tm.role IN ('captain', 'co-captain') AND tm.active = 1`
        ).bind(team.id).all<{ email: string; name: string }>()
      ).results;

      for (const c of captains) {
        await sendEmail({
          to: c.email,
          subject: `${session.name} is now available — ${matchDetails.opponent_team} (${dateStr})`,
          html: emailTemplate(
            `<h2 style="margin: 0 0 12px 0; font-size: 18px; color: #166534;">Player Available</h2>
             <p><strong>${session.name}</strong> has changed their RSVP to <strong>Yes</strong> for the match against <strong>${matchDetails.opponent_team}</strong> on <strong>${dateStr}</strong>.</p>
             <p>If you have open spots in the lineup, you can add them now.</p>
             ${buildCaptainNoteHtml(matchDetails.captain_notes)}`,
            {
              heading: "Lineup Update",
              ctaUrl: matchUrl,
              ctaLabel: "Update Lineup",
            }
          ),
        });
      }

      await sendEmail({
        to: session.email,
        subject: `Thanks for stepping up, ${session.name.split(" ")[0]}!`,
        html: emailTemplate(
          `<h2 style="margin: 0 0 12px 0; font-size: 18px; color: #166534;">You're a team player, ${session.name.split(" ")[0]}!</h2>
           <p>Thanks for making yourself available for the match against <strong>${matchDetails.opponent_team}</strong> on <strong>${dateStr}</strong>. The captains have been notified and will update the lineup.</p>
           <p>Keep an eye on your email — you'll get a lineup confirmation once you've been slotted in.</p>
           ${buildCaptainNoteHtml(matchDetails.captain_notes)}`,
          {
            heading: matchDetails.team_name,
            ctaUrl: matchUrl,
            ctaLabel: "View Match",
          }
        ),
      });
    }
  }

  // If player withdrew (changed to "no"), check if they were in a confirmed lineup
  if (body.status === "no" && prevRsvp?.status !== "no") {
    const matchDetails = await db.prepare(
      `SELECT lm.status as match_status, lm.opponent_team, lm.match_date, lm.captain_notes,
              t.slug as team_slug
       FROM league_matches lm
       JOIN teams t ON t.id = lm.team_id
       WHERE lm.id = ?`
    ).bind(body.matchId).first<{
      match_status: string; opponent_team: string; match_date: string; captain_notes: string | null; team_slug: string;
    }>();

    const inLineup = await db.prepare(
      `SELECT ls.id, ls.position FROM lineup_slots ls
       JOIN lineups l ON l.id = ls.lineup_id
       WHERE l.match_id = ? AND ls.player_id = ? AND l.status = 'confirmed'`
    ).bind(body.matchId, session.player_id).first<{ id: string; position: string }>();

    // Notify captains if match has a confirmed/locked lineup OR the player was in it
    if (matchDetails && (inLineup || ["lineup_confirmed", "locked"].includes(matchDetails.match_status))) {
      const captains = (
        await db.prepare(
          `SELECT p.email, p.name FROM team_memberships tm
           JOIN players p ON p.id = tm.player_id
           WHERE tm.team_id = ? AND tm.role IN ('captain', 'co-captain') AND tm.active = 1`
        ).bind(team.id).all<{ email: string; name: string }>()
      ).results;

      const dateStr = new Date(matchDetails.match_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const positionNote = inLineup ? ` They were assigned to <strong>${inLineup.position}</strong>.` : "";

      for (const c of captains) {
        await sendEmail({
          to: c.email,
          subject: `Player withdrawal: ${session.name} can't make ${matchDetails.opponent_team}`,
          html: emailTemplate(
            `<h2 style="margin: 0 0 12px 0; font-size: 18px; color: #dc2626;">Player Withdrawal</h2>
             <p><strong>${session.name}</strong> has withdrawn from the match against <strong>${matchDetails.opponent_team}</strong> on <strong>${dateStr}</strong>.${positionNote}</p>
             <p>You may need to select an alternate player and update the lineup.</p>
             ${buildCaptainNoteHtml(matchDetails.captain_notes)}`,
            {
              heading: "Lineup Alert",
              ctaUrl: `https://framers.app/team/${matchDetails.team_slug}/match/${body.matchId}`,
              ctaLabel: "Update Lineup",
            }
          ),
        });
      }

      // Mark the lineup slot as withdrawn if they were in it
      if (inLineup) {
        await db.prepare(
          "UPDATE lineup_slots SET is_alternate = -1 WHERE id = ?"
        ).bind(inLineup.id).run();
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const db = await getDB();

  const team = await db
    .prepare("SELECT id FROM teams WHERE slug = ?")
    .bind(slug)
    .first<{ id: string }>();

  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const matchId = request.nextUrl.searchParams.get("matchId");

  if (matchId) {
    const responses = (
      await db
        .prepare(
          `SELECT a.player_id, a.status, p.name
           FROM availability a
           JOIN players p ON p.id = a.player_id
           WHERE a.match_id = ?
           ORDER BY p.name`
        )
        .bind(matchId)
        .all<{ player_id: string; status: string; name: string }>()
    ).results;
    let slot_overrides: Array<{ player_id: string; slot_date: string; status: string }> = [];
    try {
      slot_overrides = (
        await db
          .prepare(
            "SELECT player_id, slot_date, status FROM availability_slots WHERE match_id = ?",
          )
          .bind(matchId)
          .all<{ player_id: string; slot_date: string; status: string }>()
      ).results;
    } catch {
      // Table may not exist yet.
    }
    return NextResponse.json({ responses, slot_overrides });
  }

  // All availability for upcoming matches
  const availability = (
    await db
      .prepare(
        `SELECT a.player_id, a.match_id, a.status
         FROM availability a
         JOIN league_matches lm ON lm.id = a.match_id
         WHERE lm.team_id = ? AND lm.status = 'open'`
      )
      .bind(team.id)
      .all<{ player_id: string; match_id: string; status: string }>()
  ).results;

  return NextResponse.json({ availability });
}
