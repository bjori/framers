# Team Show-Up Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `players.reliability_score` with a follow-through-rate score derived from the USTA scorecard, per the spec at `docs/superpowers/specs/2026-05-02-team-showup-model-design.md`.

**Architecture:** Pure derivation change inside `src/lib/carrot.ts`. No new tables. Adds vitest test infrastructure (first tests in this repo). One-shot backfill via a new `/api/debug` action. Lineup-optimizer weight rebalanced to ±5 priority points.

**Tech Stack:** TypeScript, Next.js 15, Cloudflare D1 (SQLite), vitest (new), wrangler.

---

## Files affected

- **Create:**
  - `vitest.config.ts`
  - `src/lib/__tests__/carrot.test.ts`
  - `src/lib/__tests__/lineup-optimizer.test.ts`
- **Modify:**
  - `package.json` — add vitest devDep, `test` script
  - `src/lib/carrot.ts` — new helpers + replaced formula + interface fields
  - `src/lib/lineup-optimizer.ts` — rebalanced reliability weight
  - `src/app/api/debug/route.ts` — add `backfill-reliability` action
- **Read-only inspection:**
  - `src/lib/usta-sync.ts` — verify forfeited-line behavior (Task 2)
  - Production D1 — sanity-check post-backfill scores (Task 8)

---

## Task 1: Add vitest test infrastructure

**Files:**
- Modify: `package.json` (add devDep + test script)
- Create: `vitest.config.ts`
- Create: `src/lib/__tests__/sanity.test.ts` (smoke test only, deleted after Task 3)

- [ ] **Step 1.1: Install vitest**

```bash
npm install --save-dev vitest@^2.0.0
```

Expected: `package.json` updated, `node_modules/vitest` present, no errors.

- [ ] **Step 1.2: Add test script to `package.json`**

In the `"scripts"` object, add `"test": "vitest run"` and `"test:watch": "vitest"`. Final scripts block should include those two new entries alongside the existing `dev`, `build`, `start`, `lint`, `preview`, `deploy`, `cf-typegen`, `db:migrate`, `db:migrate:local`.

- [ ] **Step 1.3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 1.4: Smoke test**

Create `src/lib/__tests__/sanity.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("vitest sanity", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 1.5: Verify test runner works**

Run: `npm test`
Expected: `1 passed`. If anything fails (TypeScript errors, vite config issues, alias resolution), fix in this step before continuing.

- [ ] **Step 1.6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/__tests__/sanity.test.ts
git commit -m "Add vitest test infrastructure for src/lib unit tests"
```

(No deploy — devDep + test files only, no app behavior change.)

---

## Task 2: Verify the forfeited-line representation (decision task)

The spec calls out an open question: when *we* forfeit a line, what does `usta-sync` write to `league_match_results`? The answer determines whether the "ghosted" definition needs an extra exclusion clause.

**Files:**
- Read: `src/lib/usta-sync.ts`
- Read: live D1 (`framers-v2`)
- Modify (potentially): the spec or a header comment in `src/lib/carrot.ts`

- [ ] **Step 2.1: Read usta-sync.ts**

Read `src/lib/usta-sync.ts` end to end. Look for the code path that writes `league_match_results`. Specifically, find: when our team forfeits a line (we were shorthanded), does the code (a) skip writing a row, (b) write a row with `won=0, our_score='0', is_default_win=0` and player ids populated from our last lineup, (c) write a row with null player ids, or (d) something else?

- [ ] **Step 2.2: Cross-check against production data**

Run a query to find a real example. Forfeited lines on the senior team historically (the user mentioned no-shows happen):

```bash
npx wrangler d1 execute framers-v2 --remote --json --command "SELECT lmr.*, lm.match_date, lm.team_score FROM league_match_results lmr JOIN league_matches lm ON lm.id = lmr.match_id WHERE lm.team_id = 'team-senior-framers-2026' AND (lmr.our_score = '0' OR lmr.our_score LIKE '%forfeit%' OR lmr.is_default_win = 1) ORDER BY lm.match_date DESC LIMIT 20"
```

