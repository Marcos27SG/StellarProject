"use client";

import { ArrowRight, BadgeCheck, CalendarClock, ChevronDown, Copy, Mail, MessageCircle, PenLine, Plus } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { ProducerLine, Stars, StatusPill, Streak, TierBadge, TierLadder } from "@/components/badges";
import { timeHint } from "@/components/CampaignCard";
import { CategoryTile } from "@/components/CategoryIcon";
import { FundingBar } from "@/components/FundingBar";
import { Money, Qty } from "@/components/Money";
import { EmptyState, Notice, Pill, ProgressBar, Skeleton, Stat, Term } from "@/components/ui";
import { readOnlyProps, useWallet } from "@/components/Wallet";
import { attentionActions, nextActions, type Role } from "@/lib/actions";
import { avgRating, type StatusTag } from "@/lib/despensa";
import { formatNumber, formatPct, whatsappHref } from "@/lib/format";
import { config } from "@/lib/config";
import { useBond, useCampaignList, useNow, useProducer, useSellerVerified, type CampaignItem } from "@/lib/hooks";
import { TIER_LIMITS, TIER_NAMES, tierProgress } from "@/lib/reputation";

const RANK: Record<StatusTag, number> = { Active: 0, Funding: 1, Completed: 2, Failed: 3, Defaulted: 3 };

export default function ProducerPage() {
  const { address } = useWallet();
  return address ? <Dashboard address={address} /> : <Landing />;
}

// ------------------------------------------------------------------ signed out

