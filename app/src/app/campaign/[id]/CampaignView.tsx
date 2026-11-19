"use client";

import { ArrowLeft, Check, ChevronDown, Clock, Eye, FileText, MapPin, MessageCircle, Printer } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ActionList } from "@/components/ActionPanel";
import { ProducerLine, StatusPill } from "@/components/badges";
import { BuyPanel } from "@/components/BuyPanel";
import { CategoryIcon } from "@/components/CategoryIcon";
import { FundingBar } from "@/components/FundingBar";
import { Money, Qty } from "@/components/Money";
import { MyVouchers } from "@/components/MyVouchers";
import { ProtectionExplainer } from "@/components/ProtectionExplainer";
import { ShareButton } from "@/components/ShareButton";
import { Timeline } from "@/components/Timeline";
import { EmptyState, ExplorerLink, Notice, Skeleton, Stat, Term } from "@/components/ui";
import { useWallet } from "@/components/Wallet";
import type { CategoryDef } from "@/catalog";
import { actionsForRoles, deriveRoles, type Action } from "@/lib/actions";
import { config } from "@/lib/config";
import type { Campaign, ContractConfig } from "@/lib/despensa";
import { decimalsFor, formatMoney, formatPct, safeHref, shortAddress, whatsappHref } from "@/lib/format";
import { useBond, useCampaignItem, useContractConfig, useHolding, useNow, usePendingDeliveries, usePolling } from "@/lib/hooks";
import { formatAttribute, type CampaignMetadata } from "@/lib/metadata";

/** What the guarantee pool can put toward one default: the contract caps it at a share of the pool. */
function poolShare(cfg: ContractConfig | undefined): bigint | undefined {
  return cfg ? (cfg.pool * BigInt(cfg.pool_cap_bps)) / BigInt(10_000) : undefined;
}

