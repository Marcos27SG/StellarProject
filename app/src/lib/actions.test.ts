import { describe, expect, it } from "vitest";
import { getCategory } from "@/catalog";
import { actionsForRoles, argsFor, attentionActions, deriveRoles, successMessage, nextActions, requiredBondFor, withdrawableBond, type Action, type ActionId, type Role } from "./actions";
import type { Campaign, Holding, StatusTag } from "./despensa";

const B = (n: number) => BigInt(n);
const DAY = 86_400;
const W = B(3 * DAY); // dispute window
const T0 = 1_800_000_000;
const SALE_END = B(T0 + 7 * DAY);
const DEADLINE = B(T0 + 37 * DAY);
const PRICE = B(6_000_000); // 0.60

function campaign(over: Partial<Campaign> & { tag?: StatusTag } = {}): Campaign {
  const { tag = "Funding", ...rest } = over;
  return {
    id: B(0),
    seller: "GSELLER",
    verifier: "GVERIFIER",
    title: "Demo",
    metadata_uri: "",
    unit_price: PRICE,
    min_units: 50,
    max_units: 300,
    sale_end: SALE_END,
    delivery_deadline: DEADLINE,
    milestones: [{ title: "Insumos", bps: 2000, evidence: "", released: false }],
    bond_cover_bps: 10_000,
    dispute_window: W,
    status: { tag },
    sold: 0,
    delivered: 0,
    pending: 0,
    refunded: 0,
    released_bps: 0,
    advanced: B(0),
    escrow: B(0),
    bond_total: B(0),
    bond_slashed: B(0),
    refund_per_unit: B(0),
    created_at: B(T0),
    ...rest,
  };
}

function holding(over: Partial<Holding> = {}): Holding {
  return { units: 0, pending: 0, pending_since: B(0), disputed: false, delivered: 0, refunded: 0, rated: false, ...over };
}

const ids = (c: Campaign, h: Holding | null, role: Role, now: number, bond?: bigint) =>
  nextActions(c, h, role, B(now), { bond, category: getCategory("dairy.milk") }).map((a) => a.id);

const DURING_SALE = T0 + DAY;
const AFTER_SALE = T0 + 8 * DAY;
const DURING_DELIVERY = T0 + 10 * DAY;
const AFTER_SETTLE = Number(DEADLINE) + 2 * Number(W) + 1;

// ================================================================ roles

describe("deriveRoles", () => {
  it("visitor without wallet is a buyer", () => {
    expect(deriveRoles(campaign(), null)).toEqual(["buyer"]);
  });
  it("seller is never buyer nor guarantor", () => {
    expect(deriveRoles(campaign(), "GSELLER")).toEqual(["seller"]);
  });
  it("verifier is not a buyer", () => {
    expect(deriveRoles(campaign({ tag: "Active" }), "GVERIFIER")).toEqual(["verifier"]);
  });
  it("anyone can be guarantor during Funding", () => {
    expect(deriveRoles(campaign(), "GBUYER")).toEqual(["buyer", "guarantor"]);
  });
  it("after Funding only addresses with a bond are guarantors", () => {
    expect(deriveRoles(campaign({ tag: "Completed" }), "GBUYER")).toEqual(["buyer"]);
    expect(deriveRoles(campaign({ tag: "Completed" }), "GBUYER", B(5))).toEqual(["buyer", "guarantor"]);
  });
});

// ================================================================ Funding

