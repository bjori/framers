import { getDB } from "@/lib/db";
import { sendEmailBatch, emailTemplate } from "@/lib/email";

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

  if (newStatus === "needs_players") {
    await sendNeedsPlayersEmail(match.team_id, match.opponent_team, match.match_date, match.team_slug, matchId);
  }

  return { ok: true };
}

async function sendNeedsPlayersEmail(teamId: string, opponent: string, date: string, teamSlug: string, matchId: string) {
  const db = await getDB();
  const members = (
    await db.prepare(
      `SELECT p.email, p.name FROM players p
       JOIN team_memberships tm ON tm.player_id = p.id AND tm.team_id = ? AND tm.active = 1
       LEFT JOIN availability a ON a.player_id = p.id AND a.match_id = ?
       WHERE a.status IS NULL OR a.status = 'pending'`
    ).bind(teamId, matchId).all<{ email: string; name: string }>()
  ).results;

  const dateStr = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const batch = members.map((m) => ({
    to: m.email,
    subject: `We need you! RSVP for ${opponent} on ${dateStr}`,
    html: emailTemplate(
      `<h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0c4a6e;">Hey ${m.name.split(" ")[0]},</h2>
       <p>We're short on players for our match against <strong>${opponent}</strong> on <strong>${dateStr}</strong>.</p>
       <p>Please RSVP as soon as possible so we can finalize the lineup!</p>`,
      {
        heading: "RSVP Needed",
        ctaUrl: `https://framers.app/team/${teamSlug}/match/${matchId}`,
        ctaLabel: "RSVP Now",
      }
    ),
  }));
  await sendEmailBatch(batch);
}

export async function checkAutoTransitions(teamId: string): Promise<string[]> {
  const db = await getDB();
  const transitions: string[] = [];
  const now = new Date();

  const openMatches = (
    await db.prepare(
      `SELECT id, match_date, rsvp_deadline, status FROM league_matches
       WHERE team_id = ? AND status IN ('open', 'needs_players')
       ORDER BY match_date`
    ).bind(teamId).all<{ id: string; match_date: string; rsvp_deadline: string | null; status: string }>()
  ).results;

  for (const match of openMatches) {
    if (match.rsvp_deadline && new Date(match.rsvp_deadline) < now) {
      await transitionMatch(match.id, "rsvp_closed");
      transitions.push(`${match.id}: ${match.status} -> rsvp_closed (deadline passed)`);
      continue;
    }

    const yesCount = (
      await db.prepare(
        "SELECT COUNT(*) as cnt FROM availability WHERE match_id = ? AND status = 'yes'"
      ).bind(match.id).first<{ cnt: number }>()
    )?.cnt ?? 0;

    if (yesCount < 4 && match.status === "open") {
      await transitionMatch(match.id, "needs_players");
      transitions.push(`${match.id}: open -> needs_players (only ${yesCount} yes)`);
    } else if (yesCount >= 4 && match.status === "needs_players") {
      await transitionMatch(match.id, "open");
      transitions.push(`${match.id}: needs_players -> open (${yesCount} yes)`);
    }
  }

  return transitions;
}
