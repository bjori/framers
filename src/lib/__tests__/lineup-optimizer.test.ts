import { describe, it, expect } from "vitest";
import { optimizeLineup, AvailablePlayer } from "@/lib/lineup-optimizer";

function p(overrides: Partial<AvailablePlayer> = {}): AvailablePlayer {
  return {
    id: overrides.id ?? "x",
    name: overrides.name ?? "X",
    singlesElo: 1500,
    doublesElo: 1500,
    matchesPlayedThisSeason: 5,
    defaultWinsThisSeason: 0,
    minMatchesGoal: 3,
    preferences: {},
    rsvpStatus: "yes",
    rsvpBeforeDeadline: false,
    reliabilityScore: 0.5,
    ...overrides,
  };
}

describe("lineup-optimizer reliability weight", () => {
  it("centers reliability weight on 0.5 — neutral player gets 0 swing", () => {
    // Two players, identical in every way except reliability. With centered
    // weight (score - 0.5) * 20, a neutral player (0.5) and a stalwart (1.0)
    // should differ by exactly 10 priority points.
    const stalwart = p({ id: "stalwart", name: "Stalwart", reliabilityScore: 1.0 });
    const neutral = p({ id: "neutral", name: "Neutral", reliabilityScore: 0.5 });
    const { slots } = optimizeLineup([stalwart, neutral], { singles: 1, doubles: 0 });
    // Stalwart should win the S1 slot due to higher priority (10 vs 0 from reliability).
    expect(slots[0].playerId).toBe("stalwart");
  });

  it("ranks chronic ghosts below stalwarts when ELO and other factors tie", () => {
    const stalwart = p({ id: "stalwart", name: "Stalwart", reliabilityScore: 0.9 });
    const ghost = p({ id: "ghost", name: "Ghost", reliabilityScore: 0.2 });
    const { slots } = optimizeLineup([stalwart, ghost], { singles: 1, doubles: 0 });
    expect(slots[0].playerId).toBe("stalwart");
  });

  it("does NOT bench a chronic ghost — they still get on the card if needed", () => {
    // Single ghost is the only player. They get the slot. We don't refuse to play.
    const ghost = p({ id: "ghost", name: "Ghost", reliabilityScore: 0.1 });
    const { slots } = optimizeLineup([ghost], { singles: 1, doubles: 0 });
    expect(slots).toHaveLength(1);
    expect(slots[0].playerId).toBe("ghost");
  });

  it("reliability beats a 1-match fairness deficit (knee point)", () => {
    // Player A: stalwart (1.0) but met goal already. Player B: ghost (0.1) but
    // is 1 match below goal. Under the new ±10 reliability swing, A's +10 from
    // reliability beats B's +15 deficit minus B's -8 reliability hit.
    // A: 100 + (1.0 - 0.5)*20 + 0 = 110
    // B: 100 + (0.1 - 0.5)*20 + 15 = 107
    const a = p({ id: "a", name: "A", reliabilityScore: 1.0, matchesPlayedThisSeason: 5, minMatchesGoal: 3 });
    const b = p({ id: "b", name: "B", reliabilityScore: 0.1, matchesPlayedThisSeason: 2, minMatchesGoal: 3 });
    const { slots } = optimizeLineup([a, b], { singles: 1, doubles: 0 });
    expect(slots[0].playerId).toBe("a");
  });

  it("2-match fairness deficit still beats max reliability swap (fairness floor preserved)", () => {
    // Same as above but B is 2 matches below goal. Now fairness wins.
    // A: 100 + 10 + 0 = 110
    // B: 100 + (-8) + 30 = 122
    const a = p({ id: "a", name: "A", reliabilityScore: 1.0, matchesPlayedThisSeason: 5, minMatchesGoal: 3 });
    const b = p({ id: "b", name: "B", reliabilityScore: 0.1, matchesPlayedThisSeason: 1, minMatchesGoal: 3 });
    const { slots } = optimizeLineup([a, b], { singles: 1, doubles: 0 });
    expect(slots[0].playerId).toBe("b");
  });
});
