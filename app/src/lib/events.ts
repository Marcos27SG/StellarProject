// Contract events -> who has a delivery pending or a dispute open in a campaign.
//
// The Campaign struct only counts pending units (`campaign.pending`); it does not say which buyers
// they belong to. The contract publishes `delivery_marked` and `disputed` events with the buyer as a
// topic, so we use events to find candidate buyers and then read each buyer's Holding, which is the
// source of truth (events only tell us where to look).
//
// Limits:
// - RPC keeps events for its retention window (~7 days on testnet) and each getEvents call scans at
//   most 10,000 ledgers, so we start the scan at the campaign's creation time and page with the cursor.
// - Deliveries marked before the retention window are missed. Callers compare the sum of the pending
//   units found with `campaign.pending`; nextActions does this and offers a manual fallback.

import { nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { config } from "./config";
import { getHolding, type Campaign, type Holding } from "./despensa";

export interface PendingDelivery {
  buyer: string;
  holding: Holding;
}

/** Event names as the contract publishes them (`#[contractevent]` = snake_case struct name). */
export type CampaignEventName = "delivery_marked" | "disputed" | "purchased" | "delivered" | "refunded" | "yield_paid";

/** The slice of rpc.Server this module needs (injectable for tests). */
export interface EventSource {
  getHealth(): Promise<{ latestLedger: number; oldestLedger: number }>;
  getEvents(request: rpc.Api.GetEventsRequest): Promise<rpc.Api.GetEventsResponse>;
}

const PAGE_LIMIT = 100;
/** Retention (~120,960 ledgers) / 10,000 ledgers scanned per call, plus headroom. */
const MAX_PAGES = 16;
/** Ledgers close every ~5 s. Dividing by less than that starts the scan a bit early, never late. */
const SECONDS_PER_LEDGER_LOW = 4.5;
const START_MARGIN_LEDGERS = 720; // ~1 hour

let defaultSource: EventSource | null = null;
function source(): EventSource {
  defaultSource ??= new rpc.Server(config.rpcUrl);
  return defaultSource;
}

/** Ledger to start scanning from for a campaign created at `createdAt` (unix seconds). */
export function startLedgerFor(
  createdAt: bigint,
  health: { latestLedger: number; oldestLedger: number },
  nowSeconds: number = Math.floor(Date.now() / 1000),
): number {
  const elapsed = Math.max(0, nowSeconds - Number(createdAt));
  const estimate = health.latestLedger - Math.ceil(elapsed / SECONDS_PER_LEDGER_LOW) - START_MARGIN_LEDGERS;
  return Math.min(health.latestLedger, Math.max(health.oldestLedger, estimate));
}

/** Ledger encoded in a getEvents cursor ("<toid>-<index>", toid = ledger << 32 | ...). */
export function cursorLedger(cursor: string): number {
  const toid = cursor.split("-")[0];
  if (!toid || !/^\d+$/.test(toid)) return Number.NaN;
  return Number(BigInt(toid) >> BigInt(32));
}

function topicFilter(name: CampaignEventName, id: bigint, who?: string): string[] {
  return [
    xdr.ScVal.scvSymbol(name).toXDR("base64"),
    nativeToScVal(id, { type: "u64" }).toXDR("base64"),
    who ? nativeToScVal(who, { type: "address" }).toXDR("base64") : "*",
  ];
}

/** Every `names` event for campaign `id` (optionally only those whose second topic is `who`), oldest first. */
async function scanCampaignEvents(
  id: bigint,
  createdAt: bigint,
  names: CampaignEventName[],
  src: EventSource,
  nowSeconds?: number,
  who?: string,
): Promise<rpc.Api.EventResponse[]> {
  const health = await src.getHealth();
  const filters: rpc.Api.EventFilter[] = [
    { type: "contract", contractIds: [config.contractId], topics: names.map((n) => topicFilter(n, id, who)) },
  ];
  const out: rpc.Api.EventResponse[] = [];
  let request: rpc.Api.GetEventsRequest = {
    startLedger: startLedgerFor(createdAt, health, nowSeconds),
    filters,
    limit: PAGE_LIMIT,
  };
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await src.getEvents(request);
    out.push(...res.events);
    const caughtUp = res.events.length < PAGE_LIMIT && cursorLedger(res.cursor) >= res.latestLedger;
    if (caughtUp || !res.cursor) break;
    request = { cursor: res.cursor, filters, limit: PAGE_LIMIT };
  }
  return out;
}

/**
 * Unique addresses found in the second topic of `names` events for campaign `id`
 * (the buyer for delivery_marked / disputed / purchased / delivered / refunded).
 */
export async function campaignEventAddresses(
  id: bigint,
  createdAt: bigint,
  names: CampaignEventName[],
  src: EventSource = source(),
  nowSeconds?: number,
): Promise<string[]> {
  const found = new Set<string>();
  for (const e of await scanCampaignEvents(id, createdAt, names, src, nowSeconds)) {
    const addr = e.topic[2] ? scValToNative(e.topic[2]) : null;
    if (typeof addr === "string") found.add(addr);
  }
  return [...found];
}

export type YieldKind = "Buyer" | "Seller" | "Bond" | "Protocol";

/** `{ amount, kind }` from a `yield_paid` event's data (kind is a unit enum: ["Seller"] or "Seller"). */
export function decodeYieldPaid(data: unknown): { amount: bigint; kind: YieldKind } | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { amount?: unknown; kind?: unknown };
  const kind = Array.isArray(d.kind) ? d.kind[0] : d.kind;
  if (typeof kind !== "string" || d.amount === undefined) return null;
  return { amount: BigInt(d.amount as bigint | number | string), kind: kind as YieldKind };
}

/**
 * The most recent yield paid to `to` in campaign `id` as `kind` (the seller's share on the last
 * delivery, for "Cobraste"). Null when there is none (no yield yet, or older than event retention).
 */
export async function latestYieldPaid(
  c: Pick<Campaign, "id" | "created_at">,
  to: string,
  kind: YieldKind,
  src: EventSource = source(),
): Promise<bigint | null> {
  const events = await scanCampaignEvents(c.id, c.created_at, ["yield_paid"], src, undefined, to);
  for (let i = events.length - 1; i >= 0; i--) {
    const y = decodeYieldPaid(scValToNative(events[i].value));
    if (y && y.kind === kind) return y.amount;
  }
  return null;
}

export interface PendingDeliveryDeps {
  events?: EventSource;
  holding?: (id: bigint, buyer: string) => Promise<Holding>;
  nowSeconds?: number;
}

/**
 * Buyers with units the seller marked delivered and that are not settled yet (pending > 0),
 * oldest first. Disputed ones have `holding.disputed === true`.
 * Pass the result to nextActions as `deliveries` for the seller and verifier panels.
 */
export async function listPendingDeliveries(
  c: Pick<Campaign, "id" | "created_at" | "pending">,
  deps: PendingDeliveryDeps = {},
): Promise<PendingDelivery[]> {
  if (c.pending === 0) return [];
  const readHolding = deps.holding ?? getHolding;
  const buyers = await campaignEventAddresses(
    c.id,
    c.created_at,
    ["delivery_marked", "disputed"],
    deps.events,
    deps.nowSeconds,
  );
  const rows = await Promise.all(buyers.map(async (buyer) => ({ buyer, holding: await readHolding(c.id, buyer) })));
  return rows
    .filter((r) => r.holding.pending > 0)
    .sort((a, b) => (a.holding.pending_since < b.holding.pending_since ? -1 : 1));
}
