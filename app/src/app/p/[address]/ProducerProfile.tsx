"use client";

// Public producer profile: the on-chain track record a buyer checks before trusting someone.

import { ArrowLeft, ChevronDown, MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import { Stars, Streak, TierBadge } from "@/components/badges";
import { CampaignCard } from "@/components/CampaignCard";
import { EmptyState, ExplorerLink, Skeleton, Stat, Term } from "@/components/ui";
import { avgRating, isValidAddress } from "@/lib/despensa";
import { formatNumber, formatPct, shortAddress } from "@/lib/format";
import { useCampaignList, useNow, useProducer, type CampaignItem, type ProducerStats } from "@/lib/hooks";
import { TIER_NAMES } from "@/lib/reputation";

export default function ProducerProfile({ address }: { address: string }) {
  const valid = isValidAddress(address);
  const producer = useProducer(valid ? address : null);
  const list = useCampaignList();
  const now = useNow();

  if (!valid) {
    return <EmptyState title="Dirección no válida" action={{ href: "/", label: "Volver al mercado" }} />;
  }

  const mine = (list.data ?? []).filter((i) => i.c.seller === address).sort((a, b) => Number(b.c.created_at - a.c.created_at));
  const live = mine.filter((i) => i.c.status.tag === "Funding" || i.c.status.tag === "Active");
  const past = mine.filter((i) => !(i.c.status.tag === "Funding" || i.c.status.tag === "Active"));
  const named = mine.find((i) => i.meta.meta.producer.displayName);
  const name = named?.meta.meta.producer.displayName ?? `Productor ${shortAddress(address)}`;
  const location = mine.find((i) => i.meta.meta.producer.location)?.meta.meta.producer.location;
  const s = producer.data;

  return (
    <div className="space-y-10">
      <Link href="/" className="btn-ghost -ml-3">
        <ArrowLeft className="size-4" aria-hidden /> Mercado
      </Link>

      <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
          <UserRound className="size-8" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="h-page">{name}</h1>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
            {location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-4" aria-hidden /> {location}
              </span>
            )}
            <ExplorerLink path={`account/${address}`}>Ver cuenta en Stellar</ExplorerLink>
          </p>
          {s ? (
            <div className="flex flex-wrap items-center gap-2">
              <TierBadge tier={s.tier.tier} />
              <Streak n={s.rep.streak} />
              <Stars value={avgRating(s.rep)} count={s.rep.rating_count} />
            </div>
          ) : (
            <Skeleton className="h-6 w-56" />
          )}
        </div>
      </header>

      {s && (
        <section className="max-w-2xl space-y-3" aria-labelledby="record">
          <h2 id="record" className="h-section">
            Su historial
          </h2>
          <p className="text-ink-2">
            Cumplió <b className="text-ink">{s.rep.completed}</b> {s.rep.completed === 1 ? "preventa" : "preventas"}
            {s.rep.defaulted > 0 ? (
              <>
                {" "}
                y <b className="text-danger">no cumplió {s.rep.defaulted}</b>
              </>
            ) : (
              " y nunca incumplió"
            )}
            . Nivel <b className="text-ink">{TIER_NAMES[s.tier.tier]}</b>:{" "}
            {s.tier.max_advance_bps > 0 ? (
              <>
                puede recibir hasta {formatPct(s.tier.max_advance_bps)} por adelantado, solo con evidencia aprobada y un <Term k="aval">aval</Term> del{" "}
                {formatPct(s.tier.bond_cover_bps)} de lo adelantado.
              </>
            ) : (
              <>solo puede vender con pago contra entrega hasta cumplir 3 preventas seguidas por cada incumplimiento.</>
            )}
          </p>
          <p className="text-sm text-ink-2">Este historial está en el contrato de Stellar: nadie, ni Ayni, puede editarlo ni borrar un incumplimiento.</p>
          <details className="group">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-brand">
              Ver todas las cifras
              <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
            </summary>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 pt-2 sm:grid-cols-3">
              <Stat label="Campañas cumplidas" value={s.rep.completed} />
              <Stat label="Incumplidas" value={s.rep.defaulted} tone={s.rep.defaulted > 0 ? "danger" : undefined} />
              <Stat label="Mejor racha" value={s.rep.best_streak} />
              <Stat label="Unidades entregadas" value={formatNumber(s.rep.units_delivered)} />
              <Stat label="Unidades reembolsadas" value={formatNumber(s.rep.units_refunded)} />
              <Stat label="Calificaciones" value={s.rep.rating_count} />
            </dl>
          </details>
        </section>
      )}

      <CampaignGroup title="Preventas activas" items={live} now={now} stats={s} loading={!list.data} empty="No tiene preventas activas ahora." />
      {past.length > 0 && <CampaignGroup title="Historial" items={past} now={now} stats={s} />}
    </div>
  );
}

function CampaignGroup({
  title,
  items,
  now,
  loading,
  empty,
  stats,
}: {
  title: string;
  items: CampaignItem[];
  now: bigint;
  stats?: ProducerStats;
  loading?: boolean;
  empty?: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="h-section">{title}</h2>
      {loading ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-2">{empty}</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <CampaignCard key={i.c.id.toString()} c={i.c} meta={i.meta.meta} category={i.category} now={now} producer={stats ?? null} />
          ))}
        </div>
      )}
    </section>
  );
}
