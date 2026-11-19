"use client";

import { useEffect, useState } from "react";
import { CATEGORIES, copy, generic, MAX_MILESTONES, type CategoryDef, type CopyKey } from "@/catalog";
import { CategoryTile } from "@/components/CategoryIcon";
import { CampaignCard } from "@/components/CampaignCard";
import { Money, Qty } from "@/components/Money";
import { ProtectionExplainer } from "@/components/ProtectionExplainer";
import { Timeline } from "@/components/Timeline";
import { DesignSystem } from "./DesignSystem";
import { nextActions } from "@/lib/actions";
import { TIER_LABEL, toAmount, type Campaign, type Holding } from "@/lib/despensa";
import { formatPct } from "@/lib/format";
import type { ProducerStats } from "@/lib/hooks";
import { formatAttribute, METADATA_SCHEMA_V1, type CampaignMetadata } from "@/lib/metadata";

const DAY = BigInt(86_400);
// Deployment accounts from deployments/testnet.json (any valid address works; nothing is fetched).
const SELLER = "GCCNUJF362MBLA3RN2G3VH4KDMVTNNPS5M32AL5CFW65H66PIHC3L33P";
const VERIFIER = "GDVZDGLLY2COW6VGW6GT5A47KWHWNVIE3YQ2THQV6IZWTSCR6DISG2AN";
const TIER_MAX = [0, 2000, 3000, 4000, 5000];

const PRODUCER: ProducerStats = {
  rep: { completed: 2, defaulted: 0, units_delivered: 340, units_refunded: 0, streak: 2, best_streak: 2, rating_sum: 23, rating_count: 5 },
  tier: { tier: 2, max_advance_bps: 3000, bond_cover_bps: 5000 },
};

function sampleValue(f: CategoryDef["attributes"][number]): string | number | boolean {
  switch (f.type) {
    case "select":
      return f.options?.[0]?.value ?? "";
    case "number":
      return f.unit === "m²" ? 85 : f.unit === "kg" ? 6 : 2;
    case "boolean":
      return true;
    case "url":
      return "https://example.com/documento.pdf";
    case "date":
      return new Date().toISOString().slice(0, 10);
    default:
      return f.placeholder ?? "Ejemplo";
  }
}

function sample(cat: CategoryDef, i: number, now: bigint): { c: Campaign; meta: CampaignMetadata } {
  const d = cat.defaults;
  const price = toAmount(d.unitPrice ?? "1");
  const sold = Math.round(d.maxUnits * 0.6);
  const c: Campaign = {
    id: BigInt(1000 + i),
    seller: SELLER,
    verifier: VERIFIER,
    title: `${cat.label} · muestra`,
    metadata_uri: "",
    unit_price: price,
    min_units: d.minUnits,
    max_units: d.maxUnits,
    sale_end: now + BigInt(d.saleDays) * DAY,
    delivery_deadline: now + BigInt(d.saleDays + d.deliveryDays) * DAY,
    milestones: cat.milestoneTemplates.slice(0, MAX_MILESTONES).map((t) => ({ title: t.title, bps: t.suggestedPct * 100, evidence: "", released: false })),
    bond_cover_bps: PRODUCER.tier.bond_cover_bps,
    dispute_window: 3n * DAY,
    status: { tag: "Funding" },
    sold,
    delivered: 0,
    pending: 0,
    refunded: 0,
    released_bps: 0,
    advanced: BigInt(0),
    escrow: price * BigInt(sold),
    bond_total: price * BigInt(Math.max(1, Math.round(sold / 10))),
    bond_slashed: BigInt(0),
    refund_per_unit: BigInt(0),
    created_at: now - 2n * DAY,
  };
  const meta: CampaignMetadata = {
    schema: METADATA_SCHEMA_V1,
    category: cat.id,
    description: `Ejemplo generado desde catalog/${cat.id}.ts.`,
    images: [],
    attributes: Object.fromEntries(cat.attributes.map((f) => [f.key, sampleValue(f)])),
    producer: { displayName: `${copy(cat, "producerNoun")[0].toUpperCase()}${copy(cat, "producerNoun").slice(1)} de ejemplo`, location: "Cochabamba" },
    delivery: { mode: cat.deliveryMode, points: [{ name: "Feria de la plaza", schedule: "Sábados 7–11" }] },
  };
  return { c, meta };
}

const COPY_KEYS: CopyKey[] = ["tagline", "voucherNoun", "producerNoun", "deliveryVerb", "confirmVerb", "productionStage"];