describe("Funding", () => {
  it("buyer: buy (primary), then gift if holding", () => {
    expect(ids(campaign(), null, "buyer", DURING_SALE)).toEqual(["buy"]);
    expect(ids(campaign(), holding({ units: 3 }), "buyer", DURING_SALE)).toEqual(["buy", "transfer"]);
  });
  it("buyer: buy is capped by remaining supply and maxPerOrder", () => {
    const [buy] = nextActions(campaign({ sold: 290 }), null, "buyer", B(DURING_SALE), { category: getCategory("dairy.milk") });
    expect(buy.maxUnits).toBe(10);
    const [buy2] = nextActions(campaign(), null, "buyer", B(DURING_SALE), { category: getCategory("dairy.milk") });
    expect(buy2.maxUnits).toBe(60);
    expect(buy2.confirm).toBeTruthy();
  });
  it("buyer: no buy when sold out", () => {
    expect(ids(campaign({ sold: 300 }), null, "buyer", DURING_SALE)).toEqual([]);
  });
  it("seller: bond + free cancel before goal; close sale first once goal reached", () => {
    expect(ids(campaign({ sold: 10 }), null, "seller", DURING_SALE)).toEqual(["add_bond", "cancel"]);
    expect(ids(campaign({ sold: 50 }), null, "seller", DURING_SALE)).toEqual(["close_sale", "add_bond", "cancel"]);
  });
  it("verifier: nothing", () => {
    expect(ids(campaign(), null, "verifier", DURING_SALE)).toEqual([]);
  });
  it("guarantor: add bond", () => {
    expect(ids(campaign(), null, "guarantor", DURING_SALE)).toEqual(["add_bond"]);
  });
  it("after sale_end anyone can close the sale (activates or fails)", () => {
    for (const role of ["buyer", "seller"] as Role[]) {
      expect(ids(campaign({ sold: 10 }), null, role, AFTER_SALE)).toEqual(["close_sale"]);
    }
    const [a] = nextActions(campaign({ sold: 10 }), null, "buyer", B(AFTER_SALE));
    expect(a.description).toMatch(/reembolsos/);
  });
  it("cancel is a danger action with a confirm step", () => {
    const cancel = nextActions(campaign(), null, "seller", B(DURING_SALE)).find((a) => a.id === "cancel")!;
    expect(cancel.tone).toBe("danger");
    expect(cancel.confirm).toBeTruthy();
  });
});

// ================================================================ Active

