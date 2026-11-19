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

  if (!valid || item.error) return <EmptyState title="No encontramos esta preventa" action={{ href: "/", label: "Ver preventas" }} />;
  if (!item.data) return <Skeleton className="mx-auto h-[640px] max-w-3xl rounded-lg" />;

  const { c, meta, category } = item.data;
  const d = decimalsFor(category);
  const url = `${origin}/campaign/${c.id.toString()}`;
  const producer = meta.meta.producer.displayName;
  const point = meta.meta.delivery?.points?.[0];

  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/campaign/${c.id.toString()}`} className="btn-ghost -ml-3">
          <ArrowLeft className="size-5" aria-hidden /> Volver a la preventa
        </Link>
        <button type="button" className="btn btn-lg" onClick={() => window.print()}>
          <Printer className="size-5" aria-hidden /> Imprimir
        </button>
      </div>

      {/* Always light (.theme-light): it is printed on paper and read in sunlight. */}
      <article className="theme-light mx-auto max-w-3xl space-y-6 rounded-lg border-2 border-brand bg-surface p-8 text-ink sm:p-12 print:max-w-none print:rounded-none print:border-0 print:p-0">
        <header className="flex items-center justify-between gap-4">
          <Logo size="lg" />
          <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3.5 py-1.5 font-bold text-brand">
            <ShieldCheck className="size-5" aria-hidden /> Preventa protegida
          </p>
        </header>

        <div className="space-y-2">
          <p className="inline-flex items-center gap-2 text-lg text-ink-2">
            <CategoryIcon category={category} className="size-6 text-brand" /> {category.label}
            {producer && <> · {producer}</>}
          </p>
          <h1 className="t-display sm:text-5xl sm:leading-[3.5rem]">{c.title}</h1>
          <p className="text-lg text-ink-2">{copy(category, "tagline")}</p>
        </div>

        <div className="grid items-center gap-8 sm:grid-cols-[1fr_auto]">
          <div className="space-y-5">
            <p>
              <span className="block font-display text-6xl leading-none font-extrabold tabular-nums [font-stretch:110%] sm:text-7xl">
                {CURRENCY} {formatUsd(c.unit_price, d)}
              </span>
              <span className="text-lg text-ink-2">
                por {category.unit.singular} · ≈ Bs {formatBs(c.unit_price, d)} · precio bloqueado
              </span>
            </p>
            <ul className="space-y-3 text-lg">
              <li className="flex gap-3">
                <ShieldCheck className="size-6 shrink-0 text-brand" aria-hidden />
                <span>
                  <b>Tu pago queda guardado</b> en un contrato público de Stellar. El productor cobra cuando recibes
                  {c.milestones.length > 0 ? " (salvo adelantos que aprueba un verificador)." : "."}
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
            <div className="rounded-md border border-line bg-surface">
              {origin ? <QRCodeSVG value={url} size={260} level="M" marginSize={3} /> : <div className="size-[260px]" />}
            </div>
            <figcaption className="max-w-[260px] text-center text-lg font-bold">Escanea con la cámara de tu teléfono para reservar</figcaption>
          </figure>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-ink-2">
          <span>Reserva hasta el {formatDate(c.sale_end)} · Pagas en dólares digitales · Lo que das, vuelve.</span>
          <span className="font-mono">{origin.replace(/^https?:\/\//, "")}/campaign/{c.id.toString()}</span>
        </footer>
      </article>
    </div>
  );
}
