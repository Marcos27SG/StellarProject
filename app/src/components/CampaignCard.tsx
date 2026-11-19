import { CalendarDays, Clock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { CampaignMetadata } from "@/lib/metadata";
import type { CategoryDef } from "@/catalog";
import type { Campaign } from "@/lib/despensa";
import { decimalsFor, formatBs, formatDate, formatDuration, safeHref, shortAddress } from "@/lib/format";
import type { ProducerStats } from "@/lib/hooks";
import { StatusPill, TierBadge } from "./badges";
import { CategoryTile } from "./CategoryIcon";
import { FundingBar } from "./FundingBar";
import { Money } from "./Money";

/** One line about time: closing soon, delivery date, or how it ended. */
export function timeHint(c: Campaign, now: bigint): string {
  switch (c.status.tag) {
    case "Funding":
      return now < c.sale_end ? `Cierra en ${formatDuration(Number(c.sale_end - now))}` : "Preventa terminada: por cerrar";
    case "Active":
      return `Entrega hasta el ${formatDate(c.delivery_deadline, { year: false })}`;
    case "Completed":
      return "Todo entregado";
    case "Failed":
      // Refunds are claimed by each buyer ("Pedir reembolso"), so say they're available, not done.
      return "Reembolso del 100% disponible";
    case "Defaulted":
      return "Reembolsos disponibles";
  }
}

/**
 * The protection line at the foot of a card (board 04). It has to be true for this campaign: a full
 * refund is guaranteed only while the minimum isn't reached; after that the buyer is protected by
 * pay-on-delivery, and refunds after advances come from escrow, bond and pool (ProtectionExplainer).
 */
function protectionLine(c: Campaign): string | null {
  switch (c.status.tag) {
    case "Funding":
      return c.sold < c.min_units ? "Si no llega al mínimo, recuperas el 100%." : "El productor cobra cuando confirmas que recibiste.";
    case "Active":
      return "El productor cobra cuando confirmas que recibiste.";
    default:
      return null;
  }
}

/**
 * A pre-sale in a list (board 04, "Tarjeta de campaña"): the photo or the category icon, product,
 * producer and tier, price in $us with Bs, the funding bar, days left and the delivery date, and the
 * protection line. Ended campaigns show their status pill instead of the protection line.
 */
export function CampaignCard({
  c,
  meta,
  category,
  producer,
  now,
  href,
}: {
  c: Campaign;
  meta: CampaignMetadata;
  category: CategoryDef;
  /** undefined: not shown (no stats requested); null: the caller is loading it. */
  producer?: ProducerStats | null;
  now: bigint;
  /** Defaults to the campaign page. */
  href?: string;
}) {
  const image = safeHref(meta.images[0]);
  const name = meta.producer.displayName?.trim() || `Productor ${shortAddress(c.seller)}`;
  const who = [name, meta.producer.location].filter(Boolean).join(" · ");
  const protection = protectionLine(c);
  const live = c.status.tag === "Funding" || c.status.tag === "Active";

  return (
    <Link
      href={href ?? `/campaign/${c.id.toString()}`}
      className="card group flex min-w-0 flex-col gap-3 p-3.5 transition-shadow duration-(--motion-fast) hover:shadow-lift"
      aria-label={`${c.title}, ${category.label}`}
    >
      <div className="flex gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="size-[76px] shrink-0 rounded-md bg-surface-2 object-cover" loading="lazy" />
        ) : (
          <CategoryTile category={category} size="lg" />
        )}
        <div className="flex min-w-0 flex-col items-start gap-1">
          {!live && <StatusPill c={c} />}
          <h3 className="text-[1.0625rem] leading-tight font-bold text-ink group-hover:underline group-hover:underline-offset-2">{c.title}</h3>
          <p className="text-sm text-ink-2">{who}</p>
          {producer ? (
            <TierBadge tier={producer.tier.tier} />
          ) : producer === null ? (
            <span className="h-4 w-24 animate-pulse rounded-full bg-surface-2" aria-hidden />
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="flex items-baseline gap-1.5">
          <Money amount={c.unit_price} category={category} size="lg" showBs={false} />
          <span className="text-sm text-ink-2">/ {category.unit.singular}</span>
        </span>
        <span className="text-sm text-ink-2 tabular-nums">≈ Bs {formatBs(c.unit_price, decimalsFor(category))}</span>
      </div>

      <FundingBar c={c} category={category} now={now} />

      <p className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-ink">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-4 text-ink-2" aria-hidden />
          {timeHint(c, now)}
        </span>
        {c.status.tag === "Funding" && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-4 text-ink-2" aria-hidden />
            Entrega hasta el {formatDate(c.delivery_deadline, { year: false })}
          </span>
        )}
      </p>

      {protection && (
        <p className="mt-auto flex items-center gap-1.5 border-t border-dashed border-line pt-2.5 text-sm font-bold text-success">
          <ShieldCheck className="size-[17px] shrink-0" aria-hidden />
          {protection}
        </p>
      )}
    </Link>
  );
}