describe("Active", () => {
  const active = (over: Partial<Campaign> = {}) => campaign({ tag: "Active", sold: 100, escrow: PRICE * B(100), ...over });

  it("buyer with vouchers: show QR (primary), confirm, gift", () => {
    const acts = nextActions(active(), holding({ units: 4 }), "buyer", B(DURING_DELIVERY));
    expect(acts.map((a) => a.id)).toEqual(["show_qr", "confirm", "transfer"]);
    expect(acts[0].tone).toBe("primary");
    expect(acts[0].method).toBeNull();
  });
  it("buyer with a pending delivery inside the window: confirm (primary) + dispute", () => {
    const h = holding({ units: 2, pending: 2, pending_since: B(DURING_DELIVERY) });
    expect(ids(active(), h, "buyer", DURING_DELIVERY + DAY)).toEqual(["confirm", "dispute", "show_qr", "transfer"]);
  });
  it("buyer after the window: finalize, no dispute", () => {
    const h = holding({ pending: 2, pending_since: B(DURING_DELIVERY) });
    expect(ids(active(), h, "buyer", DURING_DELIVERY + 4 * DAY)).toEqual(["finalize", "confirm"]);
  });
  it("buyer with an open dispute: no dispute, no finalize; can still confirm", () => {
    const h = holding({ pending: 2, pending_since: B(DURING_DELIVERY), disputed: true });
    expect(ids(active(), h, "buyer", DURING_DELIVERY + DAY)).toEqual(["confirm"]);
  });
  it("buyer without holding: nothing", () => {
    expect(ids(active(), null, "buyer", DURING_DELIVERY)).toEqual([]);
  });
  it("seller: deliver (primary), milestone evidence, cancel as default", () => {
    const acts = nextActions(active(), null, "seller", B(DURING_DELIVERY));
    expect(acts.map((a) => a.id)).toEqual(["deliver", "submit_milestone", "cancel"]);
    expect(acts[1].milestoneIndex).toBe(0);
    expect(acts[2].description).toMatch(/incumplimiento/);
  });
  it("seller: released milestones are not offered", () => {
    const c = active({ milestones: [{ title: "x", bps: 2000, evidence: "https://e", released: true }] });
    expect(ids(c, null, "seller", DURING_DELIVERY)).toEqual(["deliver", "cancel"]);
  });
  it("seller/guarantor: top-up bond offered only when a pending milestone is under-covered", () => {
    const withEvidence = { milestones: [{ title: "x", bps: 2000, evidence: "https://e", released: false }] };
    const short = active({ ...withEvidence, bond_total: B(0) });
    expect(ids(short, null, "seller", DURING_DELIVERY)).toContain("add_bond");
    expect(ids(short, null, "guarantor", DURING_DELIVERY, B(1))).toEqual(["add_bond"]);
    const covered = active({ ...withEvidence, bond_total: requiredBondFor(short, 0) });
    expect(ids(covered, null, "seller", DURING_DELIVERY)).not.toContain("add_bond");
    expect(ids(covered, null, "guarantor", DURING_DELIVERY, B(1))).toEqual([]);
  });
  it("verifier: approve milestones with evidence (when the bond covers it), declare default", () => {
    expect(ids(active(), null, "verifier", DURING_DELIVERY)).toEqual(["declare_default"]);
    const milestones = [
      { title: "a", bps: 1000, evidence: "https://e", released: false },
      { title: "b", bps: 1000, evidence: "", released: false },
      { title: "c", bps: 1000, evidence: "https://e", released: true },
    ];
    const covered = active({ milestones, bond_total: requiredBondFor(active({ milestones }), 0) });
    const acts = nextActions(covered, null, "verifier", B(DURING_DELIVERY));
    expect(acts.map((a) => a.id)).toEqual(["approve_milestone", "declare_default"]);
    expect(acts[0].milestoneIndex).toBe(0);
    expect(acts[0].tone).toBe("primary");
    expect(acts[0].disabled).toBeUndefined();
    expect(acts[1].tone).toBe("danger");
  });

  it("verifier: approve is shown disabled (last, never primary) when the bond is short", () => {
    const c = active({ milestones: [{ title: "a", bps: 1000, evidence: "https://e", released: false }], bond_total: B(0) });
    const acts = nextActions(c, null, "verifier", B(DURING_DELIVERY));
    expect(acts.map((a) => a.id)).toEqual(["declare_default", "approve_milestone"]);
    expect(acts[1].disabled).toMatch(/aval/);
    expect(acts[1].tone).toBe("default");
  });

  // ---------------------------------------------------------------- pending deliveries and disputes
  const B1 = "GALLLWHLW7ZI5MDK6IYEMV7AYRNCWU5SDE4SUTLDA5SF3KCMCTW325MY";
  const B2 = "GCCNUJF362MBLA3RN2G3VH4KDMVTNNPS5M32AL5CFW65H66PIHC3L33P";
  const B3 = "GDVZDGLLY2COW6VGW6GT5A47KWHWNVIE3YQ2THQV6IZWTSCR6DISG2AN";
  const MARKED = DURING_DELIVERY;
  const LATER = MARKED + 4 * DAY; // past the 3-day window
  const deliveries = [
    { buyer: B1, holding: holding({ pending: 2, pending_since: B(MARKED) }) }, // collectable
    { buyer: B2, holding: holding({ pending: 1, pending_since: B(MARKED), disputed: true }) }, // disputed
    { buyer: B3, holding: holding({ pending: 1, pending_since: B(LATER - DAY) }) }, // still in window
  ];
  const withPending = active({ pending: 4 });
  const run = (c: Campaign, role: Role, now: number, d?: typeof deliveries) =>
    nextActions(c, null, role, B(now), { deliveries: d, category: getCategory("dairy.milk") });

  it("seller: collects deliveries past the window first, skipping disputed and in-window ones", () => {
    const acts = run(withPending, "seller", LATER, deliveries);
    expect(acts.map((a) => a.id)).toEqual(["finalize", "deliver", "submit_milestone", "cancel"]);
    expect(acts[0]).toMatchObject({ method: "finalize_delivery", buyer: B1, tone: "primary" });
    expect(acts[0].description).toMatch(/2 litros/);
  });

  it("seller: inside the window there is nothing to collect yet", () => {
    expect(run(withPending, "seller", MARKED + DAY, deliveries).map((a) => a.id)).not.toContain("finalize");
  });

  it("seller: collect comes before settle, and settle warns about unfinalized deliveries", () => {
    const c = active({ sold: 4, delivered: 0, pending: 4 });
    const acts = run(c, "seller", AFTER_SETTLE, deliveries);
    expect(acts.slice(0, 3).map((a) => a.id)).toEqual(["finalize", "finalize", "settle"]);
    expect(acts[2].description).toMatch(/sin finalizar/);
  });

  it("seller: manual collect when the list is missing or incomplete", () => {
    const missing = run(active({ pending: 2 }), "seller", LATER);
    expect(missing[0]).toMatchObject({ id: "finalize", input: "buyer_address" });
    expect(missing[0].buyer).toBeUndefined();
    const partial = run(active({ pending: 6 }), "seller", LATER, deliveries).filter((a) => a.id === "finalize");
    expect(partial.map((a) => a.buyer)).toEqual([B1, undefined]);
    expect(partial[1].description).toMatch(/^Hay entregas pendientes por 2 litros/);
    expect(run(withPending, "seller", LATER, deliveries).filter((a) => a.input === "buyer_address")).toEqual([]);
  });

  it("verifier: one resolve per open dispute, none when nothing is disputed", () => {
    const acts = run(withPending, "verifier", LATER, deliveries).filter((a) => a.id === "resolve_dispute");
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ buyer: B2, input: "verdict" });
    const calm = deliveries.filter((d) => !d.holding.disputed);
    expect(run(active({ pending: 3 }), "verifier", LATER, calm).map((a) => a.id)).toEqual(["declare_default"]);
  });

  it("verifier: manual resolve only when pending units are unaccounted for", () => {
    const acts = run(active({ pending: 3 }), "verifier", LATER).filter((a) => a.id === "resolve_dispute");
    expect(acts).toHaveLength(1);
    expect(acts[0].input).toBe("buyer_and_verdict");
    expect(acts[0].buyer).toBeUndefined();
    expect(run(active({ pending: 0 }), "verifier", LATER).map((a) => a.id)).toEqual(["declare_default"]);
  });
  it("after the deadline (+2 windows): settle first for seller, verifier, guarantor and buyers with vouchers", () => {
    expect(ids(active(), null, "seller", AFTER_SETTLE)[0]).toBe("settle");
    expect(ids(active(), null, "verifier", AFTER_SETTLE)[0]).toBe("settle");
    expect(ids(active(), null, "guarantor", AFTER_SETTLE, B(5))[0]).toBe("settle");
    expect(ids(active(), holding({ units: 1 }), "buyer", AFTER_SETTLE)[0]).toBe("settle");
    expect(ids(active(), null, "buyer", AFTER_SETTLE)).toEqual([]);
  });
  it("settle is not offered one second before it is allowed", () => {
    expect(ids(active(), null, "seller", AFTER_SETTLE - 2)).not.toContain("settle");
  });
});

