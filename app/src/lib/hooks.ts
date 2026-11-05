"use client";

// Small cached data layer for contract reads. One entry per key, shared by every component that
// asks for it (e.g. a producer's reputation on many cards is fetched once). `invalidate(prefix)`
// after a transaction refetches only what that transaction could have changed.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getCategory, type CategoryDef } from "@/catalog";
import {
  friendlyError,
  getBond,
  getBuyerStats,
  getCampaign,
  getConfig,
  getHolding,
  getReputation,
  getTier,
  isVerifier,
  listCampaigns,
  type BuyerStats,
  type Campaign,
  type ContractConfig,
  type Holding,
  type Reputation,
  type TierInfo,
} from "./despensa";
import { listPendingDeliveries, type PendingDelivery } from "./events";
import { resolveCampaignMetadata, type ResolvedMetadata } from "./metadata";

interface Entry {
  value?: unknown;
  error?: string;
  inflight?: Promise<unknown>;
  at: number;
  fetcher?: () => Promise<unknown>;
  listeners: Set<() => void>;
  version: number;
}

const store = new Map<string, Entry>();

function entry(key: string): Entry {
  let e = store.get(key);
  if (!e) {
    e = { at: 0, listeners: new Set(), version: 0 };
    store.set(key, e);
  }
  return e;
}

function notify(e: Entry) {
  e.version++;
  e.listeners.forEach((l) => l());
}

function load(key: string) {
  const e = entry(key);
  if (!e.fetcher || e.inflight) return;
  const p = e.fetcher();
  e.inflight = p;
  notify(e);
  p.then(
    (v) => {
      e.value = v;
      e.error = undefined;
      e.at = Date.now();
    },
    (err) => {
      e.error = friendlyError(err);
      e.at = Date.now();
    },
  ).finally(() => {
    e.inflight = undefined;
    notify(e);
  });
}

/** Marks every key starting with one of `prefixes` as stale and refetches the ones on screen. */
export function invalidate(...prefixes: string[]) {
  for (const [key, e] of store) {
    if (!prefixes.some((p) => key.startsWith(p))) continue;
    e.at = 0;
    if (e.listeners.size > 0) load(key);
  }
}

export interface Query<T> {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  refresh: () => void;
}

