"use client";

import Link from "next/link";
import { useId } from "react";
import {
  BadgeCheck,
  CircleAlert,
  CircleCheck,
  History,
  Hourglass,
  PenLine,
  QrCode,
  RotateCw,
  Scale,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { avgRating, type Campaign, type StatusTag } from "@/lib/despensa";
import { formatNumber, formatPct, shortAddress } from "@/lib/format";
import { useProducer, useSellerVerified, type ProducerStats } from "@/lib/hooks";
import { TIER_LIMITS, TIER_NAMES } from "@/lib/reputation";
import { Pill, type PillTone } from "./ui";

// ------------------------------------------------------------------ status

// Campaign states. The board's label set (Para recoger, Por confirmar, En curso, Pendiente, Completado,
// Falló, En disputa, Reembolsado) is about vouchers and transactions; campaigns keep their own words
// in the same style: neutral while selling, info while delivering, semantic only for outcomes.
const STATUS: Record<StatusTag, { label: string; icon: LucideIcon; tone: PillTone }> = {
  Funding: { label: "En preventa", icon: Hourglass, tone: "neutral" },
  Active: { label: "En entrega", icon: RotateCw, tone: "info" },
  Completed: { label: "Completado", icon: CircleCheck, tone: "success" },
  Failed: { label: "No llegó al mínimo", icon: History, tone: "info" },
  Defaulted: { label: "Incumplida", icon: CircleAlert, tone: "danger" },
};

export const STATUS_SHORT: Record<StatusTag, string> = Object.fromEntries(
  Object.entries(STATUS).map(([k, v]) => [k, v.label]),
) as Record<StatusTag, string>;

/** Campaign status as icon + text (never color alone). Accepts a campaign or a status tag. */
export function StatusPill({ c, status, className = "" }: { c?: Campaign; status?: StatusTag; className?: string }) {
  const tag = status ?? c?.status.tag ?? "Funding";
  const s = STATUS[tag];
  return (
    <Pill tone={s.tone} icon={s.icon} className={className}>
      {s.label}
    </Pill>
  );
}

/** What a voucher (a buyer's holding) is waiting for. "Por confirmar" and "Por cobrar" use the accent: you have to act. */
export type VoucherState = "pickup" | "presale" | "confirm" | "disputed" | "received" | "refundDue" | "refunded";

export const VOUCHER_STATUS: Record<VoucherState, { label: string; icon: LucideIcon; tone: PillTone }> = {
  pickup: { label: "Para recoger", icon: QrCode, tone: "brand" },
  presale: { label: "En curso", icon: RotateCw, tone: "info" },
  confirm: { label: "Por confirmar", icon: PenLine, tone: "accent" },
  disputed: { label: "En disputa", icon: Scale, tone: "warning" },
  received: { label: "Completado", icon: CircleCheck, tone: "success" },
  refundDue: { label: "Por cobrar", icon: History, tone: "accent" },
  refunded: { label: "Reembolsado", icon: History, tone: "info" },
};

export function VoucherPill({ state }: { state: VoucherState }) {
  const s = VOUCHER_STATUS[state];
  return (
    <Pill tone={s.tone} icon={s.icon}>
      {s.label}
    </Pill>
  );
}

// ------------------------------------------------------------------ reputation

/** One diamond of the tier and streak rows (from the logo and the aguayo). */
export function Diamond({ filled, className = "size-2.5", stroke = "stroke-accent", fill = "fill-accent", dashed }: { filled: boolean; className?: string; stroke?: string; fill?: string; dashed?: boolean }) {
  return (
    <svg viewBox="0 0 10 10" className={`shrink-0 ${className}`} aria-hidden>
      <path
        d="M5 0.9 L9.1 5 L5 9.1 L0.9 5 Z"
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeDasharray={dashed ? "1.6 1.2" : undefined}
        className={`${stroke} ${filled ? fill : "fill-none"}`}
      />
    </svg>
  );
}

const TIER_SLOTS = 4;

/**
 * Tier as diamonds + name: 0 to 4 filled, counted without reading. Tier 0 (Restringido, after a
 * default) has none filled and is shown in the warning tone with an icon. Names and limits come from
 * reputation.ts (the contract's table), not from the board.
 */
export function TierBadge({ tier, size = "sm" }: { tier: number; size?: "sm" | "md" }) {
  const name = TIER_NAMES[tier] ?? "—";
  const d = size === "md" ? "size-3.5" : "size-2.5";
  const restricted = tier === 0;
  return (
    <span className={`inline-flex items-center gap-[5px] text-sm font-bold whitespace-nowrap ${restricted ? "text-warning" : "text-ink"}`}>
      {restricted && <TriangleAlert className="size-4" aria-hidden />}
      <span className={`inline-flex ${size === "md" ? "gap-0.5" : "gap-px"}`} aria-hidden>
        {Array.from({ length: TIER_SLOTS }, (_, i) => (
          <Diamond key={i} filled={i < tier} className={d} stroke={restricted ? "stroke-warning" : "stroke-accent"} />
        ))}
      </span>
      {name}
      <span className="sr-only"> (nivel {tier} de {TIER_SLOTS})</span>
    </span>
  );
}

/** What a tier allows, in words: "Anticipo hasta 30%". The aval always covers 100% of it. */
export function tierTerms(tier: number): string {
  const l = TIER_LIMITS[tier];
  if (!l) return "";
  return l.maxAdvanceBps === 0 ? "Sin anticipos" : `Anticipo hasta ${formatPct(l.maxAdvanceBps)}`;
}

/**
 * "Verificado": a verifier checked this seller's identity off-chain (only the flag is on chain).
 * Icon + word, never color alone. Renders nothing while loading or when not verified.
 */
export function VerifiedBadge({ seller }: { seller: string }) {
  const q = useSellerVerified(seller);
  if (!q.data) return null;
  return (
    <span className="inline-flex items-center gap-1 text-sm font-bold whitespace-nowrap text-brand" title="Un verificador revisó su identidad">
      <BadgeCheck className="size-4" aria-hidden />
      Verificado
    </span>
  );
}

/** One tier as a tile (board 03, "Niveles"): diamonds, name, what it allows. The top tiers sit on the accent tint. */
export function TierCard({ tier, current }: { tier: number; current?: boolean }) {
  const restricted = tier === 0;
  const bg = restricted ? "bg-warning-soft" : tier >= 3 ? "bg-accent-soft" : "bg-surface-2";
  return (
    <div
      className={`flex min-w-0 flex-col gap-1.5 rounded-md px-3.5 py-3 ${bg} ${current ? "ring-2 ring-brand ring-offset-2 ring-offset-surface" : ""}`}
      aria-current={current ? "true" : undefined}
    >
      <span className="inline-flex gap-0.5" aria-hidden>
        {restricted ? (
          <TriangleAlert className="size-3.5 text-warning" />
        ) : (
          Array.from({ length: TIER_SLOTS }, (_, i) => <Diamond key={i} filled={i < tier} className="size-3.5" />)
        )}
      </span>
      <span className="font-display text-lg leading-tight font-extrabold tracking-[-0.01em] text-ink [font-stretch:115%]">
        {TIER_NAMES[tier]}
        <span className="sr-only"> (nivel {tier} de {TIER_SLOTS})</span>
      </span>
      <span className="t-detail text-ink-2">{tierTerms(tier)}</span>
      {current && <span className="t-label text-brand">Tu nivel</span>}
    </div>
  );
}

/** Every tier, lowest first, the current one ringed. */
export function TierLadder({ current }: { current?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
      {TIER_NAMES.map((_, t) => (
        <TierCard key={t} tier={t} current={t === current} />
      ))}
    </div>
  );
}

const STREAK_SHOWN = 12;

/**
 * The streak is woven: one diamond per campaign completed in a row (the contract's streak counts
 * campaigns completed without a default, not individual deliveries). A broken streak starts a new
 * thread; it is never shown in red. `showZero` shows a dashed diamond and an invitation instead of nothing.
 */
export function Streak({ n, showZero = false, compact = false }: { n: number; showZero?: boolean; compact?: boolean }) {
  if (n <= 0 && !showZero) return null;
  const word = n === 1 ? "campaña cumplida seguida" : "campañas cumplidas seguidas";
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-ink-2">
        <Diamond filled className="size-3" />
        <b className="font-bold text-ink">{n}</b> {n === 1 ? "cumplida seguida" : "cumplidas seguidas"}
      </span>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-0.5" aria-hidden>
        {n <= 0 ? (
          <Diamond filled={false} dashed stroke="stroke-line-strong" className="size-3.5" />
        ) : (
          Array.from({ length: Math.min(n, STREAK_SHOWN) }, (_, i) => <Diamond key={i} filled className="size-3.5" />)
        )}
        {n > STREAK_SHOWN && <span className="ml-1 text-sm font-bold text-accent-ink">+{n - STREAK_SHOWN}</span>}
      </div>
      <p className="text-[0.9375rem] text-ink">
        {n <= 0 ? (
          "Sin racha todavía: empieza con tu próxima campaña cumplida."
        ) : (
          <>
            <b className="font-display text-lg font-extrabold [font-stretch:110%]">{n}</b> {word}
          </>
        )}
      </p>
    </div>
  );
}

