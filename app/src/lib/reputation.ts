// Reputation tiers, mirrored from tier_for() in contracts/despensa/src/lib.rs. Pure.

import type { Reputation, TierInfo } from "./despensa";

export const TIER_NAMES = ["Restringido", "Nuevo", "Confiable", "Destacado", "Ejemplar"] as const;

/** max_advance_bps and bond_cover_bps per tier (contract table). */
export const TIER_LIMITS: Record<number, { maxAdvanceBps: number; bondCoverBps: number }> = {
  0: { maxAdvanceBps: 0, bondCoverBps: 10_000 },
  1: { maxAdvanceBps: 2_000, bondCoverBps: 10_000 },
  2: { maxAdvanceBps: 3_000, bondCoverBps: 5_000 },
  3: { maxAdvanceBps: 4_000, bondCoverBps: 2_500 },
  4: { maxAdvanceBps: 5_000, bondCoverBps: 1_000 },
};

/**
 * Same rules as the contract. A default sends the producer to tier 0 until they complete 3
 * campaigns in a row per default on record (only the streak since the last default counts).
 * A low rating caps at 1.
 */
export function tierOf(rep: Reputation): TierInfo {
  let tier: number;
  if (rep.defaulted > 0 && rep.streak < rep.defaulted * 3) {
    tier = 0;
  } else {
    tier = rep.completed === 0 ? 1 : rep.completed <= 2 ? 2 : rep.completed <= 5 ? 3 : 4;
    if (rep.rating_count >= 5 && rep.rating_sum < rep.rating_count * 3 && tier > 1) tier = 1;
  }
  const l = TIER_LIMITS[tier];
  return { tier, max_advance_bps: l.maxAdvanceBps, bond_cover_bps: l.bondCoverBps };
}

export interface TierProgress {
  tier: number;
  /** Next tier reachable by completing campaigns, or null at the top (or when only ratings block it). */
  next: number | null;
  /** Completed campaigns still needed to reach `next`. */
  needed: number;
  /** Why the producer is where they are, for the explanation line. */
  reason: "top" | "restricted" | "low_rating" | "normal";
}

export function tierProgress(rep: Reputation): TierProgress {
  const { tier } = tierOf(rep);
  if (tier === 4) return { tier, next: null, needed: 0, reason: "top" };
  const lowRating = rep.rating_count >= 5 && rep.rating_sum < rep.rating_count * 3;
  for (let k = 1; k <= 30; k++) {
    const t = tierOf({ ...rep, completed: rep.completed + k, streak: rep.streak + k }).tier;
    if (t > tier) return { tier, next: t, needed: k, reason: tier === 0 ? "restricted" : "normal" };
  }
  return { tier, next: null, needed: 0, reason: lowRating ? "low_rating" : "normal" };
}
