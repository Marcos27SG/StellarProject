// Display formatting. Pure, es-BO. Category-aware where it matters (price decimals, unit names).

import { unitLabel, type CategoryDef } from "@/catalog";
import { config, TOKEN_DECIMALS } from "./config";

const UNIT = BigInt(10) ** BigInt(TOKEN_DECIMALS);
const LOCALE = "es-BO";

/**
 * "0.60", "0,60", "60000" -> 7-decimal token integer. Null when it is not a plain positive-or-zero
 * decimal with at most 7 decimals (no thousands separators: "60.000" would be read as 60).
 */
export function parseUsd(input: string): bigint | null {
  const s = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,7})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * UNIT + BigInt((frac + "0000000").slice(0, TOKEN_DECIMALS));
}

/** Token amount (7-decimal integer) as a JS number of dollars. Exact enough for display. */
export function toUsdNumber(amount: bigint): number {
  return Number(amount / UNIT) + Number(amount % UNIT) / Number(UNIT);
}

function number(n: number, decimals: number): string {
  return n.toLocaleString(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** "0,60" or "60.000". */
export function formatUsd(amount: bigint, decimals: 0 | 2 = 2): string {
  return number(toUsdNumber(amount), decimals);
}

/**
 * The one way to write a dollar amount: "$us 1,00", the notation used in Bolivia next to "Bs".
 * On-chain the token is USDC (DUSD on the demo deployment); users see dollars.
 */
export const CURRENCY = "$us";
export function formatMoney(amount: bigint, decimals: 0 | 2 = 2): string {
  return `${CURRENCY} ${formatUsd(amount, decimals)}`;
}

/** A plain number in es-BO: 4,6 · 1.200. */
export function formatNumber(n: number, decimals = 0): string {
  return number(n, decimals);
}

/** Bolivianos at the display-only reference rate. */
export function formatBs(amount: bigint, decimals: 0 | 2 = 2): string {
  return number(toUsdNumber(amount) * config.bobPerUsd, decimals);
}

export function decimalsFor(category?: CategoryDef): 0 | 2 {
  return category?.priceDisplay.decimals ?? 2;
}

/** "3 litros", "1 departamento", "1.200 canastas". */
export function formatQty(n: number, category: CategoryDef): string {
  return `${n.toLocaleString(LOCALE)} ${unitLabel(category, n)}`;
}

export function formatDate(seconds: bigint, opts: { year?: boolean } = {}): string {
  return new Date(Number(seconds) * 1000).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    ...(opts.year === false ? {} : { year: "numeric" }),
  });
}

/** Human duration: "3 días", "5 h", "20 min", "menos de 1 min". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const days = Math.floor(s / 86_400);
  if (days >= 2) return `${days} días`;
  if (days === 1) {
    const h = Math.floor((s % 86_400) / 3600);
    return h > 0 ? `1 día ${h} h` : "1 día";
  }
  const hours = Math.floor(s / 3600);
  if (hours >= 1) return `${hours} h`;
  const minutes = Math.floor(s / 60);
  return minutes >= 1 ? `${minutes} min` : "menos de 1 min";
}

/** Basis points as a percentage: 2000 -> "20%", 250 -> "2,5%". */
export function formatPct(bps: number): string {
  return `${(bps / 100).toLocaleString(LOCALE, { maximumFractionDigits: 1 })}%`;
}

export function shortAddress(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

/**
 * Only https:// links are rendered as-is; ipfs:// goes through the configured gateway.
 * Anything else (javascript:, data:, http:) returns null and must not become a link.
 */
export function safeHref(url: string | undefined | null): string | null {
  if (!url) return null;
  const u = url.trim();
  if (/^https:\/\/[^\s]+$/i.test(u)) return u;
  if (/^ipfs:\/\/[^\s]+$/i.test(u)) return config.ipfsGateway.replace(/\/?$/, "/") + u.slice("ipfs://".length);
  return null;
}

/** wa.me link from a free-form phone number, or null. */
export function whatsappHref(phone: string | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}
