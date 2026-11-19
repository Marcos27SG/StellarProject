// Create-campaign wizard: draft state, validation (mirrors create_campaign in the contract),
// conversion to the contract input and the off-chain metadata. Pure: no SDK, no React.

import { copy, getCategory, MAX_MILESTONES, type CategoryDef, type MilestoneTemplate } from "@/catalog";
import type { Campaign, CampaignInput } from "./despensa";
import { parseUsd } from "./format";
import { INLINE_HARD_LIMIT, METADATA_SCHEMA_V1, validateAttributes, type CampaignMetadata } from "./metadata";

export const WIZARD_STEPS = ["Producto", "Detalles", "Precio y mínimo", "Adelantos", "Revisar"] as const;
export type WizardStep = 0 | 1 | 2 | 3 | 4;

export interface MilestoneDraft {
  title: string;
  /** Percent, e.g. 20 or 2.5. Stored on-chain as bps. */
  pct: number;
  enabled: boolean;
  evidenceHint?: string;
}

export interface PointDraft {
  name: string;
  address: string;
  schedule: string;
}

export interface CampaignDraft {
  categoryId: string;
  title: string;
  description: string;
  attributes: Record<string, string | number | boolean>;
  images: string[];
  producerName: string;
  location: string;
  whatsapp: string;
  points: PointDraft[];
  /** Price per unit in USD as typed ("0.60"). */
  price: string;
  minUnits: string;
  maxUnits: string;
  /** YYYY-MM-DD, end of that day local time. */
  saleEnd: string;
  deadline: string;
  milestones: MilestoneDraft[];
  verifier: string;
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/** End of the given local day, in unix seconds (what the contract stores). */
export function daySeconds(day: string): bigint | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const t = new Date(`${day}T23:59:59`).getTime();
  return Number.isFinite(t) ? BigInt(Math.floor(t / 1000)) : null;
}

/**
 * Category milestone templates fitted to the producer's advance limit: kept as suggested when they
 * fit, scaled down proportionally (whole percents, at least 1% each) when they don't, and all
 * disabled when the producer can't receive advances (tier 0).
 */
export function fitMilestones(templates: MilestoneTemplate[], maxAdvanceBps: number): MilestoneDraft[] {
  const list = templates.slice(0, MAX_MILESTONES);
  const total = list.reduce((s, t) => s + t.suggestedPct, 0);
  const maxPct = maxAdvanceBps / 100;
  if (maxPct <= 0) return list.map((t) => ({ title: t.title, pct: t.suggestedPct, enabled: false, evidenceHint: t.evidenceHint }));
  if (total <= maxPct) return list.map((t) => ({ title: t.title, pct: t.suggestedPct, enabled: true, evidenceHint: t.evidenceHint }));
  const scaled = list.map((t) => ({
    title: t.title,
    pct: Math.max(1, Math.floor((t.suggestedPct * maxPct) / total)),
    enabled: true,
    evidenceHint: t.evidenceHint,
  }));
  // Rounding up to 1% can still overshoot: switch off the last ones until it fits.
  for (let i = scaled.length - 1; i >= 0 && advanceBpsOf(scaled) > maxAdvanceBps; i--) scaled[i].enabled = false;
  return scaled;
}

function advanceBpsOf(ms: MilestoneDraft[]): number {
  return ms.filter((m) => m.enabled).reduce((s, m) => s + Math.round(m.pct * 100), 0);
}

export function advanceBps(d: CampaignDraft): number {
  return advanceBpsOf(d.milestones);
}

