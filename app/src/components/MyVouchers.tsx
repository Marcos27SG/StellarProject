"use client";

import { Clock, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { copy, type CategoryDef } from "@/catalog";
import type { Action } from "@/lib/actions";
import type { Campaign, Holding } from "@/lib/despensa";
import { formatDuration, formatQty } from "@/lib/format";
import type { CampaignMetadata } from "@/lib/metadata";
import { ActionList, unpaidAmount } from "./ActionPanel";
import { VoucherPill, type VoucherState } from "./badges";
import { Money } from "./Money";
import { Notice, Term } from "./ui";
import { voucherCode } from "./VoucherTicket";
import { YieldEarned } from "./YieldEarned";

/** The connected buyer's vouchers in this campaign: what they hold, the QR for pickup, the next step. */
export function MyVouchers({
  c,
  h,
  buyer,
  category,
  actions,
  now,
  disputeWindow,
  meta,
}: {
  c: Campaign;
  h: Holding;
  buyer: string;
  category: CategoryDef;
  /** Buyer actions except "buy" (the BuyPanel owns that one). */
  actions: Action[];
  now: bigint;
  disputeWindow?: bigint;
  /** For the pickup point shown next to the QR. */
  meta?: CampaignMetadata;
}) {
  const voucher = copy(category, "voucherNoun");
  const [showQr, setShowQr] = useState(false);
  const total = h.units + h.pending + h.delivered + h.refunded;
  if (total === 0) return null;

  const tag = c.status.tag;
  const heldState: VoucherState = tag === "Active" ? "pickup" : tag === "Funding" ? "presale" : tag === "Failed" || tag === "Defaulted" ? "refundDue" : "pickup";
  const rows: { state: VoucherState; n: number }[] = (
    [
      { state: heldState, n: h.units },
      { state: h.disputed ? "disputed" : "confirm", n: h.pending },
      { state: "received", n: h.delivered },
      { state: "refunded", n: h.refunded },
    ] as { state: VoucherState; n: number }[]
  ).filter((r) => r.n > 0);

  const windowEnd = disputeWindow !== undefined && h.pending > 0 ? h.pending_since + disputeWindow : null;
  const canShowQr = tag === "Active" && h.units > 0;
  const list = actions.filter((a) => a.id !== "show_qr");
  const point = meta?.delivery?.points?.[0];

  return (
    <section className="card space-y-4 p-5" aria-labelledby="my-vouchers">
      <h2 id="my-vouchers" className="h-section">
        Mis <Term k="vale">{voucher}s</Term>
      </h2>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.state} className="flex items-center justify-between gap-3 py-2.5">
            <VoucherPill state={r.state} />
            <span className="font-bold tabular-nums">{formatQty(r.n, category)}</span>
          </li>
        ))}
      </ul>

      {windowEnd !== null && !h.disputed && now < windowEnd && (
        <Notice tone="warning" icon={Clock} title={`¿Recibiste ${formatQty(h.pending, category)}?`}>
          El productor registró la entrega. Tienes {formatDuration(Number(windowEnd - now))} para confirmar o disputar; después se le paga solo.
        </Notice>
      )}

      {(tag === "Failed" || tag === "Defaulted") && h.units + h.pending > 0 && (
        <p className="text-ink-2">
          Te corresponden <Money amount={c.refund_per_unit * BigInt(h.units + h.pending)} category={category} size="sm" /> de reembolso, más lo que
          ganó tu pago.
        </p>
      )}

      {canShowQr &&
        (showQr ? (
          <div className="space-y-3">
            <p className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ink-2">{point ? `${point.name}${point.schedule ? ` · ${point.schedule}` : ""}` : `Para recoger ${formatQty(h.units, category)}`}</span>
              <span className="font-mono text-ink-2">
                <span className="sr-only">Código </span>
                {voucherCode(c.id, buyer)}
              </span>
            </p>
            <VoucherQR c={c} buyer={buyer} units={h.units} category={category} />
          </div>
        ) : (
          <button className="btn btn-lg w-full" onClick={() => setShowQr(true)}>
            <QrCode className="size-5" aria-hidden /> Mostrar QR para recoger
          </button>
        ))}

      {h.units + h.pending > 0 && (tag === "Active" || tag === "Funding") && (
        <p className="flex items-center gap-2 rounded-md bg-brand-soft px-3 py-2.5 text-ink">
          <span>
            Tus <Money amount={unpaidAmount(c, h.units + h.pending)} category={category} size="md" showBs={false} /> esperan en el contrato.{" "}
            {tag === "Funding" ? "Si no se llega al mínimo, vuelven a ti completos." : "Se liberan cuando confirmes."}
          </span>
        </p>
      )}

      <YieldEarned c={c} h={h} buyer={buyer} category={category} />

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