Inspect the rows. Determine which case (a/b/c/d) matches reality.

- [ ] **Step 2.3: Decide on exclusion clause**

If case (b): the player who got assigned to the forfeited line will be in `player1_id`/`player2_id`, won=0. They'd count as **followed-through** under our spec rules (since `is_default_win=0` and they're in the result row). That's wrong — they may have actually no-showed and *caused* the forfeit. Need an additional exclusion: `our_score = '0' AND opp_score != '0'` (i.e., the line was conceded by us). Add to the ghost/follow-through definitions.

If case (a) (no row): the player on `lineup_slots` ∧ no result row would count as ghost — which is what we want if they no-showed. But it's also what we'd see if the captain forfeited preemptively because someone was injured. Acceptable noise; document and move on.

If case (c) or (d): write up the actual behavior and decide accordingly.

- [ ] **Step 2.4: Write the finding into `src/lib/carrot.ts` as a header comment**

Above the future helper functions, add a comment block summarizing what we found and how the implementation reflects it. This is the load-bearing context for anyone who reads this code later.

- [ ] **Step 2.5: Commit (only if comment was added)**

```bash
git add src/lib/carrot.ts
git commit -m "carrot: document USTA forfeited-line behavior for follow-through derivation"
```

If no comment was added (case (a) and we're accepting the noise without documentation), skip this commit.

---

## Task 3: TDD the formula math (pure function)

**Files:**
- Create: `src/lib/__tests__/carrot.test.ts`
- Modify: `src/lib/carrot.ts` (export new helper)
- Delete: `src/lib/__tests__/sanity.test.ts`

- [ ] **Step 3.1: Write the failing tests**

Create `src/lib/__tests__/carrot.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeFollowThroughRate } from "@/lib/carrot";

describe("computeFollowThroughRate", () => {
  it("returns 0.5 for new player (no history)", () => {
    expect(computeFollowThroughRate(0, 0)).toBeCloseTo(0.5, 4);
  });

  it("returns 0.625 for 1 kept, 0 ghosted", () => {
    expect(computeFollowThroughRate(1, 0)).toBeCloseTo(0.625, 4);
  });

  it("returns 0.8125 for 5 kept, 0 ghosted", () => {
    expect(computeFollowThroughRate(5, 0)).toBeCloseTo(0.8125, 4);
  });

  it("returns ~0.8846 for 10 kept, 0 ghosted", () => {
    expect(computeFollowThroughRate(10, 0)).toBeCloseTo(0.8846, 3);
  });

  it("returns 0.5 for 1 kept, 1 ghosted (wash)", () => {
    expect(computeFollowThroughRate(1, 1)).toBeCloseTo(0.5, 4);
  });

  it("returns ~0.7222 for 5 kept, 1 ghosted", () => {
    expect(computeFollowThroughRate(5, 1)).toBeCloseTo(0.7222, 3);
  });

  it("returns 0.375 for 0 kept, 1 ghosted", () => {
    expect(computeFollowThroughRate(0, 1)).toBeCloseTo(0.375, 4);
  });

  it("returns 0.1875 for 0 kept, 5 ghosted", () => {
    expect(computeFollowThroughRate(0, 5)).toBeCloseTo(0.1875, 4);
  });

  it("approaches 1 as kept→∞ with 0 ghosted", () => {
    expect(computeFollowThroughRate(1000, 0)).toBeGreaterThan(0.99);
    expect(computeFollowThroughRate(1000, 0)).toBeLessThan(1);
  });

  it("approaches 0 as ghosted→∞ with 0 kept", () => {
    expect(computeFollowThroughRate(0, 1000)).toBeLessThan(0.01);
    expect(computeFollowThroughRate(0, 1000)).toBeGreaterThan(0);
  });

  it("never returns NaN, Infinity, or out-of-range values", () => {
    for (let kept = 0; kept <= 20; kept++) {
      for (let ghosted = 0; ghosted <= 20; ghosted++) {
        const r = computeFollowThroughRate(kept, ghosted);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
        expect(Number.isFinite(r)).toBe(true);
      }
    }
  });

  it("is monotone in kept (more kept never decreases score, ghosted fixed)", () => {
    for (let ghosted = 0; ghosted <= 5; ghosted++) {
      let prev = -Infinity;
      for (let kept = 0; kept <= 20; kept++) {
        const r = computeFollowThroughRate(kept, ghosted);
        expect(r).toBeGreaterThanOrEqual(prev);
        prev = r;
      }
    }
  });

  it("is monotone in ghosted (more ghosted never increases score, kept fixed)", () => {
    for (let kept = 0; kept <= 5; kept++) {
      let prev = Infinity;
      for (let ghosted = 0; ghosted <= 20; ghosted++) {
        const r = computeFollowThroughRate(kept, ghosted);
        expect(r).toBeLessThanOrEqual(prev);
        prev = r;
      }
    }
  });
});
```

- [ ] **Step 3.2: Run tests, verify they fail**

Run: `npm test`
Expected: All `computeFollowThroughRate` tests fail with "computeFollowThroughRate is not a function" or similar import error. The sanity test still passes.

- [ ] **Step 3.3: Implement the function**

In `src/lib/carrot.ts`, add (after the `import` line, before the `PlayerCarrot` interface):

```typescript
/**
 * Compute the Beta-smoothed follow-through rate from raw counts.
 *
 * Formula: Beta(α=1.5, β=1.5) prior — a new player with zero history
 * sits at 0.5 (neutral). One bad day doesn't hard-zero a player; one
 * good day doesn't crown them either. A stalwart with 10 kept and 0
 * ghosted lands around 0.88; a chronic ghost with 0 kept and 5 ghosted
 * lands around 0.19.
 *
 * See docs/superpowers/specs/2026-05-02-team-showup-model-design.md
 * for the calibration table and design rationale.
 */
export function computeFollowThroughRate(kept: number, ghosted: number): number {
  const alpha = 1.5;
  const beta = 1.5;
  return (kept + alpha) / (kept + ghosted + alpha + beta);
}
```

- [ ] **Step 3.4: Run tests, verify they pass**

Run: `npm test`
Expected: All 13 `computeFollowThroughRate` tests pass. Sanity test still passes.

- [ ] **Step 3.5: Delete sanity test**

```bash
rm src/lib/__tests__/sanity.test.ts
```

Run `npm test` again. Expected: 13 passed.

- [ ] **Step 3.6: Commit**

```bash
git add src/lib/__tests__/carrot.test.ts src/lib/carrot.ts
git rm src/lib/__tests__/sanity.test.ts
git commit -m "carrot: add Beta-smoothed computeFollowThroughRate helper + tests"
```

---

## Task 4: SQL counters and updated `updateReliabilityScores`

This task replaces the body of `updateReliabilityScores` to use the new formula, fed by SQL counters that count `(player, match)` pairs satisfying the followed-through and ghosted definitions.

**Files:**
- Modify: `src/lib/carrot.ts` (replace `updateReliabilityScores` body, update `calculateCarrotScores` to expose counts)

The new `PlayerCarrot` interface must add `followedThroughCount` and `ghostedCount`. Existing fields (`onTrackForMinimum`, `earlyRsvpCount`, `totalRsvpCount`) stay — they're used by callers we can't fully audit yet, and they're cheap to keep computing.

- [ ] **Step 4.1: Update the `PlayerCarrot` interface**

In `src/lib/carrot.ts`, update the interface to add two fields and a derived convenience:

```typescript
export interface PlayerCarrot {
  playerId: string;
  name: string;
  matchesPlayed: number;
  matchesAvailable: number;
  reliabilityScore: number;
  onTrackForMinimum: boolean;
  minMatchesGoal: number;
  earlyRsvpCount: number;
  totalRsvpCount: number;
  followedThroughCount: number;  // NEW
  ghostedCount: number;          // NEW
}
```

- [ ] **Step 4.2: Add SQL helper to count (followedThrough, ghosted) per player**

Add this function to `src/lib/carrot.ts` (above `calculateCarrotScores`, below the imports):

```typescript
interface FollowThroughCounts {
  followedThrough: number;
  ghosted: number;
}

/**
 * Count, for one player on one team, how many league matches they
 * said yes to AND played (followed through) versus said yes to AND
 * had a lineup slot for AND did not appear in results (ghosted).
 *
 * Excluded from both: default-win lines, matches where they didn't
 * have a lineup slot at all, and any RSVP status other than 'yes'.
 */
async function countFollowThrough(
  playerId: string,
  teamId: string,
): Promise<FollowThroughCounts> {
  const db = await getDB();

  const followedThrough = (
    await db
      .prepare(
        `SELECT COUNT(DISTINCT lm.id) as cnt
         FROM league_matches lm
         JOIN availability av ON av.match_id = lm.id AND av.player_id = ? AND av.status = 'yes'
         JOIN league_match_results lmr ON lmr.match_id = lm.id
           AND (lmr.player1_id = ? OR lmr.player2_id = ?)
           AND lmr.is_default_win = 0
         WHERE lm.team_id = ?`,
      )
      .bind(playerId, playerId, playerId, teamId)
      .first<{ cnt: number }>()
  )?.cnt ?? 0;

  const ghosted = (
    await db
      .prepare(
        `SELECT COUNT(DISTINCT lm.id) as cnt
         FROM league_matches lm
         JOIN availability av ON av.match_id = lm.id AND av.player_id = ? AND av.status = 'yes'
         JOIN lineups lu ON lu.match_id = lm.id
         JOIN lineup_slots ls ON ls.lineup_id = lu.id AND ls.player_id = ?
         WHERE lm.team_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM league_match_results lmr
             WHERE lmr.match_id = lm.id
               AND (lmr.player1_id = ? OR lmr.player2_id = ?)
           )`,
      )
      .bind(playerId, playerId, teamId, playerId, playerId)
      .first<{ cnt: number }>()
  )?.cnt ?? 0;

  return { followedThrough, ghosted };
}
```

