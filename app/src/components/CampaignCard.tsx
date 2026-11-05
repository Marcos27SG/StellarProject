import { CalendarDays, MapPin } from "lucide-react";
import Link from "next/link";
import type { CampaignMetadata } from "@/lib/metadata";
import type { CategoryDef } from "@/catalog";
import type { Campaign } from "@/lib/despensa";
import { formatDate, formatDuration, safeHref } from "@/lib/format";
import type { ProducerStats } from "@/lib/hooks";
import { ProducerLine, StatusPill } from "./badges";
import { CategoryIcon } from "./CategoryIcon";
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
      return "Se devolvió el 100%";
    case "Defaulted":
      return "Compradores reembolsados";
  }
}

/**
 * A pre-sale in a list: what it is, the price, how far along, when, and who. Six facts; the rest
 * lives on the campaign page.
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
  /** undefined: the card fetches it; null: the caller is loading it. */
  producer?: ProducerStats | null;
  now: bigint;
  /** Defaults to the campaign page. */
  href?: string;
}) {
  const image = safeHref(meta.images[0]);
  const location = meta.producer.location;

  return (
    <Link
      href={href ?? `/campaign/${c.id.toString()}`}
      className="card group flex flex-col overflow-hidden transition-shadow hover:shadow-lift"
      aria-label={`${c.title}, ${category.label}`}
    >
      <div className="relative h-36 overflow-hidden bg-surface-2">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-ink-3">
            <CategoryIcon category={category} className="size-12" />
          </div>
        )}
        <StatusPill c={c} className="absolute top-3 left-3" />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="space-y-1">
          <h3 className="font-display text-lg leading-snug font-semibold text-ink group-hover:underline group-hover:underline-offset-2">{c.title}</h3>
          <p className="text-sm text-ink-2">
            <Money amount={c.unit_price} category={category} size="lg" showBs={false} className="text-ink" /> por {category.unit.singular}
          </p>
        </div>

        <FundingBar c={c} category={category} />

        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-4" aria-hidden />
            {timeHint(c, now)}
          </span>
          {location && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" aria-hidden />
              {location}
            </span>
          )}
        </p>

        <div className="mt-auto border-t border-line pt-3">
          <ProducerLine seller={c.seller} displayName={meta.producer.displayName} stats={producer} />
        </div>
      </div>
    </Link>
  );
}
