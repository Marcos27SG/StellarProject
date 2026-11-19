import { CircleCheck, Clock, History, type LucideIcon } from "lucide-react";
import type { CategoryDef } from "@/catalog";
import { formatNumber, formatQty } from "@/lib/format";
import type { Campaign } from "@/lib/despensa";
import { ProgressBar } from "./ui";

/** Where the sale stands against its minimum, in words (board 04, "Barra de financiamiento"). */
function fundingState(c: Campaign, category: CategoryDef, now?: bigint): { text: string; icon: LucideIcon; cls: string; muted: boolean } | null {
  const missing = c.min_units - c.sold;
  const ended = now !== undefined && now >= c.sale_end;
  switch (c.status.tag) {
    case "Failed":
      return { text: "No llegó al mínimo · recuperas el 100%", icon: History, cls: "text-info", muted: true };
    case "Defaulted":
      return null; // the status pill says it; the bar only shows what was sold
    case "Funding":
      if (missing > 0 && ended) return { text: "No llegó al mínimo · recuperas el 100%", icon: History, cls: "text-info", muted: true };
      if (missing > 0) return { text: `Faltan ${formatQty(missing, category)} para el mínimo`, icon: Clock, cls: "text-ink-2", muted: false };
      if (c.sold >= c.max_units) return { text: "¡Completo! Ya no se aceptan reservas", icon: CircleCheck, cls: "text-success", muted: false };
      return { text: "Mínimo logrado", icon: CircleCheck, cls: "text-success", muted: false };
    default:
      return { text: "Mínimo logrado", icon: CircleCheck, cls: "text-success", muted: false };
  }
}

/**
 * Units sold against the supply cap, with the dark tick at the all-or-nothing minimum: a buyer sees
 * at a glance whether the pre-sale is going ahead or their money could come back. Pass `now` so a sale
 * that ended short of its minimum reads as such before anyone closes it.
 */
export function FundingBar({ c, category, size = "md", now }: { c: Campaign; category: CategoryDef; size?: "md" | "lg"; now?: bigint }) {
  const state = fundingState(c, category, now);
  const Icon = state?.icon;
  return (
    <div className="space-y-1.5">
      <ProgressBar
        value={c.sold}
        max={c.max_units}
        marker={c.min_units}
        size={size}
        tone={state?.muted ? "muted" : "brand"}
        label={`Reservado: ${formatQty(c.sold, category)} de ${formatNumber(c.max_units)}. Mínimo: ${formatQty(c.min_units, category)}.`}
      />
      <p className="t-detail flex flex-wrap justify-between gap-x-3 text-ink-2 tabular-nums">
        <span>
          {formatNumber(c.sold)} de {formatQty(c.max_units, category)}
        </span>
        <span>mín. {formatNumber(c.min_units)}</span>
      </p>
      {state && Icon && (
        <p className={`t-detail flex items-center gap-1 font-bold ${state.cls}`}>
          <Icon className="size-[15px] shrink-0" strokeWidth={2.2} aria-hidden />
          {state.text}
        </p>
      )}
    </div>
  );
}
