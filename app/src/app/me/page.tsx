"use client";

// Mis vales: every voucher the connected buyer holds, grouped by what needs doing.
// Buttons come from nextActions (buyer role), filtered per group.

import { Clock, QrCode, Ticket } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { copy, type CategoryDef } from "@/catalog";
import { ActionList } from "@/components/ActionPanel";
import { StatusPill } from "@/components/badges";
import { CategoryTile } from "@/components/CategoryIcon";
import { Money } from "@/components/Money";
import { VoucherQR } from "@/components/MyVouchers";
import { Dialog, EmptyState, Notice, Skeleton, Term } from "@/components/ui";
import { useWallet } from "@/components/Wallet";
import { nextActions, type Action, type ActionId } from "@/lib/actions";
import type { Campaign, Holding } from "@/lib/despensa";
import { formatDuration, formatQty } from "@/lib/format";
import { useBuyerStats, useCampaignList, useHoldings, useNow, usePolling, type CampaignItem } from "@/lib/hooks";

type GroupId = "confirm" | "pickup" | "presale" | "refund" | "received" | "refunded";

const GROUPS: { id: GroupId; title: string; hint: string; actions: ActionId[] }[] = [
  { id: "confirm", title: "Por confirmar", hint: "El productor dice que ya te entregó. Confirma o disputa dentro del plazo.", actions: ["confirm", "dispute", "finalize"] },
  { id: "pickup", title: "Por recibir", hint: "Muestra el QR de tu vale en la entrega.", actions: ["show_qr", "transfer", "settle"] },
  { id: "presale", title: "En preventa", hint: "Si no se llega a la meta, recuperas el 100%.", actions: ["transfer", "close_sale"] },
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

  if (!address) {
    return (
      <EmptyState icon={<Ticket className="size-10" />} title="Tus vales aparecen aquí">
        <p className="mb-4">Entra para ver lo que compraste, mostrar el QR en la entrega y confirmar lo que recibes.</p>
        {enabled && (
          <button className="btn" onClick={connect}>
            Entrar con Google
          </button>
        )}
      </EmptyState>
    );
  }

  const loading = !list.data || !holdings.data;
  const groups = list.data && holdings.data ? groupRows(list.data, holdings.data, now) : null;
  const protectedAmount = (list.data ?? []).reduce((sum, i) => {
    const h = holdings.data?.[i.c.id.toString()];
    const live = i.c.status.tag === "Funding" || i.c.status.tag === "Active";
    return h && live ? sum + i.c.unit_price * BigInt(h.units + h.pending) : sum;
  }, BigInt(0));
  const empty = groups && Object.values(groups).every((g) => g.length === 0);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="h-page">
          Mis <Term k="vale">vales</Term>
        </h1>
        {groups && !empty && (
          <p className="text-ink-2">
            Tienes <Money amount={protectedAmount} size="md" showBs={false} className="text-ink" /> en custodia, esperando entregas.
            {stats.data && stats.data.campaigns_received > 0 && (
              <> Ya recibiste de {stats.data.campaigns_received} {stats.data.campaigns_received === 1 ? "productor" : "productores"} locales.</>
            )}
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
        <div className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      )}

      {empty && (
        <EmptyState icon={<Ticket className="size-10" />} title="Todavía no compraste ninguna preventa" action={{ href: "/", label: "Ver preventas" }}>
          Compra por adelantado a precio fijo. Tu dinero queda en custodia hasta que recibes tu pedido.
        </EmptyState>
      )}

      {groups &&
        GROUPS.filter((g) => groups[g.id].length > 0).map((g) => (
          <section key={g.id} className="space-y-3" aria-labelledby={`g-${g.id}`}>
            <div className="space-y-0.5">
              <h2 id={`g-${g.id}`} className="h-section">
                {g.title} <span className="font-sans text-base font-normal text-ink-2">({groups[g.id].length})</span>
              </h2>
              <p className="text-sm text-ink-2">{g.hint}</p>
            </div>
            <ul className="space-y-3">
              {groups[g.id].map((r) => (
                <VoucherRow key={`${g.id}-${r.item.c.id}`} group={g.id} row={r} address={address} now={now} disputeWindow={r.item.c.dispute_window} />
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

function VoucherRow({
  group,
  row: { item, h, units, actions },
  address,
  now,
  disputeWindow,
}: {
  group: GroupId;
  row: Row;
  address: string;
  now: bigint;
  disputeWindow?: bigint;
}) {
  const { c, category, meta } = item;
  const [qr, setQr] = useState(false);
  return (
    <li className="card grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 gap-3">
        <CategoryTile category={category} />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/campaign/${c.id.toString()}`} className="font-semibold underline underline-offset-2 hover:no-underline">
              {c.title}
            </Link>
            <StatusPill c={c} />
          </div>
          <p className="text-sm text-ink-2">
            <b className="text-ink">{formatQty(units, category)}</b>
            {meta.meta.producer.displayName && <> · {meta.meta.producer.displayName}</>}
          </p>
          <RowDetail group={group} c={c} h={h} category={category} now={now} disputeWindow={disputeWindow} units={units} />
        </div>
      </div>
      <div className="sm:w-64">
        <ActionList actions={actions} c={c} category={category} compact onLocal={(a) => a.id === "show_qr" && setQr(true)} />
      </div>
      {qr && (
        <Dialog open onClose={() => setQr(false)} title={`Mi ${copy(category, "voucherNoun")}`}>
          <VoucherQR c={c} buyer={address} units={h.units} category={category} />
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
    if (h.disputed) return <p className="text-sm text-danger">En disputa: el verificador decidirá.</p>;
    return (
      <p className="inline-flex items-center gap-1.5 text-sm font-medium text-warning">
        <Clock className="size-4" aria-hidden />
        {now < end ? `Te quedan ${formatDuration(Number(end - now))} para confirmar o disputar` : "Pasó el plazo de disputa"}
      </p>
    );
  }
  if (group === "pickup") {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-ink-2">
        <QrCode className="size-4" aria-hidden /> Muestra tu QR en la entrega
      </p>
    );
  }
  if (group === "refund") {
    return (
      <p className="text-sm text-ink-2">
        Te corresponden <Money amount={c.refund_per_unit * BigInt(units)} category={category} size="sm" showBs={false} />
      </p>
    );
  }
  if (group === "received" && h.rated) return <p className="text-sm text-ink-2">Ya calificaste esta campaña.</p>;
  return null;
}
