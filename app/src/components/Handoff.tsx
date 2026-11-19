"use client";

import { Scale } from "lucide-react";
import type { CategoryDef } from "@/catalog";
import { formatDuration, formatQty } from "@/lib/format";
import { VoucherPill } from "./badges";
import { Money } from "./Money";
import { Puntada } from "./Puntada";
import { MoneyStatus, Spinner } from "./ui";

/**
 * What happened after "Entregué": waiting for the buyer, confirmed (paid), or disputed. This is the
 * demo's handshake: when the buyer confirms on their phone, "Cobraste" appears here with la puntada.
 */
export function HandoffStatus({
  watch,
  h,
  category,
  unitPrice,
  releasedBps,
  feeBps,
  verifier,
  windowLeft,
}: {
  watch: { delivered: number };
  h: { delivered: number; pending: number; disputed: boolean };
  category: CategoryDef;
  unitPrice: bigint;
  releasedBps: number;
  feeBps: number;
  verifier: string;
  windowLeft: number | null;
}) {
  const confirmed = h.delivered - watch.delivered;
  if (confirmed > 0) {
    // Same arithmetic as the contract: the unpaid share of the price, minus the fee for the pool.
    const gross = (BigInt(confirmed) * unitPrice * BigInt(10_000 - releasedBps)) / BigInt(10_000);
    const net = gross - (gross * BigInt(feeBps)) / BigInt(10_000);
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg bg-success-soft p-5 text-center" role="status" aria-live="polite">
        <Puntada className="size-16" />
        <MoneyStatus state="completed" />
        <p className="t-title-1">
          Cobraste <Money amount={net} category={category} size="lg" showBs={false} />
        </p>
        <p className="text-ink-2">
          El comprador confirmó que recibió {formatQty(confirmed, category)}. El dinero ya está en tu cuenta (el {(feeBps / 100).toLocaleString("es-BO")}% fue al
          fondo común).
        </p>
      </div>
    );
  }
  if (h.disputed) {
    return (
      <div className="space-y-2 rounded-lg bg-warning-soft p-4" role="status" aria-live="polite">
        <p className="flex items-center gap-2 font-bold text-warning">
          <Scale className="size-5" aria-hidden /> El comprador abrió una disputa
        </p>
        <p className="text-ink">El pago queda congelado hasta que {verifier} revise las pruebas y decida.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2.5 rounded-lg bg-info-soft p-4" role="status" aria-live="polite">
      <VoucherPill state="confirm" />
      <p className="flex items-center gap-2 font-bold text-info">
        <Spinner className="size-5" /> Esperando que el comprador confirme…
      </p>
      <p className="text-ink">
        Le aparece en su teléfono si tiene Ayni abierto. Esta pantalla se actualiza sola.
        {windowLeft !== null && windowLeft > 0 && <> Si no confirma ni disputa, cobras solo en {formatDuration(windowLeft)}.</>}
      </p>
    </div>
  );
}