// ================================================================ terminal states

describe("Completed", () => {
  const done = campaign({ tag: "Completed" });
  it("buyer: rate once", () => {
    expect(ids(done, holding({ delivered: 3 }), "buyer", DURING_DELIVERY)).toEqual(["rate"]);
    expect(ids(done, holding({ delivered: 3, rated: true }), "buyer", DURING_DELIVERY)).toEqual([]);
    expect(ids(done, null, "buyer", DURING_DELIVERY)).toEqual([]);
  });
  it("seller and verifier: nothing", () => {
    expect(ids(done, null, "seller", DURING_DELIVERY)).toEqual([]);
    expect(ids(done, null, "verifier", DURING_DELIVERY)).toEqual([]);
  });
  it("seller who posted their own bond: withdraw it", () => {
    expect(ids(done, null, "seller", DURING_DELIVERY, B(10))).toEqual(["withdraw_bond"]);
  });
  it("guarantor: withdraw bond (100%)", () => {
    expect(ids(done, null, "guarantor", DURING_DELIVERY, B(10))).toEqual(["withdraw_bond"]);
    expect(ids(done, null, "guarantor", DURING_DELIVERY, B(0))).toEqual([]);
    expect(withdrawableBond(done, B(10))).toBe(B(10));
  });
});

describe("Failed", () => {
  const failed = campaign({ tag: "Failed" });
  it("buyer: claim refund (100%), no rating", () => {
    expect(ids(failed, holding({ units: 3 }), "buyer", AFTER_SALE)).toEqual(["claim_refund"]);
    expect(ids(failed, holding({ refunded: 3 }), "buyer", AFTER_SALE)).toEqual([]);
  });
  it("seller and verifier: nothing", () => {
    expect(ids(failed, null, "seller", AFTER_SALE)).toEqual([]);
    expect(ids(failed, null, "verifier", AFTER_SALE)).toEqual([]);
  });
  it("guarantor: withdraw bond", () => {
    expect(ids(failed, null, "guarantor", AFTER_SALE, B(4))).toEqual(["withdraw_bond"]);
  });
  it("seller who posted their own bond: withdraw it", () => {
    expect(ids(failed, null, "seller", AFTER_SALE, B(4))).toEqual(["withdraw_bond"]);
  });
});