/** `key = null` disables the query. Data older than `ttlMs` is refetched when a component mounts. */
export function useQuery<T>(key: string | null, fetcher: () => Promise<T>, ttlMs = 20_000): Query<T> {
  if (key) entry(key).fetcher = fetcher as () => Promise<unknown>;

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!key) return () => {};
      const e = entry(key);
      e.listeners.add(listener);
      return () => e.listeners.delete(listener);
    },
    [key],
  );
  const version = useSyncExternalStore(
    subscribe,
    () => (key ? entry(key).version : -1),
    () => -1,
  );

  useEffect(() => {
    if (!key) return;
    const e = entry(key);
    if (e.value === undefined || Date.now() - e.at > ttlMs) load(key);
  }, [key, ttlMs]);

  return useMemo(() => {
    const e = key ? store.get(key) : undefined;
    return {
      data: e?.value as T | undefined,
      error: e?.error,
      loading: !!key && e?.value === undefined && !e?.error,
      refresh: () => key && load(key),
    };
    // `version` changes whenever the entry does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);
}

// ------------------------------------------------------------------ campaigns

/** A campaign with its resolved off-chain metadata and category. */
export interface CampaignItem {
  c: Campaign;
  meta: ResolvedMetadata;
  category: CategoryDef;
}

async function toItem(c: Campaign): Promise<CampaignItem> {
  const meta = await resolveCampaignMetadata(c);
  return { c, meta, category: getCategory(meta.meta.category) };
}

/** All campaigns with their metadata. `enabled = false` skips the fetch (shared cache key otherwise). */
export function useCampaignList(enabled = true) {
  return useQuery<CampaignItem[]>(enabled ? "campaigns" : null, async () => Promise.all((await listCampaigns()).map(toItem)));
}

export function useCampaignItem(id: bigint | null) {
  return useQuery<CampaignItem>(id === null ? null : `campaign:${id}`, async () => toItem(await getCampaign(id!)));
}

export function useHolding(id: bigint, address: string | null) {
  return useQuery<Holding>(address ? `holding:${id}:${address}` : null, () => getHolding(id, address!));
}

export function useBond(id: bigint, address: string | null) {
  return useQuery<bigint>(address ? `bond:${id}:${address}` : null, () => getBond(id, address!));
}

/** Is `address` on the contract's verifier allowlist? `null` skips the read. */
export function useVerifierAllowed(address: string | null) {
  return useQuery<boolean>(address ? `verifier:${address}` : null, () => isVerifier(address!), 60_000);
}

export function useContractConfig() {
  return useQuery<ContractConfig>("config", getConfig, 60_000);
}

export interface ProducerStats {
  rep: Reputation;
  tier: TierInfo;
}

export function useProducer(seller: string | null) {
  return useQuery<ProducerStats>(seller ? `producer:${seller}` : null, async () => {
    const [rep, tier] = await Promise.all([getReputation(seller!), getTier(seller!)]);
    return { rep, tier };
  }, 60_000);
}

/** The buyer's holding in each of `ids` (Mis vales). One key per address + campaign set. */
export function useHoldings(address: string | null, ids: bigint[]) {
  const key = address && ids.length ? `holdings:${address}:${ids.join(",")}` : null;
  return useQuery<Record<string, Holding>>(key, async () => {
    const rows = await Promise.all(ids.map(async (id) => [id.toString(), await getHolding(id, address!)] as const));
    return Object.fromEntries(rows);
  });
}

export function useBuyerStats(address: string | null) {
  return useQuery<BuyerStats>(address ? `buyer:${address}` : null, () => getBuyerStats(address!), 60_000);
}

/**
 * How many of the buyer's vouchers need them now: deliveries to confirm (inside the dispute
 * window or not) and refunds to claim. Drives the badge on "Mis vales" in the header.
 */
export function useBuyerAttention(address: string | null): number {
  const list = useCampaignList(!!address);
  const ids = address ? (list.data ?? []).map((i) => i.c.id) : [];
  const holdings = useHoldings(address, ids);
  if (!address || !list.data || !holdings.data) return 0;
  let n = 0;
  for (const { c } of list.data) {
    const h = holdings.data[c.id.toString()];
    if (!h) continue;
    if (c.status.tag === "Active" && h.pending > 0 && !h.disputed) n++;
    if ((c.status.tag === "Failed" || c.status.tag === "Defaulted") && h.units + h.pending > 0) n++;
  }
  return n;
}

/** Stats for several producers at once (marketplace sorting by reputation). */
export function useProducers(sellers: string[]) {
  const list = [...new Set(sellers)].sort();
  return useQuery<Record<string, ProducerStats>>(list.length ? `producers:${list.join(",")}` : null, async () => {
    const rows = await Promise.all(
      list.map(async (s) => {
        const [rep, tier] = await Promise.all([getReputation(s), getTier(s)]);
        return [s, { rep, tier }] as const;
      }),
    );
    return Object.fromEntries(rows);
  }, 60_000);
}

/** Buyers with pending deliveries / open disputes. Slow (event scan), so only for seller and verifier panels. */
export function usePendingDeliveries(c: Campaign | undefined, enabled: boolean) {
  const on = !!c && enabled && c.pending > 0;
  return useQuery<PendingDelivery[]>(on ? `pending:${c!.id}:${c!.pending}` : null, () => listPendingDeliveries(c!), 60_000);
}

/** Keys a transaction on campaign `id` can change. */
export function invalidateCampaign(id: bigint) {
  invalidate(`campaign:${id}`, `holding:${id}:`, `bond:${id}:`, `pending:${id}:`, "campaigns", "producer", "config", "holdings:", "buyer:");
}

// ------------------------------------------------------------------ live updates

/**
 * Calls `fn` every `ms` while `active` and the tab is visible. Used where the other side of a
 * hand-off acts on another phone: the buyer waits for the producer to register a delivery, the
 * producer waits for the buyer to confirm.
 */
export function usePolling(fn: () => void, ms: number, active: boolean) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") ref.current();
    }, ms);
    return () => clearInterval(t);
  }, [ms, active]);
}

// ------------------------------------------------------------------ time

/** Current time in seconds as a bigint, ticking every `everyMs` (ledger time is within seconds of this). */
export function useNow(everyMs = 30_000): bigint {
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => {
    const t = setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