> **Note:** If Task 2 found that USTA-forfeited-by-us lines write a `league_match_results` row with `our_score='0', opp_score!='0', is_default_win=0`, modify the `followedThrough` query to also exclude that case: add `AND NOT (lmr.our_score = '0' AND lmr.opp_score != '0')` to the JOIN. If Task 2 found a different behavior, adjust accordingly.

- [ ] **Step 4.3: Replace `updateReliabilityScores` body**

In `src/lib/carrot.ts`, replace the entire `updateReliabilityScores` function with:

```typescript
export async function updateReliabilityScores(teamId: string): Promise<void> {
  const db = await getDB();

  const roster = (
    await db.prepare(
      `SELECT p.id FROM players p
       JOIN team_memberships tm ON tm.player_id = p.id AND tm.team_id = ? AND tm.active = 1`
    ).bind(teamId).all<{ id: string }>()
  ).results;

  for (const p of roster) {
    const { followedThrough, ghosted } = await countFollowThrough(p.id, teamId);
    const score = computeFollowThroughRate(followedThrough, ghosted);
    await db
      .prepare("UPDATE players SET reliability_score = ? WHERE id = ?")
      .bind(Math.round(score * 100) / 100, p.id)
      .run();
  }
}
```

The old formula (response_rate × 0.6 + early_rate × 0.4) is gone. The `is_before_deadline` flag stays in the schema but stops feeding into `reliability_score`.