function Landing() {
  const { enabled, connect } = useWallet();
  const steps = [
    { title: "Publica tu preventa", text: "Qué vas a producir, a qué precio y cuánto puedes entregar." },
    { title: "Tus compradores reservan hoy", text: "El dinero queda en custodia en Stellar: ven que es seguro y reservan." },
    { title: "Cobras al entregar", text: "Escaneas su QR y te pagan al instante, en dólares digitales." },
    { title: "Subes de nivel", text: "Cada entrega cumplida suma reputación y te habilita adelantos para producir." },
  ];
  return (
    <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-start">
      <section className="space-y-5">
        <h1 className="h-page">Vende por adelantado, sin empezar de cero</h1>
        <p className="text-[1.0625rem] text-ink-2 lg:text-lg">
          Asegura compradores y un precio fijo antes de producir. Con buena reputación, recibe adelantos para comprar insumos, respaldados por un{" "}
          <Term k="aval">aval</Term> de quien confía en ti.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button className="btn btn-lg" onClick={connect} {...readOnlyProps(enabled)}>
            Entrar con Google
          </button>
          <Link href="/producer/new" className="btn-ghost">
            Ver cómo se arma una preventa <ArrowRight className="size-5" aria-hidden />
          </Link>
        </div>
      </section>
      <ol className="space-y-4 border-line lg:border-l lg:pl-10">
        {steps.map(({ title, text }, i) => (
          <li key={title} className="flex gap-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-brand">{i + 1}</span>
            <span className="space-y-0.5">
              <b className="block font-bold">{title}</b>
              <span className="text-ink-2">{text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ------------------------------------------------------------------ signed in

function Dashboard({ address }: { address: string }) {
  const list = useCampaignList();
  const mine = (list.data ?? []).filter((i) => i.c.seller === address);
  const verifying = (list.data ?? []).filter((i) => i.c.verifier === address);

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="h-page">Mi puesto</h1>
          <ProducerLine seller={address} />
        </div>
        {/* With no campaigns the empty state below carries the one primary action. */}
        {mine.length > 0 && (
          <Link href="/producer/new" className="btn btn-lg">
            <Plus className="size-5" aria-hidden /> Nueva preventa
          </Link>
        )}
      </header>

      <ReputationCard address={address} />

      <VerificationCard address={address} />

      <section className="space-y-3" aria-labelledby="mine">
        <h2 id="mine" className="sr-only">
          Mis preventas
        </h2>
        {list.error && (
          <Notice
            tone="danger"
            title="No se pudo leer la red de Stellar"
            action={
              <button className="btn-secondary btn-sm" onClick={list.refresh}>
                Reintentar
              </button>
            }
          >
            {list.error}
          </Notice>
        )}
        {!list.data && !list.error && <RowSkeleton />}
        {list.data && mine.length === 0 && (
          <EmptyState title="Aún no tienes preventas" action={{ href: "/producer/new", label: "Crear mi primera preventa" }}>
            Empieza sin adelantos: cobras al entregar y vas sumando reputación.
          </EmptyState>
        )}
        <CampaignRows items={mine} role="seller" me={address} />
      </section>

      {verifying.length > 0 && (
        <section className="space-y-3" aria-labelledby="verifying">
          <h2 id="verifying" className="h-section">
            Campañas que verificas
          </h2>
          <p className="text-ink-2">
            Apruebas hitos y decides disputas.{" "}
            <Link href="/verify" className="link">
              Abrir el panel del verificador
            </Link>
          </p>
          <CampaignRows items={verifying} role="verifier" me={address} />
        </section>
      )}
    </div>
  );
}

function ReputationCard({ address }: { address: string }) {
  const q = useProducer(address);
  if (!q.data)
    return (
      <div className="card space-y-4 p-5" aria-hidden>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-2/3" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-md" />
          ))}
        </div>
      </div>
    );
  const { rep, tier } = q.data;
  const p = tierProgress(rep);
  const avg = avgRating(rep);
  const next = p.next !== null ? TIER_LIMITS[p.next] : null;

  return (
    <section className="card space-y-5 p-5" aria-labelledby="rep">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="rep" className="h-section">
          Tu reputación
        </h2>
        <TierBadge tier={tier.tier} size="md" />
        <Stars value={avg} count={rep.rating_count} />
      </div>
      <Streak n={rep.streak} showZero />
      <p className="text-ink-2">
        {tier.max_advance_bps > 0 ? (
          <>
            Tu nivel permite adelantos de hasta <b className="text-ink">{formatPct(tier.max_advance_bps)}</b>, con un aval que cubre el{" "}
            <b className="text-ink">{formatPct(tier.bond_cover_bps)}</b> de lo adelantado. Cumplir entregas sube ese límite.
          </>
        ) : (
          <>Por ahora vendes solo con pago contra entrega.</>
        )}
      </p>
      {p.next !== null && (
        <div className="space-y-1.5">
          <ProgressBar value={rep.completed} max={rep.completed + p.needed} label="Avance hacia el siguiente nivel" />
          <p className="text-ink-2">
            {p.reason === "normal" &&
              `${p.needed} ${p.needed === 1 ? "campaña cumplida" : "campañas cumplidas"} más para ${TIER_NAMES[p.next]}: adelantos de hasta ${formatPct(next!.maxAdvanceBps)}.`}
            {p.reason === "restricted" &&
              `Tienes incumplimientos: cumple ${p.needed} ${p.needed === 1 ? "campaña" : "campañas"} más para volver a recibir adelantos.`}
            {p.reason === "low_rating" && "Tu calificación promedio está bajo 3 estrellas: mejórala para recuperar tu nivel."}
          </p>
        </div>
      )}
      {p.reason === "top" && <p className="text-ink-2">Estás en el nivel más alto. Mantén tu racha.</p>}
      <TierLadder current={tier.tier} />
      <details className="group">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-bold text-brand">
          Ver tu historial
          <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
        </summary>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 pt-2 sm:grid-cols-3">
          <Stat label="Campañas cumplidas" value={rep.completed} />
          <Stat label="Incumplidas" value={rep.defaulted} tone={rep.defaulted > 0 ? "danger" : undefined} />
          <Stat label="Mejor racha" value={rep.best_streak} />
          <Stat label="Unidades entregadas" value={formatNumber(rep.units_delivered)} />
          <Stat label="Unidades reembolsadas" value={formatNumber(rep.units_refunded)} />
          <Stat label="Calificaciones" value={rep.rating_count} />
        </dl>
      </details>
    </section>
  );
}

function CampaignRows({ items, role, me }: { items: CampaignItem[]; role: Role; me: string }) {
  const sorted = [...items].sort((a, b) => RANK[a.c.status.tag] - RANK[b.c.status.tag] || Number(b.c.created_at - a.c.created_at));
  return (
    <ul className="space-y-3">
      {sorted.map((i) => (
        <CampaignRow key={i.c.id.toString()} item={i} role={role} me={me} />
      ))}
    </ul>
  );
}

function CampaignRow({ item: { c, meta, category }, role, me }: { item: CampaignItem; role: Role; me: string }) {
  const now = useNow();
  const bond = useBond(c.id, role === "seller" ? me : null);
  const acts = nextActions(c, null, role, now, { bond: bond.data, category });
  const urgent = attentionActions(acts, c)[0];
  return (
    <li>
      <Link
        href={`/campaign/${c.id.toString()}`}
        className="card grid gap-4 p-4 transition-shadow hover:shadow-lift sm:grid-cols-[auto_minmax(0,1fr)_240px] sm:items-center"
      >
        <span className="hidden sm:flex">
          <CategoryTile category={category} />
        </span>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-bold">{c.title}</h3>
            <StatusPill c={c} />
          </div>
          <p className="t-detail flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-4" aria-hidden />
              {timeHint(c, now)}
            </span>
            <span>
              En custodia <Money amount={c.escrow} category={category} size="sm" showBs={false} />
            </span>
            {c.pending > 0 && (
              <span>
                <Qty n={c.pending} category={category} /> por confirmar
              </span>
            )}
            {meta.meta.producer.displayName && role === "verifier" && <span>de {meta.meta.producer.displayName}</span>}
          </p>
          {urgent && (
            // Something you have to do: the accent, like "Por confirmar".
            <Pill tone="accent" icon={PenLine}>
              Te toca: {urgent.label}
            </Pill>
          )}
        </div>
        <FundingBar c={c} category={category} now={now} />
      </Link>
    </li>
  );
}

function RowSkeleton() {
  return (
    <div className="space-y-3" aria-busy aria-label="Cargando tus preventas">
      {[0, 1].map((i) => (
        <div key={i} className="card flex items-center gap-4 p-4">
          <Skeleton className="hidden size-12 shrink-0 rounded-md sm:block" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
          <Skeleton className="hidden h-2 w-60 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}

/**
 * "Verifica tu identidad para pedir adelantos". The check is a request to a verifier, done outside
 * the app (CI, NIT or co-op membership): the app stores no documents and the contract only keeps the
 * "verified" flag. Contact links come from NEXT_PUBLIC_VERIFY_WHATSAPP / NEXT_PUBLIC_VERIFY_EMAIL.
 */
function VerificationCard({ address }: { address: string }) {
  const verified = useSellerVerified(address);
  const [copied, setCopied] = useState(false);
  if (verified.data === undefined) return null;
  if (verified.data) {
    return (
      <p id="verificar" className="flex items-center gap-2 text-ink-2">
        <BadgeCheck className="size-5 text-brand" aria-hidden />
        <span>
          <b className="text-ink">Identidad verificada.</b> Puedes pedir adelantos por hitos, siempre con un aval que los cubra.
        </span>
      </p>
    );
  }
  const message = `Hola, quiero verificar mi identidad en Ayni para pedir adelantos. Mi cuenta: ${address}`;
  const wa = whatsappHref(config.verifyWhatsapp);
  const mail = config.verifyEmail
    ? `mailto:${config.verifyEmail}?subject=${encodeURIComponent("Verificación de productor en Ayni")}&body=${encodeURIComponent(message)}`
    : null;
  return (
    <section id="verificar" aria-labelledby="verify-title" className="card space-y-4 p-5">
      <div className="space-y-1">
        <h2 id="verify-title" className="h-section flex items-center gap-2">
          <BadgeCheck className="size-6 text-brand" aria-hidden /> Verifica tu identidad para pedir adelantos
        </h2>
        <p className="text-ink-2">
          Sin verificar puedes vender igual, con pago contra entrega. Para recibir dinero antes de entregar, un verificador (tu cooperativa,
          asociación o Ayni) tiene que revisar tu identidad.
        </p>
      </div>
      <ol className="list-decimal space-y-1.5 pl-5 text-ink-2 [&_b]:text-ink">
        <li>
          <b>Escribe al verificador</b> con tu dirección de cuenta (abajo).
        </li>
        <li>
          <b>Muéstrale tu carnet, NIT o credencial de socio.</b> Se revisa fuera de la app: Ayni no guarda tus documentos y en Stellar queda solo
          la marca de verificado.
        </li>
        <li>
          <b>Cuando te marque,</b> verás aquí &quot;Identidad verificada&quot; y podrás agregar hitos a tus preventas.
        </li>
      </ol>
      <div className="flex flex-wrap gap-2">
        {wa && (
          <a className="btn" href={`${wa}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="size-5" aria-hidden /> Pedir por WhatsApp
          </a>
        )}
        {mail && (
          <a className={wa ? "btn-secondary" : "btn"} href={mail}>
            <Mail className="size-5" aria-hidden /> Pedir por correo
          </a>
        )}
        <button
          type="button"
          className={wa || mail ? "btn-ghost" : "btn-secondary"}
          onClick={() => navigator.clipboard?.writeText(address).then(() => setCopied(true), () => {})}
        >
          <Copy className="size-4" aria-hidden /> {copied ? "Dirección copiada" : "Copiar mi dirección"}
        </button>
      </div>
      {!wa && !mail && (
        <p className="t-detail text-ink-2">Envíala a tu cooperativa o asociación, o a quien verifique tus preventas.</p>
      )}
    </section>
  );
}
