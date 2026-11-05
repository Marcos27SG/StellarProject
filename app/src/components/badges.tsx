"use client";

import Link from "next/link";
import { CircleCheck, Flame, Hourglass, RotateCcw, Star, TriangleAlert, Truck, type LucideIcon } from "lucide-react";
import { avgRating, TIER_LABEL, type Campaign, type StatusTag } from "@/lib/despensa";
import { formatNumber, shortAddress } from "@/lib/format";
import { useProducer, type ProducerStats } from "@/lib/hooks";

// ------------------------------------------------------------------ status

// Neutral while open or closed without fault, info while delivering, semantic only for outcomes.
const STATUS: Record<StatusTag, { label: string; icon: LucideIcon; cls: string }> = {
  Funding: { label: "En preventa", icon: Hourglass, cls: "bg-surface-2 text-ink-2" },
  Active: { label: "En entrega", icon: Truck, cls: "bg-info-soft text-info" },
  Completed: { label: "Cumplida", icon: CircleCheck, cls: "bg-success-soft text-success" },
  Failed: { label: "No llegó a la meta · reembolsada", icon: RotateCcw, cls: "bg-surface-2 text-ink-2" },
  Defaulted: { label: "Incumplida · reembolsos", icon: TriangleAlert, cls: "bg-danger-soft text-danger" },
};

export const STATUS_SHORT: Record<StatusTag, string> = Object.fromEntries(
  Object.entries(STATUS).map(([k, v]) => [k, v.label]),
) as Record<StatusTag, string>;

/** Status as icon + text (never color alone). Accepts a campaign or a status tag. */
export function StatusPill({ c, status, className = "" }: { c?: Campaign; status?: StatusTag; className?: string }) {
  const tag = status ?? c?.status.tag ?? "Funding";
  const s = STATUS[tag];
  const Icon = s.icon;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls} ${className}`}>
      <Icon className="size-3.5" aria-hidden />
      {s.label}
    </span>
  );
}

// ------------------------------------------------------------------ reputation

export function TierBadge({ tier }: { tier: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-ink-2">
      Nivel {tier} · {TIER_LABEL[tier] ?? "—"}
      <span className="sr-only"> de 4</span>
    </span>
  );
}

export function Streak({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-ink-2">
      <Flame className="size-4 text-accent" aria-hidden />
      {n} {n === 1 ? "cumplida seguida" : "cumplidas seguidas"}
    </span>
  );
}

export function Stars({ value, count }: { value: number | null; count?: number }) {
  if (value === null) return <span className="text-sm text-ink-2">Sin calificaciones</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-ink-2">
      <Star className="size-4 fill-accent text-accent" aria-hidden />
      <span className="font-semibold text-ink">{formatNumber(value, 1)}</span>
      <span className="sr-only"> de 5</span>
      {count !== undefined && <span>({count})</span>}
    </span>
  );
}

/**
 * The trust line for a producer: name, tier, rating; with `detail`, also streak and record.
 * Fetches the on-chain record when `stats` is undefined; `null` means the caller is loading it.
 */
export function ProducerLine({
  seller,
  displayName,
  stats,
  detail = false,
  linkProfile = false,
}: {
  seller: string;
  displayName?: string;
  stats?: ProducerStats | null;
  detail?: boolean;
  /** Link the name to the public profile. Not inside another link (cards). */
  linkProfile?: boolean;
}) {
  const q = useProducer(stats === undefined ? seller : null);
  const s = stats ?? q.data;
  const name = displayName?.trim() || `Productor ${shortAddress(seller)}`;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {linkProfile ? (
        <Link href={`/p/${seller}`} className="font-medium text-ink underline underline-offset-2 hover:no-underline">
          {name}
        </Link>
      ) : (
        <span className="font-medium text-ink">{name}</span>
      )}
      {s ? (
        <>
          <TierBadge tier={s.tier.tier} />
          <Stars value={avgRating(s.rep)} count={s.rep.rating_count} />
          {detail && <Streak n={s.rep.streak} />}
          {s.rep.defaulted > 0 && (
            <span className="inline-flex items-center gap-1 text-danger">
              <TriangleAlert className="size-4" aria-hidden />
              {s.rep.defaulted} {s.rep.defaulted === 1 ? "incumplida" : "incumplidas"}
            </span>
          )}
        </>
      ) : (
        <span className="h-4 w-32 animate-pulse rounded-full bg-surface-2" aria-hidden />
      )}
    </div>
  );
}