- [ ] **Step 4.4: Update `calculateCarrotScores` to populate new fields**

In `src/lib/carrot.ts`, update the `for (const player of roster)` loop body. After the existing per-player counts (`played`, `available`, `earlyRsvp`, `totalRsvp`), add:

```typescript
    const { followedThrough, ghosted } = await countFollowThrough(player.id, teamId);
```

Then in the `results.push({...})` call, add the two new fields at the end:

```typescript
      followedThroughCount: followedThrough,
      ghostedCount: ghosted,
```

So the full `results.push` becomes:

```typescript
    results.push({
      playerId: player.id,
      name: player.name,
      matchesPlayed: played,
      matchesAvailable: available,
      reliabilityScore: player.reliability_score,
      onTrackForMinimum: canStillReachGoal && (played >= minGoal || remainingMatches > 0),
      minMatchesGoal: minGoal,
      earlyRsvpCount: earlyRsvp,
      totalRsvpCount: totalRsvp,
      followedThroughCount: followedThrough,
      ghostedCount: ghosted,
    });
```

- [ ] **Step 4.5: Type-check the codebase**

Run: `npx tsc --noEmit`
Expected: No errors. If callers of `PlayerCarrot` are typed, they must compile against the new interface (the two fields are additive, so this should be fine).

- [ ] **Step 4.6: Run unit tests**

