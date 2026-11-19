import { CalendarDays, Lock, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import type { CategoryDef } from "@/catalog";
import { CategoryTile } from "./CategoryIcon";
import { VoucherPill, type VoucherState } from "./badges";
import { Money } from "./Money";

/**
 * A short code both phones show at the hand-off, so buyer and producer can see they're looking at the
 * same voucher. It isn't stored anywhere: it is derived from the campaign id and the end of the buyer's
 * address, so the delivery screen (opened from the QR) shows the same one. Not a secret; the QR is
 * what the producer scans.
 */
export function voucherCode(campaignId: bigint | number | string, buyer: string): string {
  return `AYN-${campaignId.toString()}-${buyer.slice(-4).toUpperCase()}`;
}

/**
 * A voucher as a ticket (board 04, "Vale con QR"): what it's for, where and when, a perforation, then
 * where the money is and the next step. The voucher always says where your money is.
 */
export function VoucherTicket({
  state,
  code,
  category,
  heading,
  subheading,
  place,
  when,
  waiting,
  waitingNote = "Se liberan cuando confirmes.",
  notch = "bg-bg",
  children,
}: {
  state: VoucherState;
  code?: string;
  category: CategoryDef;
  /** "10 litros · Leche fresca entera" */
  heading: ReactNode;
  /** Producer and tier. */
  subheading?: ReactNode;
  /** Pickup point, from the campaign's metadata; omitted when the producer didn't give one. */
  place?: string;
  when?: string;
  /** Money still in the contract for these units (after any advances). */
  waiting?: bigint;
  waitingNote?: string;
  /** The background behind the ticket, for the two notches of the perforation. */
  notch?: string;
  /** The bottom half: the QR, or the next action. */
  children?: ReactNode;
}) {
  return (
    <article className="card overflow-visible">
      <div className="flex flex-col gap-2.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <VoucherPill state={state} />
          {code && (
            <span className="font-mono text-[0.8125rem] text-ink-2">
              <span className="sr-only">Código </span>
              {code}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <CategoryTile category={category} />
          <div className="min-w-0">
            <h3 className="t-subtitle">{heading}</h3>
            {subheading && <div className="mt-0.5 text-sm text-ink-2">{subheading}</div>}
          </div>
        </div>
        {place && (
          <p className="flex items-center gap-1.5 text-[0.9375rem]">
            <MapPin className="size-[17px] shrink-0 text-ink-2" aria-hidden />
            {place}
          </p>
        )}
        {when && (
          <p className="flex items-center gap-1.5 text-[0.9375rem]">
            <CalendarDays className="size-[17px] shrink-0 text-ink-2" aria-hidden />
            {when}
          </p>
        )}
      </div>
      {(waiting !== undefined || children) && (
        <>
          <div className="relative border-t-2 border-dashed border-line" aria-hidden>
            <span className={`absolute -top-3 -left-3 size-6 rounded-full border border-line ${notch}`} />
            <span className={`absolute -top-3 -right-3 size-6 rounded-full border border-line ${notch}`} />
          </div>
          <div className="flex flex-col items-stretch gap-2.5 p-4">
            {children}
            {waiting !== undefined && waiting > 0n && (
              <p className="flex items-center gap-2 rounded-md bg-brand-soft px-3 py-2.5 text-ink">
                <Lock className="size-[18px] shrink-0 text-brand" aria-hidden />
                <span>
                  Tus <Money amount={waiting} category={category} size="md" showBs={false} /> esperan en el contrato. {waitingNote}
                </span>
              </p>
            )}
          </div>
        </>
      )}
    </article>
  );
}
