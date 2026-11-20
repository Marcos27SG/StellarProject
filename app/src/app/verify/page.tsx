"use client";

// Verifier inbox: milestones waiting for approval and open disputes, across every campaign this
// address verifies. Buttons come from nextActions (verifier role) with the pending deliveries
// read from contract events.

import { BadgeCheck, ClipboardCheck, ExternalLink, Gavel, Scale } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ActionList } from "@/components/ActionPanel";
import { StatusPill } from "@/components/badges";
import { CategoryTile } from "@/components/CategoryIcon";
import { Money } from "@/components/Money";
import { EmptyState, Field, Notice, Skeleton, Term, TxSteps } from "@/components/ui";
import { readOnlyProps, useAction, useWallet } from "@/components/Wallet";
import { isValidAddress } from "@/lib/despensa";
import { nextActions, requiredBondFor } from "@/lib/actions";
import { formatDate, formatPct, formatQty, safeHref, shortAddress } from "@/lib/format";
import {
  invalidate,
  useCampaignList,
  useContractConfig,
  useNow,
  usePendingDeliveries,
  useSellerVerified,
  useVerifierAllowed,
  type CampaignItem,
} from "@/lib/hooks";

export default function VerifyPage() {
  const { address, enabled, connect } = useWallet();
  const list = useCampaignList();

  if (!address) {
    return (
      <EmptyState level={1} icon={<Scale className="size-10" />} title="Panel del verificador">
        <p className="mb-4">
          Si una asociación, cooperativa o ingeniero te eligió como <Term k="verificador">verificador</Term>, aquí revisas la evidencia de los
          hitos y decides las disputas. Nunca puedes quedarte con el dinero: solo decides si va al productor o vuelve al comprador.
        </p>
        {enabled && (
          <button className="btn" onClick={connect}>
            Entrar con Google
          </button>
        )}
      </EmptyState>
    );
  }

  const mine = (list.data ?? []).filter((i) => i.c.verifier === address);
  const active = mine.filter((i) => i.c.status.tag === "Active");
  const others = mine.filter((i) => i.c.status.tag !== "Active");
  const toReview = active.reduce((n, i) => n + i.c.milestones.filter((m) => m.evidence && !m.released).length, 0);
  const pendingUnits = active.reduce((n, i) => n + i.c.pending, 0);

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="h-page">Verificación</h1>
        {list.data && mine.length > 0 && (
          <p className="text-ink-2">
            {toReview === 0 && pendingUnits === 0
              ? `Nada pendiente en tus ${mine.length} ${mine.length === 1 ? "campaña" : "campañas"}.`
              : `${toReview} ${toReview === 1 ? "hito por revisar" : "hitos por revisar"} y ${pendingUnits} ${pendingUnits === 1 ? "unidad entregada" : "unidades entregadas"} sin confirmar, en ${mine.length} ${mine.length === 1 ? "campaña" : "campañas"}.`}
          </p>
        )}
        <Notice tone="warning" title="Cada aprobación es definitiva">
          Aprobar un hito libera dinero de la custodia al productor y no se puede revertir. Revisa la evidencia antes.
        </Notice>
      </header>

      <VerifySeller me={address} />

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
      {!list.data && !list.error && (
        <div className="space-y-3" aria-busy aria-label="Cargando">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      )}

      {list.data && mine.length === 0 && (
        <EmptyState icon={<Scale className="size-10" />} title="No verificas ninguna campaña">
          Cuando un productor te elija como verificador al crear su preventa, aparecerá aquí.
        </EmptyState>
      )}

      {list.data && mine.length > 0 && active.length === 0 && (
        <EmptyState icon={<ClipboardCheck className="size-10" />} title="Nada que revisar">
          Ninguna de tus campañas está en etapa de producción o entrega.
        </EmptyState>
      )}

      {active.map((i) => (
        <InboxCard key={i.c.id.toString()} item={i} />
      ))}

      {others.length > 0 && (
        <section className="space-y-2">
          <h2 className="h-section">Otras campañas que verificas</h2>
          <ul className="flex flex-wrap gap-2">
            {others.map(({ c }) => (
              <li key={c.id.toString()}>
                <Link href={`/campaign/${c.id.toString()}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-3 py-1.5 text-sm hover:bg-surface-2">
                  {c.title} <StatusPill c={c} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function InboxCard({ item: { c, meta, category } }: { item: CampaignItem }) {
  const now = useNow();
  const pending = usePendingDeliveries(c, true);
  const acts = nextActions(c, null, "verifier", now, { category, deliveries: pending.data });
  const approvals = acts.filter((a) => a.id === "approve_milestone");
  const disputes = acts.filter((a) => a.id === "resolve_dispute");
  const settle = acts.filter((a) => a.id === "settle");
  const declare = acts.filter((a) => a.id === "declare_default");
  const nothing = approvals.length === 0 && disputes.length === 0 && settle.length === 0 && !pending.loading;

  return (
    <section className="card space-y-5 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <CategoryTile category={category} />
          <div className="min-w-0">
            <Link href={`/campaign/${c.id.toString()}`} className="t-subtitle underline underline-offset-2 hover:no-underline">
              {c.title}
            </Link>
            <p className="text-ink-2">
              {meta.meta.producer.displayName || `Productor ${shortAddress(c.seller)}`} · entrega hasta {formatDate(c.delivery_deadline)} · aval{" "}
              <Money amount={c.bond_total} category={category} size="sm" showBs={false} />
            </p>
          </div>
        </div>
        <StatusPill c={c} />
      </header>

      {settle.length > 0 && <ActionList actions={settle} c={c} category={category} />}

      {approvals.length > 0 && (
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <ClipboardCheck className="size-4 text-brand" aria-hidden /> <Term k="hito">Hitos</Term> por revisar
          </h3>
          <ul className="space-y-3">
            {approvals.map((a) => {
              const m = c.milestones[a.milestoneIndex!];
              const href = safeHref(m.evidence);
              const hint = category.milestoneTemplates.find((t) => t.title === m.title)?.evidenceHint;
              return (
                <li key={a.milestoneIndex} className="space-y-3 rounded-md bg-surface-2 p-4">
                  <div className="space-y-1 text-sm">
                    <p className="font-bold">
                      {m.title} <span className="font-normal text-ink-3">· adelanto del {formatPct(m.bps)}</span>
                    </p>
                    {hint && <p className="text-ink-2">Se espera: {hint}</p>}
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
                        Abrir evidencia <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    ) : (
                      <p className="text-danger">La evidencia no es un enlace seguro (https o ipfs): pide al productor que la reenvíe.</p>
                    )}
                    <p className="text-ink-2">
                      Aval necesario: <Money amount={requiredBondFor(c, a.milestoneIndex!)} category={category} size="sm" showBs={false} /> · hay{" "}
                      <Money amount={c.bond_total} category={category} size="sm" showBs={false} />
                    </p>
                  </div>
                  <ActionList actions={[a]} c={c} category={category} compact />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(disputes.length > 0 || pending.loading) && (
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Gavel className="size-4 text-danger" aria-hidden /> <Term k="disputa">Disputas</Term>
          </h3>
          {pending.loading && <p className="text-ink-2">Buscando disputas en los eventos del contrato…</p>}
          <ul className="space-y-3">
            {disputes.map((a, i) => {
              const d = pending.data?.find((x) => x.buyer === a.buyer);
              return (
                <li key={a.buyer ?? `manual-${i}`} className="space-y-3 rounded-md bg-warning-soft p-4">
                  {d ? (
                    <p>
                      El comprador <span className="font-mono">{shortAddress(d.buyer)}</span> dice que no recibió{" "}
                      <b>{formatQty(d.holding.pending, category)}</b> (entrega registrada por el productor el {formatDate(d.holding.pending_since)}).
                    </p>
                  ) : (
                    <p className="text-ink-2">{a.description}</p>
                  )}
                  <ActionList actions={[a]} c={c} category={category} compact />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {nothing && <p className="text-ink-2">Nada pendiente en esta campaña.</p>}

      {declare.length > 0 && (
        <details className="border-t border-line pt-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-ink-2">Si el productor desapareció o hubo fraude</summary>
          <div className="mt-3">
            <ActionList actions={declare} c={c} category={category} />
          </div>
        </details>
      )}
    </section>
  );
}

/**
 * "Verificar productor": after checking a seller's identity off-chain (CI, NIT or co-op membership),
 * an allowlisted verifier (or the admin) sets the on-chain flag that lets them ask for advances. Only
 * the flag is stored: no documents, names or numbers. Revoking blocks new advances; paid ones stay paid.
 */
function VerifySeller({ me }: { me: string }) {
  const { enabled } = useWallet();
  const allowed = useVerifierAllowed(me);
  const cfg = useContractConfig();
  const [seller, setSeller] = useState("");
  const addr = seller.trim();
  const valid = isValidAddress(addr);
  const status = useSellerVerified(valid ? addr : null);
  const tx = useAction();
  const [last, setLast] = useState<boolean | null>(null);
  const canVerify = allowed.data === true || cfg.data?.admin === me;
  if (allowed.data === undefined && cfg.data === undefined) return null;
  if (!canVerify) return null;

  const run = (verified: boolean) => {
    setLast(verified);
    return tx.run("set_seller_verified", { caller: me, seller: addr, verified }, () => invalidate(`sellerverified:${addr}`));
  };
  const self = addr === me;

  return (
    <section aria-labelledby="verify-seller" className="card space-y-4 p-5">
      <div className="space-y-1">
        <h2 id="verify-seller" className="h-section flex items-center gap-2">
          <BadgeCheck className="size-6 text-brand" aria-hidden /> Verificar productor
        </h2>
        <p className="text-ink-2">
          Revisa su identidad fuera de la app (carnet, NIT o que sea socio de la cooperativa) y luego marca su cuenta. Solo los productores{" "}
          <Term k="verificado">verificados</Term> pueden pedir adelantos. No subas ni guardes documentos aquí: en el contrato queda solo la marca.
        </p>
      </div>
      <Field
        label="Cuenta del productor"
        hint="La dirección que empieza con G, la que te envió el productor."
        error={addr && !valid ? "No es una dirección de Stellar válida." : self ? "No puedes verificarte a ti mismo." : undefined}
      >
        <input
          value={seller}
          onChange={(e) => {
            setSeller(e.target.value);
            tx.reset();
          }}
          placeholder="G…"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
      </Field>
      {valid && !self && (
        <p className="text-ink-2" aria-live="polite">
          {status.data === undefined ? "Consultando…" : status.data ? "Esta cuenta ya está verificada." : "Esta cuenta todavía no está verificada."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className="btn"
          disabled={!valid || self || tx.busy || status.data === true}
          {...readOnlyProps(enabled)}
          onClick={() => run(true)}
        >
          Verificar productor
        </button>
        <button
          className="btn-secondary"
          disabled={!valid || self || tx.busy || status.data !== true}
          {...readOnlyProps(enabled)}
          onClick={() => run(false)}
        >
          Quitar verificación
        </button>
      </div>
      {tx.phase !== "idle" && (
        <TxSteps
          phase={tx.phase}
          error={tx.error}
          hash={tx.hash}
          failedAt={tx.failedAt}
          success={last ? "Productor verificado: ya puede pedir adelantos." : "Verificación quitada: no podrá recibir nuevos adelantos."}
        />
      )}
    </section>
  );
}