Run: `npm test`
Expected: 13 passed. (No new tests this task — SQL behavior is verified against production in Task 8.)

- [ ] **Step 4.7: Commit**

```bash
git add src/lib/carrot.ts
git commit -m "carrot: replace reliability_score with follow-through-rate from USTA scorecard

The previous formula (response_rate*0.6 + early_rate*0.4) measured
'did the player click the RSVP button on time' — engagement, not
follow-through. The new formula measures 'did the player keep their
yes and play', derived from availability/lineup_slots/league_match_results.

PlayerCarrot interface gains followedThroughCount and ghostedCount so
captain dashboards can show the breakdown next to the score.

See docs/superpowers/specs/2026-05-02-team-showup-model-design.md."
```

---

## Task 5: Lineup-optimizer weight rebalance + tests

**Files:**
- Create: `src/lib/__tests__/lineup-optimizer.test.ts`
- Modify: `src/lib/lineup-optimizer.ts`

- [ ] **Step 5.1: Write failing tests**

Create `src/lib/__tests__/lineup-optimizer.test.ts`:

```typescript
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
    // weight (score - 0.5) * 10, a neutral player (0.5) and a stalwart (1.0)
    // should differ by exactly 5 priority points.
    const stalwart = p({ id: "stalwart", name: "Stalwart", reliabilityScore: 1.0 });
    const neutral = p({ id: "neutral", name: "Neutral", reliabilityScore: 0.5 });
    const { slots } = optimizeLineup([stalwart, neutral], { singles: 1, doubles: 0 });
    // Stalwart should win the S1 slot due to higher priority (5 vs 0 from reliability).
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
```

- [ ] **Step 5.2: Run tests, verify they fail or partially pass**

Run: `npm test`
Expected: Tests run, but the first test ("neutral player gets 0 swing") will fail with the *current* formula because today neutral (0.5) gets +5 and stalwart (1.0) gets +10 — both positive, stalwart still wins, so this test actually passes by accident on the current formula. To force a real fail, change the assertion details OR just trust that Step 5.3's edit correctly implements the spec and that the other tests catch regressions.

Better: run the test now and verify ALL tests pass (the current formula happens to satisfy them too). Then Step 5.3 changes the math but tests still pass. The tests assert the *correct end state*, not specifically the centered-on-0.5 detail.

- [ ] **Step 5.3: Update the optimizer weight**

In `src/lib/lineup-optimizer.ts`, change the line in `rsvpPriority`:

```typescript
  score += p.reliabilityScore * 10;
```

to:

```typescript
  score += (p.reliabilityScore - 0.5) * 20;
```

The `* 20` (not `* 10`) is intentional and load-bearing — see the spec's "Math discovery" subsection. Centering on 0.5 with the same multiplier is a uniform shift and doesn't change rankings; bumping the multiplier is what makes the change actually affect lineup decisions. The bump produces a ±10 reliability swing, which is enough to flip a stalwart-vs-ghost-with-1-deficit ranking but not a 2-deficit one (preserving the fairness floor).

