"use client";

import { Sprout, TriangleAlert } from "lucide-react";
import type { CategoryDef } from "@/catalog";
import { config } from "@/lib/config";
import type { Campaign, Holding } from "@/lib/despensa";
import { formatMoney } from "@/lib/format";
import { useHoldingYield } from "@/lib/hooks";
import { Money } from "./Money";
import { Term } from "./ui";

/** Below half a cent the two-decimal format would print 0,00, which reads as "nothing". */
const HALF_CENT = BigInt(50_000);

/**
 * "Tu pago ganó $us X mientras espera": yield already paid to this buyer in the campaign plus their
 * share of what their vouchers have earned so far (`holding_yield`). Money earned, never a projected
 * rate. A loss in the lending pool is said plainly. Renders nothing until there is something to say.
 */
export function YieldEarned({ c, h, buyer, category }: { c: Campaign; h: Holding; buyer: string; category: CategoryDef }) {
  const q = useHoldingYield(c.id, buyer);
  const zero = BigInt(0);
  if (q.data === undefined) return null;
  const accrued = q.data;
  const earned = h.yield_paid + (accrued > zero ? accrued : zero);
  const test = config.network === "testnet";

  if (accrued < zero) {
    return (
      <p className="flex items-start gap-2 text-warning">
        <TriangleAlert className="mt-0.5 size-[18px] shrink-0" aria-hidden />
        <span>
          El servicio de préstamos perdió <Money amount={-accrued} category={category} size="sm" showBs={false} /> de tu pago. La pérdida se
          reparte en la misma proporción entre todos y queda registrada.
        </span>
      </p>
    );
  }
  if (earned <= zero) return null;

  const live = c.status.tag === "Funding" || c.status.tag === "Active";
  return (
    <p className="flex items-start gap-2 text-ink">
      <Sprout className="mt-0.5 size-[18px] shrink-0 text-brand" aria-hidden />
      <span>
        Tu pago ganó{" "}
        {earned < HALF_CENT ? (
          <b>menos de {formatMoney(BigInt(100_000))}</b>
        ) : (
          <Money amount={earned} category={category} size="sm" showBs={false} />
        )}{" "}
        {live ? "mientras espera" : "mientras esperaba"}
        {test && (
          <>
            {" "}
            (<Term k="rendimiento">rendimiento de prueba</Term>)
          </>
        )}
        .{live && accrued > zero && " Es tu parte: la recibes cuando confirmas."}
      </span>
    </p>
  );
}
