import { describe, expect, it } from "vitest";
import type { Reputation } from "./despensa";
import { tierOf, tierProgress } from "./reputation";

const rep = (over: Partial<Reputation> = {}): Reputation => ({
  completed: 0,
  defaulted: 0,
  units_delivered: 0,
  units_refunded: 0,
  streak: 0,
  best_streak: 0,
  rating_sum: 0,
  rating_count: 0,
  ...over,
});

describe("tierOf mirrors the contract table", () => {
  it.each([
    [0, 1, 2000, 10_000],
    [1, 2, 3000, 10_000],
    [2, 2, 3000, 10_000],
    [3, 3, 4000, 10_000],
    [5, 3, 4000, 10_000],
    [6, 4, 5000, 10_000],
  ])("%i completed -> tier %i", (completed, tier, adv, bond) => {
    expect(tierOf(rep({ completed }))).toEqual({ tier, max_advance_bps: adv, bond_cover_bps: bond });
  });
  it("a default restricts until 3 campaigns in a row are completed", () => {
    expect(tierOf(rep({ completed: 2, defaulted: 1, streak: 2 })).tier).toBe(0);
    expect(tierOf(rep({ completed: 3, defaulted: 1, streak: 3 })).tier).toBe(3);
  });
  it("campaigns completed before the default do not offset it", () => {
    expect(tierOf(rep({ completed: 6, defaulted: 1, streak: 0 })).tier).toBe(0);
    expect(tierOf(rep({ completed: 9, defaulted: 1, streak: 3 })).tier).toBe(4);
    expect(tierOf(rep({ completed: 9, defaulted: 2, streak: 3 })).tier).toBe(0);
  });
  it("an average under 3 stars with 5+ ratings caps at tier 1", () => {
    expect(tierOf(rep({ completed: 6, rating_count: 5, rating_sum: 14 })).tier).toBe(1);
    expect(tierOf(rep({ completed: 6, rating_count: 4, rating_sum: 4 })).tier).toBe(4);
  });
});

describe("tierProgress", () => {
  it("counts the completions to the next tier", () => {
    expect(tierProgress(rep())).toMatchObject({ tier: 1, next: 2, needed: 1, reason: "normal" });
    expect(tierProgress(rep({ completed: 1 }))).toMatchObject({ tier: 2, next: 3, needed: 2 });
    expect(tierProgress(rep({ completed: 4 }))).toMatchObject({ tier: 3, next: 4, needed: 2 });
  });
  it("top tier has nowhere to go", () => {
    expect(tierProgress(rep({ completed: 9 }))).toMatchObject({ tier: 4, next: null, reason: "top" });
  });
  it("restricted producers see how many completions lift the restriction", () => {
    expect(tierProgress(rep({ defaulted: 1 }))).toMatchObject({ tier: 0, next: 3, needed: 3, reason: "restricted" });
  });
  it("a low rating blocks progress through completions", () => {
    expect(tierProgress(rep({ completed: 4, rating_count: 6, rating_sum: 10 }))).toMatchObject({ tier: 1, next: null, reason: "low_rating" });
  });
});
