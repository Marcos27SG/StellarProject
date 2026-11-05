import type { CategoryDef } from "@/catalog";
import { CURRENCY, decimalsFor, formatBs, formatQty, formatUsd } from "@/lib/format";

/**
 * A price: the locked dollar amount first ("$us 0,60"), bolivianos as a reference ("≈ Bs 7,20").
 * Decimals follow the category (0,60 for milk, 60.000 for an apartment).
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
  const main = { sm: "text-sm", md: "text-base", lg: "text-xl", xl: "text-4xl tracking-tight" }[size];
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 ${className}`}>
      <span className={`font-semibold whitespace-nowrap tabular-nums ${main}`}>
        <span className="text-[0.75em] font-medium text-ink-2" aria-hidden>
          {CURRENCY}
        </span>{" "}
        {formatUsd(amount, d)}
        <span className="sr-only"> dólares</span>
      </span>
      {showBs && (
        <span className="text-sm whitespace-nowrap text-ink-2 tabular-nums">
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
