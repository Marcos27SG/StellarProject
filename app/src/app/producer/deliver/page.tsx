"use client";

// Opened by scanning the buyer's voucher QR with the producer's phone camera
// (/producer/deliver?campaign=<id>&buyer=<G…>&units=<n>). Big targets: used outdoors, at a market stall.

import { CircleCheck, PackageCheck, QrCode } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { copy } from "@/catalog";
import { Stepper } from "@/components/ActionPanel";
import { StatusPill } from "@/components/badges";
import { CategoryIcon } from "@/components/CategoryIcon";
import { BUSY_LABEL, EmptyState, Notice, Skeleton, Spinner, Stat, TxSteps } from "@/components/ui";
import { voucherCode } from "@/components/VoucherTicket";
import { HandoffStatus } from "@/components/Handoff";
import { useAction, useWallet } from "@/components/Wallet";
import { argsFor, nextActions, successMessage } from "@/lib/actions";
import { isValidAddress } from "@/lib/despensa";
import { formatQty, shortAddress } from "@/lib/format";
import { KNOWN_VERIFIERS } from "@/lib/verifiers";
import { invalidateCampaign, useCampaignItem, useHolding, useNow, usePolling, useSellerYield } from "@/lib/hooks";

function Deliver() {
  const params = useSearchParams();
  const rawId = params.get("campaign") ?? "";
  const buyer = (params.get("buyer") ?? "").trim();
  const ok = /^\d+$/.test(rawId) && isValidAddress(buyer);
  const id = ok ? BigInt(rawId) : null;

  const { address, enabled, connect } = useWallet();
  const item = useCampaignItem(id);
  const holding = useHolding(id ?? BigInt(0), ok ? buyer : null);
  const now = useNow();
  const [units, setUnits] = useState(() => Math.max(1, Number(params.get("units")) || 1));
  const tx = useAction();
  // After registering a delivery, watch the buyer's holding until they confirm or dispute.
  const [watch, setWatch] = useState<{ delivered: number } | null>(null);
  const hw = holding.data;
  const settled = !!watch && !!hw && (hw.delivered > watch.delivered || hw.disputed || hw.pending === 0);
  usePolling(holding.refresh, 5000, !!watch && !settled);
  const confirmedNow = !!watch && !!hw && hw.delivered > watch.delivered;
  const sellerYield = useSellerYield(item.data?.c, confirmedNow, hw?.delivered ?? 0);
  // Back on this page with a delivery still waiting (a reload at the stall, or coming back later):
  // keep watching, so "Cobraste" still appears when the buyer confirms.
  useEffect(() => {
    if (!watch && hw && hw.pending > 0) setWatch({ delivered: hw.delivered });
  }, [watch, hw]);

  if (!ok) {
    return (
      <EmptyState level={1} icon={<QrCode className="size-10" />} title="Este código QR no es válido" action={{ href: "/producer", label: "Ir a mi panel" }}>
        Pide al comprador que vuelva a abrir su vale en Ayni y escanea el código otra vez.
      </EmptyState>
    );
  }
  if (item.error) return <EmptyState level={1} title="No encontramos la preventa">{item.error}</EmptyState>;
  if (!item.data || !holding.data) {
    return (
      <div className="mx-auto max-w-md space-y-4" aria-busy aria-label="Cargando la entrega">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-9 w-40 rounded-full" />
        <div className="card space-y-4 p-5">
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
          <Skeleton className="h-13 w-full rounded-md" />
          <Skeleton className="h-13 w-full rounded-md" />
        </div>
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
        <p className="inline-flex items-center gap-1.5 text-ink-2">
          <CategoryIcon category={category} className="size-5" /> {category.label}
        </p>
        <h1 className="h-page">
          {capitalize(copy(category, "deliveryVerb"))} a {shortAddress(buyer)}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-ink-2">
          <Link href={`/campaign/${c.id.toString()}`} className="underline underline-offset-2 hover:no-underline">
            {c.title}
          </Link>
          <StatusPill c={c} />
        </div>
        {/* The same code the buyer's voucher shows: both phones can see they match. */}
        <p className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3.5 py-1.5">
          <span className="t-label text-ink-2">Código del vale</span>
          <span className="font-mono text-lg font-bold">{voucherCode(c.id, buyer)}</span>
        </p>
      </header>

      <section className="card space-y-5 p-5">
        <dl className="grid grid-cols-2 gap-4">
          <Stat size="lg" label="Por recibir" value={formatQty(h.units, category)} />
          <Stat size="lg" label={h.disputed ? "En disputa" : "Esperando confirmación"} value={formatQty(h.pending, category)} tone={h.disputed ? "danger" : undefined} />
        </dl>
        {/* Opened after the hand-off (nothing waiting): say how it ended instead of two zeros. */}
        {!watch && h.delivered > 0 && h.pending === 0 && (
          <p className="flex items-start gap-2 rounded-md bg-success-soft px-3.5 py-3 font-bold text-success">
            <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
            El comprador ya recibió {formatQty(h.delivered, category)} y el pago se liberó al productor.
          </p>
        )}

        {!address ? (
          enabled ? (
            <button className="btn btn-lg w-full" onClick={connect}>
              Entrar como productor
            </button>
          ) : (
            <p className="text-ink-2">Para registrar la entrega hace falta iniciar sesión, que no está disponible en esta demo.</p>
          )
        ) : !isSeller ? (
          <Notice tone="danger">Solo el productor de esta preventa puede registrar la entrega.</Notice>
        ) : (
          <>
            {deliver && max > 0 ? (
              <div className="space-y-3">
                <p id="deliver-qty" className="text-[0.9375rem] font-bold">
                  ¿Cuánto entregas ahora?
                </p>
                <div role="group" aria-labelledby="deliver-qty" className="space-y-1.5">
                  <Stepper value={qty} onChange={setUnits} step={1} max={max} unit={qty === 1 ? category.unit.singular : category.unit.plural} />
                  <p className="t-detail text-ink-2">de {formatQty(max, category)} por recibir</p>
                </div>
                <button
                  className="btn btn-lg w-full"
                  disabled={tx.busy}
                  aria-busy={tx.busy}
                  onClick={() => {
                    const base = { delivered: h.delivered };
                    tx.run("mark_delivered", argsFor(deliver, c.id, address, { address: buyer, units: qty }), () => {
                      setWatch(base);
                      done();
                    });
                  }}
                >
                  {tx.busy ? (
                    <>
                      <Spinner /> {BUSY_LABEL[tx.phase]}
                    </>
                  ) : (
                    <>
                      <PackageCheck className="size-5" aria-hidden /> Entregué {formatQty(qty, category)}
                    </>
                  )}
                </button>
                <p className="text-ink-2">
                  El comprador puede confirmar desde su teléfono y cobras al instante. Si no confirma ni disputa, cobras al terminar el plazo de
                  disputa.
                </p>
              </div>
            ) : (
              <p className="text-ink-2">
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
            sellerYield={sellerYield.loading ? undefined : (sellerYield.data ?? null)}
            verifier={KNOWN_VERIFIERS.find((v) => v.address === c.verifier)?.name ?? "el verificador"}
            windowLeft={h.pending > 0 ? Number(h.pending_since + c.dispute_window - now) : null}
          />
        ) : (
          <TxSteps phase={tx.phase} error={tx.error} hash={tx.hash} failedAt={tx.failedAt} success={deliver ? successMessage(deliver, category) : undefined} />
        )}
      </section>
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
