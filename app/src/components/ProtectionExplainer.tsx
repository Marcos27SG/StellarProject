"use client";

import { ChevronDown, Lock, PackageCheck, RotateCcw, ShieldCheck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { CategoryDef } from "@/catalog";
import type { Campaign } from "@/lib/despensa";
import { formatDate, formatDuration, formatPct, formatQty } from "@/lib/format";
import { Money } from "./Money";
import { Term } from "./ui";

/**
 * "Cómo está protegido tu dinero", with this campaign's real numbers. Refund conditions, time limits
 * and advances are risks, so they stay visible; only the refund order is behind a disclosure.
 * `pool` is the share of the guarantee pool one default may use (pool x pool_cap_bps).
 */
export function ProtectionExplainer({
  c,
  category,
  pool,
  disputeWindow,
}: {
  c: Campaign;
  category: CategoryDef;
  pool?: bigint;
  disputeWindow?: bigint;
}) {
  const advanceBps = c.milestones.reduce((s, m) => s + m.bps, 0);
  const windowText = disputeWindow ? formatDuration(Number(disputeWindow)) : "unos días";
  const items: { icon: LucideIcon; body: ReactNode }[] = [
    {
      icon: RotateCcw,
      body: (
        <>
          <b>Recuperas el 100%</b> si no se llega a la meta de {formatQty(c.min_units, category)} antes del {formatDate(c.sale_end)}.
        </>
      ),
    },
    {
      icon: PackageCheck,
      body: (
        <>
          <b>El productor cobra cuando confirmas</b> que recibiste. Si no recibiste, tienes {windowText} para abrir una{" "}
          <Term k="disputa">disputa</Term>; si no haces nada en ese plazo, se le paga.
        </>
      ),
    },
    ...(advanceBps > 0
      ? [
          {
            icon: ShieldCheck,
            body: (
              <>
                <b>Hasta {formatPct(advanceBps)} puede adelantarse</b> al productor antes de entregar, solo si el{" "}
                <Term k="verificador">verificador</Term> aprueba la evidencia y con un <Term k="aval">aval</Term> del {formatPct(c.bond_cover_bps)} de
                lo adelantado.
              </>
            ),
          },
        ]
      : []),
    {
      icon: Lock,
      body: (
        <>
          <b>Nadie puede tomar el dinero fuera de estas reglas</b>, tampoco Pacta: está en <Term k="custodia">custodia</Term> en un contrato de
          Stellar.
        </>
      ),
    },
  ];

  return (
    <section aria-labelledby="protection" className="space-y-4">
      <h2 id="protection" className="h-section">
        Cómo está protegido tu dinero
      </h2>
      <ul className="space-y-3">
        {items.map(({ icon: Icon, body }, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink-2 [&_b]:font-semibold [&_b]:text-ink">
            <Icon className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
            <p>{body}</p>
          </li>
        ))}
      </ul>
      <details className="group rounded-xl bg-surface-2 px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
          ¿Qué pasa si el productor no cumple?
          <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
        </summary>
        <p className="mt-3 text-sm text-ink-2">Se te devuelve lo que no recibiste, en este orden, hasta cubrir el precio que pagaste:</p>
        <ol className="mt-3 divide-y divide-line text-sm">
          {[
            { label: "Lo que queda en custodia", amount: c.escrow },
            { label: <Term k="aval">El aval del productor</Term>, amount: c.bond_total - c.bond_slashed },
            { label: <Term k="fondo">El fondo de garantía (tope por caso)</Term>, amount: pool },
          ].map((l, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2">
              <span>
                {i + 1}. {l.label}
              </span>
              {l.amount === undefined ? (
                <span className="h-4 w-16 animate-pulse rounded-full bg-surface" aria-hidden />
              ) : (
                <Money amount={l.amount} category={category} size="sm" showBs={false} />
              )}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-sm text-ink-2">Además, el productor pierde su racha y baja de nivel: la próxima vez no podrá recibir adelantos.</p>
      </details>
    </section>
  );
}