/** A fresh draft for `category`, keeping who the producer is from `keep` (when switching category). */
export function newDraft(category: CategoryDef, today: Date, maxAdvanceBps: number, keep?: Partial<CampaignDraft>): CampaignDraft {
  const d = category.defaults;
  const saleEnd = addDays(today, d.saleDays);
  const deadline = addDays(saleEnd, d.deliveryDays);
  const attributes: CampaignDraft["attributes"] = {};
  for (const f of category.attributes) if (f.type === "boolean") attributes[f.key] = false;
  return {
    categoryId: category.id,
    title: `${category.label} (${MONTHS[deadline.getMonth()]})`,
    description: "",
    attributes,
    images: [],
    producerName: keep?.producerName ?? "",
    location: keep?.location ?? "",
    whatsapp: keep?.whatsapp ?? "",
    points: keep?.points?.length ? keep.points : [{ name: "", address: "", schedule: "" }],
    price: d.unitPrice ?? "1.00",
    minUnits: String(d.minUnits),
    maxUnits: String(d.maxUnits),
    saleEnd: isoDay(saleEnd),
    deadline: isoDay(deadline),
    milestones: fitMilestones(category.milestoneTemplates, maxAdvanceBps),
    verifier: keep?.verifier ?? "",
  };
}

// ------------------------------------------------------------------ validation

export type StepErrors = Record<string, string>;

export interface ValidationContext {
  maxAdvanceBps: number;
  nowSeconds: number;
  /** The producer's address, when signed in (seller and verifier must differ). */
  me?: string | null;
  /** Address check, injected so this module stays free of the SDK. */
  isAddress: (s: string) => boolean;
  /**
   * Result of the contract's `is_verifier` for the chosen verifier. `false` blocks the step;
   * `undefined` (still loading, or the read failed) lets the contract have the last word.
   */
  verifierAllowed?: boolean;
}

/** Contract limits (types.rs): delivery at most 5 years out; titles at most 256 bytes (80 characters always fit). */
export const MAX_HORIZON_SECONDS = 5 * 365 * 86_400;
const MAX_TITLE_CHARS = 80;

function units(s: string): number | null {
  return /^\d+$/.test(s.trim()) ? Number(s.trim()) : null;
}

export function validateStep(step: WizardStep, d: CampaignDraft, ctx: ValidationContext): StepErrors {
  const e: StepErrors = {};
  const category = getCategory(d.categoryId);
  switch (step) {
    case 0:
      if (category.id !== d.categoryId || category.comingSoon) e.categoryId = "Elige un tipo de producto.";
      break;
    case 1: {
      if (!d.title.trim()) e.title = "Ponle un nombre a tu preventa.";
      else if (d.title.trim().length > MAX_TITLE_CHARS) e.title = `Máximo ${MAX_TITLE_CHARS} caracteres.`;
      if (d.description.length > 2000) e.description = "Máximo 2.000 caracteres.";
      for (const issue of validateAttributes(category, attributesOf(d, category))) e[`attr.${issue.key}`] = issue.message;
      d.images.forEach((img, i) => {
        if (img.trim() && !/^(https|ipfs):\/\/\S+$/.test(img.trim())) e[`image.${i}`] = "Debe ser un enlace https:// o ipfs://.";
      });
      if (d.whatsapp.trim() && d.whatsapp.replace(/\D/g, "").length < 8) e.whatsapp = "Número incompleto.";
      break;
    }
    case 2: {
      const price = parseUsd(d.price);
      if (price === null || price <= BigInt(0)) e.price = "Ingresa un precio mayor a 0 (por ejemplo 0.60).";
      const min = units(d.minUnits);
      const max = units(d.maxUnits);
      if (min === null || min < 1) e.minUnits = "La cantidad mínima debe ser al menos 1.";
      if (max === null || max < 1) e.maxUnits = "Ingresa cuánto puedes producir.";
      else if (min !== null && min > max) e.minUnits = "La cantidad mínima no puede superar lo que puedes producir.";
      const sale = daySeconds(d.saleEnd);
      const deadline = daySeconds(d.deadline);
      if (sale === null || Number(sale) <= ctx.nowSeconds) e.saleEnd = "El cierre de la preventa debe ser una fecha futura.";
      if (deadline === null) e.deadline = "Elige la fecha límite de entrega.";
      else if (sale !== null && deadline <= sale) e.deadline = "La entrega debe ser después del cierre de la preventa.";
      else if (Number(deadline) > ctx.nowSeconds + MAX_HORIZON_SECONDS) e.deadline = "La entrega no puede ser a más de 5 años.";
      break;
    }
    case 3: {
      const on = d.milestones.filter((m) => m.enabled);
      if (on.length > MAX_MILESTONES) e.milestones = `Máximo ${MAX_MILESTONES} hitos.`;
      d.milestones.forEach((m, i) => {
        if (!m.enabled) return;
        if (!m.title.trim()) e[`milestone.${i}.title`] = "Describe el hito.";
        else if (m.title.trim().length > MAX_TITLE_CHARS) e[`milestone.${i}.title`] = `Máximo ${MAX_TITLE_CHARS} caracteres.`;
        if (!(m.pct > 0)) e[`milestone.${i}.pct`] = "Debe ser mayor a 0%.";
      });
      const total = advanceBpsOf(d.milestones);
      if (total > ctx.maxAdvanceBps) {
        e.milestones =
          ctx.maxAdvanceBps === 0
            ? "Tu nivel actual no permite adelantos: vende con pago contra entrega."
            : `Tu nivel permite hasta ${ctx.maxAdvanceBps / 100}% de adelanto en total.`;
      }
      break;
    }
    case 4: {
      const v = d.verifier.trim();
      if (!ctx.isAddress(v)) e.verifier = "Ingresa la dirección de Stellar del verificador (empieza con G…).";
      else if (ctx.me && v === ctx.me) e.verifier = "El verificador tiene que ser otra persona o institución.";
      else if (ctx.verifierAllowed === false) e.verifier = "Este verificador no está autorizado en Ayni. Elige uno de la lista o pide que lo autoricen.";
      const size = inlineEstimate(d);
      if (size > INLINE_HARD_LIMIT) e.size = `Los detalles ocupan ${size} bytes (máximo ${INLINE_HARD_LIMIT}). Acorta la descripción.`;
      break;
    }
  }
  return e;
}

