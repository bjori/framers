import { getDB } from "@/lib/db";

export type MatchStatus = "open" | "needs_players" | "rsvp_closed" | "lineup_draft" | "lineup_confirmed" | "locked" | "completed" | "cancelled";

const VALID_TRANSITIONS: Record<MatchStatus, MatchStatus[]> = {
  open: ["needs_players", "rsvp_closed", "lineup_draft", "lineup_confirmed", "cancelled"],
  needs_players: ["open", "rsvp_closed", "lineup_confirmed", "cancelled"],
  rsvp_closed: ["lineup_draft", "lineup_confirmed", "cancelled"],
  lineup_draft: ["lineup_confirmed", "rsvp_closed", "open", "cancelled"],
  lineup_confirmed: ["locked", "lineup_draft", "open", "completed", "cancelled"],
  locked: ["completed", "lineup_confirmed", "cancelled"],
  completed: [],
  cancelled: ["open"],
};

export function canTransition(from: MatchStatus, to: MatchStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function transitionMatch(matchId: string, newStatus: MatchStatus, changedBy?: { id: string; name: string }): Promise<{ ok: boolean; error?: string }> {
  const db = await getDB();

  const match = await db.prepare(
    `SELECT lm.id, lm.status, lm.team_id, lm.opponent_team, lm.match_date,
            t.name as team_name, t.slug as team_slug
     FROM league_matches lm
     JOIN teams t ON t.id = lm.team_id
     WHERE lm.id = ?`
  ).bind(matchId).first<{
    id: string; status: string; team_id: string; opponent_team: string;
    match_date: string; team_name: string; team_slug: string;
  }>();

  if (!match) return { ok: false, error: "Match not found" };

  if (!canTransition(match.status as MatchStatus, newStatus)) {
    return { ok: false, error: `Cannot transition from ${match.status} to ${newStatus}` };
  }

  await db.prepare("UPDATE league_matches SET status = ? WHERE id = ?")
    .bind(newStatus, matchId).run();

  if (changedBy) {
    await db.prepare(
      `INSERT INTO match_changelog (id, match_type, match_id, changed_by_player_id, changed_by_name, field_name, old_value, new_value)
       VALUES (?, 'league', ?, ?, ?, 'status', ?, ?)`
    ).bind(crypto.randomUUID(), matchId, changedBy.id, changedBy.name, match.status, newStatus).run();
  }

  return { ok: true };
}

export async function checkAutoTransitions(teamId: string): Promise<string[]> {
  const db = await getDB();
  const transitions: string[] = [];
  const now = new Date();

  const today = now.toISOString().slice(0, 10);
  const twoWeeksOut = new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10);

  const openMatches = (
    await db.prepare(
      `SELECT id, match_date, rsvp_deadline, status, is_home, notes FROM league_matches
       WHERE team_id = ? AND status IN ('open', 'needs_players')
       ORDER BY match_date`
    ).bind(teamId).all<{ id: string; match_date: string; rsvp_deadline: string | null; status: string; is_home: number; notes: string | null }>()
  ).results;

  // Split-schedule matches can have line overrides that push the "effective" date
  // past (or before) match_date. Pull the min/max override date per match so we
  // keep sending reminders through the last scheduled slot.
  const matchIds = openMatches.map((m) => m.id);
  const overrideExtents = new Map<string, { earliest: string | null; latest: string | null }>();
  if (matchIds.length > 0) {
    try {
      const placeholders = matchIds.map(() => "?").join(",");
      const { results } = await db
        .prepare(
          `SELECT match_id, MIN(scheduled_date) as earliest, MAX(scheduled_date) as latest
           FROM match_line_schedules
           WHERE match_id IN (${placeholders}) AND scheduled_date IS NOT NULL
           GROUP BY match_id`,
        )
        .bind(...matchIds)
        .all<{ match_id: string; earliest: string | null; latest: string | null }>();
      for (const r of results) {
        overrideExtents.set(r.match_id, { earliest: r.earliest, latest: r.latest });
      }
    } catch {
      // Table may not exist yet.
    }
  }

  for (const match of openMatches) {
    if (match.rsvp_deadline && new Date(match.rsvp_deadline) < now) {
      await transitionMatch(match.id, "rsvp_closed");
      transitions.push(`${match.id}: ${match.status} -> rsvp_closed (deadline passed)`);
      continue;
    }

    const extent = overrideExtents.get(match.id);
    const earliestDate = extent?.earliest && extent.earliest < match.match_date ? extent.earliest : match.match_date;
    const latestDate = extent?.latest && extent.latest > match.match_date ? extent.latest : match.match_date;

    // Window = any slot is today-through-two-weeks and the match is not entirely in the past.
    const matchInWindow = latestDate >= today && earliestDate <= twoWeeksOut;
    // Skip unconfirmed away matches (no location/notes yet)
    const isAwayUnconfirmed = match.is_home === 0 && (!match.notes || match.notes.trim() === "");

    const yesCount = (
      await db.prepare(
        "SELECT COUNT(*) as cnt FROM availability WHERE match_id = ? AND status = 'yes'"
      ).bind(match.id).first<{ cnt: number }>()
    )?.cnt ?? 0;

    if (yesCount < 4 && match.status === "open") {
      // Don't nag for matches months out or unconfirmed away (no location/notes)
      if (matchInWindow && !isAwayUnconfirmed) {
        await transitionMatch(match.id, "needs_players");
        transitions.push(`${match.id}: open -> needs_players (only ${yesCount} yes)`);
      }
    } else if (yesCount >= 4 && match.status === "needs_players") {
      await transitionMatch(match.id, "open");
      transitions.push(`${match.id}: needs_players -> open (${yesCount} yes)`);
    }
  }

  return transitions;
}
