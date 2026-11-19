import type { CategoryDef } from "@/catalog";
import { CURRENCY, decimalsFor, formatBs, formatQty, formatUsd } from "@/lib/format";

/**
 * A price: the locked dollar amount first ("$us 0,60"), bolivianos as a reference ("≈ Bs 7,20").
 * Decimals follow the category (0,60 for milk, 60.000 for an apartment). Always tabular.
 * - `sm`, `md`: inline in text, bold body face.
 * - `lg`: the amount style (Archivo 110, 800; 24 px, 32 on desktop).
 * - `xl`: the hero price (32 px, 48 on desktop).
 */
export function Money({
  amount,
  category,
  size = "md",
  showBs = true,
  className = "",
}: {
  amount: bigint;
  category?: CategoryDef;
  size?: "sm" | "md" | "lg" | "xl";
  showBs?: boolean;
  className?: string;
}) {
  const d = decimalsFor(category);
  const main = {
    sm: "text-sm font-bold",
    md: "text-base font-bold",
    lg: "t-amount",
    xl: "t-amount text-[2rem] leading-[2.375rem] lg:text-5xl lg:leading-[3.5rem]",
  }[size];
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 ${className}`}>
      <span className={`whitespace-nowrap tabular-nums ${main}`}>
        <span aria-hidden>{CURRENCY}</span> {formatUsd(amount, d)}
        <span className="sr-only"> dólares</span>
      </span>
      {showBs && (
        <span className="t-detail font-normal whitespace-nowrap text-ink-2 tabular-nums">
          ≈ Bs {formatBs(amount, d)}
          <span className="sr-only"> (referencial)</span>
        </span>
      )}
    </span>
  );
}

/** "3 litros", "1 departamento". */
export function Qty({ n, category, className = "" }: { n: number; category: CategoryDef; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{formatQty(n, category)}</span>;
}