const STAR = "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z";

/** Average rating as five stars filled to the value (4,8 → four and four fifths), the number and the count. */
export function Stars({ value, count, size = "md" }: { value: number | null; count?: number; size?: "sm" | "md" }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (value === null) return <span className="text-sm text-ink-2">Sin calificaciones</span>;
  const px = size === "sm" ? "size-4" : "size-[18px]";
  const label = `${formatNumber(value, 1)} de 5 estrellas${count !== undefined ? `, ${count} ${count === 1 ? "calificación" : "calificaciones"}` : ""}`;
  return (
    <span role="img" aria-label={label} className="inline-flex items-center gap-1.5">
      <span className="inline-flex gap-px">
        {[0, 1, 2, 3, 4].map((i) => {
          const f = Math.max(0, Math.min(1, value - i));
          return (
            <svg key={i} viewBox="0 0 24 24" className={`shrink-0 ${px}`} aria-hidden>
              <clipPath id={`${id}-s${i}`}>
                <rect width={24 * f} height="24" />
              </clipPath>
              <path d={STAR} className="fill-accent" clipPath={`url(#${id}-s${i})`} />
              <path d={STAR} fill="none" strokeWidth={1.6} strokeLinejoin="round" className="stroke-accent" />
            </svg>
          );
        })}
      </span>
      <span className="text-[0.9375rem] font-bold text-ink">{formatNumber(value, 1)}</span>
      {count !== undefined && (
        <span className="text-sm text-ink-2">
          · {count} {count === 1 ? "calificación" : "calificaciones"}
        </span>
      )}
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
        <Link href={`/p/${seller}`} className="font-bold text-ink underline underline-offset-2 hover:no-underline">
          {name}
        </Link>
      ) : (
        <span className="font-bold text-ink">{name}</span>
      )}
      <VerifiedBadge seller={seller} />
      {s ? (
        <>
          <TierBadge tier={s.tier.tier} />
          <Stars value={avgRating(s.rep)} count={s.rep.rating_count} size="sm" />
          {detail && <Streak n={s.rep.streak} compact />}
          {s.rep.defaulted > 0 && (
            <span className="inline-flex items-center gap-1 font-bold text-danger">
              <CircleAlert className="size-4" aria-hidden />
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
