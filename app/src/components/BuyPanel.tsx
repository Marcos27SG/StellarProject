"use client";

import { CalendarDays } from "lucide-react";
import { useState } from "react";
import type { CategoryDef } from "@/catalog";
import type { Action } from "@/lib/actions";
import { config } from "@/lib/config";
import type { Campaign } from "@/lib/despensa";
import { formatDate, formatDuration, formatMoney, formatQty } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { ActionDialog, Stepper } from "./ActionPanel";
import { Money } from "./Money";
import { readOnlyProps, TokenSetup, useWallet } from "./Wallet";

/**
 * Price, quantity and the one buy button, plus (on phones, while buying is possible) a bar fixed
 * to the bottom of the screen so the button is always under the thumb. Place one instance per layout.
 * `buy` is the "buy" action from nextActions, or undefined when buying is not possible now.
 */
export function BuyPanel({ c, category, buy, bar = true }: { c: Campaign; category: CategoryDef; buy?: Action; bar?: boolean }) {
  const { enabled, balance } = useWallet();
  const now = useNow();
  const missing = c.min_units - c.sold;
  const step = Math.max(1, category.unit.step);
  const [units, setUnits] = useState(step);
  const [open, setOpen] = useState(false);
  const total = c.unit_price * BigInt(units);

  return (
    <>
      <section className="card space-y-5 p-5" aria-labelledby="buy-title">
        <div>
          <h2 id="buy-title" className="text-sm text-ink-2">
            Precio por {category.unit.singular}, bloqueado
          </h2>
          <Money amount={c.unit_price} category={category} size="xl" />
          <p className="mt-1 text-sm text-ink-2">No cambia aunque suban los precios. Bs al cambio referencial de Bs {config.bobPerUsd} por $us.</p>
        </div>

        {buy ? (
          <>
            <p className="text-sm text-ink-2">
              {missing > 0 ? (
                <>
                  Faltan <b className="text-ink">{formatQty(missing, category)}</b> para la meta
                </>
              ) : (
                <>Meta alcanzada</>
              )}
              {now < c.sale_end && (
                <>
                  {" "}
                  · cierra en <b className="text-ink">{formatDuration(Number(c.sale_end - now))}</b>
                </>
              )}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Stepper value={units} onChange={setUnits} step={step} max={buy.maxUnits} label={`Cantidad en ${category.unit.plural}`} />
              <Money amount={total} category={category} size="lg" showBs={false} />
            </div>
            <TokenSetup compact />
            {balance !== null && balance > 0n && balance < total && (
              <p className="text-sm text-warning" role="status">
                Tu saldo ({formatMoney(balance)}) no alcanza para {formatQty(units, category)}.
              </p>
            )}
            <button className="btn btn-lg w-full" onClick={() => setOpen(true)} {...readOnlyProps(enabled)}>
              {buy.label} {formatQty(units, category)}
            </button>
            <p className="text-sm text-ink-2">
              Tu pago queda en custodia hasta que recibes. Si no se llega a la meta, recuperas el 100%. Sin comisiones para ti.
            </p>
          </>
        ) : (
          <ClosedNote c={c} now={now} />
        )}
      </section>

      {buy && bar && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface px-4 py-3 shadow-lift lg:hidden">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-ink-2">Por {category.unit.singular}</p>
              <Money amount={c.unit_price} category={category} size="md" showBs={false} />
            </div>
            <button className="btn shrink-0 px-6" onClick={() => setOpen(true)} {...readOnlyProps(enabled)}>
              {buy.label}
            </button>
          </div>
        </div>
      )}

      {open && buy && <ActionDialog action={buy} c={c} category={category} initial={{ units }} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Why there is no buy button: the sale is over, or (while open) this viewer can't buy, e.g. the producer. */
function ClosedNote({ c, now }: { c: Campaign; now: bigint }) {
  const open = now < c.sale_end;
  const text = {
    Funding: !open
      ? "La preventa terminó: falta cerrarla para pasar a producción o habilitar reembolsos."
      : c.sold >= c.min_units
        ? `Meta alcanzada. La preventa sigue abierta hasta el ${formatDate(c.sale_end)}; el productor puede cerrarla antes y empezar.`
        : `La preventa sigue abierta hasta el ${formatDate(c.sale_end)}.`,
    Active: `La venta cerró. Entrega hasta el ${formatDate(c.delivery_deadline)}.`,
    Completed: "Campaña cumplida: todo fue entregado.",
    Failed: "No llegó a la meta: los compradores recuperan el 100%.",
    Defaulted: "El productor no cumplió: los compradores reciben su reembolso.",
  }[c.status.tag];
  return (
    <p className="flex gap-2 text-sm text-ink-2">
      <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden />
      {c.max_units === c.sold && c.status.tag === "Funding" ? "Agotado." : text}
    </p>
  );
}