export function firstInvalidStep(d: CampaignDraft, ctx: ValidationContext): WizardStep | null {
  for (const s of [0, 1, 2, 3, 4] as WizardStep[]) if (Object.keys(validateStep(s, d, ctx)).length) return s;
  return null;
}

// ------------------------------------------------------------------ conversion

function attributesOf(d: CampaignDraft, category: CategoryDef): CampaignMetadata["attributes"] {
  const out: CampaignMetadata["attributes"] = {};
  for (const f of category.attributes) {
    const v = d.attributes[f.key];
    if (v === undefined || v === "") continue;
    if (f.type === "number") {
      const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
      out[f.key] = Number.isFinite(n) ? n : String(v);
    } else if (f.type === "boolean") {
      if (v === true) out[f.key] = true;
    } else {
      out[f.key] = typeof v === "string" ? v.trim() : v;
    }
  }
  return out;
}

export function toMetadata(d: CampaignDraft): CampaignMetadata {
  const category = getCategory(d.categoryId);
  const points = d.points
    .filter((p) => p.name.trim())
    .map((p) => ({
      name: p.name.trim(),
      ...(p.address.trim() ? { address: p.address.trim() } : {}),
      ...(p.schedule.trim() ? { schedule: p.schedule.trim() } : {}),
    }));
  return {
    schema: METADATA_SCHEMA_V1,
    category: category.id,
    description: d.description.trim(),
    images: d.images.map((s) => s.trim()).filter(Boolean),
    attributes: attributesOf(d, category),
    producer: {
      displayName: d.producerName.trim(),
      ...(d.location.trim() ? { location: d.location.trim() } : {}),
      ...(d.whatsapp.trim() ? { whatsapp: d.whatsapp.trim() } : {}),
    },
    delivery: { mode: category.deliveryMode, ...(points.length ? { points } : {}) },
  };
}

/** Rough size of the inline metadata string (base64 of the JSON), without the SDK or zod. */
export function inlineEstimate(d: CampaignDraft): number {
  const json = JSON.stringify(toMetadata(d));
  const bytes = new TextEncoder().encode(json).length;
  return "data:application/json;base64,".length + Math.ceil(bytes / 3) * 4;
}

