"use client";

// Opened by scanning the buyer's voucher QR with the producer's phone camera
// (/producer/deliver?campaign=<id>&buyer=<G…>&units=<n>). Big targets: used outdoors, at a market stall.

import { Gavel, LoaderCircle, PackageCheck, QrCode } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { copy } from "@/catalog";
import { Stepper } from "@/components/ActionPanel";
import { StatusPill } from "@/components/badges";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Money } from "@/components/Money";
import { EmptyState, MoneyStatus, Notice, Skeleton, Stat, TxSteps } from "@/components/ui";
import { useAction, useWallet } from "@/components/Wallet";
import { argsFor, nextActions, successMessage } from "@/lib/actions";
import { isValidAddress } from "@/lib/despensa";
import { formatDuration, formatQty, shortAddress } from "@/lib/format";
import { invalidateCampaign, useCampaignItem, useContractConfig, useHolding, useNow, usePolling } from "@/lib/hooks";

function Deliver() {
  const params = useSearchParams();
  const rawId = params.get("campaign") ?? "";
  const buyer = (params.get("buyer") ?? "").trim();
  const ok = /^\d+$/.test(rawId) && isValidAddress(buyer);
  const id = ok ? BigInt(rawId) : null;

  const { address, enabled, connect } = useWallet();
  const item = useCampaignItem(id);
  const holding = useHolding(id ?? BigInt(0), ok ? buyer : null);
  const cfg = useContractConfig();
  const now = useNow();
  const [units, setUnits] = useState(() => Math.max(1, Number(params.get("units")) || 1));
  const tx = useAction();
  // After registering a delivery, watch the buyer's holding until they confirm or dispute.
  const [watch, setWatch] = useState<{ delivered: number } | null>(null);
  const hw = holding.data;
  const settled = !!watch && !!hw && (hw.delivered > watch.delivered || hw.disputed || hw.pending === 0);
  usePolling(holding.refresh, 5000, !!watch && !settled);

  if (!ok) {
    return (
      <EmptyState icon={<QrCode className="size-10" />} title="Este código QR no es válido" action={{ href: "/producer", label: "Ir a mi panel" }}>
        Pide al comprador que vuelva a abrir su vale en Ayni y escanea el código otra vez.
      </EmptyState>
    );
  }
  if (item.error) return <EmptyState title="No encontramos la preventa">{item.error}</EmptyState>;
  if (!item.data || !holding.data) {
    return (
      <div className="mx-auto max-w-md space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  const { c, category } = item.data;
  const h = holding.data;
  const isSeller = address === c.seller;
  // Same rules as the campaign page: deliver while Active, collect once the dispute window passed.
  const acts = nextActions(c, null, "seller", now, {
    category,
    deliveries: h.pending > 0 ? [{ buyer, holding: h }] : [],
  });
  const deliver = acts.find((a) => a.id === "deliver");
  const collect = acts.find((a) => a.id === "finalize" && a.buyer === buyer);
  const max = h.units;
  const qty = Math.min(units, Math.max(1, max));
  const done = () => invalidateCampaign(c.id);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header className="space-y-2">
        <p className="inline-flex items-center gap-1.5 text-sm text-ink-2">
          <CategoryIcon category={category} className="size-4" /> {category.label}
        </p>
        <h1 className="h-page">
          {capitalize(copy(category, "deliveryVerb"))} a {shortAddress(buyer)}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          <Link href={`/campaign/${c.id.toString()}`} className="underline underline-offset-2 hover:no-underline">
            {c.title}
          </Link>
          <StatusPill c={c} />
        </div>
      </header>

      <section className="card space-y-5 p-5">
        <dl className="grid grid-cols-2 gap-4">
          <Stat size="lg" label="Por recibir" value={formatQty(h.units, category)} />
          <Stat size="lg" label={h.disputed ? "En disputa" : "Esperando confirmación"} value={formatQty(h.pending, category)} tone={h.disputed ? "danger" : undefined} />
        </dl>

        {!address ? (
          enabled ? (
            <button className="btn btn-lg w-full" onClick={connect}>
              Entrar como productor
            </button>
          ) : (
            <p className="text-sm text-ink-2">Para registrar la entrega hace falta iniciar sesión, que no está disponible en esta demo.</p>
          )
        ) : !isSeller ? (
          <Notice tone="danger">Solo el productor de esta preventa puede registrar la entrega.</Notice>
        ) : (
          <>
            {deliver && max > 0 ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">¿Cuánto entregas ahora?</p>
                <div className="flex items-center justify-between gap-3">
                  <Stepper value={qty} onChange={setUnits} step={1} max={max} />
                  <span className="text-sm text-ink-2">de {formatQty(max, category)}</span>
                </div>
                <button
                  className="btn btn-lg w-full"
                  disabled={tx.busy}
                  onClick={() => {
                    const base = { delivered: h.delivered };
                    tx.run("mark_delivered", argsFor(deliver, c.id, address, { address: buyer, units: qty }), () => {
                      setWatch(base);
                      done();
                    });
                  }}
                >
                  <PackageCheck className="size-5" aria-hidden /> Entregué {formatQty(qty, category)}
                </button>
                <p className="text-sm text-ink-2">
                  El comprador puede confirmar desde su teléfono y cobras al instante. Si no confirma ni disputa, cobras al terminar el plazo de
                  disputa.
                </p>
              </div>
            ) : (
              <p className="text-sm text-ink-2">
                {c.status.tag === "Active" ? "Este comprador no tiene más por recibir." : "Esta preventa no está en etapa de entrega."}
              </p>
            )}
            {collect && (
              <button
                className="btn-secondary w-full"
                disabled={tx.busy}
                onClick={() => tx.run("finalize_delivery", argsFor(collect, c.id, address), done)}
              >
                {collect.label}
              </button>
            )}
          </>
        )}
        {watch ? (
          <HandoffStatus
            watch={watch}
            h={h}
            category={category}
            unitPrice={c.unit_price}
            releasedBps={c.released_bps}
            feeBps={cfg.data?.fee_bps ?? 200}
            windowLeft={h.pending > 0 ? Number(h.pending_since + c.dispute_window - now) : null}
          />
        ) : (
          <TxSteps phase={tx.phase} error={tx.error} hash={tx.hash} success={deliver ? successMessage(deliver, category) : undefined} />
        )}
      </section>
    </div>
  );
}

