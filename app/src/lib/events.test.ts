import { nativeToScVal, rpc, xdr } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import type { Holding } from "./despensa";
import {
  campaignEventAddresses,
  cursorLedger,
  decodeYieldPaid,
  latestYieldPaid,
  listPendingDeliveries,
  startLedgerFor,
  type EventSource,
} from "./events";

const B1 = "GALLLWHLW7ZI5MDK6IYEMV7AYRNCWU5SDE4SUTLDA5SF3KCMCTW325MY";
const B2 = "GCCNUJF362MBLA3RN2G3VH4KDMVTNNPS5M32AL5CFW65H66PIHC3L33P";
const B3 = "GDVZDGLLY2COW6VGW6GT5A47KWHWNVIE3YQ2THQV6IZWTSCR6DISG2AN";
const LATEST = 5_579_070;
const OLDEST = LATEST - 120_960;

const cursorAt = (ledger: number) => `${((BigInt(ledger) << BigInt(32)) | BigInt(4095)).toString().padStart(19, "0")}-1`;

function event(name: string, id: number, buyer: string): rpc.Api.EventResponse {
  return {
    topic: [xdr.ScVal.scvSymbol(name), nativeToScVal(BigInt(id), { type: "u64" }), nativeToScVal(buyer, { type: "address" })],
    value: xdr.ScVal.scvVoid(),
  } as unknown as rpc.Api.EventResponse;
}

/** Fake RPC: serves `pages` in order and records every request. */
function fakeSource(pages: { events: rpc.Api.EventResponse[]; cursorLedger: number }[]) {
  const requests: rpc.Api.GetEventsRequest[] = [];
  const src: EventSource = {
    getHealth: async () => ({ latestLedger: LATEST, oldestLedger: OLDEST }),
    getEvents: async (req) => {
      requests.push(req);
      const page = pages[requests.length - 1] ?? { events: [], cursorLedger: LATEST };
      return {
        events: page.events,
        cursor: cursorAt(page.cursorLedger),
        latestLedger: LATEST,
        oldestLedger: OLDEST,
      } as unknown as rpc.Api.GetEventsResponse;
    },
  };
  return { src, requests };
}

describe("cursorLedger", () => {
  it("decodes the ledger from a real testnet cursor", () => {
    expect(cursorLedger("0023961871652487167-4294967295")).toBe(5_579_057);
    expect(cursorLedger(cursorAt(LATEST))).toBe(LATEST);
  });
  it("garbage is NaN", () => {
    expect(cursorLedger("")).toBeNaN();
  });
});

describe("startLedgerFor", () => {
  const health = { latestLedger: LATEST, oldestLedger: OLDEST };
  const now = 1_800_000_000;
  it("starts a little before the campaign was created", () => {
    const start = startLedgerFor(BigInt(now - 3600), health, now);
    expect(start).toBeLessThan(LATEST - 3600 / 5);
    expect(start).toBeGreaterThan(LATEST - 3600 / 5 - 2000);
  });
  it("is clamped to the retention window", () => {
    expect(startLedgerFor(BigInt(now - 30 * 86_400), health, now)).toBe(OLDEST);
    expect(startLedgerFor(BigInt(now + 999), health, now)).toBeLessThanOrEqual(LATEST);
  });
});

describe("campaignEventAddresses", () => {
  it("filters by event name + campaign id and decodes the buyer topic", async () => {
    const { src, requests } = fakeSource([{ events: [event("delivery_marked", 7, B1)], cursorLedger: LATEST }]);
    expect(await campaignEventAddresses(BigInt(7), BigInt(0), ["delivery_marked", "disputed"], src)).toEqual([B1]);
    const [filter] = requests[0].filters;
    expect(filter.topics).toHaveLength(2);
    expect(filter.topics![0][0]).toBe(xdr.ScVal.scvSymbol("delivery_marked").toXDR("base64"));
    expect(filter.topics![0][1]).toBe(nativeToScVal(BigInt(7), { type: "u64" }).toXDR("base64"));
    expect(filter.topics![0][2]).toBe("*");
    expect(requests[0].startLedger).toBe(OLDEST);
  });

  it("pages with the cursor until it reaches the latest ledger, de-duplicating buyers", async () => {
    const { src, requests } = fakeSource([
      { events: [], cursorLedger: OLDEST + 10_000 },
      { events: [event("delivery_marked", 0, B1)], cursorLedger: OLDEST + 20_000 },
      { events: [event("disputed", 0, B1), event("delivery_marked", 0, B2)], cursorLedger: LATEST },
      { events: [event("delivery_marked", 0, B3)], cursorLedger: LATEST }, // never requested
    ]);
    const found = await campaignEventAddresses(BigInt(0), BigInt(0), ["delivery_marked", "disputed"], src);
    expect(found.sort()).toEqual([B1, B2].sort());
    expect(requests).toHaveLength(3);
    expect(requests[1].cursor).toBe(cursorAt(OLDEST + 10_000));
    expect(requests[1].startLedger).toBeUndefined();
  });

  it("gives up after a bounded number of pages", async () => {
    const endless = Array.from({ length: 50 }, (_, i) => ({ events: [], cursorLedger: OLDEST + i }));
    const { src, requests } = fakeSource(endless);
    await campaignEventAddresses(BigInt(0), BigInt(0), ["delivery_marked"], src);
    expect(requests.length).toBeLessThanOrEqual(16);
  });
});