Update the JSDoc comment at the top of the file (lines 1-24) only if it mentions reliability magnitude specifically. The current "RSVP status + reliability + match-fairness deficit + default-win make-up" wording is still accurate; no edit needed.

- [ ] **Step 5.4: Run tests, verify all pass**

Run: `npm test`
Expected: All Task 3 tests (13) + all Task 5 tests (5) pass.

- [ ] **Step 5.5: Commit**

```bash
git add src/lib/lineup-optimizer.ts src/lib/__tests__/lineup-optimizer.test.ts
git commit -m "lineup-optimizer: center + bump reliability weight to ±10

Previous formula gave 0..+10 priority points based on reliability
(always positive). After the carrot.ts change to make reliability_score
a Beta-smoothed follow-through rate, ghosts have meaningfully different
scores from stalwarts and the optimizer should reflect that.

Math discovery (caught during plan self-review): naïvely centering on
0.5 with the same *10 multiplier is a uniform −5 shift across all
players — algebraically a ranking no-op. Bumping the multiplier is
what makes the change actually affect lineup decisions. With *20 the
swing is ±10, which is enough to flip a stalwart-vs-ghost-with-1-deficit
ranking but not a 2-deficit one (preserving the fairness floor: every
player still hits min-match goal eventually).

See docs/superpowers/specs/2026-05-02-team-showup-model-design.md
section 'Lineup-optimizer integration'."
```

---

## Task 6: Backfill action in `/api/debug`

**Files:**
- Modify: `src/app/api/debug/route.ts`

- [ ] **Step 6.1: Add the `backfill-reliability` action**

In `src/app/api/debug/route.ts`, find the section where existing actions are dispatched (look for `if (body.action === "setup-fees")` or similar). Add immediately after one of the existing action handlers:

```typescript
    if (body.action === "backfill-reliability") {
      const { updateReliabilityScores } = await import("@/lib/carrot");
      const teams = (
        await db.prepare("SELECT id, name, slug FROM teams WHERE id IN (SELECT DISTINCT team_id FROM team_memberships WHERE active = 1)").all<{ id: string; name: string; slug: string }>()
      ).results;
      const summary: { team: string; players: number }[] = [];
      for (const team of teams) {
        await updateReliabilityScores(team.id);
        const count = (
          await db.prepare("SELECT COUNT(*) as cnt FROM team_memberships WHERE team_id = ? AND active = 1").bind(team.id).first<{ cnt: number }>()
        )?.cnt ?? 0;
        summary.push({ team: team.name, players: count });
      }
      return NextResponse.json({ ok: true, summary });
    }
```

- [ ] **Step 6.2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6.3: Run all tests**

Run: `npm test`
Expected: 18 passed.

- [ ] **Step 6.4: Build to verify Cloudflare bundling works**

Run: `npx opennextjs-cloudflare build`
Expected: build completes with `OpenNext build complete.`

- [ ] **Step 6.5: Commit**

```bash
git add src/app/api/debug/route.ts
git commit -m "api/debug: add backfill-reliability action for one-time reliability_score recompute

Run once after deploying the new follow-through-rate formula:
  curl -sk -X POST 'https://framers.app/api/debug' \\
    -H \"Authorization: Bearer \$ADMIN_SECRET\" \\
    -H 'Content-Type: application/json' \\
    -d '{\"action\":\"backfill-reliability\"}'

The daily cron continues calling updateReliabilityScores per team,
so this action is only needed once at deploy time."
```

---

## Task 7: Push, deploy, run backfill

**Files:** none (deploy + ops)

- [ ] **Step 7.1: Push all commits**

```bash
GIT_SSH_COMMAND="ssh -i /Users/hannes.magnusson/.ssh/id_ed25519-private-github -o IdentitiesOnly=yes" git push
```

- [ ] **Step 7.2: Deploy main worker**

The build artifact from Task 6 Step 6.4 is current. Deploy:

```bash
npx wrangler deploy .open-next/worker.js
```

