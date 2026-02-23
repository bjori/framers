/**
 * Constraint-based lineup optimizer for USTA team matches.
 *
 * Considers: ELO ratings, player preferences (doubles_only, singles preference),
 * availability/RSVP status, minimum match fairness, and reliability score.
 */

export interface AvailablePlayer {
  id: string;
  name: string;
  singlesElo: number;
  doublesElo: number;
  matchesPlayedThisSeason: number;
  defaultWinsThisSeason: number;
  minMatchesGoal: number;
  preferences: { doublesOnly?: boolean };
  rsvpStatus: "yes" | "maybe" | "call_last" | "doubles_only";
  rsvpBeforeDeadline: boolean;
  reliabilityScore: number;
}

export interface LineupSlot {
  position: string;
  playerId: string;
  playerName: string;
  score: number;
}

export interface LineupResult {
  slots: LineupSlot[];
  unassigned: AvailablePlayer[];
  alternates: AvailablePlayer[];
}

function rsvpPriority(p: AvailablePlayer): number {
  let score = 0;
  if (p.rsvpStatus === "yes") score += 100;
  else if (p.rsvpStatus === "maybe") score += 50;
  else if (p.rsvpStatus === "doubles_only") score += 80;
  else if (p.rsvpStatus === "call_last") score += 20;

  if (p.rsvpBeforeDeadline) score += 25;
  score += p.reliabilityScore * 10;

  // Fairness: prioritize players who need more real matches
  // Default wins count officially but don't give real playing time
  const realMatchesPlayed = p.matchesPlayedThisSeason - p.defaultWinsThisSeason;
  const matchDeficit = Math.max(0, p.minMatchesGoal - realMatchesPlayed);
  score += matchDeficit * 15;

  // Extra boost for players with default wins who didn't actually play
  if (p.defaultWinsThisSeason > 0) score += p.defaultWinsThisSeason * 10;

  return score;
}

export function optimizeLineup(
  players: AvailablePlayer[],
  format: { singles: number; doubles: number }
): LineupResult {
  const sorted = [...players].sort((a, b) => {
    const priDiff = rsvpPriority(b) - rsvpPriority(a);
    if (priDiff !== 0) return priDiff;
    return b.singlesElo - a.singlesElo;
  });

  const slots: LineupSlot[] = [];
  const assigned = new Set<string>();

  // Singles slots: highest singles ELO among non-doubles-only players
  // If not enough singles-willing players, fall back to doubles-preferred players
  const singlesEligible = sorted.filter(
    (p) => !p.preferences.doublesOnly && p.rsvpStatus !== "doubles_only" && !assigned.has(p.id)
  );

  for (let i = 0; i < format.singles; i++) {
    let candidate = singlesEligible.find((p) => !assigned.has(p.id));
    if (!candidate) {
      // Fallback: pick from doubles-preferred players (better than forfeiting a line)
      candidate = sorted.find((p) => !assigned.has(p.id));
    }
    if (candidate) {
      slots.push({
        position: `S${i + 1}`,
        playerId: candidate.id,
        playerName: candidate.name,
        score: candidate.singlesElo,
      });
      assigned.add(candidate.id);
    }
  }

  // Doubles slots: pair remaining players by complementary doubles ELO
  const doublesPool = sorted.filter((p) => !assigned.has(p.id));

  for (let d = 0; d < format.doubles; d++) {
    const remaining = doublesPool.filter((p) => !assigned.has(p.id));
    if (remaining.length < 2) break;

    // Pair strongest with next strongest available
    const p1 = remaining[0];
    const p2 = remaining[1];

    slots.push({
      position: `D${d + 1}A`,
      playerId: p1.id,
      playerName: p1.name,
      score: p1.doublesElo,
    });
    slots.push({
      position: `D${d + 1}B`,
      playerId: p2.id,
      playerName: p2.name,
      score: p2.doublesElo,
    });
    assigned.add(p1.id);
    assigned.add(p2.id);
  }

  const unassigned = players.filter((p) => !assigned.has(p.id));
  const alternates = unassigned.slice(0, 3);

  return { slots, unassigned, alternates };
}