describe("Defaulted", () => {
  const def = campaign({ tag: "Defaulted", bond_total: B(100), bond_slashed: B(40) });
  it("buyer: claim refund, then rate", () => {
    expect(ids(def, holding({ units: 2, pending: 1 }), "buyer", AFTER_SETTLE)).toEqual(["claim_refund"]);
    expect(ids(def, holding({ units: 2, delivered: 1 }), "buyer", AFTER_SETTLE)).toEqual(["claim_refund", "rate"]);
    expect(ids(def, holding({ refunded: 3 }), "buyer", AFTER_SETTLE)).toEqual(["rate"]);
  });
  it("seller and verifier: nothing", () => {
    expect(ids(def, null, "seller", AFTER_SETTLE)).toEqual([]);
    expect(ids(def, null, "verifier", AFTER_SETTLE)).toEqual([]);
  });
  it("guarantor: withdraw what's left (pro rata)", () => {
    expect(withdrawableBond(def, B(50))).toBe(B(30));
    expect(ids(def, null, "guarantor", AFTER_SETTLE, B(50))).toEqual(["withdraw_bond"]);
    const wiped = campaign({ tag: "Defaulted", bond_total: B(100), bond_slashed: B(100) });
    expect(ids(wiped, null, "guarantor", AFTER_SETTLE, B(50))).toEqual([]);
  });
  it("seller's own bond: the unslashed share comes back too", () => {
    const [w] = nextActions(def, null, "seller", B(AFTER_SETTLE), { bond: B(50) });
    expect(w).toMatchObject({ id: "withdraw_bond", label: "Retirar lo que queda de mi aval" });
  });
  it("bond not needed for refunds: the label promises 100%", () => {
    const untouched = campaign({ tag: "Defaulted", bond_total: B(100), bond_slashed: B(0) });
    const [w] = nextActions(untouched, null, "guarantor", B(AFTER_SETTLE), { bond: B(50) });
    expect(w.label).toBe("Retirar mi aval");
    expect(w.description).toMatch(/100%/);
  });
});

// ================================================================ invariants