/** The contract's CampaignInput. Call only after every step validates. */
export function toCampaignInput(d: CampaignDraft, metadataUri: string): CampaignInput {
  return {
    title: d.title.trim(),
    metadata_uri: metadataUri,
    unit_price: parseUsd(d.price)!,
    min_units: Number(d.minUnits),
    max_units: Number(d.maxUnits),
    sale_end: daySeconds(d.saleEnd)!,
    delivery_deadline: daySeconds(d.deadline)!,
    milestones: d.milestones.filter((m) => m.enabled).map((m) => ({ title: m.title.trim(), bps: Math.round(m.pct * 100) })),
  };
}

/** A Campaign-shaped object for the live preview card (nothing sold yet). */
export function previewCampaign(
  d: CampaignDraft,
  seller: string,
  bondCoverBps: number,
  nowSeconds: number,
  disputeWindow: bigint = BigInt(259_200),
): Campaign {
  const price = parseUsd(d.price) ?? BigInt(0);
  return {
    id: BigInt(0),
    seller,
    verifier: d.verifier,
    title: d.title.trim() || getCategory(d.categoryId).label,
    metadata_uri: "",
    unit_price: price,
    min_units: units(d.minUnits) ?? 0,
    max_units: Math.max(units(d.maxUnits) ?? 0, 1),
    sale_end: daySeconds(d.saleEnd) ?? BigInt(nowSeconds),
    delivery_deadline: daySeconds(d.deadline) ?? BigInt(nowSeconds),
    milestones: d.milestones.filter((m) => m.enabled).map((m) => ({ title: m.title, bps: Math.round(m.pct * 100), evidence: "", released: false })),
    bond_cover_bps: bondCoverBps,
    dispute_window: disputeWindow,
    status: { tag: "Funding" },
    sold: 0,
    delivered: 0,
    pending: 0,
    refunded: 0,
    released_bps: 0,
    advanced: BigInt(0),
    escrow: BigInt(0),
    bond_total: BigInt(0),
    bond_slashed: BigInt(0),
    refund_per_unit: BigInt(0),
    created_at: BigInt(nowSeconds),
  };
}

// ------------------------------------------------------------------ money flow

export interface MoneyFlow {
  /** Everything sold at the cap. */
  gross: bigint;
  /** Advance paid when every milestone is approved (gross, before the fee). */
  advance: bigint;
  advanceNet: bigint;
  /** Bond that must be in place before the verifier can approve all milestones. */
  bondNeeded: bigint;
  /** Paid as buyers confirm delivery. */
  onDeliveryNet: bigint;
  totalNet: bigint;
  fee: bigint;
}

/**
 * What the producer receives if they sell `units` (default: the cap) and approve every milestone
 * before delivering. Same arithmetic as DESIGN.md §5 (10 L at 1 USDC, 20% milestone, 2% fee -> 9.80).
 */
export function moneyFlow(d: CampaignDraft, bondCoverBps: number, feeBps: number, units?: number): MoneyFlow {
  const BPS = BigInt(10_000);
  const price = parseUsd(d.price) ?? BigInt(0);
  const n = BigInt(units ?? (Number(d.maxUnits) || 0));
  const gross = price * n;
  const advance = (gross * BigInt(advanceBps(d))) / BPS;
  const net = (x: bigint) => x - (x * BigInt(feeBps)) / BPS;
  const advanceNet = net(advance);
  const onDeliveryNet = net(gross - advance);
  return {
    gross,
    advance,
    advanceNet,
    bondNeeded: (advance * BigInt(bondCoverBps)) / BPS,
    onDeliveryNet,
    totalNet: advanceNet + onDeliveryNet,
    fee: gross - advanceNet - onDeliveryNet,
  };
}

/** "lechero", "granja", "constructora": who the producer is for this category. */
export function producerNoun(d: CampaignDraft): string {
  return copy(getCategory(d.categoryId), "producerNoun");
}