describe("listPendingDeliveries", () => {
  const holding = (over: Partial<Holding>): Holding => ({
    units: 0, pending: 0, pending_since: BigInt(0), disputed: false, delivered: 0, refunded: 0, rated: false, yield_paid: BigInt(0), ...over,
  });

  it("skips the network when nothing is pending", async () => {
    const { src, requests } = fakeSource([]);
    expect(await listPendingDeliveries({ id: BigInt(0), created_at: BigInt(0), pending: 0 }, { events: src })).toEqual([]);
    expect(requests).toHaveLength(0);
  });

  it("keeps only holdings that still have pending units, oldest first", async () => {
    const { src } = fakeSource([{ events: [event("delivery_marked", 0, B1), event("delivery_marked", 0, B2)], cursorLedger: LATEST }]);
    const holdings: Record<string, Holding> = {
      [B1]: holding({ pending: 1, pending_since: BigInt(200) }),
      [B2]: holding({ pending: 3, pending_since: BigInt(100), disputed: true }),
    };
    const rows = await listPendingDeliveries(
      { id: BigInt(0), created_at: BigInt(0), pending: 4 },
      { events: src, holding: async (_id, buyer) => holdings[buyer] },
    );
    expect(rows.map((r) => r.buyer)).toEqual([B2, B1]);

    holdings[B1] = holding({ delivered: 1 }); // confirmed since: no longer pending
    const after = await listPendingDeliveries(
      { id: BigInt(0), created_at: BigInt(0), pending: 3 },
      { events: fakeSource([{ events: [event("delivery_marked", 0, B1), event("delivery_marked", 0, B2)], cursorLedger: LATEST }]).src, holding: async (_id, b) => holdings[b] },
    );
    expect(after.map((r) => r.buyer)).toEqual([B2]);
  });
});

describe("yield_paid events", () => {
  it("decodes amount and kind (unit enums come back as a one-element array)", () => {
    expect(decodeYieldPaid({ amount: BigInt(192_001), kind: ["Seller"] })).toEqual({ amount: BigInt(192_001), kind: "Seller" });
    expect(decodeYieldPaid({ amount: BigInt(5), kind: "Buyer" })).toEqual({ amount: BigInt(5), kind: "Buyer" });
    expect(decodeYieldPaid(null)).toBeNull();
    expect(decodeYieldPaid({ amount: BigInt(1) })).toBeNull();
  });

  it("returns the latest payment of the requested kind", async () => {
    const value = (amount: number, kind: string) =>
      xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("amount"), val: nativeToScVal(BigInt(amount), { type: "i128" }) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("kind"), val: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(kind)]) }),
      ]);
    const events = [value(10, "Seller"), value(3, "Bond"), value(25, "Seller"), value(7, "Bond")].map(
      (v) => ({ topic: [], value: v }) as unknown as rpc.Api.EventResponse,
    );
    const src: EventSource = {
      getHealth: async () => ({ latestLedger: 1000, oldestLedger: 1 }),
      getEvents: async () => ({ events, cursor: "", latestLedger: 1000 }) as unknown as rpc.Api.GetEventsResponse,
    };
    expect(await latestYieldPaid({ id: BigInt(0), created_at: BigInt(0) }, "GCCNUJF362MBLA3RN2G3VH4KDMVTNNPS5M32AL5CFW65H66PIHC3L33P", "Seller", src)).toBe(BigInt(25));
    expect(await latestYieldPaid({ id: BigInt(0), created_at: BigInt(0) }, "GCCNUJF362MBLA3RN2G3VH4KDMVTNNPS5M32AL5CFW65H66PIHC3L33P", "Protocol", src)).toBeNull();
  });
});