describe("invariants", () => {
  const statuses: StatusTag[] = ["Funding", "Active", "Completed", "Failed", "Defaulted"];
  const roles: Role[] = ["buyer", "seller", "verifier", "guarantor"];
  const h = holding({ units: 2, pending: 1, pending_since: B(DURING_DELIVERY), delivered: 1 });

  it("only the first action can be primary; every money-moving buyer action has a confirm", () => {
    const moneyMoving: ActionId[] = ["buy", "confirm", "transfer", "cancel", "declare_default", "approve_milestone", "add_bond"];
    for (const tag of statuses)
      for (const role of roles)
        for (const now of [DURING_SALE, DURING_DELIVERY, AFTER_SETTLE]) {
          const c = campaign({
            tag,
            sold: 60,
            pending: 1,
            milestones: [{ title: "Insumos", bps: 2000, evidence: "https://e", released: false }],
          });
          const acts = nextActions(c, h, role, B(now), { bond: B(5) });
          acts.slice(1).forEach((a) => expect(a.tone).not.toBe("primary"));
          const firstDisabled = acts.findIndex((a) => a.disabled);
          if (firstDisabled >= 0) {
            acts.slice(firstDisabled).forEach((a) => expect(a.disabled, `${tag}/${role}/${a.id} after a disabled one`).toBeTruthy());
            acts.filter((a) => a.disabled).forEach((a) => expect(a.tone).not.toBe("primary"));
          }
          acts.filter((a) => moneyMoving.includes(a.id)).forEach((a) => expect(a.confirm, `${tag}/${role}/${a.id}`).toBeTruthy());
          acts.forEach((a) => {
            expect(a.label.length).toBeGreaterThan(0);
            expect(a.description.length).toBeGreaterThan(0);
          });
        }
  });

  it("actions that release money or end a campaign are flagged irreversible; refundable ones are not", () => {
    // close_sale is left out: once the sale has ended, closing it is bookkeeping anyone may do, with a fixed outcome.
    // dispute: only the verifier can close it, so the buyer can't take it back.
    const mustBe: ActionId[] = ["confirm", "transfer", "cancel", "declare_default", "approve_milestone", "resolve_dispute", "dispute"];
    const mustNot: ActionId[] = ["buy", "add_bond"];
    const seen = new Set<ActionId>();
    for (const tag of statuses)
      for (const role of roles)
        for (const now of [DURING_SALE, DURING_DELIVERY, AFTER_SETTLE]) {
          const c = campaign({ tag, sold: 60, pending: 1, milestones: [{ title: "Insumos", bps: 2000, evidence: "https://e", released: false }] });
          for (const a of nextActions(c, h, role, B(now), { bond: B(5_000_000_000) })) {
            seen.add(a.id);
            if (mustBe.includes(a.id)) expect(a.irreversible, `${tag}/${role}/${a.id}`).toBe(true);
            if (mustNot.includes(a.id)) expect(a.irreversible, `${tag}/${role}/${a.id}`).toBeFalsy();
            if (a.irreversible) expect(a.confirm, `${a.id} needs the confirm text`).toBeTruthy();
          }
        }
    expect(seen.has("confirm") && seen.has("buy")).toBe(true);
  });

  it("actionsForRoles de-duplicates settle across roles", () => {
    const c = campaign({ tag: "Active", sold: 100 });
    const all = actionsForRoles(c, holding({ units: 1 }), ["buyer", "guarantor"], B(AFTER_SETTLE), { bond: B(5) });
    const settles = [...all.buyer, ...all.guarantor].filter((a) => a.id === "settle");
    expect(settles).toHaveLength(1);
  });

  it("attentionActions flags what unblocks money, not routine work", () => {
    const sel = (c: Campaign, now: number, bond?: bigint) =>
      attentionActions(nextActions(c, null, "seller", B(now), { bond }), c).map((a) => a.id);
    expect(sel(campaign({ sold: 10 }), DURING_SALE)).toEqual([]); // optional bond + cancel: nothing urgent
    expect(sel(campaign({ sold: 50 }), DURING_SALE)).toEqual(["close_sale"]);
    expect(sel(campaign({ tag: "Active", sold: 10 }), DURING_DELIVERY)).toEqual([]); // deliver, evidence: routine
    expect(sel(campaign({ tag: "Active", sold: 10, pending: 2 }), DURING_DELIVERY)).toEqual([]); // manual fallback only
    expect(sel(campaign({ tag: "Completed" }), DURING_DELIVERY, B(5))).toEqual(["withdraw_bond"]);
    const short = campaign({ tag: "Active", sold: 10, milestones: [{ title: "x", bps: 1000, evidence: "https://e", released: false }] });
    expect(attentionActions(nextActions(short, null, "verifier", B(DURING_DELIVERY)), short)).toEqual([]); // approve disabled
  });

  it("argsFor maps every contract action to the contract's argument names", () => {
    const id = B(7);
    const all: Action[] = [];
    for (const tag of statuses)
      for (const role of roles)
        for (const now of [DURING_SALE, DURING_DELIVERY, AFTER_SETTLE])
          all.push(...nextActions(campaign({ tag, sold: 60, pending: 1 }), h, role, B(now), { bond: B(5) }));
    const expected: Record<string, string[]> = {
      buy: ["id", "buyer", "units"],
      transfer_units: ["id", "from", "to", "units"],
      confirm_delivery: ["id", "buyer", "units"],
      dispute: ["id", "buyer"],
      finalize_delivery: ["id", "buyer"],
      rate: ["id", "buyer", "stars"],
      claim_refund: ["id", "buyer"],
      add_bond: ["id", "provider", "amount"],
      close_sale: ["id"],
      cancel: ["id"],
      submit_milestone: ["id", "index", "evidence"],
      mark_delivered: ["id", "buyer", "units"],
      approve_milestone: ["id", "index"],
      resolve_dispute: ["id", "buyer", "delivered"],
      declare_default: ["id"],
      withdraw_bond: ["id", "provider"],
      settle: ["id"],
    };
    for (const a of all) {
      if (a.method === null) {
        expect(() => argsFor(a, id, "GME")).toThrow();
        continue;
      }
      expect(Object.keys(argsFor(a, id, "GME")).sort(), a.method).toEqual([...expected[a.method]].sort());
    }
  });

  it("every contract action says what happened once confirmed, in the category's words", () => {
    for (const tag of statuses)
      for (const role of roles)
        for (const now of [DURING_SALE, DURING_DELIVERY, AFTER_SETTLE])
          for (const a of nextActions(campaign({ tag, sold: 60, pending: 1 }), h, role, B(now), { bond: B(5) }))
            if (a.method !== null) expect(successMessage(a).length, a.id).toBeGreaterThan(10);
    expect(successMessage({ id: "buy" }, getCategory("real_estate.apartment"))).toMatch(/reserva/);
  });

  it("argsFor targets the right buyer", () => {
    const finalize = { id: "finalize", role: "seller", method: "finalize_delivery", label: "x", description: "x", tone: "default" } as Action;
    expect(argsFor({ ...finalize, buyer: "GB" }, B(1), "GSELLER")).toEqual({ id: B(1), buyer: "GB" });
    expect(argsFor(finalize, B(1), "GSELLER", { address: "GTYPED" })).toEqual({ id: B(1), buyer: "GTYPED" });
    expect(argsFor({ ...finalize, role: "buyer" }, B(1), "GME")).toEqual({ id: B(1), buyer: "GME" });
    const resolve = { ...finalize, id: "resolve_dispute", method: "resolve_dispute", buyer: "GB" } as Action;
    expect(argsFor(resolve, B(1), "GVER", { verdict: false })).toEqual({ id: B(1), buyer: "GB", delivered: false });
  });

  it("labels follow the category (no hard-coded product words)", () => {
    const apt = getCategory("real_estate.apartment");
    const c = campaign({ tag: "Active", sold: 10 });
    const [qr, confirm] = nextActions(c, holding({ units: 1 }), "buyer", B(DURING_DELIVERY), { category: apt });
    expect(qr.label).toBe("Mostrar mi reserva");
    expect(confirm.label).toMatch(/llaves/);
  });
});