/** What happened after "Entregué": waiting for the buyer, confirmed (paid), or disputed. */
function HandoffStatus({
  watch,
  h,
  category,
  unitPrice,
  releasedBps,
  feeBps,
  windowLeft,
}: {
  watch: { delivered: number };
  h: { delivered: number; pending: number; disputed: boolean };
  category: import("@/catalog").CategoryDef;
  unitPrice: bigint;
  releasedBps: number;
  feeBps: number;
  windowLeft: number | null;
}) {
  const confirmed = h.delivered - watch.delivered;
  if (confirmed > 0) {
    // Same arithmetic as the contract: the unpaid share of the price, minus the fee for the pool.
    const gross = (BigInt(confirmed) * unitPrice * BigInt(10_000 - releasedBps)) / BigInt(10_000);
    const net = gross - (gross * BigInt(feeBps)) / BigInt(10_000);
    return (
      <div className="space-y-2 rounded-lg bg-success-soft p-4" role="status" aria-live="polite">
        <MoneyStatus state="completed" label="Cobrado" />
        <p className="text-lg font-semibold">El comprador confirmó</p>
        <p className="text-sm text-ink-2">
          Recibió {formatQty(confirmed, category)}. Cobraste <Money amount={net} category={category} size="sm" />.
        </p>
      </div>
    );
  }
  if (h.disputed) {
    return (
      <div className="space-y-2 rounded-lg bg-danger-soft p-4" role="status" aria-live="polite">
        <p className="flex items-center gap-2 font-semibold text-danger">
          <Gavel className="size-5" aria-hidden /> El comprador abrió una disputa
        </p>
        <p className="text-sm text-ink-2">El pago queda congelado hasta que el verificador decida.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-lg bg-info-soft p-4" role="status" aria-live="polite">
      <MoneyStatus state="pending" label="Pago pendiente" />
      <p className="flex items-center gap-2 font-semibold">
        <LoaderCircle className="size-5 animate-spin text-brand" aria-hidden /> Esperando que el comprador confirme…
      </p>
      <p className="text-sm text-ink-2">
        Le aparece en su teléfono ahora mismo.
        {windowLeft !== null && windowLeft > 0 && <> Si no confirma ni disputa, cobras solo en {formatDuration(windowLeft)}.</>}
      </p>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function DeliverPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-64 max-w-md rounded-lg" />}>
      <Deliver />
    </Suspense>
  );
}
