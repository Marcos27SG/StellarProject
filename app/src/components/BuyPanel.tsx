"use client";

import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CategoryDef } from "@/catalog";
import type { Action } from "@/lib/actions";
import { config } from "@/lib/config";
import type { Campaign } from "@/lib/despensa";
import { decimalsFor, formatDate, formatDuration, formatMoney, formatQty } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { ActionDialog, Stepper } from "./ActionPanel";
import { Money } from "./Money";
import { readOnlyProps, TokenSetup, useWallet } from "./Wallet";

/**
 * Price, quantity and the one buy button, plus (below desktop width, while buying is possible) a bar
 * fixed to the bottom of the screen so the button is always under the thumb (elevation 2). The bar
 * only shows while the panel's own button is off screen, so there is one primary button in view; while
 * it shows it sets --bottom-bar so toasts clear it. The button says
 * how much money moves. Place one instance per layout. `buy` is the "buy" action from nextActions,
 * or undefined when buying is not possible now.
 */
export function BuyPanel({ c, category, buy, bar = true }: { c: Campaign; category: CategoryDef; buy?: Action; bar?: boolean }) {
  const { enabled, balance } = useWallet();
  const now = useNow();
  const missing = c.min_units - c.sold;
  const step = Math.max(1, category.unit.step);
  const [units, setUnits] = useState(step);
  const [open, setOpen] = useState(false);
  const total = c.unit_price * BigInt(units);
  const totalText = formatMoney(total, decimalsFor(category));
  const mainButton = useRef<HTMLButtonElement>(null);
  const [mainVisible, setMainVisible] = useState(true);
  const showBar = !!buy && bar && !mainVisible;

  useEffect(() => {
    const el = mainButton.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setMainVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [buy]);

  useEffect(() => {
    // The tab bar is hidden on campaign pages, so this is the only thing at the bottom edge.
    const root = document.documentElement;
    const narrow = window.matchMedia("(max-width: 1023px)");
    const apply = () => root.style.setProperty("--bottom-bar", showBar && narrow.matches ? "84px" : "0px");
    apply();
    narrow.addEventListener("change", apply);
    return () => {
      narrow.removeEventListener("change", apply);
      root.style.setProperty("--bottom-bar", "0px");
    };
  }, [showBar]);

  return (
    <>
      <section className="card space-y-5 p-5" aria-labelledby="buy-title">
        <div>
          <h2 id="buy-title" className="t-detail text-ink-2">
            Precio por {category.unit.singular}, bloqueado
          </h2>
          <Money amount={c.unit_price} category={category} size="xl" />
          <p className="t-detail mt-1 text-ink-2">No cambia aunque suban los precios. Bs al cambio referencial de Bs {config.bobPerUsd} por $us.</p>
        </div>

        {buy ? (
          <>
            <p className="t-detail text-ink-2">
              {missing > 0 ? (
                <>
                  Faltan <b className="text-ink">{formatQty(missing, category)}</b> para el mínimo
                </>
              ) : (
                <>Mínimo logrado</>
              )}
              {now < c.sale_end && (
                <>
                  {" "}
                  · cierra en <b className="text-ink">{formatDuration(Number(c.sale_end - now))}</b>
                </>
              )}
            </p>
            <div role="group" aria-labelledby="buy-qty">
              <p id="buy-qty" className="mb-1.5 text-[0.9375rem] font-bold">
                Cantidad ({category.unit.plural})
              </p>
              <Stepper value={units} onChange={setUnits} step={step} max={buy.maxUnits} unit={units === 1 ? category.unit.singular : category.unit.plural} label={`Cantidad en ${category.unit.plural}`} />
              {buy.maxUnits !== undefined && <p className="t-detail mt-1.5 text-ink-2">Máximo {formatQty(buy.maxUnits, category)} en esta reserva.</p>}
            </div>
            <TokenSetup compact />
            {balance !== null && balance > 0n && balance < total && (
              <p className="t-detail font-bold text-warning" role="status">
                Tu saldo ({formatMoney(balance)}) no alcanza para {formatQty(units, category)}.
              </p>
            )}
            <button ref={mainButton} className="btn btn-lg w-full" onClick={() => setOpen(true)} {...readOnlyProps(enabled)}>
              {buy.label} <span className="opacity-60">·</span> <span className="font-display tabular-nums [font-stretch:105%]">{totalText}</span>
            </button>
            <p className="text-ink-2">
              Tu pago queda en custodia hasta que recibes. Si no se llega al mínimo, recuperas el 100%. Sin comisión para ti.
            </p>
          </>
        ) : (
          <ClosedNote c={c} now={now} />
        )}
      </section>

      {showBar && (
        <div className="fixed inset-x-0 bottom-0 z-40 animate-[rise-in_var(--motion-base)_var(--motion-ease-enter)] border-t border-line bg-surface-fixed px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-fixed lg:hidden print:hidden">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="t-detail text-ink-2">
                {formatQty(units, category)} · por {category.unit.singular}
              </p>
              <Money amount={c.unit_price} category={category} size="md" showBs={false} />
            </div>
            <button className="btn btn-lg shrink-0" onClick={() => setOpen(true)} {...readOnlyProps(enabled)}>
              {buy.label} <span className="opacity-60">·</span> <span className="font-display tabular-nums [font-stretch:105%]">{totalText}</span>
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
      ? "La preventa terminó: falta cerrarla para pasar a producción o habilitar los reembolsos."
      : c.sold >= c.min_units
        ? `Mínimo logrado. La preventa sigue abierta hasta el ${formatDate(c.sale_end)}; el productor puede cerrarla antes y empezar.`
        : `La preventa sigue abierta hasta el ${formatDate(c.sale_end)}.`,
    Active: `La venta cerró. Entrega hasta el ${formatDate(c.delivery_deadline)}.`,
    Completed: "Campaña cumplida: todo fue entregado.",
    Failed: "No llegó al mínimo: cada comprador puede pedir su reembolso del 100%.",
    Defaulted: "El productor no cumplió: los compradores pueden pedir su reembolso.",
  }[c.status.tag];
  return (
    <p className="flex gap-2 text-ink-2">
      <CalendarDays className="mt-0.5 size-5 shrink-0" aria-hidden />
      {c.max_units === c.sold && c.status.tag === "Funding" ? "¡Completo! Ya no se aceptan reservas." : text}
    </p>
  );
}