export default function CampaignView({ id }: { id: string }) {
  const valid = /^\d+$/.test(id);
  const campaignId = valid ? BigInt(id) : null;
  const { address } = useWallet();
  const item = useCampaignItem(campaignId);
  const cfg = useContractConfig();
  const holding = useHolding(campaignId ?? BigInt(0), campaignId === null ? null : address);
  const bond = useBond(campaignId ?? BigInt(0), campaignId === null ? null : address);
  const now = useNow();
  const c = item.data?.c;
  const roles = c ? deriveRoles(c, address, bond.data ?? BigInt(0)) : [];
  const pending = usePendingDeliveries(c, roles.includes("seller") || roles.includes("verifier"));
  // While the buyer holds vouchers in a live campaign, watch for the producer registering a
  // delivery on their phone, so "Confirmar" shows up without reloading.
  const h0 = holding.data;
  usePolling(holding.refresh, 6000, c?.status.tag === "Active" && !!h0 && h0.units + h0.pending > 0);

  if (!valid || item.error) {
    return (
      <EmptyState level={1} title="No encontramos esta preventa" action={{ href: "/", label: "Ver preventas" }}>
        {item.error ?? "El enlace no es válido."}
      </EmptyState>
    );
  }
  if (!item.data || !c) return <CampaignSkeleton />;

  const { meta, category } = item.data;
  const h = holding.data ?? null;
  const acts = actionsForRoles(c, h, roles, now, { bond: bond.data, category, deliveries: pending.data });
  const buy = acts.buyer.find((a) => a.id === "buy");
  const buyerRest = acts.buyer.filter((a) => a.id !== "buy");
  const hasHolding = !!h && h.units + h.pending + h.delivered + h.refunded > 0;
  const vouchers = address && h && hasHolding && (
    <MyVouchers c={c} h={h} buyer={address} category={category} actions={buyerRest} now={now} disputeWindow={c.dispute_window} meta={meta.meta} />
  );

  return (
    <div className="space-y-6">
      <Link href="/" className="btn-ghost -ml-3">
        <ArrowLeft className="size-5" aria-hidden /> Inicio
      </Link>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-10">
          <header className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <CategoryIcon category={category} className="size-4" />
                {category.label}
              </span>
              <StatusPill c={c} />
            </div>
            <h1 className="h-page">{c.title}</h1>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ProducerLine seller={c.seller} displayName={meta.meta.producer.displayName} linkProfile detail />
              <ShareButton
                variant="ghost"
                className="-mr-3"
                path={`/campaign/${c.id.toString()}`}
                title={c.title}
                text={`${c.title}: ${formatMoney(c.unit_price, decimalsFor(category))} por ${category.unit.singular}, precio bloqueado. Tu pago queda protegido en Stellar hasta que recibes.`}
              />
            </div>
          </header>

          {vouchers && <div className="lg:hidden">{vouchers}</div>}
          <div className="lg:hidden">
            <BuyPanel c={c} category={category} buy={buy} />
          </div>

          <Gallery meta={meta.meta} />

          {meta.degraded && <Notice tone="neutral">Los detalles del producto no están disponibles: se muestran solo los datos guardados en el contrato.</Notice>}

          <Details meta={meta.meta} category={category} />

          <section aria-labelledby="progress" className="space-y-5">
            <h2 id="progress" className="h-section">
              Avance
            </h2>
            <FundingBar c={c} category={category} size="lg" now={now} />
            <Timeline c={c} category={category} />
          </section>

          {c.milestones.length > 0 && <Milestones c={c} category={category} />}

          <ProtectionExplainer c={c} category={category} pool={poolShare(cfg.data)} disputeWindow={c.dispute_window} />

          {roles.includes("seller") && (
            <RolePanel title="Tu campaña" subtitle="Eres el productor de esta preventa.">
              <SellerSummary c={c} category={category} pendingLoading={pending.loading} />
              <ActionList actions={acts.seller} c={c} category={category} />
              <Link href={`/campaign/${c.id.toString()}/cartel`} className="btn-ghost -ml-3">
                <Printer className="size-4" aria-hidden /> Imprimir un cartel con QR para tu puesto
              </Link>
            </RolePanel>
          )}

          {roles.includes("verifier") && (
            <RolePanel title="Verificación" subtitle={`Revisas la evidencia y decides las disputas como ${category.verifierLabel.toLowerCase()}.`}>
              {pending.loading && <p className="text-ink-2">Buscando entregas pendientes y disputas…</p>}
              {acts.verifier.length > 0 ? (
                <ActionList actions={acts.verifier} c={c} category={category} />
              ) : (
                <p className="text-ink-2">Nada que revisar por ahora.</p>
              )}
            </RolePanel>
          )}

          {roles.includes("guarantor") && acts.guarantor.length > 0 && (
            <RolePanel
              title={c.status.tag === "Funding" ? "¿Confías en este productor? Aválalo" : "Tu aval"}
              subtitle={
                <>
                  Cualquiera puede dejar un <Term k="aval">aval</Term>: una cooperativa, la familia, otros productores. Si el productor cumple, lo
                  recuperas entero; si no, se usa para reembolsar.
                  {bond.data !== undefined && bond.data > BigInt(0) && (
                    <>
                      {" "}
                      Tu aval: <Money amount={bond.data} category={category} size="sm" />.
                    </>
                  )}
                </>
              }
            >
              <ActionList actions={acts.guarantor} c={c} category={category} />
            </RolePanel>
          )}

          <OnChain c={c} category={category} />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div className="hidden space-y-6 lg:block">
            <BuyPanel c={c} category={category} buy={buy} bar={false} />
            {vouchers}
          </div>
          {!hasHolding && buyerRest.length > 0 && <OpenActions actions={buyerRest} c={c} category={category} />}
        </aside>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ sections

/** Photos when the producer added them. No placeholder box: the category icon is already in the header. */
function Gallery({ meta }: { meta: CampaignMetadata }) {
  const images = meta.images.map(safeHref).filter((u): u is string => !!u);
  if (images.length === 0) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={images[0]} alt={meta.description.slice(0, 80) || "Foto del producto"} className="h-56 w-full rounded-lg object-cover sm:h-72" />
      {images.length > 1 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-1 sm:grid-rows-2">
          {images.slice(1, 3).map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" className="h-24 w-full rounded-lg object-cover sm:h-full" loading="lazy" />
          ))}
        </div>
      )}
    </div>
  );
}

