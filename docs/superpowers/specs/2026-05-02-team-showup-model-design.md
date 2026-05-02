# Team Show-Up Model — Design Spec

**Date:** 2026-05-02
**Status:** Approved (brainstorming complete) — ready for implementation plan
**Author:** Hannes + Cursor agent (Superpowers `brainstorming` skill)
**Scope:** Fix the data side of the reliability/show-up model. Layer-on rituals (standby ladder, roll-call, vibe-aware copy) live in a separate follow-up spec ("Brainstorm B").

---

## Goal

Replace the current `players.reliability_score` formula — which only measures *did the player click the RSVP button on time* — with one that measures **did the player keep their "yes" and actually show up**, derived from the USTA scorecard (the source of truth).

## Why this matters

The Senior Framers team's reality is "Tuesday-yes, Saturday-ghost": people RSVP enthusiastically and then a non-trivial fraction don't show. The current lineup-optimizer is structurally blind to this — it rewards engagement, not follow-through. A player who RSVPs yes every Tuesday and ghosts every Saturday morning currently has a perfect 1.0 reliability score and gets +10 priority in lineup selection, identical to a player who actually shows up every time.

That isn't a tone problem; it's a math problem. The fix is upstream: get the data honest, then any UI / ritual built on top of it is pointing at reality instead of theatre.

## Non-goals

- **Not changing the schema.** This spec uses only existing tables (`availability`, `lineup_slots`, `league_match_results`).
- **Not adding RSVP history.** The "moment of truth" for ghost detection is `availability.status` at query time. If a player walks back their `yes` to `no` after the match, they could in principle scrub their record — we accept this and rely on social pressure, not code, to handle it. (The fix, if ever needed, is `availability_history` in a future spec.)
- **Not adding new attendance-tracking UI.** The USTA scorecard is authoritative — `usta-sync` is the only writer of `league_match_results`. If the scorecard is wrong, the captain files a USTA grievance and re-syncs; the platform doesn't try to second-guess.
- **Not redesigning rituals or lifecycle.** Standby ladder, day-of roll-call, and decay-of-yes are explicit follow-ups in Brainstorm B.
- **Not making the score player-facing.** Captains/admins see it; players don't. (Public reliability scores would be a worse-vibe-not-better-vibe change.)

## Architecture

A pure derivation change inside `src/lib/carrot.ts`. No new tables, no new API routes, no new background jobs. The existing daily cron (`/api/cron`) already calls `updateReliabilityScores` for each active team — that keeps working with the new formula. One backfill on first deploy.

```
+-----------------------------+        +--------------------------+
| availability                |        | lineup_slots             |
| (player_id, match_id,       |        | (match_id, player_id,    |
|  status: yes/no/maybe/...)  |        |  position, is_alternate) |
+--------------+--------------+        +-----------+--------------+
               |                                   |
               |   joined per (player, match)      |
               +-------+   +-----------------------+
                       |   |
                       v   v
               +---------------------------------+
               | follow-through derivation       |
               | (numerator, denominator)        |
               +-------+----------------+--------+
                       |                |
                       v                v
        +--------------+--------+   +---+----------------------+
        | league_match_results  |   | players.reliability_score|
        | (player1_id,          |   | (Beta-smoothed rate)     |
        |  player2_id,          |   +--------------------------+
        |  is_default_win)      |
        +-----------------------+
```

## Data model & definitions

### Vocabulary

For a given `(player, league match)` pair:

- **Followed through** ⟺ all of:
  - `availability.status = 'yes'`
  - Player appears as `player1_id` or `player2_id` in some `league_match_results` row for that match
  - That row has `is_default_win = 0`
- **Ghosted** ⟺ all of:
  - `availability.status = 'yes'`
  - Player has a `lineup_slots` row for that match (whether `is_alternate=0` or `is_alternate=1`)
  - Player does *not* appear in any `league_match_results` row for that match
- **Excluded** (counts toward neither numerator nor denominator):
  - `availability.status` ∈ {`no`, `maybe`, `doubles_only`, `call_last`, NULL/missing}
  - Said `yes` but wasn't given a `lineup_slots` row (captain's call — not a ghost)
  - Was on the card but the line was credited as `is_default_win = 1` (the *opponent* ghosted; this player gets a default-win credit but didn't swing a racket — they shouldn't get a follow-through credit either)

### Formula

```
followed_through = COUNT of (player, match) pairs satisfying "Followed through" above
ghosted          = COUNT of (player, match) pairs satisfying "Ghosted" above

reliability_score = (followed_through + 1.5) / (followed_through + ghosted + 3.0)
```

That's a `Beta(α=1.5, β=1.5)` Bayesian prior — mildly hump-shaped around 0.5, so low-N players sit near neutral instead of swinging hard to 0 or 1 from a single data point.

### Calibration table

