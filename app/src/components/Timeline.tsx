import { Check, CircleDot, RotateCcw, TriangleAlert } from "lucide-react";
import { copy, type CategoryDef } from "@/catalog";
import type { Campaign } from "@/lib/despensa";
import { formatDate } from "@/lib/format";

type StepState = "done" | "current" | "todo" | "failed" | "defaulted";

interface Step {
  label: string;
  detail: string;
  state: StepState;
}

function steps(c: Campaign, category: CategoryDef): Step[] {
  const delivery = copy(category, "productionStage");
  const sale = { label: "Preventa", detail: `Hasta el ${formatDate(c.sale_end)}` };
  const prod = { label: delivery, detail: `Fecha límite: ${formatDate(c.delivery_deadline)}` };
  const done = { label: "Cumplida", detail: "Todo entregado y pagado" };
  switch (c.status.tag) {
    case "Funding":
      return [{ ...sale, state: "current" }, { ...prod, state: "todo" }, { ...done, state: "todo" }];
    case "Active":
      return [{ ...sale, state: "done" }, { ...prod, state: "current" }, { ...done, state: "todo" }];
    case "Completed":
      return [{ ...sale, state: "done" }, { ...prod, state: "done" }, { ...done, state: "done" }];
    case "Failed":
      return [
        { ...sale, state: "done" },
        { label: "No llegó a la meta", detail: "Todos recuperan el 100%", state: "failed" },
      ];
    case "Defaulted":
      return [
        { ...sale, state: "done" },
        { ...prod, state: "done" },
        { label: "Incumplida", detail: "Reembolsos desde la custodia, el aval y el fondo", state: "defaulted" },
      ];
  }
}

const DOT: Record<StepState, string> = {
  done: "bg-brand text-brand-ink",
  current: "bg-surface text-brand ring-2 ring-brand",
  todo: "bg-surface-2 text-ink-3",
  failed: "bg-surface-2 text-ink-2",
  defaulted: "bg-danger-soft text-danger",
};

const STATE_SR: Record<StepState, string> = {
  done: "hecho",
  current: "etapa actual",
  todo: "pendiente",
  failed: "terminó sin llegar a la meta",
  defaulted: "incumplida",
};

/** Preventa → Producción → Cumplida, with Failed and Defaulted as explicit alternate endings. */
export function Timeline({ c, category }: { c: Campaign; category: CategoryDef }) {
  const list = steps(c, category);
  return (
    <ol className="grid gap-4 sm:grid-flow-col sm:auto-cols-fr">
      {list.map((s, i) => (
        <li key={s.label} className="relative flex gap-3 sm:flex-col sm:gap-2">
          {i < list.length - 1 && (
            <span
              className={`absolute top-9 left-4 h-[calc(100%-1.25rem)] w-0.5 sm:top-4 sm:left-9 sm:h-0.5 sm:w-[calc(100%-1.5rem)] ${
                s.state === "done" ? "bg-brand" : "bg-line"
              }`}
              aria-hidden
            />
          )}
          <span className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ${DOT[s.state]}`}>
            {s.state === "done" ? (
              <Check className="size-4" aria-hidden />
            ) : s.state === "failed" ? (
              <RotateCcw className="size-4" aria-hidden />
            ) : s.state === "defaulted" ? (
              <TriangleAlert className="size-4" aria-hidden />
            ) : (
              <CircleDot className="size-4" aria-hidden />
            )}
          </span>
          <div>
            <p className={`text-sm font-semibold ${s.state === "todo" ? "text-ink-2" : "text-ink"}`}>
              {s.label}
              <span className="sr-only"> ({STATE_SR[s.state]})</span>
            </p>
            <p className="text-sm text-ink-2">{s.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
