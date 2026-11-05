import type { CategoryDef } from "@/catalog";
import { formatNumber, formatQty } from "@/lib/format";
import type { Campaign } from "@/lib/despensa";
import { ProgressBar } from "./ui";

/** Units sold against the supply cap, with a tick at the all-or-nothing goal. */
export function FundingBar({ c, category, size = "md" }: { c: Campaign; category: CategoryDef; size?: "md" | "lg" }) {
  const reached = c.sold >= c.min_units;
  return (
    <div className="space-y-1.5">
      <ProgressBar
        value={c.sold}
        max={c.max_units}
        marker={c.min_units}
        size={size}
        label={`${formatQty(c.sold, category)} vendidos de ${formatNumber(c.max_units)}. Meta mínima: ${formatQty(c.min_units, category)}.`}
      />
      <p className="flex flex-wrap justify-between gap-x-3 text-sm text-ink-2 tabular-nums">
        <span>
          <b className="font-semibold text-ink">{formatQty(c.sold, category)}</b> de {formatNumber(c.max_units)}
        </span>
        <span>{reached ? "Meta alcanzada" : `Meta: ${formatQty(c.min_units, category)}`}</span>
      </p>
    </div>
  );
}
