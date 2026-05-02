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
