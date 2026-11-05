import { describe, expect, it } from "vitest";
import { getCategory } from "@/catalog";
import { parseUsd } from "./format";
import { parseMetadata } from "./metadata";
import {
  advanceBps,
  daySeconds,
  firstInvalidStep,
  fitMilestones,
  inlineEstimate,
  moneyFlow,
  newDraft,
  toCampaignInput,
  toMetadata,
  validateStep,
  type CampaignDraft,
  type ValidationContext,
} from "./wizard";

const TODAY = new Date(2026, 10, 9, 10, 0, 0); // 9 Nov 2026, local
const NOW = Math.floor(TODAY.getTime() / 1000);
const ADDR = "GDVZDGLLY2COW6VGW6GT5A47KWHWNVIE3YQ2THQV6IZWTSCR6DISG2AN";
const ME = "GCCNUJF362MBLA3RN2G3VH4KDMVTNNPS5M32AL5CFW65H66PIHC3L33P";
const ctx = (over: Partial<ValidationContext> = {}): ValidationContext => ({
  maxAdvanceBps: 2000,
  nowSeconds: NOW,
  me: ME,
  isAddress: (s) => /^G[A-Z2-7]{55}$/.test(s),
  ...over,
});

const milk = getCategory("dairy.milk");
const apt = getCategory("real_estate.apartment");

function ready(over: Partial<CampaignDraft> = {}): CampaignDraft {
  return { ...newDraft(milk, TODAY, 2000), attributes: { tipo: "entera" }, verifier: ADDR, ...over };
}

describe("parseUsd", () => {
  it("accepts dot or comma decimals, up to 7", () => {
    expect(parseUsd("0.60")).toBe(BigInt(6_000_000));
    expect(parseUsd("0,6")).toBe(BigInt(6_000_000));
    expect(parseUsd("60000")).toBe(BigInt(600_000_000_000));
    expect(parseUsd("1.1234567")).toBe(BigInt(11_234_567));
  });
  it("rejects anything else", () => {
    for (const bad of ["", "abc", "-1", "1.12345678", "1.000.000", "1e3"]) expect(parseUsd(bad), bad).toBeNull();
  });
});

describe("newDraft", () => {
  it("starts from the category defaults", () => {
    const d = newDraft(milk, TODAY, 2000);
    expect(d).toMatchObject({ categoryId: "dairy.milk", price: "0.60", minUnits: "50", maxUnits: "300", saleEnd: "2026-11-16", deadline: "2026-12-16" });
    expect(d.title).toBe("Leche fresca (diciembre)");
    expect(d.milestones).toEqual([expect.objectContaining({ title: "Compra de alimento para el ganado", pct: 20, enabled: true })]);
  });
  it("keeps who the producer is when switching category", () => {
    const d = newDraft(apt, TODAY, 2000, { producerName: "Coop", verifier: ADDR });
    expect(d).toMatchObject({ producerName: "Coop", verifier: ADDR, categoryId: "real_estate.apartment" });
  });
});

describe("fitMilestones", () => {
  it("keeps templates that fit", () => {
    expect(fitMilestones(milk.milestoneTemplates, 3000).map((m) => m.pct)).toEqual([20]);
  });
  it("scales down templates that exceed the tier limit", () => {
    const fitted = fitMilestones(apt.milestoneTemplates, 2000); // templates sum to 50%
    expect(fitted.map((m) => m.pct)).toEqual([2, 4, 6, 4, 4]);
    expect(fitted.every((m) => m.enabled)).toBe(true);
  });
  it("never exceeds the limit, even when 1% minimums overshoot", () => {
    const tiny = fitMilestones(apt.milestoneTemplates, 300);
    const total = tiny.filter((m) => m.enabled).reduce((s, m) => s + m.pct * 100, 0);
    expect(total).toBeLessThanOrEqual(300);
    expect(tiny.some((m) => m.enabled)).toBe(true);
  });
  it("tier 0: everything off", () => {
    expect(fitMilestones(milk.milestoneTemplates, 0).every((m) => !m.enabled)).toBe(true);
  });
});

