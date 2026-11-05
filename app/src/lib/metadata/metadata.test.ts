import { afterEach, describe, expect, it, vi } from "vitest";
import { getCategory, listCategories, CATEGORIES, MAX_MILESTONES, unitLabel } from "@/catalog";
import {
  clearMetadataCache,
  createMetadataStore,
  encodeInline,
  formatAttribute,
  INLINE_SOFT_LIMIT,
  inlineSize,
  isValidIpfsUri,
  metadataStore,
  resolveCampaignMetadata,
  validateAttributes,
  type CampaignMetadata,
} from ".";

const milkDoc: CampaignMetadata = {
  schema: "despensa.campaign/v1",
  category: "dairy.milk",
  description: "Leche de vaca de la Cooperativa de Punata. Recojo semanal en la feria.",
  images: ["https://example.com/vaca.jpg"],
  attributes: { tipo: "entera", origen: "Punata, Cochabamba" },
  producer: { displayName: "Cooperativa Punata", location: "Cochabamba" },
  delivery: { mode: "recurring_pickup", points: [{ name: "Feria de la plaza", schedule: "Sáb 7–11" }] },
};

afterEach(() => {
  clearMetadataCache();
  vi.unstubAllGlobals();
});

describe("catalog", () => {
  it("has the four seed categories plus generic fallback", () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual(["dairy.milk", "eggs", "veg_basket", "real_estate.apartment"]);
    expect(getCategory("nope").id).toBe("generic");
    expect(getCategory(undefined).id).toBe("generic");
  });
  it("hides coming-soon categories unless asked", () => {
    expect(listCategories().map((c) => c.id)).not.toContain("real_estate.apartment");
    expect(listCategories({ includeComingSoon: true })).toHaveLength(4);
  });
  it("respects the contract milestone limit and sane defaults", () => {
    for (const c of CATEGORIES) {
      expect(c.milestoneTemplates.length).toBeLessThanOrEqual(MAX_MILESTONES);
      expect(c.defaults.minUnits).toBeLessThanOrEqual(c.defaults.maxUnits);
      expect(c.defaults.saleDays).toBeLessThan(c.defaults.deliveryDays);
    }
  });
  it("pluralizes units", () => {
    expect(unitLabel(getCategory("dairy.milk"), 1)).toBe("litro");
    expect(unitLabel(getCategory("dairy.milk"), 3)).toBe("litros");
    expect(unitLabel(getCategory("x"), 2)).toBe("unidades");
  });
});

describe("inline adapter", () => {
  it("round-trips UTF-8 (accents, ñ, en dash)", async () => {
    const uri = encodeInline(milkDoc);
    expect(uri.startsWith("data:application/json;base64,")).toBe(true);
    const r = await metadataStore.resolve(uri);
    expect(r.degraded).toBe(false);
    expect(r.source).toBe("inline");
    expect(r.meta.description).toBe(milkDoc.description);
    expect(r.meta.delivery?.points?.[0].schedule).toBe("Sáb 7–11");
  });
  it("a typical document stays under the 1 KB soft limit", () => {
    expect(inlineSize(milkDoc)).toBeLessThan(INLINE_SOFT_LIMIT);
  });
  it("publish refuses oversized documents", async () => {
    await expect(metadataStore.publish({ ...milkDoc, description: "x".repeat(2000), images: Array(8).fill("https://example.com/" + "a".repeat(280)) })).rejects.toThrow(/bytes/);
  });
  it("invalid inline JSON degrades instead of throwing", async () => {
    const r = await metadataStore.resolve("data:application/json;base64,bm90IGpzb24=");
    expect(r.degraded).toBe(true);
    expect(r.meta.category).toBe("generic");
  });
  it("wrong schema degrades", async () => {
    const uri = "data:application/json;base64," + btoa(JSON.stringify({ schema: "other/v9" }));
    expect((await metadataStore.resolve(uri)).degraded).toBe(true);
  });
});

describe("legacy adapter", () => {
  it("plain text becomes a generic description", async () => {
    const r = await metadataStore.resolve("Leche de vaca de la Cooperativa de Punata.");
    expect(r).toMatchObject({ source: "legacy", degraded: false });
    expect(r.meta.category).toBe("generic");
    expect(r.meta.description).toBe("Leche de vaca de la Cooperativa de Punata.");
  });
  it("empty uri is fine", async () => {
    expect((await metadataStore.resolve("")).degraded).toBe(false);
  });
});

describe("https / ipfs adapters", () => {
  it("fetches and validates https", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(milkDoc))));
    const r = await metadataStore.resolve("https://example.com/c.json");
    expect(r).toMatchObject({ source: "https", degraded: false });
    expect(r.meta.category).toBe("dairy.milk");
  });
  it("network errors degrade", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    const r = await metadataStore.resolve("https://example.com/c.json");
    expect(r.degraded).toBe(true);
    expect(r.error).toMatch(/500/);
  });
  it("a plain web page behind an https link stays reachable as a link", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>fotos de la granja</html>")));
    const r = await metadataStore.resolve("https://example.com/mi-granja");
    expect(r.degraded).toBe(true);
    expect(r.meta.documents).toEqual([{ label: "Ver detalles del producto", url: "https://example.com/mi-granja" }]);
  });
  it("the demo 'ipfs://despensa-demo' degrades without a network call", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(isValidIpfsUri("ipfs://despensa-demo")).toBe(false);
    const r = await metadataStore.resolve("ipfs://despensa-demo");
    expect(r.degraded).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });
  it("valid CIDs go through the gateway", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(milkDoc)));
    vi.stubGlobal("fetch", f);
    const cid = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    const r = await metadataStore.resolve(`ipfs://${cid}`);
    expect(r.degraded).toBe(false);
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain(cid);
  });
  it("ipfs publishing is a stub", async () => {
    const { ipfsAdapter } = await import(".");
    await expect(createMetadataStore(undefined, ipfsAdapter).publish(milkDoc)).rejects.toThrow(/IPFS/);
  });
});

describe("cache", () => {
  it("resolves once per campaign", async () => {
    const store = { resolve: vi.fn(async () => ({ meta: milkDoc, source: "inline" as const, degraded: false })), publish: vi.fn() };
    const c = { id: BigInt(7), metadata_uri: "x" };
    await resolveCampaignMetadata(c, store);
    await resolveCampaignMetadata(c, store);
    expect(store.resolve).toHaveBeenCalledTimes(1);
  });
});

describe("attributes", () => {
  it("validates against the category schema", () => {
    const milk = getCategory("dairy.milk");
    expect(validateAttributes(milk, { tipo: "entera" })).toEqual([]);
    expect(validateAttributes(milk, {})).toEqual([{ key: "tipo", message: "Campo obligatorio." }]);
    expect(validateAttributes(milk, { tipo: "chocolatada" })[0].message).toMatch(/Opción/);
    const apt = getCategory("real_estate.apartment");
    expect(validateAttributes(apt, { superficie: "85", dormitorios: 2 })[0]).toMatchObject({ key: "superficie" });
  });
  it("formats values for display", () => {
    const apt = getCategory("real_estate.apartment");
    const m2 = apt.attributes.find((a) => a.key === "superficie");
    expect(formatAttribute(m2, 85)).toBe("85 m²");
    expect(formatAttribute(undefined, true)).toBe("Sí");
    const tipo = getCategory("dairy.milk").attributes.find((a) => a.key === "tipo");
    expect(formatAttribute(tipo, "entera")).toBe("Entera");
  });
});
