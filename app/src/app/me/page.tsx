"use client";

// Mis vales: every voucher the connected buyer holds, grouped by what needs doing.
// Buttons come from nextActions (buyer role), filtered per group.

import { Clock, Lock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { copy, type CategoryDef } from "@/catalog";
import { ActionList, unpaidAmount } from "@/components/ActionPanel";
import { TierBadge, type VoucherState } from "@/components/badges";
import { Money } from "@/components/Money";
import { VoucherQR } from "@/components/MyVouchers";
import { Dialog, EmptyState, Notice, Term, VoucherSkeleton } from "@/components/ui";
import { voucherCode, VoucherTicket } from "@/components/VoucherTicket";
import { YieldEarned } from "@/components/YieldEarned";
import { readOnlyProps, useWallet } from "@/components/Wallet";
import { nextActions, type Action, type ActionId } from "@/lib/actions";
import type { Campaign, Holding } from "@/lib/despensa";
import { formatDate, formatDuration, formatQty } from "@/lib/format";
import { useBuyerStats, useCampaignList, useHoldings, useNow, usePolling, useProducers, type CampaignItem } from "@/lib/hooks";

type GroupId = "confirm" | "pickup" | "presale" | "refund" | "received" | "refunded";

const GROUPS: { id: GroupId; title: string; hint: string; actions: ActionId[] }[] = [
  { id: "confirm", title: "Por confirmar", hint: "El productor dice que ya te entregó. Confirma o disputa dentro del plazo.", actions: ["confirm", "dispute", "finalize"] },
  { id: "pickup", title: "Por recibir", hint: "Muestra el QR de tu vale en la entrega.", actions: ["show_qr", "transfer", "settle"] },
  { id: "presale", title: "En preventa", hint: "Si no se llega al mínimo, recuperas el 100%.", actions: ["transfer", "close_sale"] },
  { id: "refund", title: "Reembolsos por cobrar", hint: "La campaña no siguió adelante: tu dinero está listo para volver.", actions: ["claim_refund"] },
  { id: "received", title: "Recibidos", hint: "Califica al productor: tu opinión queda en su reputación.", actions: ["rate"] },
  { id: "refunded", title: "Reembolsados", hint: "Ya recuperaste este dinero.", actions: ["rate"] },
];

interface Row {
  item: CampaignItem;
  h: Holding;
  units: number;
  actions: Action[];
}

function groupRows(items: CampaignItem[], holdings: Record<string, Holding>, now: bigint): Record<GroupId, Row[]> {
  const out: Record<GroupId, Row[]> = { confirm: [], pickup: [], presale: [], refund: [], received: [], refunded: [] };
  for (const item of items) {
    const h = holdings[item.c.id.toString()];
    if (!h) continue;
    const acts = nextActions(item.c, h, "buyer", now, { category: item.category });
    const pick = (g: GroupId) => acts.filter((a) => GROUPS.find((x) => x.id === g)!.actions.includes(a.id));
    const tag = item.c.status.tag;
    const owed = h.units + h.pending;
    if (tag === "Active" && h.pending > 0) out.confirm.push({ item, h, units: h.pending, actions: pick("confirm") });
    if (tag === "Active" && h.units > 0) out.pickup.push({ item, h, units: h.units, actions: pick("pickup") });
    if (tag === "Funding" && h.units > 0) out.presale.push({ item, h, units: h.units, actions: pick("presale") });
    if ((tag === "Failed" || tag === "Defaulted") && owed > 0) out.refund.push({ item, h, units: owed, actions: pick("refund") });
    if (h.delivered > 0) out.received.push({ item, h, units: h.delivered, actions: pick("received") });
    if (h.refunded > 0) out.refunded.push({ item, h, units: h.refunded, actions: h.delivered > 0 ? [] : pick("refunded") });
  }
  return out;
}

export default function MyVouchersPage() {
  const { address, enabled, connect } = useWallet();
  const list = useCampaignList();
  const ids = (list.data ?? []).map((i) => i.c.id);
  const holdings = useHoldings(address, ids);
  const stats = useBuyerStats(address);
  const now = useNow();
  // Live while something can change from the producer side (a delivery registered at the stall).
  const watching = (list.data ?? []).some((i) => {
    const h = holdings.data?.[i.c.id.toString()];
    return i.c.status.tag === "Active" && !!h && h.units + h.pending > 0;
  });
  usePolling(holdings.refresh, 8000, watching);
  const held = (list.data ?? []).filter((i) => {
    const h = holdings.data?.[i.c.id.toString()];
    return !!h && h.units + h.pending + h.delivered + h.refunded > 0;
  });
  const producers = useProducers(held.map((i) => i.c.seller));

  if (!address) {
    return (
      <EmptyState level={1} title="Tus vales aparecen aquí">
        <p className="mb-2">Entra para ver lo que reservaste, mostrar el QR en la entrega y confirmar lo que recibes.</p>
        {/* Read-only: the button stays, disabled, and points to the banner (as on /producer). */}
        <button className="btn btn-lg" onClick={connect} {...readOnlyProps(enabled)}>
          Entrar con Google
        </button>
      </EmptyState>
    );
  }

  const loading = !list.data || !holdings.data;
  const groups = list.data && holdings.data ? groupRows(list.data, holdings.data, now) : null;
  // What is still in the contract for the buyer: unpaid units after any advances, in live campaigns.
  const protectedAmount = (list.data ?? []).reduce((sum, i) => {
    const h = holdings.data?.[i.c.id.toString()];
    const live = i.c.status.tag === "Funding" || i.c.status.tag === "Active";
    return h && live ? sum + unpaidAmount(i.c, h.units + h.pending) : sum;
  }, BigInt(0));
  const empty = groups && Object.values(groups).every((g) => g.length === 0);
  // One primary action per screen: the first group with something to do gets it.
  const firstGroup = groups ? GROUPS.find((g) => groups[g.id].some((r) => r.actions.some((a) => a.tone === "primary" && !a.disabled)))?.id : undefined;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="h-page">
          Mis <Term k="vale">vales</Term>
        </h1>
        {groups && !empty && protectedAmount > 0n && (
          <p className="flex items-start gap-2 rounded-md bg-brand-soft px-3.5 py-3 text-ink">
            <Lock className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
            <span>
              Tienes <Money amount={protectedAmount} size="md" showBs={false} /> en custodia, esperando entregas.
              {stats.data && stats.data.campaigns_received > 0 && (
                <> Ya recibiste lo de {stats.data.campaigns_received} {stats.data.campaigns_received === 1 ? "preventa" : "preventas"} de productores locales.</>
              )}
            </span>
          </p>
        )}
      </header>

      {(list.error || holdings.error) && (
        <Notice
          tone="danger"
          title="No se pudo leer la red de Stellar"
          action={
            <button className="btn-secondary btn-sm" onClick={() => (list.error ? list.refresh() : holdings.refresh())}>
              Reintentar
            </button>
          }
        >
          {list.error ?? holdings.error}
        </Notice>
      )}

      {loading && !list.error && !holdings.error && (
        <div className="grid gap-3 md:grid-cols-2" aria-busy aria-label="Cargando tus vales">
          <VoucherSkeleton />
          <VoucherSkeleton />
        </div>
      )}

      {empty && (
        <EmptyState title="Todavía no tienes vales" action={{ href: "/", label: "Ver preventas" }}>
          Cuando reserves algo, aparece aquí con su fecha y lugar de entrega.
        </EmptyState>
      )}

      {groups &&
        GROUPS.filter((g) => groups[g.id].length > 0).map((g) => (
          <section key={g.id} className="space-y-3" aria-labelledby={`g-${g.id}`}>
            <div className="space-y-0.5">
              <h2 id={`g-${g.id}`} className="h-section">
                {g.title} <span className="font-sans text-base font-normal text-ink-2">({groups[g.id].length})</span>
              </h2>
              <p className="text-ink-2">{g.hint}</p>
            </div>
            <ul className="grid items-start gap-3 md:grid-cols-2">
              {groups[g.id].map((r, i) => (
                <VoucherRow
                  key={`${g.id}-${r.item.c.id}`}
                  group={g.id}
                  row={r}
                  address={address}
                  now={now}
                  disputeWindow={r.item.c.dispute_window}
                  tier={producers.data?.[r.item.c.seller]?.tier.tier}
                  primary={g.id === firstGroup && i === 0}
                />
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

const STATE: Record<GroupId, VoucherState> = {
  confirm: "confirm",
  pickup: "pickup",
  presale: "presale",
  refund: "refundDue",
  received: "received",
  refunded: "refunded",
};

/** One voucher as a ticket (board 04): what, from whom, where and when, the money still in the contract, the next step. */
function VoucherRow({
  group,
  row: { item, h, units, actions },
  address,
  now,
  disputeWindow,
  tier,
  primary,
}: {
  group: GroupId;
  row: Row;
  address: string;
  now: bigint;
  disputeWindow?: bigint;
  tier?: number;
  /** Only one voucher on the page gets the primary button. */
  primary: boolean;
}) {
  const { c, category, meta } = item;
  const [qr, setQr] = useState(false);
  const point = meta.meta.delivery?.points?.[0];
  const place = point ? [point.name, point.address].filter(Boolean).join(" · ") : undefined;
  const live = group === "pickup" || group === "presale" || group === "confirm";
  const when = live ? [point?.schedule, `entrega hasta el ${formatDate(c.delivery_deadline, { year: false })}`].filter(Boolean).join(" · ") : undefined;
  const state: VoucherState = group === "confirm" && h.disputed ? "disputed" : STATE[group];
  const shown = primary ? actions : actions.map((a) => (a.tone === "primary" ? { ...a, tone: "default" as const } : a));
  const name = meta.meta.producer.displayName?.trim();
  return (
    <li>
      <VoucherTicket
        state={state}
        code={group === "pickup" || group === "confirm" ? voucherCode(c.id, address) : undefined}
        category={category}
        heading={
          <Link href={`/campaign/${c.id.toString()}`} className="underline-offset-2 hover:underline">
            {formatQty(units, category)} · {c.title}
          </Link>
        }
        subheading={
          (name || tier !== undefined) && (
            <span className="inline-flex flex-wrap items-center gap-x-2">
              {name}
              {name && tier !== undefined && <span aria-hidden>·</span>}
              {tier !== undefined && <TierBadge tier={tier} />}
            </span>
          )
        }
        place={live ? place : undefined}
        when={when}
        waiting={live && !h.disputed ? unpaidAmount(c, units) : undefined}
        waitingNote={group === "presale" ? "Si no se llega al mínimo, vuelven a ti completos." : "Se liberan cuando confirmes."}
      >
        <RowDetail group={group} c={c} h={h} category={category} now={now} disputeWindow={disputeWindow} units={units} />
        <YieldEarned c={c} h={h} buyer={address} category={category} />
        <ActionList actions={shown} c={c} category={category} compact onLocal={(a) => a.id === "show_qr" && setQr(true)} />
      </VoucherTicket>
      {qr && (
        <Dialog open onClose={() => setQr(false)} title={`Mi ${copy(category, "voucherNoun")}`}>
          <div className="space-y-3">
            <p className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ink-2">{place ?? `${formatQty(h.units, category)} · ${c.title}`}</span>
              <span className="font-mono text-ink-2">
                <span className="sr-only">Código </span>
                {voucherCode(c.id, address)}
              </span>
            </p>
            <VoucherQR c={c} buyer={address} units={h.units} category={category} />
            <p className="flex items-center gap-2 rounded-md bg-brand-soft px-3 py-2.5 text-ink">
              <Lock className="size-[18px] shrink-0 text-brand" aria-hidden />
              <span>
                Tus <Money amount={unpaidAmount(c, h.units)} category={category} size="md" showBs={false} /> esperan en el contrato. Se liberan
                cuando confirmes.
              </span>
            </p>
          </div>
        </Dialog>
      )}
    </li>
  );
}

function RowDetail({
  group,
  c,
  h,
  category,
  now,
  disputeWindow,
  units,
}: {
  group: GroupId;
  c: Campaign;
  h: Holding;
  category: CategoryDef;
  now: bigint;
  disputeWindow?: bigint;
  units: number;
}) {
  if (group === "confirm" && disputeWindow !== undefined) {
    const end = h.pending_since + disputeWindow;
    if (h.disputed) return <p className="text-ink-2">El pago está congelado hasta que el verificador decida.</p>;
    return (
      <p className="inline-flex items-start gap-1.5 font-bold text-warning">
        <Clock className="mt-0.5 size-[18px] shrink-0" aria-hidden />
        {now < end ? `Te quedan ${formatDuration(Number(end - now))} para confirmar o disputar` : "Pasó el plazo de disputa"}
      </p>
    );
  }
  if (group === "refund") {
    return (
      <p className="text-ink-2">
        Te corresponden <Money amount={c.refund_per_unit * BigInt(units)} category={category} size="sm" showBs={false} /> de reembolso, más lo
        que ganó tu pago.
      </p>
    );
  }
  if (group === "received" && h.rated) return <p className="text-ink-2">Ya calificaste esta campaña.</p>;
  return null;
}