describe("validateStep mirrors create_campaign", () => {
  it("a complete draft passes every step", () => {
    expect(firstInvalidStep(ready(), ctx())).toBeNull();
  });
  it("step 1: title and required attributes", () => {
    expect(validateStep(1, ready({ title: " " }), ctx())).toHaveProperty("title");
    expect(validateStep(1, ready({ attributes: {} }), ctx())).toHaveProperty(["attr.tipo"]);
    expect(validateStep(1, ready({ images: ["javascript:alert(1)"] }), ctx())).toHaveProperty(["image.0"]);
  });
  it("step 2: price > 0, 1 <= min <= max, future sale end, deadline after sale end", () => {
    expect(validateStep(2, ready({ price: "0" }), ctx())).toHaveProperty("price");
    expect(validateStep(2, ready({ minUnits: "0" }), ctx())).toHaveProperty("minUnits");
    expect(validateStep(2, ready({ minUnits: "400" }), ctx())).toHaveProperty("minUnits");
    expect(validateStep(2, ready({ saleEnd: "2026-11-01" }), ctx())).toHaveProperty("saleEnd");
    expect(validateStep(2, ready({ deadline: "2026-11-16" }), ctx())).toHaveProperty("deadline");
  });
  it("step 3: total advance within the tier, every milestone > 0% with a title", () => {
    expect(validateStep(3, ready(), ctx({ maxAdvanceBps: 1000 }))).toHaveProperty("milestones");
    expect(validateStep(3, ready(), ctx({ maxAdvanceBps: 0 })).milestones).toMatch(/pago contra entrega/);
    const zero = ready({ milestones: [{ title: "x", pct: 0, enabled: true }] });
    expect(validateStep(3, zero, ctx())).toHaveProperty(["milestone.0.pct"]);
    const off = ready({ milestones: [{ title: "", pct: 0, enabled: false }] });
    expect(validateStep(3, off, ctx())).toEqual({});
  });
  it("step 4: verifier is a valid address and not the producer", () => {
    expect(validateStep(4, ready({ verifier: "nope" }), ctx())).toHaveProperty("verifier");
    expect(validateStep(4, ready({ verifier: ME }), ctx())).toHaveProperty("verifier");
    expect(validateStep(4, ready({ description: "x".repeat(3500) }), ctx())).toHaveProperty("size");
  });
  it("step 4: the verifier must be on the contract's allowlist", () => {
    expect(validateStep(4, ready(), ctx({ verifierAllowed: false })).verifier).toMatch(/no está autorizado/);
    expect(validateStep(4, ready(), ctx({ verifierAllowed: true }))).toEqual({});
    // Still loading (or the read failed): do not block, the contract decides.
    expect(validateStep(4, ready(), ctx())).toEqual({});
  });
  it("mirrors the contract's caps: 5-year horizon and title lengths", () => {
    expect(validateStep(2, ready({ deadline: "2031-11-07" }), ctx())).toEqual({});
    expect(validateStep(2, ready({ deadline: "2031-11-10" }), ctx()).deadline).toMatch(/5 años/);
    const long = ready({ milestones: [{ title: "x".repeat(81), pct: 10, enabled: true }] });
    expect(validateStep(3, long, ctx())).toHaveProperty(["milestone.0.title"]);
  });
});

describe("conversion", () => {
  it("toCampaignInput matches the contract's CampaignInput", () => {
    const d = ready();
    const input = toCampaignInput(d, "data:x");
    expect(input).toEqual({
      title: "Leche fresca (diciembre)",
      metadata_uri: "data:x",
      unit_price: BigInt(6_000_000),
      min_units: 50,
      max_units: 300,
      sale_end: daySeconds("2026-11-16"),
      delivery_deadline: daySeconds("2026-12-16"),
      milestones: [{ title: "Compra de alimento para el ganado", bps: 2000 }],
    });
  });
  it("toMetadata is valid v1 metadata and drops empty fields", () => {
    const meta = toMetadata(
      ready({
        producerName: " Coop Punata ",
        points: [{ name: "Feria", address: "", schedule: "Sáb 7–11" }, { name: " ", address: "", schedule: "" }],
        images: ["", "https://x/y.jpg"],
      }),
    );
    expect(parseMetadata(meta)).toEqual(meta);
    expect(meta.producer).toEqual({ displayName: "Coop Punata" });
    expect(meta.delivery).toEqual({ mode: "recurring_pickup", points: [{ name: "Feria", schedule: "Sáb 7–11" }] });
    expect(meta.images).toEqual(["https://x/y.jpg"]);
    expect(meta.attributes).toEqual({ tipo: "entera" });
  });
  it("number attributes are stored as numbers", () => {
    const d = { ...newDraft(apt, TODAY, 5000), attributes: { superficie: "85", dormitorios: "2" } };
    expect(toMetadata(d).attributes).toEqual({ superficie: 85, dormitorios: 2 });
  });
  it("a typical draft stays under the 1 KB soft limit", () => {
    const d = ready({ description: "Leche de vaca de la Cooperativa de Punata. Recojo semanal en la feria.", producerName: "Coop Punata", location: "Punata" });
    expect(inlineEstimate(d)).toBeLessThan(1024);
  });
});

describe("moneyFlow", () => {
  it("reproduces the DESIGN.md worked example: 10 L at 1 USDC, 20% milestone, 2% fee -> 9.80", () => {
    const d = ready({ price: "1", maxUnits: "10", milestones: [{ title: "x", pct: 20, enabled: true }] });
    expect(advanceBps(d)).toBe(2000);
    const f = moneyFlow(d, 10_000, 200);
    expect(f.gross).toBe(parseUsd("10"));
    expect(f.advance).toBe(parseUsd("2"));
    expect(f.advanceNet).toBe(parseUsd("1.96"));
    expect(f.bondNeeded).toBe(parseUsd("2"));
    expect(f.onDeliveryNet).toBe(parseUsd("7.84"));
    expect(f.totalNet).toBe(parseUsd("9.80"));
    expect(f.fee).toBe(parseUsd("0.20"));
  });
});
