"use client";

// A printable poster for the producer's market stall: the pre-sale, its price, why it's safe, and a
// big QR that opens the campaign page. Bridges the physical market to the on-chain pre-sale.

import { ArrowLeft, Printer, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { copy } from "@/catalog";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Logo } from "@/components/Logo";
import { EmptyState, Skeleton } from "@/components/ui";
import { CURRENCY, decimalsFor, formatBs, formatDate, formatQty, formatUsd } from "@/lib/format";
import { useCampaignItem } from "@/lib/hooks";

export default function Poster({ id }: { id: string }) {
  const valid = /^\d+$/.test(id);
  const item = useCampaignItem(valid ? BigInt(id) : null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  if (!valid || item.error) return <EmptyState title="No encontramos esta preventa" action={{ href: "/", label: "Volver al mercado" }} />;
  if (!item.data) return <Skeleton className="mx-auto h-[640px] max-w-3xl rounded-2xl" />;

  const { c, meta, category } = item.data;
  const d = decimalsFor(category);
  const url = `${origin}/campaign/${c.id.toString()}`;
  const producer = meta.meta.producer.displayName;
  const point = meta.meta.delivery?.points?.[0];

  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/campaign/${c.id.toString()}`} className="btn-ghost -ml-3">
          <ArrowLeft className="size-4" aria-hidden /> Volver a la preventa
        </Link>
        <button type="button" className="btn" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden /> Imprimir
        </button>
      </div>

      {/* Always light (.theme-light): it is printed on paper and read in sunlight. */}
      <article className="theme-light mx-auto max-w-3xl space-y-6 rounded-2xl border-2 border-brand bg-surface p-8 text-ink sm:p-12 print:max-w-none print:rounded-none print:border-0 print:p-0">
        <header className="flex items-center justify-between gap-4">
          <Logo size="lg" />
          <p className="rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand">Preventa protegida</p>
        </header>

        <div className="space-y-2">
          <p className="inline-flex items-center gap-2 text-base text-ink-2">
            <CategoryIcon category={category} className="size-5" /> {category.label}
            {producer && <> · {producer}</>}
          </p>
          <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">{c.title}</h1>
          <p className="text-lg text-ink-2">{copy(category, "tagline")}</p>
        </div>

        <div className="grid items-center gap-8 sm:grid-cols-[1fr_auto]">
          <div className="space-y-5">
            <p>
              <span className="block text-6xl font-semibold tracking-tight">
                <span className="text-3xl font-medium text-ink-2">{CURRENCY}</span> {formatUsd(c.unit_price, d)}
              </span>
              <span className="text-lg text-ink-2">
                por {category.unit.singular} · ≈ Bs {formatBs(c.unit_price, d)} · precio bloqueado
              </span>
            </p>
            <ul className="space-y-3 text-base">
              <li className="flex gap-3">
                <ShieldCheck className="size-6 shrink-0 text-brand" aria-hidden />
                <span>
                  <b>Tu pago queda guardado</b> en un contrato de Stellar. El productor cobra recién cuando recibes.
                </span>
              </li>
              <li className="flex gap-3">
                <RotateCcw className="size-6 shrink-0 text-brand" aria-hidden />
                <span>
                  <b>Todo o nada:</b> si no se llega a {formatQty(c.min_units, category)} antes del {formatDate(c.sale_end)}, se te
                  devuelve el 100%.
                </span>
              </li>
              <li className="flex gap-3">
                <Truck className="size-6 shrink-0 text-brand" aria-hidden />
                <span>
                  <b>Entrega hasta el {formatDate(c.delivery_deadline)}</b>
                  {point && (
                    <>
                      {" "}
                      en {point.name}
                      {point.schedule && <> ({point.schedule})</>}
                    </>
                  )}
                  .
                </span>
              </li>
            </ul>
          </div>

          <figure className="flex flex-col items-center gap-2 justify-self-center">
            {origin ? <QRCodeSVG value={url} size={240} level="M" marginSize={2} /> : <div className="size-[240px]" />}
            <figcaption className="max-w-[240px] text-center text-base font-semibold">Escanea con la cámara de tu teléfono para comprar</figcaption>
          </figure>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-sm text-ink-2">
          <span>Compra hasta el {formatDate(c.sale_end)} · Pagas en dólares digitales</span>
          <span className="font-mono">{origin.replace(/^https?:\/\//, "")}/campaign/{c.id.toString()}</span>
        </footer>
      </article>
    </div>
  );
}
