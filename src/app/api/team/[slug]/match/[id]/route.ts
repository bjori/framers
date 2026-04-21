import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { track } from "@/lib/analytics";
import {
  replaceLineSchedules,
  loadLineSchedules,
  effectivePlayDates,
  parseMatchFormat,
  groupLinesBySlot,
} from "@/lib/line-schedule";
import { sendEmailBatch, captainSignoff } from "@/lib/email";
import {
  buildRescheduleEmailBatch,
  formatScheduleSummary,
  type RescheduleBatchRecipient,
} from "@/lib/reschedule-email";

interface LineScheduleInput {
  line: string;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug, id } = await params;
  const db = await getDB();

  const team = await db
    .prepare("SELECT id, name, slug, match_format FROM teams WHERE slug = ?")
    .bind(slug)
    .first<{ id: string; name: string; slug: string; match_format: string | null }>();
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const isAdmin = session.is_admin === 1;
  if (!isAdmin) {
    const membership = await db
      .prepare("SELECT role FROM team_memberships WHERE player_id = ? AND team_id = ?")
      .bind(session.player_id, team.id)
      .first<{ role: string }>();
    if (!membership || (membership.role !== "captain" && membership.role !== "co-captain")) {
      return NextResponse.json({ error: "Only captains and admins can edit match details" }, { status: 403 });
    }
  }

  const body = (await request.json()) as {
    match_date?: string | null;
    match_time?: string | null;
    location?: string | null;
    notes?: string | null;
    captain_notes?: string | null;
    line_schedules?: LineScheduleInput[];
  };

  // Capture old values so we can log meaningful changelog entries and
  // detect whether play dates have shifted (→ reset RSVPs).
  const existing = await db
    .prepare(
      `SELECT lm.match_date, lm.match_time, lm.opponent_team, lm.captain_notes,
              lm.notes, lm.location, lm.is_home
       FROM league_matches lm
       WHERE lm.id = ? AND lm.team_id = ?`,
    )
    .bind(id, team.id)
    .first<{
      match_date: string;
      match_time: string | null;
      opponent_team: string;
      captain_notes: string | null;
      notes: string | null;
      location: string | null;
      is_home: number;
    }>();

  if (!existing) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const format = parseMatchFormat(team.match_format);
  const oldOverrides = await loadLineSchedules(db, id);
  const oldPlayDates = effectivePlayDates(
    { match_date: existing.match_date, match_time: existing.match_time },
    oldOverrides,
    format,
  );

  const nextMatchDate = body.match_date || existing.match_date;
  const nextMatchTime = body.match_time ?? null;

  if (nextMatchDate !== existing.match_date) {
    await db
      .prepare(
        "UPDATE league_matches SET match_date = ?, match_time = ?, location = ?, notes = ?, captain_notes = ? WHERE id = ? AND team_id = ?",
      )
      .bind(nextMatchDate, nextMatchTime, body.location ?? null, body.notes ?? null, body.captain_notes ?? null, id, team.id)
      .run();

    await db
      .prepare(
        `INSERT INTO match_changelog (id, match_type, match_id, changed_by_player_id, changed_by_name, field_name, old_value, new_value)
         VALUES (?, 'league', ?, ?, ?, 'match_date', ?, ?)`,
      )
      .bind(crypto.randomUUID(), id, session.player_id, session.name, existing.match_date, nextMatchDate)
      .run();
  } else {
    await db
      .prepare(
        "UPDATE league_matches SET match_time = ?, location = ?, notes = ?, captain_notes = ? WHERE id = ? AND team_id = ?",
      )
      .bind(nextMatchTime, body.location ?? null, body.notes ?? null, body.captain_notes ?? null, id, team.id)
      .run();
  }

  if (Array.isArray(body.line_schedules)) {
    await replaceLineSchedules(
      db,
      id,
      { match_date: nextMatchDate, match_time: nextMatchTime },
      body.line_schedules.map((o) => ({
        line: o.line,
        scheduled_date: o.scheduled_date ?? null,
        scheduled_time: o.scheduled_time ?? null,
      })),
    );
    const newOverrides = await loadLineSchedules(db, id);
    const summarize = (rows: typeof oldOverrides) =>
      rows
        .map((r) => `${r.line}=${r.scheduled_date ?? "-"}@${r.scheduled_time ?? "-"}`)
        .sort()
        .join(", ") || "(none)";
    const oldSummary = summarize(oldOverrides);
    const newSummary = summarize(newOverrides);
    if (oldSummary !== newSummary) {
      await db
        .prepare(
          `INSERT INTO match_changelog (id, match_type, match_id, changed_by_player_id, changed_by_name, field_name, old_value, new_value)
           VALUES (?, 'league', ?, ?, ?, 'line_schedules', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          session.player_id,
          session.name,
          oldSummary,
          newSummary,
        )
        .run();
    }
  }

  // If the set of effective play dates changed, reset everyone's RSVP so
  // players reconfirm (or bail) against the new date(s). The lineup itself
  // is intentionally preserved — the captain keeps their decisions, but
  // every player must now re-RSVP on the new schedule.
  const newOverridesForDates = Array.isArray(body.line_schedules)
    ? await loadLineSchedules(db, id)
    : oldOverrides;
  const newPlayDates = effectivePlayDates(
    { match_date: nextMatchDate, match_time: nextMatchTime },
    newOverridesForDates,
    format,
  );
  const datesChanged =
    oldPlayDates.length !== newPlayDates.length ||
    oldPlayDates.some((d, i) => d !== newPlayDates[i]);

  let rsvpsReset = 0;
  let acksReset = 0;
  let notifiedPlayers = 0;
  if (datesChanged) {
    const result = await db
      .prepare("DELETE FROM availability WHERE match_id = ?")
      .bind(id)
      .run();
    // D1 result shape: { meta: { changes: number } }
    rsvpsReset = (result as unknown as { meta?: { changes?: number } }).meta?.changes ?? 0;

    // Per-slot overrides are meaningless once the slot dates themselves shift.
    try {
      await db
        .prepare("DELETE FROM availability_slots WHERE match_id = ?")
        .bind(id)
        .run();
    } catch {
      // availability_slots table may not exist yet.
    }

    // Reset lineup acknowledgements — the roster stays, but everyone on the
    // card has to re-confirm against the new date(s).
    const ackResult = await db
      .prepare(
        `UPDATE lineup_slots
         SET acknowledged = NULL, acknowledged_at = NULL
         WHERE lineup_id IN (SELECT id FROM lineups WHERE match_id = ?)`,
      )
      .bind(id)
      .run();
    acksReset = (ackResult as unknown as { meta?: { changes?: number } }).meta?.changes ?? 0;

    // Reset stale dedup rows so the RSVP ladder (2-week blast, 1-week short,
    // shorthanded nudge) re-engages against the new schedule. Daily reminders
    // are already time-gated so we leave those alone.
    await db
      .prepare(
        "DELETE FROM app_events WHERE event IN ('we_need_you','rsvp_week_need_yes','shorthanded_nudge') AND detail LIKE ?",
      )
      .bind(`${id}|%`)
      .run();

    await db
      .prepare(
        `INSERT INTO match_changelog (id, match_type, match_id, changed_by_player_id, changed_by_name, field_name, old_value, new_value)
         VALUES (?, 'league', ?, ?, ?, 'rsvps_reset', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        id,
        session.player_id,
        session.name,
        oldPlayDates.join(","),
        newPlayDates.join(","),
      )
      .run();

    // Fire the immediate "match rescheduled — please re-RSVP & re-confirm"
    // blast to every active team member. Best-effort: if the email provider
    // is down we still persist the schema change and log it; the daily cron
    // will pick up the slack via the re-ack nudge.
    try {
      const members = (
        await db
          .prepare(
            `SELECT p.id as player_id, p.email, p.name
             FROM team_memberships tm
             JOIN players p ON p.id = tm.player_id
             WHERE tm.team_id = ? AND tm.active = 1`,
          )
          .bind(team.id)
          .all<{ player_id: string; email: string; name: string }>()
      ).results;

      const starters = (
        await db
          .prepare(
            `SELECT ls.player_id, ls.position
             FROM lineup_slots ls
             JOIN lineups l ON l.id = ls.lineup_id
             WHERE l.match_id = ? AND ls.is_alternate = 0`,
          )
          .bind(id)
          .all<{ player_id: string; position: string }>()
      ).results;
      const starterByPlayer = new Map<string, string[]>();
      for (const s of starters) {
        const arr = starterByPlayer.get(s.player_id) ?? [];
        arr.push(s.position);
        starterByPlayer.set(s.player_id, arr);
      }

      const newOverrides = await loadLineSchedules(db, id);
      const newBlocks = groupLinesBySlot(
        { match_date: nextMatchDate, match_time: nextMatchTime },
        newOverrides,
        format,
      );
      const oldBlocks = groupLinesBySlot(
        { match_date: existing.match_date, match_time: existing.match_time },
        oldOverrides,
        format,
      );
      const previousSummary = formatScheduleSummary(oldBlocks);
      const signoff = await captainSignoff(team.id);

      const recipients: RescheduleBatchRecipient[] = members.map((m) => {
        const positions = starterByPlayer.get(m.player_id);
        return {
          playerId: m.player_id,
          email: m.email,
          name: m.name,
          isStarter: !!positions && positions.length > 0,
          starterPositions: positions,
        };
      });

      if (recipients.length > 0) {
        const batch = buildRescheduleEmailBatch({
          teamName: team.name,
          teamSlug: team.slug,
          opponent: existing.opponent_team,
          matchId: id,
          captainNotes: body.captain_notes ?? existing.captain_notes,
          previousSummary,
          newBlocks,
          rsvpsReset: rsvpsReset > 0,
          signoff,
          recipients,
        });
        await sendEmailBatch(batch);
        notifiedPlayers = recipients.length;
        await db
          .prepare("INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)")
          .bind(
            "reschedule_notice",
            `${id}|${recipients.length} recipients`,
            new Date().toISOString(),
          )
          .run();
      }
    } catch (err) {
      console.error("[reschedule email]", err);
    }
  }

  track("match_details_edited", {
    playerId: session.player_id,
    detail: `match:${id}${datesChanged ? `|rsvps_reset=${rsvpsReset}|acks_reset=${acksReset}|notified=${notifiedPlayers}` : ""}`,
  });
  return NextResponse.json({
    ok: true,
    rsvps_reset: rsvpsReset,
    acks_reset: acksReset,
    notified_players: notifiedPlayers,
    dates_changed: datesChanged,
  });
}
