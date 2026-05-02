/**
 * Constraint-based lineup optimizer for USTA team matches.
 *
 * The optimizer runs in two phases so we never let fairness/RSVP scoring
 * scramble the ELO-based position order:
 *
 *   1. SELECTION — "who gets on the card at all". Uses a composite priority
 *      (RSVP status + reliability + match-fairness deficit + default-win
 *      make-up) to rank candidates. We grab the top N singles-eligible for
 *      singles and the next 2×doubles for the doubles pool. doubles_only
 *      players are excluded from singles consideration unless we'd otherwise
 *      default a line.
 *
 *   2. PLACEMENT — "where each selected player plays". The selected singles
 *      roster is re-sorted by singlesElo desc (strongest singles player →
 *      S1). The selected doubles roster is re-sorted by doublesElo desc and
 *      paired adjacently: 1+2 → D1, 3+4 → D2, 5+6 → D3. This gives the D1
 *      line your strongest pair (stack-the-top strategy).
 *
 * This split means a tournament-winning singles player always gets the S1
 * slot if they're picked, and a weaker doubles player never jumps ahead of
 * a stronger one on the doubles ladder, regardless of how keen they were to
 * RSVP or how many matches they've played this season.
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
  score += (p.reliabilityScore - 0.5) * 20;

  // Fairness: prioritize players who need more real matches
  // Default wins count officially but don't give real playing time
  const realMatchesPlayed = p.matchesPlayedThisSeason - p.defaultWinsThisSeason;
  const matchDeficit = Math.max(0, p.minMatchesGoal - realMatchesPlayed);
  score += matchDeficit * 15;

  // Extra boost for players with default wins who didn't actually play
  if (p.defaultWinsThisSeason > 0) score += p.defaultWinsThisSeason * 10;

  return score;
}

function isDoublesOnly(p: AvailablePlayer): boolean {
  return p.preferences.doublesOnly === true || p.rsvpStatus === "doubles_only";
}

export function optimizeLineup(
  players: AvailablePlayer[],
  format: { singles: number; doubles: number },
): LineupResult {
  // --- SELECTION phase ---------------------------------------------------
  // Who deserves to play? Composite priority ranks candidates by RSVP,
  // fairness, and reliability. ELO is a tiebreak so that when two players
  // are equally "deserving", the stronger one plays.
  const byPriority = [...players].sort((a, b) => {
    const priDiff = rsvpPriority(b) - rsvpPriority(a);
    if (priDiff !== 0) return priDiff;
    // Tiebreak: use max(singlesElo, doublesElo) since we don't yet know which
    // bucket they'll end up in.
    const aBest = Math.max(a.singlesElo, a.doublesElo);
    const bBest = Math.max(b.singlesElo, b.doublesElo);
    return bBest - aBest;
  });

  const selectedIds = new Set<string>();

  // Singles selection: top N non-doubles-only players by priority. Fall back
  // to doubles-only players only if we'd otherwise default a singles line.
  const singlesRoster: AvailablePlayer[] = [];
  for (const p of byPriority) {
    if (singlesRoster.length >= format.singles) break;
    if (isDoublesOnly(p)) continue;
    singlesRoster.push(p);
    selectedIds.add(p.id);
  }
  if (singlesRoster.length < format.singles) {
    for (const p of byPriority) {
      if (singlesRoster.length >= format.singles) break;
      if (selectedIds.has(p.id)) continue;
      singlesRoster.push(p);
      selectedIds.add(p.id);
    }
  }

  // Doubles selection: next 2×doubles by priority.
  const doublesRoster: AvailablePlayer[] = [];
  const doublesNeeded = format.doubles * 2;
  for (const p of byPriority) {
    if (doublesRoster.length >= doublesNeeded) break;
    if (selectedIds.has(p.id)) continue;
    doublesRoster.push(p);
    selectedIds.add(p.id);
  }

  // --- PLACEMENT phase ---------------------------------------------------
  // Singles: strongest singles player → S1.
  const singlesOrdered = [...singlesRoster].sort((a, b) => b.singlesElo - a.singlesElo);
  // Doubles: strongest doubles players get D1A/B, next pair D2, etc.
  const doublesOrdered = [...doublesRoster].sort((a, b) => b.doublesElo - a.doublesElo);

  const slots: LineupSlot[] = [];
  for (let i = 0; i < format.singles; i++) {
    const p = singlesOrdered[i];
    if (!p) break;
    slots.push({
      position: `S${i + 1}`,
      playerId: p.id,
      playerName: p.name,
      score: p.singlesElo,
    });
  }
  for (let d = 0; d < format.doubles; d++) {
    const p1 = doublesOrdered[d * 2];
    const p2 = doublesOrdered[d * 2 + 1];
    if (!p1 || !p2) break;
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
  }

  const unassigned = players.filter((p) => !selectedIds.has(p.id));
  // Alternates are the next highest-priority players not on the card — use
  // priority (not ELO) since they're our backup pool.
  const alternates = [...unassigned]
    .sort((a, b) => rsvpPriority(b) - rsvpPriority(a))
    .slice(0, 3);

  return { slots, unassigned, alternates };
}