| `followed_through` | `ghosted` | `reliability_score` | Vibe |
|---|---|---|---|
| 0 | 0 | 0.50 | New player, no signal |
| 1 | 0 | 0.63 | Promising |
| 5 | 0 | 0.81 | Reliable |
| 10 | 0 | 0.88 | Stalwart |
| 1 | 1 | 0.50 | Wash → back to neutral |
| 5 | 1 | 0.72 | Mostly reliable, one off-day |
| 0 | 1 | 0.38 | One-strike, low signal |
| 0 | 5 | 0.19 | Classic Greenbrook drift |

### Scope of computation

- All league matches the player has been a roster member of, all-time, within their current `team_memberships` row. (We don't time-window or season-window — the team is small, sample size matters more than recency.)
- Computed per `(player, team)` pair. Stored on `players.reliability_score` (single column, mirrors current behavior — there's only one active team per player at a time, so no ambiguity in practice).

## Lineup-optimizer integration

`src/lib/lineup-optimizer.ts:rsvpPriority` currently does:

```typescript
score += p.reliabilityScore * 10;  // range 0..10, always positive
```

### Math discovery (caught during plan self-review)

A naïve `(reliabilityScore - 0.5) * 10` change is **algebraically equivalent to a uniform −5 shift across all players** — i.e., it's a ranking no-op. Centering on 0.5 alone is purely cosmetic for the optimizer; it only matters if we *also* increase the magnitude. The change has to do real work, not just look like it does.

### Resolution

Bump the multiplier *and* center on neutral:

```typescript
score += (p.reliabilityScore - 0.5) * 20;  // range -10 to +10, centered at neutral
```

Effect on priority math (other terms for context: `yes`=+100, fairness deficit=+15/match, default-win make-up=+10):

- A `yes` from a stalwart (1.0): 100 + 10 = **110**
- A `yes` from a chronic ghost (0.2): 100 + (–6) = **94**
- A `yes` from a neutral (0.5): 100 + 0 = **100**

The behavioral knee-point this produces:

| Scenario | Old formula | New formula |
|---|---|---|
| Stalwart no-deficit vs. ghost no-deficit | Stalwart wins by 10 | Stalwart wins by 20 |
| Stalwart no-deficit vs. ghost **+1**-deficit | Ghost wins by 7 | **Stalwart wins by 3** |
| Stalwart no-deficit vs. ghost **+2**-deficit | Ghost wins by 22 | Ghost wins by 13 |

So a 1-match fairness deficit no longer rescues a chronic ghost; a 2-match deficit still does. Fairness floor (everyone hits their min-match goal eventually) is preserved, but reliability pushes through tossups. This honors "modest, not punitive" — a chronic ghost still gets matches when they're behind on minimum quota, just not when they're already even.

## Surfacing

### Captain / admin (carrot dashboard, `/api/team/[slug]/carrot`)

The existing `PlayerCarrot` interface gains two fields:

```typescript
interface PlayerCarrot {
  // ... existing fields ...
  followedThroughCount: number;  // new
  ghostedCount: number;           // new
}
```

The UI (wherever the carrot data is rendered today) shows the breakdown alongside the score: `"reliability 0.62 — kept yes 5×, ghosted 2×"` instead of just `"0.62"`. This makes the math legible to captains so they can eyeball it without judgment.

### Player-facing

**No change.** Players don't see their own `reliability_score`, and they don't see anyone else's. (Brainstorm B will add a player-facing "practice nudge" — a derived signal of *"you've shown up but didn't get picked, want to come to practice?"* — but that's a separate feature with very different intent and copy.)

## Migration / backfill

1. Deploy the new code.
2. One-time invocation: call `updateReliabilityScores(teamId)` for every active team. Easiest mechanism is a new `/api/debug` action (`backfill-reliability`) gated by `ADMIN_SECRET`, called once via curl.
3. The existing daily cron continues calling `updateReliabilityScores` per team — no cron-config change.
4. Old fields retired in code only (`responseRate`, `earlyRate` are not stored in the schema; they were always recomputed from `availability` rows). No data migration needed.
5. Communications: no announcement to players (it's an internal scoring change, not user-visible). Captains may want a one-line note in the next team email pointing out the captain-dashboard changes.

## Testing strategy

The repo currently has **no test framework installed** and no `__tests__` directories. The implementation plan must pick one of:

- **(A) Add vitest** as a dev dependency, configure `vitest.config.ts`, write `src/lib/__tests__/carrot.test.ts` covering the calibration table + edge cases. Adds ~5 min of dev-loop value and ~15 min of setup work. **Recommended** if we're going to keep building features that need testing — this won't be the last unit-test-shaped function.
- **(B) One-off Node test script** at `scripts/verify-carrot-formula.ts`, runs via `npx tsx`. No framework. Cheap to write, cheap to throw away. Acceptable if we don't expect more unit-test-shaped work soon.

The implementation plan will lock this in. Default proposal: **(A) vitest**, scoped narrowly to `src/lib/**/*.test.ts`.

### Test cases (formula + edge cases)

Independent of A or B:

1. New player, no history → score 0.5
2. 1 follow-through, 0 ghosts → score 0.625 (within 0.001)
3. 5/0 → 0.8125; 10/0 → 0.8846; 1/1 → 0.5; 5/1 → 0.7222; 0/5 → 0.1875
4. `is_default_win` line: counted neither as follow-through nor as ghost
5. Alternate (`is_alternate=1`) who didn't play: not counted as ghost
6. Player with `availability.status='yes'` but no `lineup_slots` row: not counted as ghost
7. Player with `availability.status` ∈ {`no`, `maybe`, `doubles_only`, `call_last`, NULL}: excluded entirely
8. Mixed roster of 5 players with varied histories: function produces stable, monotone scores

### Production verification (post-deploy)

Independent of unit tests, after deploy run a query like:

```sql
SELECT p.name, p.reliability_score, m.* FROM players p
JOIN team_memberships tm ON tm.player_id = p.id AND tm.active = 1
JOIN <follow_through_view> m ON m.player_id = p.id
WHERE tm.team_id = 'team-senior-framers-2026'
ORDER BY p.reliability_score;
```

Eyeball the results against captain knowledge. If the rank order doesn't match informal intuition for the bottom 5 and top 5, the formula is wrong — file a follow-up.

## Risks & open questions

- **Captain bias in lineup selection skews ghost detection.** If the captain consistently doesn't pick a player despite their RSVP, that player accrues neither follow-throughs nor ghosts — they're invisible to the system. **Mitigation:** the lineup-optimizer's match-fairness deficit term already pulls infrequently-picked yes-RSVPers up; this spec doesn't make that worse.
- **Sub-in mid-match.** If the captain swaps player A for player B at the line during an actual match, the `league_match_results.player1_id`/`player2_id` reflects whoever finished. Player A appears to have ghosted; player B appears as a "surprise show." **Mitigation:** edge case, low frequency, not worth modeling — file a USTA scorecard correction if it actually happens.
- **Lines we forfeit (shorthanded).** Open question: when *our* team forfeits a line, what does `league_match_results` look like? Three possibilities the implementation plan must verify against `src/lib/usta-sync.ts`: (a) no row exists for that line — then any yes-RSVP'd player who was assigned to it via `lineup_slots` would incorrectly count as a ghost. (b) Row exists with `player1_id`/`player2_id` populated and `won=0` and `is_default_win=0` — the player counts as having played (correct, they showed up; we just lost the line on the court). (c) Row exists with `is_default_win=0` but null `player1_id` — neutral, no signal. The implementation plan must read `usta-sync` carefully and add a definition clause for the actual behavior. **Likely fix:** if (a) is true, broaden the "ghosted" definition's exclusion to also exclude `(player, match)` pairs where `league_matches.team_score` indicates a known shorthanded forfeit on that line.
- **`availability` writes are idempotent — does last-update-wins fully reflect the player's intent?** Probably yes. We accept that "scrubbing" by flipping `yes`→`no` after a ghost is technically possible. Trust + small social pressure handles it.
- **Test infra cost.** If we go with vitest (A), the implementation plan needs to budget the setup. If with one-off script (B), we accept that this code path won't have ongoing CI coverage.

## Appendix: rejected alternatives

- **Add `availability_history` table.** Considered for "moment of truth" precision. Rejected for now: the user explicitly chose latest-state, and the cost (new table + writers everywhere `availability` is updated) outweighs the gain for a team this size.
- **Add captain post-match attendance check-in UI.** Considered for higher-fidelity attendance signal. Rejected: USTA scorecard is authoritative (user's framing); adding a second source of truth invites drift and captain tax.
- **Player self-check-in on match day.** Considered as a roll-call mechanism. Rejected for this spec — it's a *ritual* feature (Brainstorm B), not a data-model fix.
- **Keep both `reliability_score` (engagement) and add `follow_through_score` (kept yes).** Considered as a "track both" alternative. Rejected: the user explicitly chose to retire engagement-measurement entirely. Two scores in the optimizer would be muddier than one honest one.
- **Larger optimizer weight (`(score - 0.5) * 30`, range -15 to +15).** Rejected: ghosts shouldn't be effectively benched. Smaller hand fits team culture.
- **Make reliability_score visible on player profiles.** Rejected: bad-vibes, not on-brand for the team.

## Follow-ups

- **Brainstorm B (rituals/UX) — separate spec.** Standby ladder with explicit emails, day-of roll-call lifecycle state, vibe-aware match-email copy, and the "practice nudge" derived from `said yes ∧ no lineup_slot ∧ lineup_confirmed`.
- **`availability_history`** — only add if Brainstorm B's decay-of-yes design needs it. This spec doesn't.
- **Optimizer weight retuning** — after a season's worth of data with the new formula, re-eyeball whether ±5 priority points is the right swing. May want to nudge it.
