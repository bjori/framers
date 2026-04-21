/**
 * Per-slot RSVP overrides.
 *
 * The base `availability` table holds a player's "overall" RSVP for a match
 * (one row per player × match). That overall response is the default answer
 * for every slot of the match — so on a single-date match it's the only
 * thing that matters, and on a split-schedule match it's what every slot
 * falls back to when no per-slot override exists.
 *
 * `availability_slots` layers overrides on top: a row there means "for this
 * specific slot_date, my answer differs from (or replaces) the overall".
 * Rows are only created when the player actively chooses a different answer
 * for a given slot; otherwise we just inherit.
 *
 * Resolution:
 *   effective(player, match, slotDate) =
 *     override(player, match, slotDate) ??
 *     overall(player, match) ??
 *     "pending"
 */

import type { ScheduleBlock } from "@/lib/line-schedule";

export type RsvpStatus = "yes" | "no" | "maybe" | "pending";

export interface SlotRsvpSnapshot {
  /** Overall status from `availability`, or null if no row exists yet. */
  overall: RsvpStatus | null;
  /** Map of slot_date → per-slot override status. */
  bySlot: Map<string, RsvpStatus>;
}

export interface EffectiveSlotRsvp {
  slotDate: string;
  status: RsvpStatus;
  source: "override" | "overall" | "default";
}

export async function loadSlotOverrides(
  db: D1Database,
  playerId: string,
  matchId: string,
): Promise<Map<string, RsvpStatus>> {
  const out = new Map<string, RsvpStatus>();
  try {
    const { results } = await db
      .prepare("SELECT slot_date, status FROM availability_slots WHERE player_id = ? AND match_id = ?")
      .bind(playerId, matchId)
      .all<{ slot_date: string; status: RsvpStatus }>();
    for (const r of results) out.set(r.slot_date, r.status);
  } catch {
    // Table may not exist yet.
  }
  return out;
}

export async function loadSlotOverridesForMatch(
  db: D1Database,
  matchId: string,
): Promise<Map<string, Map<string, RsvpStatus>>> {
  // returns playerId → (slotDate → status)
  const out = new Map<string, Map<string, RsvpStatus>>();
  try {
    const { results } = await db
      .prepare("SELECT player_id, slot_date, status FROM availability_slots WHERE match_id = ?")
      .bind(matchId)
      .all<{ player_id: string; slot_date: string; status: RsvpStatus }>();
    for (const r of results) {
      const m = out.get(r.player_id) ?? new Map<string, RsvpStatus>();
      m.set(r.slot_date, r.status);
      out.set(r.player_id, m);
    }
  } catch {
    // Table may not exist yet.
  }
  return out;
}

/** Effective status for a single (player, match, slot_date), given the pre-loaded overall + overrides. */
export function effectiveStatusFor(
  overall: RsvpStatus | null,
  overrides: Map<string, RsvpStatus>,
  slotDate: string,
): EffectiveSlotRsvp {
  const override = overrides.get(slotDate);
  if (override) return { slotDate, status: override, source: "override" };
  if (overall && overall !== "pending") return { slotDate, status: overall, source: "overall" };
  return { slotDate, status: overall ?? "pending", source: overall ? "overall" : "default" };
}

/** Build a per-slot summary for a player across all blocks of a split match. */
export function summarizePlayerAcrossSlots(
  overall: RsvpStatus | null,
  overrides: Map<string, RsvpStatus>,
  blocks: ScheduleBlock[],
): EffectiveSlotRsvp[] {
  const distinctDates = [...new Set(blocks.map((b) => b.date))].sort();
  return distinctDates.map((d) => effectiveStatusFor(overall, overrides, d));
}
