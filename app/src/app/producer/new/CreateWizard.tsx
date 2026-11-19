"use client";

// Five-step create wizard. Everything product-specific comes from the category (catalog/);
// rules come from lib/wizard.ts, which mirrors the contract's create_campaign checks.

import { ArrowLeft, ArrowRight, Check, CircleCheck, Plus, Printer, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { copy, getCategory, isKnownCategory, listCategories, MAX_MILESTONES, type AttributeField, type CategoryDef } from "@/catalog";
import { Stepper as UnitStepper } from "@/components/ActionPanel";
import { StatusPill } from "@/components/badges";
import { CampaignCard } from "@/components/CampaignCard";
import { ShareButton } from "@/components/ShareButton";
import { CategoryTile } from "@/components/CategoryIcon";
import { Money } from "@/components/Money";
import { AffixInput, Field, Notice, ProgressBar, Term, TxSteps } from "@/components/ui";
import { readOnlyProps, useAction, useWallet } from "@/components/Wallet";
import { friendlyError, getCampaign, getConfig, isValidAddress, type TierInfo } from "@/lib/despensa";
import { formatBs, formatDate, formatPct, formatQty, parseUsd, shortAddress } from "@/lib/format";
import { invalidate, useContractConfig, useNow, useProducer, useVerifierAllowed, type ProducerStats } from "@/lib/hooks";
import { INLINE_SOFT_LIMIT, metadataStore } from "@/lib/metadata";
import { TIER_NAMES } from "@/lib/reputation";
import { verifiersFor } from "@/lib/verifiers";
import {
  advanceBps,
  daySeconds,
  fitMilestones,
  inlineEstimate,
  moneyFlow,
  newDraft,
  previewCampaign,
  toCampaignInput,
  toMetadata,
  validateStep,
  WIZARD_STEPS,
  type CampaignDraft,
  type StepErrors,
  type WizardStep,
} from "@/lib/wizard";

const DRAFT_KEY = "despensa:draft:v1";
const NEW_PRODUCER_TIER: TierInfo = { tier: 1, max_advance_bps: 2000, bond_cover_bps: 10_000 };
const PREVIEW_SELLER = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function loadDraft(): { draft: CampaignDraft; step: WizardStep } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { draft: CampaignDraft; step: WizardStep };
    return parsed?.draft && isKnownCategory(parsed.draft.categoryId) ? parsed : null;
  } catch {
    return null;
  }
}

function saveDraft(value: { draft: CampaignDraft; step: WizardStep } | null) {
  try {
    if (value) localStorage.setItem(DRAFT_KEY, JSON.stringify(value));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Private mode or blocked storage: the wizard still works, it just won't survive a reload.
  }
}