function Details({ meta, category }: { meta: CampaignMetadata; category: CategoryDef }) {
  const attrs = category.attributes.filter((f) => meta.attributes[f.key] !== undefined && meta.attributes[f.key] !== "");
  const points = meta.delivery?.points ?? [];
  const docs = (meta.documents ?? []).map((d) => ({ ...d, href: safeHref(d.url) })).filter((d) => d.href);
  const wa = whatsappHref(meta.producer.whatsapp);
  if (!meta.description && attrs.length === 0 && points.length === 0 && docs.length === 0) return null;

  return (
    <section aria-labelledby="details" className="space-y-6">
      <h2 id="details" className="sr-only">
        Detalles
      </h2>
      {meta.description && <p className="max-w-prose text-base leading-relaxed whitespace-pre-line text-ink">{meta.description}</p>}

      {attrs.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          {attrs.map((f) => {
            const v = meta.attributes[f.key];
            const href = f.type === "url" ? safeHref(String(v)) : null;
            return (
              <Stat
                key={f.key}
                label={f.label}
                value={
                  f.type === "url" ? (
                    href ? (
                      <a href={href} target="_blank" rel="noreferrer" className="link">
                        Ver documento
                      </a>
                    ) : (
                      "—"
                    )
                  ) : (
                    formatAttribute(f, v)
                  )
                }
              />
            );
          })}
        </dl>
      )}

      {points.length > 0 && (
        <div className="space-y-2">
          <h3 className="h-sub">Dónde se entrega</h3>
          <ul className="space-y-2">
            {points.map((p) => (
              <li key={p.name} className="flex gap-2">
                <MapPin className="mt-1 size-[18px] shrink-0 text-ink-2" aria-hidden />
                <span>
                  <b className="font-bold">{p.name}</b>
                  {p.address && <span className="text-ink-2"> · {p.address}</span>}
                  {p.schedule && <span className="block text-ink-2">{p.schedule}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(docs.length > 0 || wa) && (
        <div className="flex flex-wrap gap-2">
          {docs.map((d) => (
            <a key={d.href} href={d.href!} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
              <FileText className="size-4" aria-hidden /> {d.label}
            </a>
          ))}
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
              <MessageCircle className="size-4" aria-hidden /> Escribir por WhatsApp
            </a>
          )}
        </div>
      )}
    </section>
  );
}

function Milestones({ c, category }: { c: Campaign; category: CategoryDef }) {
  return (
    <section aria-labelledby="milestones" className="space-y-4">
      <div className="space-y-1">
        <h2 id="milestones" className="h-section">
          <Term k="hito">Hitos</Term> con adelanto
        </h2>
        <p className="text-ink-2">
          Cada adelanto se paga solo si el verificador aprueba la evidencia. Aprobado hasta ahora: {formatPct(c.released_bps)}.
        </p>
      </div>
      <ol className="divide-y divide-line">
        {c.milestones.map((m, i) => {
          const href = safeHref(m.evidence);
          const state = m.released ? "released" : m.evidence ? "review" : "todo";
          return (
            <li key={i} className="flex items-start gap-3 py-3">
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  state === "released" ? "bg-brand text-brand-ink" : state === "review" ? "bg-info-soft text-info" : "bg-surface-2 text-ink-2"
                }`}
              >
                {state === "released" ? <Check className="size-4" aria-hidden /> : state === "review" ? <Clock className="size-4" aria-hidden /> : i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-bold">
                  {m.title} <span className="font-normal text-ink-2">· {formatPct(m.bps)}</span>
                </p>
                <p className="text-ink-2">
                  {state === "released"
                    ? "Aprobado: adelanto pagado."
                    : state === "review"
                      ? "Evidencia enviada, en revisión."
                      : category.milestoneTemplates.find((t) => t.title === m.title)?.evidenceHint ?? "Pendiente de evidencia."}
                </p>
                {href && (
                  <a href={href} target="_blank" rel="noreferrer" className="link">
                    Ver evidencia
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The raw on-chain numbers, for whoever wants to check them. Collapsed: buyers don't need them to decide. */
function OnChain({ c, category }: { c: Campaign; category: CategoryDef }) {
  return (
    <details className="group border-t border-line pt-6">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2">
        <span>
          <span className="h-sub flex items-center gap-1.5">
            <Eye className="size-5 text-brand" aria-hidden /> Ver la prueba: los datos en Stellar
          </span>
          <span className="t-detail text-ink-2">Se leen en vivo del contrato. Nadie puede editarlos.</span>
        </span>
        <ChevronDown className="size-5 shrink-0 text-ink-2 transition group-open:rotate-180" aria-hidden />
      </summary>
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Stat label="En custodia" value={<Money amount={c.escrow} category={category} size="sm" showBs={false} />} />
        <Stat
          label="Aval total"
          value={<Money amount={c.bond_total} category={category} size="sm" showBs={false} />}
          hint={c.bond_slashed > BigInt(0) ? <>Usado en reembolsos: <Money amount={c.bond_slashed} category={category} size="sm" showBs={false} /></> : undefined}
        />
        <Stat label="Adelantado al productor" value={<Money amount={c.advanced} category={category} size="sm" showBs={false} />} />
        <Stat label="Entregado" value={<><Qty n={c.delivered} category={category} /> de {c.sold}</>} />
        <Stat label="Por confirmar" value={<Qty n={c.pending} category={category} />} />
        <Stat label="Reembolsado" value={<Qty n={c.refunded} category={category} />} />
      </dl>
      <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1">
        <ExplorerLink path={`contract/${config.contractId}`}>Contrato {shortAddress(config.contractId)}</ExplorerLink>
        <ExplorerLink path={`account/${c.seller}`}>Productor {shortAddress(c.seller)}</ExplorerLink>
        <ExplorerLink path={`account/${c.verifier}`}>
          {category.verifierLabel} {shortAddress(c.verifier)}
        </ExplorerLink>
      </p>
    </details>
  );
}

function SellerSummary({ c, category, pendingLoading }: { c: Campaign; category: CategoryDef; pendingLoading: boolean }) {
  if (c.status.tag !== "Active") return null;
  return (
    <div className="space-y-1 text-ink-2">
      <p>
        Entregado: <b className="text-ink"><Qty n={c.delivered} category={category} /></b> de {c.sold}
        {c.pending > 0 && (
          <>
            {" "}
            · esperando confirmación: <b className="text-ink"><Qty n={c.pending} category={category} /></b>
          </>
        )}
      </p>
      <p>Para entregar, escanea con la cámara del teléfono el QR del comprador: se abre la entrega ya llenada.</p>
      {pendingLoading && <p>Buscando entregas listas para cobrar…</p>}
    </div>
  );
}

function RolePanel({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <section className="card space-y-4 p-5">
      <div className="space-y-1">
        <h2 className="h-section">{title}</h2>
        {subtitle && <p className="text-ink-2">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function OpenActions({ actions, c, category }: { actions: Action[]; c: Campaign; category: CategoryDef }) {
  return (
    <section className="space-y-3">
      <h2 className="h-sub">Acciones abiertas a cualquiera</h2>
      <ActionList actions={actions} c={c} category={category} />
    </section>
  );
}

/** Same shape as the page: header lines, the buy card, the bar and the timeline. */
function CampaignSkeleton() {
  const buy = (
    <div className="card space-y-4 p-5" aria-hidden>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-9 w-32" />
      <Skeleton className="h-13 w-full rounded-md" />
      <Skeleton className="h-13 w-full rounded-md" />
    </div>
  );
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]" aria-busy aria-label="Cargando la preventa">
      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-7 w-48 rounded-full" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="lg:hidden">{buy}</div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-full rounded-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden lg:block">{buy}</div>
    </div>
  );
}