export default function CatalogPreview() {
  const [now, setNow] = useState<bigint | null>(null);
  useEffect(() => setNow(BigInt(Math.floor(Date.now() / 1000))), []);
  const all = [...CATEGORIES, generic];

  return (
    <div className="space-y-10">
      {now !== null && <DesignSystem now={now} />}
      <header className="max-w-3xl space-y-2 border-t border-line pt-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Solo en desarrollo</p>
        <h1 className="font-display text-3xl font-semibold">Catálogo de categorías</h1>
        <p className="text-ink-2">
          Cada bloque se genera con datos de muestra desde un archivo de <code className="font-mono text-sm">src/catalog/</code>.
          Agregar una categoría la hace aparecer aquí, en el mercado y en la página de campaña sin tocar ningún componente.
        </p>
      </header>

      {now === null ? null : (
        all.map((cat, i) => {
          const { c, meta } = sample(cat, i, now);
          const sumPct = cat.milestoneTemplates.reduce((s, t) => s + t.suggestedPct, 0);
          const okTiers = TIER_MAX.map((max, t) => (max >= sumPct * 100 ? TIER_LABEL[t] : null)).filter(Boolean);
          const buyer = nextActions(c, null, "buyer", now, { category: cat });
          const holder: Holding = { units: 2, pending: 0, pending_since: 0n, disputed: false, delivered: 0, refunded: 0, rated: false };
          const active = nextActions({ ...c, status: { tag: "Active" } }, holder, "buyer", now, { category: cat });
          return (
            <section key={cat.id} id={cat.id} className="space-y-4 border-t border-line pt-8">
              <h2 className="flex flex-wrap items-center gap-3 font-display text-2xl font-semibold">
                <CategoryTile category={cat} />
                {cat.label}
                <code className="font-mono text-sm font-normal text-ink-3">{cat.id}</code>
                {cat.comingSoon && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-2">Muy pronto</span>}
              </h2>

              <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
                <CampaignCard c={c} meta={meta} category={cat} producer={PRODUCER} now={now} href={`#${cat.id}`} />

                <div className="card space-y-5 p-5 text-sm">
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Item label="Unidad">
                      <Qty n={1} category={cat} /> / <Qty n={3} category={cat} />
                    </Item>
                    <Item label="Precio de muestra">
                      <Money amount={c.unit_price} category={cat} size="sm" />
                    </Item>
                    <Item label="Si se vende todo">
                      <Money amount={c.unit_price * BigInt(c.max_units)} category={cat} size="sm" />
                    </Item>
                    <Item label="Entrega">{cat.deliveryMode}{cat.perishable ? " · perecedero" : ""}</Item>
                    <Item label="Verificador">{cat.verifierLabel}</Item>
                    <Item label="Plazos por defecto">
                      {cat.defaults.saleDays} d preventa · {cat.defaults.deliveryDays} d entrega
                    </Item>
                  </dl>

                  {cat.attributes.length > 0 && (
                    <div>
                      <h3 className="mb-2 font-semibold">Atributos</h3>
                      <ul className="flex flex-wrap gap-2">
                        {cat.attributes.map((f) => (
                          <li key={f.key} className="rounded-sm border border-line px-2 py-1 text-xs">
                            <span className="text-ink-3">{f.label}:</span> {formatAttribute(f, meta.attributes[f.key])}
                            {f.required && <span className="text-danger"> *</span>}
                            {f.showOnCard && <span className="text-ink-3"> · en tarjeta</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <h3 className="mb-2 font-semibold">Hitos ({formatPct(sumPct * 100)} en total)</h3>
                    <ol className="list-inside list-decimal space-y-1 text-ink-2">
                      {cat.milestoneTemplates.map((t) => (
                        <li key={t.title}>
                          {t.title} · {t.suggestedPct}% <span className="text-ink-3">— {t.evidenceHint}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-2 text-xs text-ink-3">
                      Niveles que pueden usar todas las plantillas: {okTiers.length ? okTiers.join(", ") : "ninguno"}. El asistente las
                      ajusta al límite del productor.
                    </p>
                  </div>

                  <div>
                    <h3 className="mb-2 font-semibold">Textos</h3>
                    <dl className="grid gap-1 text-xs sm:grid-cols-2">
                      {COPY_KEYS.map((k) => (
                        <div key={k} className="flex gap-2">
                          <dt className="font-mono text-ink-3">{k}</dt>
                          <dd>{copy(cat, k)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  <div>
                    <h3 className="mb-2 font-semibold">Botones del comprador</h3>
                    <p className="flex flex-wrap gap-2 text-xs">
                      {[...buyer, ...active].map((a, j) => (
                        <span key={j} className="rounded-full bg-surface-2 px-2 py-1">
                          {a.label}
                        </span>
                      ))}
                    </p>
                  </div>

                  <Timeline c={{ ...c, status: { tag: "Active" } }} category={cat} />
                </div>
              </div>

              <details className="rounded-lg">
                <summary className="cursor-pointer text-sm text-ink-2">Ver explicación de protecciones</summary>
                <div className="mt-3">
                  <ProtectionExplainer c={c} category={cat} pool={toAmount("125")} disputeWindow={3n * DAY} />
                </div>
              </details>
            </section>
          );
        })
      )}
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
