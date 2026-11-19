"use client";

// Transparency: everything here is read live from the contract. Built for judges and skeptical buyers.

import { ExternalLink } from "lucide-react";
import type { CSSProperties } from "react";
import { StatusPill } from "@/components/badges";
import { Money } from "@/components/Money";
import { ExplorerLink, Notice, Skeleton, Stat, Term } from "@/components/ui";
import { config } from "@/lib/config";
import type { StatusTag } from "@/lib/despensa";
import { formatBs, formatDuration, formatMoney, formatNumber, formatPct, shortAddress } from "@/lib/format";
import { useCampaignList, useContractConfig } from "@/lib/hooks";
import { TIER_LIMITS, TIER_NAMES } from "@/lib/reputation";

const STATUSES: StatusTag[] = ["Funding", "Active", "Completed", "Failed", "Defaulted"];
const TIER_WHO = ["Incumplió y aún no rehízo su racha", "Productor nuevo", "1 a 2 campañas cumplidas", "3 a 5 campañas cumplidas", "6 o más campañas cumplidas"];

type SegmentKey = "delivered" | "pending" | "todo" | "refunded";
const SEGMENTS: { key: SegmentKey; label: string }[] = [
  { key: "delivered", label: "Entregado" },
  { key: "pending", label: "Por confirmar" },
  { key: "todo", label: "Por entregar" },
  { key: "refunded", label: "Reembolsos" },
];

