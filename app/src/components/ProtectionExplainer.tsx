"use client";

import { ChevronDown, Lock, PackageCheck, RotateCcw, ShieldCheck, Sprout, type LucideIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import type { CategoryDef } from "@/catalog";
import { config } from "@/lib/config";
import type { Campaign } from "@/lib/despensa";
import { formatDate, formatDuration, formatPct, formatQty } from "@/lib/format";
import { Money } from "./Money";
import { Term } from "./ui";

/**
 * "Cómo está protegido tu dinero", with this campaign's real numbers. Refund conditions, time limits
 * and advances are risks, so they stay visible; the refund order and the lending-pool risk are behind
 * disclosures. The wording is the reference for every shorter protection line in the app (cards,
 * sheet, previews). Never "garantizado" or "sin riesgo": the lending pool itself can lose money.
 */
export function ProtectionExplainer({
  c,
  category,
  disputeWindow,
}: {
  c: Campaign;
  category: CategoryDef;
  disputeWindow?: bigint;
}) {
  const advanceBps = c.milestones.reduce((s, m) => s + m.bps, 0);
  const windowText = disputeWindow ? formatDuration(Number(disputeWindow)) : "unos días";
  const items: { icon: LucideIcon | ComponentType<{ className?: string }>; body: ReactNode }[] = [
    {
      icon: RotateCcw,
      body: (
        <>
          <b>Recuperas el 100%</b> si no se llega al mínimo de {formatQty(c.min_units, category)} antes del {formatDate(c.sale_end)}.
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
                <b>Hasta {formatPct(advanceBps)} puede adelantarse</b> al productor antes de entregar: solo a productores con identidad
                verificada, solo si el <Term k="verificador">verificador</Term> aprueba la evidencia, y con un <Term k="aval">aval</Term> que
                cubre el {formatPct(c.bond_cover_bps)} de lo adelantado.
              </>
            ),
          },
        ]
      : []),
    {
      icon: Sprout,
      body: (
        <>
          <b>Tu pago gana mientras espera.</b> Cuando recibes, te llevas el {formatPct(c.buyer_yield_bps)} de lo que ganó tu pago; si se te
          devuelve, te llevas todo. Sin comisión para ti.
          {config.network === "testnet" && <> En esta versión de prueba es un <Term k="rendimiento">rendimiento de prueba</Term>.</>}
        </>
      ),
    },
    {
      icon: Lock,
      body: (
        <>
          <b>Nadie puede tomar el dinero fuera de estas reglas</b>, tampoco Ayni: está en <Term k="custodia">custodia</Term> en un contrato público
          de Stellar.
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
          <li key={i} className="flex gap-3 leading-relaxed text-ink-2 [&_b]:font-bold [&_b]:text-ink">
            <Icon className="mt-0.5 size-[22px] shrink-0 text-brand" aria-hidden />
            <p>{body}</p>
          </li>
        ))}
      </ul>
      <details className="group rounded-md bg-surface-2 px-4 py-1">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-bold">
          ¿Qué pasa si el productor no cumple?
          <ChevronDown className="size-5 transition group-open:rotate-180" aria-hidden />
        </summary>
        <p className="mt-2 text-ink-2">
          Se te devuelve lo que no recibiste, en este orden, hasta cubrir el precio que pagaste. Como el aval cubre cada adelanto, alcanza para
          el precio completo:
        </p>
        <ol className="mt-3 divide-y divide-line">
          {[
            { label: "Tu pago en custodia", amount: c.escrow },
            { label: <Term k="aval">El aval del productor</Term>, amount: c.bond_left },
          ].map((l, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2.5">
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
        <p className="mt-2 mb-3 text-ink-2">Además, el productor pierde su racha y baja de nivel: la próxima vez no podrá recibir adelantos.</p>
      </details>
      <details className="group rounded-md bg-surface-2 px-4 py-1">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-bold">
          Más detalles
          <ChevronDown className="size-5 transition group-open:rotate-180" aria-hidden />
        </summary>
        <p className="mt-2 mb-3 text-ink-2">
          Mientras espera, el dinero se presta en un servicio de préstamos de Stellar. Si ese servicio perdiera dinero, los pagos y los
          reembolsos bajarían en la misma proporción para todos, y lo verías en esta página.
        </p>
      </details>
    </section>
  );
}