export default function CreateWizard() {
  const { address, enabled, connect } = useWallet();
  const producer = useProducer(address);
  const cfg = useContractConfig();
  const now = useNow();
  const tier = producer.data?.tier ?? NEW_PRODUCER_TIER;
  const feeBps = cfg.data?.fee_bps ?? 200;

  const [draft, setDraft] = useState<CampaignDraft | null>(null);
  const [step, setStep] = useState<WizardStep>(0);
  const [showErrors, setShowErrors] = useState(false);
  const [restored, setRestored] = useState(false);
  const [created, setCreated] = useState<bigint | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const tx = useAction();

  useEffect(() => {
    const saved = loadDraft();
    if (saved) {
      setDraft(saved.draft);
      setStep(saved.step);
      setRestored(true);
    }
  }, []);

  useEffect(() => {
    if (draft && created === null) saveDraft({ draft, step });
  }, [draft, step, created]);

  // The contract only accepts allowlisted verifiers: ask it before the producer reaches "Crear".
  const chosenVerifier = draft?.verifier.trim() ?? "";
  const verifierAllowed = useVerifierAllowed(isValidAddress(chosenVerifier) ? chosenVerifier : null);

  const ctx = useMemo(
    () => ({ maxAdvanceBps: tier.max_advance_bps, nowSeconds: Number(now), me: address, isAddress: isValidAddress, verifierAllowed: verifierAllowed.data }),
    [tier.max_advance_bps, now, address, verifierAllowed.data],
  );
  const errors: StepErrors = draft ? validateStep(step, draft, ctx) : step === 0 ? { categoryId: "Elige un tipo de producto." } : {};
  const valid = Object.keys(errors).length === 0;
  const category = draft ? getCategory(draft.categoryId) : null;

  const update = (patch: Partial<CampaignDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const pick = (cat: CategoryDef) => {
    setDraft((d) => (d && d.categoryId === cat.id ? d : newDraft(cat, new Date(), tier.max_advance_bps, d ?? undefined)));
    setShowErrors(false);
    setStep(1);
  };

  const go = (to: WizardStep) => {
    if (to > step && !valid) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const reset = () => {
    saveDraft(null);
    setDraft(null);
    setStep(0);
    setRestored(false);
    setCreated(null);
    setPublishError(null);
    tx.reset();
  };

  const publish = async () => {
    if (!draft || !valid) return setShowErrors(true);
    if (!address) return connect();
    setPublishError(null);
    let uri: string;
    try {
      uri = await metadataStore.publish(toMetadata(draft));
    } catch (e) {
      setPublishError(friendlyError(e));
      return;
    }
    const title = draft.title.trim();
    const ok = await tx.run(
      "create_campaign",
      { seller: address, verifier: draft.verifier.trim(), input: toCampaignInput(draft, uri) },
      () => invalidate("campaigns", "config", "producer"),
    );
    if (!ok) return;
    saveDraft(null);
    try {
      const c = await getConfig();
      const id = c.campaigns - BigInt(1);
      const mine = await getCampaign(id);
      setCreated(mine.seller === address && mine.title === title ? id : BigInt(-1));
    } catch {
      setCreated(BigInt(-1));
    }
  };

  if (created !== null) return <Published id={created} onAnother={reset} />;

  return (
    <div className="space-y-8">
      <Link href="/producer" className="btn-ghost -ml-3">
        <ArrowLeft className="size-5" aria-hidden /> Mi puesto
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="h-page">Nueva preventa</h1>
          <p className="text-ink-2">Vende hoy lo que vas a producir, con el dinero de tus compradores protegido.</p>
        </div>
        {draft && (
          <button type="button" onClick={reset} className="btn-ghost">
            Empezar de nuevo
          </button>
        )}
      </header>

      <StepNav step={step} reachable={draft ? 4 : 0} onGo={(s) => (s < step ? go(s) : undefined)} />

      {restored && step > 0 && <Notice tone="info">Retomaste el borrador que dejaste a medias.</Notice>}
      {!address && enabled && (
        <Notice tone="neutral">Puedes armar tu preventa ahora y entrar con Google al publicar. Los límites de adelanto que ves son los de un productor nuevo.</Notice>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {step === 0 && <StepCategory selected={draft?.categoryId} onPick={pick} />}
          {draft && category && step === 1 && <StepDetails d={draft} category={category} update={update} errors={showErrors ? errors : {}} />}
          {draft && category && step === 2 && <StepPrice d={draft} category={category} update={update} errors={showErrors ? errors : {}} />}
          {draft && category && step === 3 && (
            <StepMilestones d={draft} category={category} tier={tier} feeBps={feeBps} update={update} errors={showErrors ? errors : {}} />
          )}
          {draft && category && step === 4 && (
            <StepReview d={draft} category={category} tier={tier} feeBps={feeBps} update={update} errors={showErrors ? errors : {}} me={address} />
          )}

          {step > 0 && (
            <div className="space-y-3 border-t border-line pt-5">
              {showErrors && !valid && (
                <p className="flex items-center gap-2 font-bold text-danger" role="alert">
                  <TriangleAlert className="size-4" aria-hidden /> Revisa los campos marcados.
                </p>
              )}
              {publishError && <Notice tone="danger">{publishError}</Notice>}
              <TxSteps phase={tx.phase} error={tx.error} hash={tx.hash} />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <button type="button" className="btn-ghost" onClick={() => go((step - 1) as WizardStep)} disabled={tx.busy}>
                  <ArrowLeft className="size-4" aria-hidden /> Atrás
                </button>
                {step < 4 ? (
                  <button type="button" className="btn" onClick={() => go((step + 1) as WizardStep)}>
                    Siguiente: {WIZARD_STEPS[step + 1]} <ArrowRight className="size-4" aria-hidden />
                  </button>
                ) : (
                  <button type="button" className="btn" onClick={publish} disabled={tx.busy} {...readOnlyProps(enabled)}>
                    {address ? "Publicar preventa" : "Entrar con Google y publicar"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {draft && category && (
          <aside className="hidden space-y-3 lg:sticky lg:top-20 lg:block lg:self-start">
            <p className="text-[0.9375rem] font-bold text-ink-2">Así se verá en el mercado</p>
            <Preview d={draft} category={category} address={address} stats={producer.data} tier={tier} now={now} />
          </aside>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ chrome

function StepNav({ step, reachable, onGo }: { step: WizardStep; reachable: number; onGo: (s: WizardStep) => void }) {
  return (
    <ol className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" aria-label="Pasos">
      {WIZARD_STEPS.map((label, i) => {
        const state = i < step ? "done" : i === step ? "current" : "todo";
        return (
          <li key={label} className="shrink-0">
            <button
              type="button"
              onClick={() => onGo(i as WizardStep)}
              disabled={i >= step || i > reachable}
              aria-current={state === "current" ? "step" : undefined}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-[0.9375rem] font-bold ${
                state === "current" ? "border-brand bg-brand text-brand-ink" : state === "done" ? "border-line-strong bg-surface text-ink hover:bg-surface-2" : "border-transparent text-ink-2"
              }`}
            >
              <span
                className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                  state === "done" ? "bg-brand text-brand-ink" : state === "current" ? "bg-brand-ink text-brand" : "bg-surface-2"
                }`}
              >
                {state === "done" ? <Check className="size-3" aria-hidden /> : i + 1}
              </span>
              {label}
              {state === "done" && <span className="sr-only"> (completo)</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="h-section">{title}</h2>
        {hint && <p className="text-ink-2">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

const invalid = (e?: string) => (e ? { "aria-invalid": true, className: "w-full" } : { className: "w-full" });

// ------------------------------------------------------------------ step 0: category

function StepCategory({ selected, onPick }: { selected?: string; onPick: (c: CategoryDef) => void }) {
  const cats = listCategories({ includeComingSoon: true });
  return (
    <Section title="¿Qué vas a vender?" hint="Elige el tipo de producto. Las unidades, los datos y los hitos sugeridos se adaptan a tu elección.">
      <ul className="grid gap-3 sm:grid-cols-2">
        {cats.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              disabled={c.comingSoon}
              onClick={() => onPick(c)}
              aria-pressed={selected === c.id}
              className={`flex h-full w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                selected === c.id ? "border-brand bg-brand-soft ring-2 ring-brand" : "border-line-strong bg-surface hover:bg-surface-2"
              } disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent`}
            >
              <CategoryTile category={c} />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  {c.label}
                  {c.comingSoon && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-2">Muy pronto</span>}
                </span>
                <span className="t-detail block text-ink-2">
                  Se vende por {c.unit.singular} · {c.perishable ? "perecedero" : "no perecedero"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ------------------------------------------------------------------ step 1: details

type StepProps = {
  d: CampaignDraft;
  category: CategoryDef;
  update: (p: Partial<CampaignDraft>) => void;
  errors: StepErrors;
};

function StepDetails({ d, category, update, errors }: StepProps) {
  const setAttr = (key: string, v: string | number | boolean) => update({ attributes: { ...d.attributes, [key]: v } });
  const setPoint = (i: number, patch: Partial<CampaignDraft["points"][number]>) =>
    update({ points: d.points.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const images = [...d.images, "", "", ""].slice(0, 3);
  return (
    <>
      <Section title="Tu producto">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre de la preventa" error={errors.title} wide hint="Es lo primero que ven los compradores.">
            <input {...invalid(errors.title)} value={d.title} maxLength={80} onChange={(e) => update({ title: e.target.value })} />
          </Field>
          <Field label="Descripción" error={errors.description} wide hint="Cómo lo produces, qué incluye y cómo se entrega.">
            <textarea {...invalid(errors.description)} rows={3} value={d.description} onChange={(e) => update({ description: e.target.value })} />
          </Field>
          {category.attributes.map((f) => (
            <AttributeInput key={f.key} field={f} value={d.attributes[f.key]} onChange={(v) => setAttr(f.key, v)} error={errors[`attr.${f.key}`]} />
          ))}
        </div>
      </Section>

      <Section title="Fotos" hint="Pega hasta 3 enlaces a fotos (https://…). Se muestran en el mercado.">
        <div className="grid gap-3">
          {images.map((img, i) => (
            <Field key={i} label={`Foto ${i + 1}${i === 0 ? " (portada)" : ""}`} error={errors[`image.${i}`]}>
              <input
                {...invalid(errors[`image.${i}`])}
                placeholder="https://…"
                value={img}
                onChange={(e) => update({ images: images.map((x, j) => (j === i ? e.target.value : x)) })}
              />
            </Field>
          ))}
        </div>
      </Section>

      <Section title={`Sobre ti (${copy(category, "producerNoun")})`} hint="Ayuda a que los compradores confíen y sepan dónde recoger.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre visible" hint="Tu nombre, tu granja o tu cooperativa.">
            <input className="w-full" value={d.producerName} maxLength={80} onChange={(e) => update({ producerName: e.target.value })} />
          </Field>
          <Field label="Ubicación">
            <input className="w-full" placeholder="Punata, Cochabamba" value={d.location} maxLength={80} onChange={(e) => update({ location: e.target.value })} />
          </Field>
          <Field label="WhatsApp (opcional)" error={errors.whatsapp}>
            <input {...invalid(errors.whatsapp)} inputMode="tel" placeholder="+591 7…" value={d.whatsapp} onChange={(e) => update({ whatsapp: e.target.value })} />
          </Field>
        </div>
        <div className="space-y-3">
          <p className="text-[0.9375rem] font-bold">Puntos de entrega</p>
          {d.points.map((p, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <input aria-label="Lugar" placeholder="Feria de la plaza" value={p.name} onChange={(e) => setPoint(i, { name: e.target.value })} />
              <input aria-label="Dirección" placeholder="Dirección (opcional)" value={p.address} onChange={(e) => setPoint(i, { address: e.target.value })} />
              <input aria-label="Horario" placeholder="Sábados 7–11" value={p.schedule} onChange={(e) => setPoint(i, { schedule: e.target.value })} />
              <button
                type="button"
                className="btn-ghost"
                onClick={() => update({ points: d.points.length > 1 ? d.points.filter((_, j) => j !== i) : [{ name: "", address: "", schedule: "" }] })}
                aria-label="Quitar punto de entrega"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ))}
          {d.points.length < 5 && (
            <button type="button" className="btn-ghost -ml-3" onClick={() => update({ points: [...d.points, { name: "", address: "", schedule: "" }] })}>
              <Plus className="size-4" aria-hidden /> Agregar punto
            </button>
          )}
        </div>
      </Section>
    </>
  );
}

function AttributeInput({
  field: f,
  value,
  onChange,
  error,
}: {
  field: AttributeField;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean) => void;
  error?: string;
}) {
  const label = (
    <>
      {f.label}
      {f.unit && <span className="font-normal text-ink-2"> ({f.unit})</span>}
      {f.required && (
        <span className="text-danger" aria-hidden>
          {" "}
          *
        </span>
      )}
      {f.required && <span className="sr-only"> (obligatorio)</span>}
    </>
  );
  if (f.type === "boolean") {
    return (
      <label className="flex min-h-11 items-center gap-3 self-end text-sm">
        <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        <span className="font-medium">{f.label}</span>
      </label>
    );
  }
  return (
    <Field label={label} error={error}>
      {f.type === "select" ? (
        <select {...invalid(error)} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          <option value="">Elegir…</option>
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...invalid(error)}
          type={f.type === "date" ? "date" : f.type === "url" ? "url" : "text"}
          inputMode={f.type === "number" ? "decimal" : undefined}
          placeholder={f.placeholder ?? (f.type === "url" ? "https://…" : undefined)}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

// ------------------------------------------------------------------ step 2: price and goal

function StepPrice({ d, category, update, errors }: StepProps) {
  const price = parseUsd(d.price);
  const max = Number(d.maxUnits) || 0;
  const min = Number(d.minUnits) || 0;
  const step = Math.max(1, category.unit.step);
  return (
    <Section title="Precio y cantidades" hint="El precio queda bloqueado en dólares digitales: no cambia aunque suba el boliviano.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Precio por ${category.unit.singular}`} error={errors.price} hint="Precio fijo hasta la entrega. Bs al cambio de referencia.">
          <AffixInput
            {...invalid(errors.price)}
            prefix="$us"
            suffix={price !== null && price > BigInt(0) ? `≈ Bs ${formatBs(price, category.priceDisplay.decimals)}` : undefined}
            inputMode="decimal"
            placeholder="0,60"
            value={d.price}
            onChange={(e) => update({ price: e.target.value })}
          />
        </Field>
        <div />
        <Field
          group
          label={`Cantidad mínima (${category.unit.plural})`}
          error={errors.minUnits}
          hint="Si no se alcanza antes del cierre, todos recuperan el 100% y tú no pierdes reputación."
        >
          <UnitStepper value={min || step} onChange={(n) => update({ minUnits: String(n) })} step={step} unit={category.unit.plural} label="Cantidad mínima" />
        </Field>
        <Field group label={`Lo máximo que puedes producir (${category.unit.plural})`} error={errors.maxUnits} hint="Nadie puede reservarte más que esto.">
          <UnitStepper value={max || step} onChange={(n) => update({ maxUnits: String(n) })} step={step} unit={category.unit.plural} label="Cantidad máxima" />
        </Field>
        <Field label="Cierre de la preventa" error={errors.saleEnd}>
          <input {...invalid(errors.saleEnd)} type="date" value={d.saleEnd} onChange={(e) => update({ saleEnd: e.target.value })} />
        </Field>
        <Field label={`Fecha límite para ${copy(category, "deliveryVerb")}`} error={errors.deadline}>
          <input {...invalid(errors.deadline)} type="date" value={d.deadline} onChange={(e) => update({ deadline: e.target.value })} />
        </Field>
      </div>
      {price !== null && price > BigInt(0) && max > 0 && (
        <dl className="grid gap-3 rounded-md bg-surface-2 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-2">Si vendes todo ({formatQty(max, category)})</dt>
            <dd>
              <Money amount={price * BigInt(max)} category={category} />
            </dd>
          </div>
          {min > 0 && (
            <div>
              <dt className="text-ink-2">Con la cantidad mínima ({formatQty(min, category)})</dt>
              <dd>
                <Money amount={price * BigInt(min)} category={category} />
              </dd>
            </div>
          )}
        </dl>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ step 3: milestones

function StepMilestones({ d, category, tier, feeBps, update, errors }: StepProps & { tier: TierInfo; feeBps: number }) {
  const used = advanceBps(d);
  const flow = moneyFlow(d, tier.bond_cover_bps, feeBps);
  const setM = (i: number, patch: Partial<CampaignDraft["milestones"][number]>) =>
    update({ milestones: d.milestones.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const anyOn = d.milestones.some((m) => m.enabled);
  const over = used > tier.max_advance_bps;

  return (
    <Section
      title="Adelantos por hitos (opcional)"
      hint={
        <>
          Puedes recibir parte del dinero antes de entregar, para comprar insumos. Cada adelanto se paga cuando el{" "}
          <Term k="verificador">verificador</Term> aprueba la evidencia de un <Term k="hito">hito</Term>, y necesita un{" "}
          <Term k="aval">aval</Term>.
        </>
      }
    >
      <div className="rounded-md bg-surface-2 p-4 text-sm text-ink-2 [&_b]:text-ink">
        Tu nivel <b>{TIER_NAMES[tier.tier]}</b>{" "}
        {tier.max_advance_bps > 0 ? (
          <>
            permite hasta <b>{formatPct(tier.max_advance_bps)}</b> de adelanto en total, respaldado por un aval del{" "}
            <b>{formatPct(tier.bond_cover_bps)}</b> de lo adelantado. Cumple entregas para subir de nivel.
          </>
        ) : (
          <>no permite adelantos por ahora: vendes con pago contra entrega hasta recuperar tu reputación.</>
        )}
      </div>

      {tier.max_advance_bps > 0 && (
        <>
          <div>
            <div className="mb-1.5 flex justify-between text-sm text-ink-2">
              <span>Adelanto total: {formatPct(used)}</span>
              <span>Límite: {formatPct(tier.max_advance_bps)}</span>
            </div>
            <ProgressBar value={Math.min(used, tier.max_advance_bps)} max={Math.max(1, tier.max_advance_bps)} tone={over ? "danger" : "brand"} label="Adelanto usado sobre tu límite" />
            {over && (
              <p className="t-detail mt-1.5 font-bold text-danger" role="alert">
                Pasaste tu límite de adelanto.
              </p>
            )}
          </div>

          <ul className="space-y-3">
            {d.milestones.map((m, i) => (
              <li key={i} className={`rounded-md p-3 ${m.enabled ? "bg-surface-2" : ""}`}>
                <div className="grid items-start gap-3 sm:grid-cols-[auto_1fr_7rem_auto]">
                  <input
                    type="checkbox"
                    className="mt-3 size-5 accent-[var(--brand)]"
                    checked={m.enabled}
                    onChange={(e) => setM(i, { enabled: e.target.checked })}
                    aria-label={`Usar el hito ${m.title || i + 1}`}
                  />
                  <Field label="Hito" error={errors[`milestone.${i}.title`]} hint={m.evidenceHint ? `Evidencia: ${m.evidenceHint}` : undefined}>
                    <input {...invalid(errors[`milestone.${i}.title`])} value={m.title} disabled={!m.enabled} onChange={(e) => setM(i, { title: e.target.value })} />
                  </Field>
                  <Field label="% adelanto" error={errors[`milestone.${i}.pct`]}>
                    <input
                      {...invalid(errors[`milestone.${i}.pct`])}
                      inputMode="decimal"
                      value={String(m.pct)}
                      disabled={!m.enabled}
                      onChange={(e) => setM(i, { pct: Number(e.target.value.replace(",", ".")) || 0 })}
                    />
                  </Field>
                  <button
                    type="button"
                    className="btn-ghost mt-6"
                    onClick={() => update({ milestones: d.milestones.filter((_, j) => j !== i) })}
                    aria-label="Quitar hito"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            {d.milestones.length < MAX_MILESTONES && (
              <button type="button" className="btn-ghost -ml-3" onClick={() => update({ milestones: [...d.milestones, { title: "", pct: 5, enabled: true }] })}>
                <Plus className="size-4" aria-hidden /> Agregar hito
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => update({ milestones: fitMilestones(category.milestoneTemplates, tier.max_advance_bps) })}
            >
              Usar los hitos sugeridos para {category.label.toLowerCase()}
            </button>
          </div>
        </>
      )}

      {errors.milestones && <Notice tone="danger">{errors.milestones}</Notice>}

      {anyOn && used > 0 && !over && (
        <p className="text-ink-2">
          Si vendes todo, recibirías <Money amount={flow.advanceNet} category={category} size="sm" /> por adelantado. Antes de que se apruebe,
          tú o alguien que te respalde debe dejar un aval de <Money amount={flow.bondNeeded} category={category} size="sm" />. Si cumples, el
          aval se devuelve entero.
        </p>
      )}
      {!anyOn && <p className="text-ink-2">Sin hitos: cobras todo al entregar. Es la opción más simple y no necesita aval.</p>}
    </Section>
  );
}

// ------------------------------------------------------------------ step 4: verifier and review

function StepReview({ d, category, tier, feeBps, update, errors, me }: StepProps & { tier: TierInfo; feeBps: number; me: string | null }) {
  const known = verifiersFor(d.categoryId, me);
  const pickedKnown = known.some((v) => v.address === d.verifier);
  const [other, setOther] = useState(() => !!d.verifier && !pickedKnown);
  const showInput = known.length === 0 || other;
  const flow = moneyFlow(d, tier.bond_cover_bps, feeBps);
  const size = inlineEstimate(d);
  const sale = daySeconds(d.saleEnd);
  const deadline = daySeconds(d.deadline);
  const on = d.milestones.filter((m) => m.enabled);
  const price = parseUsd(d.price) ?? BigInt(0);
  return (
    <>
      <Section
        title="Verificador"
        hint={`Una persona o institución independiente (${category.verifierLabel.toLowerCase()}). Aprueba los hitos y decide si hay una disputa. Nunca puede quedarse con el dinero.`}
      >
        {known.length > 0 && (
          <fieldset className="grid gap-2">
            <legend className="sr-only">Elige un verificador</legend>
            {known.map((v) => (
              <label
                key={v.address}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${
                  !other && d.verifier === v.address ? "border-brand bg-brand-soft" : "border-line-strong hover:bg-surface-2"
                }`}
              >
                <input
                  type="radio"
                  name="verifier"
                  className="mt-1 accent-[var(--brand)]"
                  checked={!other && d.verifier === v.address}
                  onChange={() => {
                    setOther(false);
                    update({ verifier: v.address });
                  }}
                />
                <span className="min-w-0">
                  <b className="block">{v.name}</b>
                  {v.note && <span className="block text-ink-2">{v.note}</span>}
                  <span className="font-mono text-ink-2">{shortAddress(v.address)}</span>
                </span>
              </label>
            ))}
            <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm ${other ? "border-brand bg-brand-soft" : "border-line-strong hover:bg-surface-2"}`}>
              <input
                type="radio"
                name="verifier"
                className="accent-[var(--brand)]"
                checked={other}
                onChange={() => {
                  setOther(true);
                  if (pickedKnown) update({ verifier: "" });
                }}
              />
              <b>Otra persona o institución</b>
            </label>
          </fieldset>
        )}
        {showInput && (
          <Field label={`Dirección de Stellar del verificador (${category.verifierLabel.toLowerCase()})`} error={errors.verifier}>
            <input
              {...invalid(errors.verifier)}
              className="w-full font-mono"
              placeholder="G…"
              spellCheck={false}
              autoComplete="off"
              value={d.verifier}
              onChange={(e) => update({ verifier: e.target.value.trim() })}
            />
          </Field>
        )}
        {!showInput && errors.verifier && (
          <p className="t-detail text-danger" role="alert">
            {errors.verifier}
          </p>
        )}
      </Section>

      <Section title="Revisa tu preventa">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label="Producto">
            {category.label} · {d.title}
          </Row>
          <Row label="Precio">
            <Money amount={price} category={category} size="sm" /> por {category.unit.singular}
          </Row>
          <Row label="Mínimo y máximo">
            {formatQty(Number(d.minUnits), category)} mínimo · {formatQty(Number(d.maxUnits), category)} máximo
          </Row>
          <Row label="Fechas">
            Cierre {sale ? formatDate(sale) : "—"} · Entrega hasta {deadline ? formatDate(deadline) : "—"}
          </Row>
          <Row label="Adelantos">{on.length ? on.map((m) => `${m.title} (${m.pct}%)`).join(", ") : "Ninguno: cobro contra entrega"}</Row>
          <Row label="Verificador">{d.verifier ? (known.find((v) => v.address === d.verifier)?.name ?? shortAddress(d.verifier)) : "—"}</Row>
        </dl>
      </Section>

      <Section title="Cómo te llega el dinero" hint="Si vendes todo y cumples todas las entregas:">
        <ol className="space-y-2 text-sm">
          <li className="flex flex-wrap justify-between gap-2">
            <span>Entra a custodia</span>
            <Money amount={flow.gross} category={category} size="sm" />
          </li>
          {flow.advance > BigInt(0) && (
            <li className="flex flex-wrap justify-between gap-2">
              <span>Adelanto por hitos (con aval de {formatPct(tier.bond_cover_bps)})</span>
              <Money amount={flow.advanceNet} category={category} size="sm" />
            </li>
          )}
          <li className="flex flex-wrap justify-between gap-2">
            <span>Al entregar, a medida que tus compradores confirman</span>
            <Money amount={flow.onDeliveryNet} category={category} size="sm" />
          </li>
          <li className="flex flex-wrap justify-between gap-2 text-ink-2">
            <span>
              {formatPct(feeBps)} para el <Term k="fondo">fondo común</Term>
            </span>
            <Money amount={flow.fee} category={category} size="sm" showBs={false} />
          </li>
          <li className="flex flex-wrap justify-between gap-2 border-t border-line pt-2 font-semibold">
            <span>Recibes en total</span>
            <Money amount={flow.totalNet} category={category} />
          </li>
        </ol>
        <p className="text-ink-2">
          Si no llegas al mínimo de {formatQty(Number(d.minUnits), category)}, todos recuperan su dinero y tu reputación no cambia.
        </p>
      </Section>

      <p className={`text-sm ${size > INLINE_SOFT_LIMIT ? "text-warning" : "text-ink-2"}`}>
        Los detalles se guardan en el contrato ({size.toLocaleString("es-BO")} bytes
        {size > INLINE_SOFT_LIMIT ? ": es bastante, una descripción más corta abarata cada operación" : ""}).
        {errors.size && <span className="block text-danger">{errors.size}</span>}
      </p>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-ink-2">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

// ------------------------------------------------------------------ preview and result

function Preview({
  d,
  category,
  address,
  stats,
  tier,
  now,
}: {
  d: CampaignDraft;
  category: CategoryDef;
  address: string | null;
  stats?: ProducerStats;
  tier: TierInfo;
  now: bigint;
}) {
  const c = previewCampaign(d, address ?? PREVIEW_SELLER, tier.bond_cover_bps, Number(now));
  const meta = toMetadata(d);
  const fallback: ProducerStats = {
    rep: { completed: 0, defaulted: 0, units_delivered: 0, units_refunded: 0, streak: 0, best_streak: 0, rating_sum: 0, rating_count: 0 },
    tier,
  };
  return (
    <CampaignCard
      c={c}
      meta={{ ...meta, producer: { ...meta.producer, displayName: meta.producer.displayName || "Tu nombre" } }}
      category={category}
      producer={stats ?? fallback}
      now={now}
      href="#"
    />
  );
}

function Published({ id, onAnother }: { id: bigint; onAnother: () => void }) {
  return (
    <section className="mx-auto max-w-lg space-y-5 py-6 text-center">
      <CircleCheck className="mx-auto size-12 text-success" aria-hidden />
      <h1 className="h-page">Tu preventa está publicada</h1>
      <p className="text-ink-2">
        Ya está en el contrato de Stellar. Compártela con tus compradores: su dinero queda en custodia hasta que les entregues.
      </p>
      <div className="flex justify-center">
        <StatusPill status="Funding" />
      </div>
      {id >= BigInt(0) && (
        <div className="space-y-2">
          <p className="text-[0.9375rem] font-bold">Avísale a tus compradores</p>
          <ShareButton
            className="justify-center"
            path={`/campaign/${id.toString()}`}
            title="Mi preventa en Ayni"
            text="Abrí mi preventa en Ayni: compras hoy a precio fijo y tu pago queda protegido hasta que te entrego."
          />
          <Link href={`/campaign/${id.toString()}/cartel`} className="btn-ghost">
            <Printer className="size-4" aria-hidden /> Imprimir un cartel con QR para tu puesto
          </Link>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        {id >= BigInt(0) ? (
          <Link href={`/campaign/${id.toString()}`} className="btn">
            Ver mi preventa
          </Link>
        ) : (
          <Link href="/producer" className="btn">
            Ir a mi panel
          </Link>
        )}
        <button type="button" className="btn-ghost" onClick={onAnother}>
          Crear otra
        </button>
      </div>
    </section>
  );
}