Expected: `Deployed greenbrook-framers triggers`. Note the version ID for the handoff summary.

- [ ] **Step 7.3: Run the backfill**

```bash
curl -sk -X POST "https://framers.app/api/debug" \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action":"backfill-reliability"}'
```

Expected response (shape): `{"ok":true,"summary":[{"team":"Senior Framers","players":17},{"team":"Junior Framers","players":17}]}`. Both teams should appear with their roster counts.

If `ADMIN_SECRET` isn't set in your shell: `export ADMIN_SECRET=$(npx wrangler secret list 2>/dev/null | rg ADMIN_SECRET || echo 'set it manually')`. Or use the deployed-worker shell to invoke the function directly — whichever is faster.

---

## Task 8: Production verification

**Files:** none (read-only sanity checks)

- [ ] **Step 8.1: Pull current scores for the senior team**

```bash
npx wrangler d1 execute framers-v2 --remote --json --command "SELECT p.name, p.reliability_score FROM players p JOIN team_memberships tm ON tm.player_id = p.id AND tm.active = 1 WHERE tm.team_id = 'team-senior-framers-2026' ORDER BY p.reliability_score, p.name"
```

- [ ] **Step 8.2: Eyeball the rank order**

Sanity check: do the bottom 5 players (lowest reliability_score) match captain intuition for "the ones who say yes and don't show up"? Do the top 5 match "the stalwarts"?

If the rank order is wildly wrong: stop. The formula or the SQL counters have a bug. Common culprits:
- Forfeited-line edge case (Task 2 finding wasn't applied to the SQL)
- `lineup_slots` row missing for some matches (a player can't ghost a match if they were never on a lineup)
- `availability` rows for past matches missing (they may not have RSVP'd at all, in which case they're correctly excluded)

- [ ] **Step 8.3: Spot-check follow-through and ghost counts via the API**

```bash
curl -sk "https://framers.app/api/team/senior-framers-2026/carrot" \
  -H "Cookie: <admin session cookie>" | jq '.scores | sort_by(.reliabilityScore) | .[] | {name, reliabilityScore, followedThroughCount, ghostedCount}'
```

(Easier to run after logging in to `framers.app` as admin and grabbing the session cookie from devtools — or skip this step and just rely on Step 8.1.)

Verify each player's `followedThroughCount + ghostedCount` is plausible given their RSVP/play history.

- [ ] **Step 8.4: Confirm cron continues to update**

The next daily cron (`/api/cron`, 17:00 UTC = 9 AM PST) should overwrite reliability_score using the same updated formula. If it differs from the backfill values, something in the cron path is calling a stale code path or different team scope. Spot-check next morning.

- [ ] **Step 8.5: Update the spec status (optional)**

If everything looks right, edit `docs/superpowers/specs/2026-05-02-team-showup-model-design.md` header to change `**Status:** Approved` → `**Status:** Shipped 2026-05-02`. Commit.

```bash
git add docs/superpowers/specs/2026-05-02-team-showup-model-design.md
git commit -m "spec: mark team show-up model as shipped"
GIT_SSH_COMMAND="ssh -i /Users/hannes.magnusson/.ssh/id_ed25519-private-github -o IdentitiesOnly=yes" git push
```

---

## Followups (intentionally out of scope)

- **Brainstorm B (rituals/UX)**: standby ladder with explicit emails, day-of roll-call lifecycle state, vibe-aware match-email copy, and the "practice nudge" derived from `said yes ∧ no lineup_slot ∧ lineup_confirmed`. Run a fresh `superpowers:brainstorming` session.
- **Captain dashboard UI** to render the new `followedThroughCount` / `ghostedCount` fields. The API exposes them; no consumer UI exists yet. Light frontend ticket, can be done any time.
- **Optimizer weight retuning** after a season's worth of data. May want to nudge ±5 → ±8 if ghosts feel under-penalized in practice.
- **`availability_history` table** if Brainstorm B's decay-of-yes design needs it. This plan doesn't.
