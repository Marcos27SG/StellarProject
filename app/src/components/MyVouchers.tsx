"use client";

import { Clock, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { copy, type CategoryDef } from "@/catalog";
import type { Action } from "@/lib/actions";
import type { Campaign, Holding } from "@/lib/despensa";
import { formatDuration, formatQty } from "@/lib/format";
import { ActionList } from "./ActionPanel";
import { Money } from "./Money";
import { MoneyStatus, Notice, Term } from "./ui";

/** The connected buyer's vouchers in this campaign: what they hold, the QR for pickup, the next step. */
export function MyVouchers({
  c,
  h,
  buyer,
  category,
  actions,
  now,
  disputeWindow,
}: {
  c: Campaign;
  h: Holding;
  buyer: string;
  category: CategoryDef;
  /** Buyer actions except "buy" (the BuyPanel owns that one). */
  actions: Action[];
  now: bigint;
  disputeWindow?: bigint;
}) {
  const voucher = copy(category, "voucherNoun");
  const [showQr, setShowQr] = useState(false);
  const total = h.units + h.pending + h.delivered + h.refunded;
  if (total === 0) return null;

  const rows: { label: string; n: number; status?: "pending" | "completed" }[] = [
    { label: "Por recibir", n: h.units },
    { label: h.disputed ? "En disputa" : "Entregado, por confirmar", n: h.pending, status: "pending" as const },
    { label: "Recibido", n: h.delivered, status: "completed" as const },
    { label: "Reembolsado", n: h.refunded, status: "completed" as const },
  ].filter((r) => r.n > 0);

  const windowEnd = disputeWindow !== undefined && h.pending > 0 ? h.pending_since + disputeWindow : null;
  const canShowQr = c.status.tag === "Active" && h.units > 0;
  const list = actions.filter((a) => a.id !== "show_qr");

  return (
    <section className="card space-y-4 p-5" aria-labelledby="my-vouchers">
      <h2 id="my-vouchers" className="h-section">
        Mis <Term k="vale">{voucher}s</Term>
      </h2>
      <dl className="divide-y divide-line text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 py-2">
            <dt className="text-ink-2">{r.label}</dt>
            <dd className="flex items-center gap-2 font-semibold tabular-nums">
              {formatQty(r.n, category)}
              {r.status && <MoneyStatus state={r.status} label={r.status === "pending" ? (h.disputed ? "En disputa" : "Pendiente") : undefined} />}
            </dd>
          </div>
        ))}
      </dl>

      {windowEnd !== null && !h.disputed && now < windowEnd && (
        <Notice tone="warning" icon={Clock} title={`¿Recibiste ${formatQty(h.pending, category)}?`}>
          El productor registró la entrega. Tienes {formatDuration(Number(windowEnd - now))} para confirmar o disputar; después se le paga solo.
        </Notice>
      )}

      {(c.status.tag === "Failed" || c.status.tag === "Defaulted") && h.units + h.pending > 0 && (
        <p className="text-sm text-ink-2">
          Te corresponden <Money amount={c.refund_per_unit * BigInt(h.units + h.pending)} category={category} size="sm" /> de reembolso.
        </p>
      )}

      {canShowQr &&
        (showQr ? (
          <VoucherQR c={c} buyer={buyer} units={h.units} category={category} />
        ) : (
          <button className="btn w-full" onClick={() => setShowQr(true)}>
            <QrCode className="size-4" aria-hidden /> Mostrar mi {voucher} para recoger
          </button>
        ))}

      <ActionList actions={list} c={c} category={category} onLocal={(a) => a.id === "show_qr" && setShowQr(true)} />
    </section>
  );
}

/**
 * QR the producer scans at pickup. It opens /producer/deliver pre-filled (campaign, buyer, units),
 * so the phone camera is enough: no app to install. Always light, so any camera reads it.
 */
export function VoucherQR({ c, buyer, units, category }: { c: Campaign; buyer: string; units: number; category: CategoryDef }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/producer/deliver?campaign=${c.id.toString()}&buyer=${buyer}&units=${units}`;
  return (
    // Big, on pure white, with a margin: it scans in the sun and through a cracked screen (board 04).
    <figure className="flex flex-col items-center gap-2.5">
      <div className="theme-light overflow-hidden rounded-md border border-line bg-surface">
        {origin ? (
          <QRCodeSVG value={url} size={216} level="M" marginSize={3} title={`Código de tu ${copy(category, "voucherNoun")}`} />
        ) : (
          <div className="size-[216px]" />
        )}
      </div>
      <figcaption className="text-center text-sm text-ink-2">
        Muéstralo al productor ({formatQty(units, category)}). Sube el brillo de tu pantalla.
        <br />
        Lo escanea con la cámara para {copy(category, "deliveryVerb")}.
      </figcaption>
    </figure>
  );
}