export default function TransparencyPage() {
  const list = useCampaignList();
  const cfg = useContractConfig();
  const items = list.data ?? [];

  const zero = BigInt(0);
  let escrow = zero;
  let sold = zero;
  let bonds = zero;
  const value: Record<SegmentKey, bigint> = { delivered: zero, pending: zero, todo: zero, refunded: zero };
  const byStatus: Record<StatusTag, number> = { Funding: 0, Active: 0, Completed: 0, Failed: 0, Defaulted: 0 };
  for (const { c } of items) {
    const p = c.unit_price;
    escrow += c.escrow;
    sold += p * BigInt(c.sold);
    byStatus[c.status.tag]++;
    const live = c.status.tag === "Funding" || c.status.tag === "Active";
    if (live) bonds += c.bond_total - c.bond_slashed;
    const outstanding = c.sold - c.delivered - c.pending - c.refunded;
    value.delivered += p * BigInt(c.delivered);
    value.pending += p * BigInt(c.pending);
    if (live) value.todo += p * BigInt(Math.max(0, outstanding));
    else value.refunded += p * BigInt(Math.max(0, outstanding));
    value.refunded += p * BigInt(c.refunded);
  }
  const producers = new Set(items.map((i) => i.c.seller)).size;

  return (
    <div className="space-y-12">
      <header className="max-w-3xl space-y-3">
        <h1 className="h-page">Transparencia</h1>
        <p className="text-ink-2">
          Todo lo que ves aquí se lee en vivo del contrato de Pacta en Stellar. Nadie, ni nosotros, puede editar estos números: cualquiera
          puede comprobarlos en el explorador.
        </p>
        <p className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <ExplorerLink path={`contract/${config.contractId}`}>Contrato {shortAddress(config.contractId)}</ExplorerLink>
          {cfg.data && <ExplorerLink path={`contract/${cfg.data.token}`}>Moneda {config.tokenSymbol}</ExplorerLink>}
          <span className="text-ink-2">Red: {config.network === "testnet" ? "Stellar testnet (montos de prueba)" : "Stellar"}</span>
        </p>
      </header>

      {(list.error || cfg.error) && (
        <Notice
          tone="danger"
          title="No se pudo leer la red de Stellar"
          action={
            <button
              className="btn-secondary btn-sm"
              onClick={() => {
                list.refresh();
                cfg.refresh();
              }}
            >
              Reintentar
            </button>
          }
        >
          {list.error ?? cfg.error}
        </Notice>
      )}

      <section aria-labelledby="money" className="space-y-6">
        <h2 id="money" className="sr-only">
          Dinero en el contrato
        </h2>
        <div>
          <p className="text-ink-2">
            En <Term k="custodia">custodia</Term> ahora, esperando que los productores entreguen
          </p>
          {list.data ? (
            <p className="mt-1 text-5xl font-semibold tracking-tight tabular-nums sm:text-6xl">{formatMoney(escrow)}</p>
          ) : (
            <Skeleton className="mt-2 h-14 w-64" />
          )}
          {list.data && <p className="mt-1 text-ink-2">≈ Bs {formatBs(escrow)}</p>}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-6 lg:grid-cols-4">
          <Stat size="lg" label="Vendido en preventas" value={list.data ? formatMoney(sold) : <Skeleton className="mt-1 h-7 w-24" />} />
          <Stat size="lg" label={<><Term k="aval">Avales</Term> vigentes</>} value={list.data ? formatMoney(bonds) : <Skeleton className="mt-1 h-7 w-24" />} />
          <Stat size="lg" label={<Term k="fondo">Fondo de garantía</Term>} value={cfg.data ? formatMoney(cfg.data.pool) : <Skeleton className="mt-1 h-7 w-24" />} />
          <Stat size="lg" label="Productores" value={list.data ? producers : <Skeleton className="mt-1 h-7 w-24" />} />
        </dl>
      </section>

      <section aria-labelledby="split" className="space-y-4">
        <div className="space-y-1">
          <h2 id="split" className="h-section">
            ¿Qué pasó con lo vendido?
          </h2>
          <p className="text-sm text-ink-2">Valor de todo lo vendido en preventas, al precio pagado, según su estado.</p>
        </div>
        {list.data ? <SplitBar value={value} total={sold} /> : <Skeleton className="h-7 w-full" />}
      </section>

      <section aria-labelledby="campaigns" className="grid gap-12 lg:grid-cols-2">
        <div className="space-y-4">
          <h2 id="campaigns" className="h-section">
            Campañas por estado
          </h2>
          {list.data ? (
            <ul className="space-y-2">
              {STATUSES.map((s) => (
                <li key={s} className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-0">
                  <StatusPill status={s} />
                  <span className="font-semibold tabular-nums">{byStatus[s]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </div>

        <div className="space-y-4">
          <h2 className="h-section">Reglas del contrato</h2>
          <ul className="space-y-2 text-sm text-ink-2">
            <li>
              Comisión: <b className="text-ink">{cfg.data ? formatPct(cfg.data.fee_bps) : "…"}</b> de cada pago a productores, que va entera al fondo
              de garantía.
            </li>
            <li>
              Plazo para disputar una entrega: <b className="text-ink">{cfg.data ? formatDuration(Number(cfg.data.dispute_window)) : "…"}</b> en
              las preventas nuevas. Cada preventa conserva el plazo con el que se creó: nadie puede acortarlo después.
            </li>
            <li>Verificadores: solo instituciones autorizadas pueden verificar una preventa. El productor no puede nombrar a un conocido.</li>
            <li>Todo o nada: si una preventa no llega a su meta, cada comprador recupera el 100%.</li>
            <li>
              Si un productor no cumple: reembolso desde la custodia, luego su aval y luego el fondo de garantía, que aporta como máximo el{" "}
              <b className="text-ink">{cfg.data ? formatPct(cfg.data.pool_cap_bps) : "…"}</b> de su saldo por caso.
            </li>
          </ul>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="mb-2 text-left text-sm text-ink-2">Adelantos que permite cada nivel de reputación</caption>
              <thead className="text-ink-2">
                <tr>
                  <th className="py-1 pr-3 font-medium">Nivel</th>
                  <th className="py-1 pr-3 font-medium">Quién</th>
                  <th className="py-1 pr-3 text-right font-medium">Adelanto máx.</th>
                  <th className="py-1 text-right font-medium">Aval requerido</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {[0, 1, 2, 3, 4].map((t) => (
                  <tr key={t} className="border-t border-line">
                    <td className="py-1.5 pr-3 font-medium">{TIER_NAMES[t]}</td>
                    <td className="py-1.5 pr-3 text-ink-2">{TIER_WHO[t]}</td>
                    <td className="py-1.5 pr-3 text-right">{formatPct(TIER_LIMITS[t].maxAdvanceBps)}</td>
                    <td className="py-1.5 text-right">{formatPct(TIER_LIMITS[t].bondCoverBps)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <p className="flex items-center gap-1.5 text-sm text-ink-2">
        <ExternalLink className="size-4" aria-hidden />
        Cada transacción (compras, entregas, reembolsos, aprobaciones) aparece en el explorador de Stellar con su fecha y sus montos.
      </p>
    </div>
  );
}

/**
 * Tall segmented bar (dataviz spec): 28px, 4px corners, 2px surface gaps, share printed inside
 * when the block is wide enough, legend of names in block order, table view for the figures.
 * Colors: one-hue ordinal ramp (delivered → pending → to deliver) + a neutral for refunds.
 */
function SplitBar({ value, total }: { value: Record<SegmentKey, bigint>; total: bigint }) {
  if (total === BigInt(0)) return <p className="text-sm text-ink-2">Todavía no se vendió nada.</p>;
  const share = (v: bigint) => Number((v * BigInt(10_000)) / total) / 100;
  const parts = SEGMENTS.map((s) => ({ ...s, v: value[s.key], pct: share(value[s.key]) })).filter((p) => p.v > BigInt(0));
  const pct = (n: number, d = 0) => `${formatNumber(n, d)}%`;
  const name = parts.map((p) => `${p.label}: ${formatMoney(p.v)} (${pct(p.pct)})`).join("; ");
  return (
    <div className="space-y-3">
      <div className="flex h-7 w-full gap-0.5" role="img" aria-label={`Lo vendido según su estado. ${name}`}>
        {parts.map((p) => (
          <div
            key={p.key}
            tabIndex={0}
            aria-label={`${p.label}: ${formatMoney(p.v)}, ${pct(p.pct, 1)}`}
            className="flex min-w-1 items-center overflow-hidden rounded px-2 text-xs font-semibold"
            style={{ flexGrow: p.pct, flexBasis: 0, background: `var(--seg-${p.key})`, color: `var(--seg-${p.key}-ink)` } as CSSProperties}
          >
            {p.pct >= 10 && pct(p.pct)}
          </div>
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2" aria-label="Leyenda">
        {parts.map((p) => (
          <li key={p.key} className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-xs" style={{ background: `var(--seg-${p.key})` }} aria-hidden />
            {p.label} · {pct(p.pct)}
          </li>
        ))}
      </ul>
      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-ink-2">Ver como tabla</summary>
        <table className="mt-2 w-full max-w-md text-left">
          <thead className="text-ink-2">
            <tr>
              <th className="py-1 font-medium">Estado</th>
              <th className="py-1 text-right font-medium">Valor</th>
              <th className="py-1 text-right font-medium">Parte</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {parts.map((p) => (
              <tr key={p.key} className="border-t border-line">
                <td className="py-1.5">{p.label}</td>
                <td className="py-1.5 text-right">
                  <Money amount={p.v} size="sm" showBs={false} />
                </td>
                <td className="py-1.5 text-right">{pct(p.pct, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
