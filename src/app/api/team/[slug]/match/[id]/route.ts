import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { track } from "@/lib/analytics";
import {
  replaceLineSchedules,
  loadLineSchedules,
  effectivePlayDates,
  parseMatchFormat,
} from "@/lib/line-schedule";

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

  const team = await db.prepare("SELECT id FROM teams WHERE slug = ?").bind(slug).first<{ id: string }>();
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
    .prepare("SELECT match_date, match_time, match_format FROM league_matches WHERE id = ? AND team_id = ?")
    .bind(id, team.id)
    .first<{ match_date: string; match_time: string | null; match_format: string | null }>();

  if (!existing) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const format = parseMatchFormat(existing.match_format);
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
  if (datesChanged) {
    const result = await db
      .prepare("DELETE FROM availability WHERE match_id = ?")
      .bind(id)
      .run();
    // D1 result shape: { meta: { changes: number } }
    rsvpsReset = (result as unknown as { meta?: { changes?: number } }).meta?.changes ?? 0;
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
  }

  track("match_details_edited", {
    playerId: session.player_id,
    detail: `match:${id}${datesChanged ? `|rsvps_reset=${rsvpsReset}` : ""}`,
  });
  return NextResponse.json({ ok: true, rsvps_reset: rsvpsReset, dates_changed: datesChanged });
}
