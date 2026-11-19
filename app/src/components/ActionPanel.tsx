"use client";

// Renders Action[] from lib/actions.ts. Components never decide what is allowed: they show what
// nextActions returned, collect the inputs the action asks for, and submit argsFor(...).

import { Minus, Plus, Scale, Star, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { CategoryDef } from "@/catalog";
import { argsFor, requiredBondFor, successMessage, type Action, type ActionValues } from "@/lib/actions";
import { isValidAddress, toAmount, type Campaign } from "@/lib/despensa";
import { CURRENCY, formatBs, formatQty } from "@/lib/format";
import { invalidateCampaign } from "@/lib/hooks";
import { Money } from "./Money";
import { BUSY_LABEL, Dialog, Field, Notice, Spinner, TxSteps } from "./ui";
import { READ_ONLY_ID, useAction, useWallet } from "./Wallet";

const BPS = BigInt(10_000);

/** Secondary actions always open the dialog, so their consequence is read before anything happens. */
export function needsDialog(a: Action, primary = true) {
  return !!a.input || !!a.confirm || !primary;
}

/**
 * One primary action, with its consequence written under it, then the others as quieter buttons.
 * Disabled actions say why, in text. `onLocal` handles UI-only actions (method null).
 */
export function ActionList({
  actions,
  c,
  category,
  onLocal,
  compact = false,
}: {
  actions: Action[];
  c: Campaign;
  category: CategoryDef;
  onLocal?: (a: Action) => void;
  /** Hide the primary action's description (the context above already says it). */
  compact?: boolean;
}) {
  const { enabled, address, connect } = useWallet();
  const tx = useAction();
  const [open, setOpen] = useState<Action | null>(null);
  const [ran, setRan] = useState<Action | null>(null);
  if (actions.length === 0) return null;

  const [first, ...rest] = actions;
  const primary = first.tone === "primary" && !first.disabled ? first : null;
  const others = primary ? rest : actions;

  const click = (a: Action, isPrimary: boolean) => {
    if (a.method === null) return onLocal?.(a);
    if (!address) return connect();
    if (needsDialog(a, isPrimary)) return setOpen(a);
    setRan(a);
    tx.run(a.method, argsFor(a, c.id, address), () => invalidateCampaign(c.id));
  };

  const blockedProps = (a: Action) => {
    const readOnly = a.method !== null && !enabled;
    return {
      disabled: !!a.disabled || readOnly || tx.busy,
      "aria-describedby": readOnly ? READ_ONLY_ID : a.disabled ? `why-${a.id}-${a.milestoneIndex ?? ""}` : undefined,
    };
  };
  const reasons = actions.filter((a) => a.disabled);

  return (
    <div className="space-y-3">
      {primary && (
        <div className="space-y-1.5">
          <button
            type="button"
            className="btn btn-lg w-full sm:w-auto"
            onClick={() => click(primary, true)}
            aria-busy={tx.busy && ran === primary}
            {...blockedProps(primary)}
          >
            {tx.busy && ran === primary ? (
              <>
                <Spinner /> {BUSY_LABEL[tx.phase]}
              </>
            ) : (
              primary.label
            )}
          </button>
          {!compact && <p className="t-detail text-ink-2">{primary.description}</p>}
        </div>
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {others.map((a, i) => (
            <button
              key={`${a.role}-${a.id}-${a.milestoneIndex ?? ""}-${a.buyer ?? ""}-${i}`}
              type="button"
              className={`btn-secondary ${a.tone === "danger" ? "border-danger text-danger" : ""}`}
              onClick={() => click(a, false)}
              {...blockedProps(a)}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      {reasons.map((a) => (
        <p key={`why-${a.id}-${a.milestoneIndex ?? ""}`} id={`why-${a.id}-${a.milestoneIndex ?? ""}`} className="t-detail flex items-start gap-1.5 text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <b className="font-bold">{a.label}:</b> {a.disabled}
          </span>
        </p>
      ))}
      <TxSteps phase={tx.phase} error={tx.error} hash={tx.hash} failedAt={tx.failedAt} success={ran ? successMessage(ran, category) : undefined} />
      {open && <ActionDialog action={open} c={c} category={category} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** What this action moves, in money, for the confirm step. Null when there is nothing to show. */
function moneyLine(a: Action, c: Campaign, units: number): { label: string; amount: bigint } | null {
  const unpaid = (n: number) => (BigInt(n) * c.unit_price * (BPS - BigInt(c.released_bps))) / BPS;
  switch (a.id) {
    case "buy":
      return { label: "Total a pagar", amount: c.unit_price * BigInt(units) };
    case "confirm":
      return { label: "Sale de la custodia hacia el productor", amount: unpaid(units) };
    case "approve_milestone": {
      const m = a.milestoneIndex !== undefined ? c.milestones[a.milestoneIndex] : undefined;
      return m ? { label: "Adelanto que recibe el productor", amount: (c.unit_price * BigInt(c.sold) * BigInt(m.bps)) / BPS } : null;
    }
    default:
      return null;
  }
}

/** The form + confirm step + transaction progress for one action. */
export function ActionDialog({
  action: a,
  c,
  category,
  initial = {},
  onClose,
}: {
  action: Action;
  c: Campaign;
  category: CategoryDef;
  initial?: ActionValues;
  onClose: () => void;
}) {
  const { address, connect } = useWallet();
  const tx = useAction();
  const step = Math.max(1, category.unit.step);
  const [units, setUnits] = useState(initial.units ?? (a.input === "units" && a.id !== "buy" ? a.maxUnits ?? step : step));
  const [addr, setAddr] = useState(initial.address ?? "");
  const [stars, setStars] = useState(initial.stars ?? 5);
  const [amount, setAmount] = useState("");
  const [evidence, setEvidence] = useState(initial.evidence ?? "");
  const [verdict, setVerdict] = useState<boolean | null>(initial.verdict ?? null);
  const [touched, setTouched] = useState(false);

  const needs = {
    units: a.input === "units" || a.input === "units_and_address",
    address: a.input === "units_and_address" || a.input === "buyer_address" || a.input === "buyer_and_verdict",
    stars: a.input === "stars",
    amount: a.input === "amount",
    evidence: a.input === "evidence",
    verdict: a.input === "verdict" || a.input === "buyer_and_verdict",
  };

  let parsedAmount: bigint | null = null;
  try {
    parsedAmount = amount.trim() && /^\d+(\.\d{0,7})?$/.test(amount.trim()) ? toAmount(amount) : null;
  } catch {
    parsedAmount = null;
  }

  const error = validate();
  function validate(): string | null {
    if (needs.units) {
      if (!Number.isInteger(units) || units < 1) return "Ingresa una cantidad válida.";
      if (a.maxUnits !== undefined && units > a.maxUnits) return `Máximo ${formatQty(a.maxUnits, category)}.`;
    }
    if (needs.address) {
      const v = addr.trim();
      if (!isValidAddress(v)) return "Ingresa una dirección de Stellar válida (empieza con G).";
      if (v === c.seller || v === c.verifier) return "No puede ser el productor ni el verificador de esta campaña.";
      if (a.id === "transfer" && v === address) return "Esa es tu propia dirección.";
    }
    if (needs.amount && (!parsedAmount || parsedAmount <= BigInt(0))) return "Ingresa un monto mayor a 0.";
    if (needs.evidence && !/^(https|ipfs):\/\/\S+$/.test(evidence.trim())) return "La evidencia debe ser un enlace https:// o ipfs://.";
    if (needs.verdict && verdict === null) return "Elige una opción.";
    return null;
  }

  const values: ActionValues = {
    units,
    address: addr.trim(),
    stars,
    amount: parsedAmount ?? undefined,
    evidence: evidence.trim(),
    verdict: verdict ?? undefined,
  };

  const submit = () => {
    if (!address) return connect();
    setTouched(true);
    if (error || a.method === null) return;
    tx.run(a.method, argsFor(a, c.id, address, values), () => invalidateCampaign(c.id));
  };

  const settled = tx.phase === "done" || tx.phase === "pending" || tx.phase === "unconfirmed";
  const milestone = a.milestoneIndex !== undefined ? c.milestones[a.milestoneIndex] : undefined;
  const template = milestone
    ? category.milestoneTemplates.find((t) => t.title === milestone.title) ?? category.milestoneTemplates[a.milestoneIndex!]
    : undefined;
  const money = moneyLine(a, c, units);
  // Irreversible actions with nothing to fill in get the alert dialog; the rest, the bottom sheet.
  const alert = !!a.irreversible && !a.input;
  const showError = touched && error;

  return (
    <Dialog
      open
      onClose={onClose}
      title={a.label}
      variant={alert ? "alert" : "sheet"}
      icon={a.id === "dispute" ? Scale : TriangleAlert}
      tone={a.tone === "danger" ? "warning" : "brand"}
    >
      <div className="space-y-5">
        <p className="text-sm text-ink-2">{a.description}</p>

        {needs.address && (
          <Field label={a.id === "transfer" ? "Dirección de quien recibe" : "Dirección del comprador"}>
            <input
              className="w-full font-mono"
              placeholder="G…"
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={showError && !isValidAddress(addr.trim()) ? true : undefined}
            />
          </Field>
        )}

        {needs.units && (
          // Not a <Field>: a <label> around the stepper would send a tap on its text to the "Uno menos" button.
          <div role="group" aria-labelledby="qty-label">
            <p id="qty-label" className="mb-1.5 text-[0.9375rem] font-bold">
              Cantidad ({category.unit.plural})
            </p>
            <Stepper value={units} onChange={setUnits} step={step} max={a.maxUnits} unit={category.unit.plural} label={`Cantidad en ${category.unit.plural}`} />
            {a.maxUnits !== undefined && <p className="t-detail mt-1.5 text-ink-2">Máximo {formatQty(a.maxUnits, category)}.</p>}
          </div>
        )}

        {needs.stars && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Tu calificación</legend>
            <div className="flex gap-1" role="radiogroup" aria-label="Estrellas">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={stars === s}
                  aria-label={`${s} estrella${s > 1 ? "s" : ""}`}
                  onClick={() => setStars(s)}
                  className="rounded-md p-1.5 hover:bg-surface-2"
                >
                  <Star className={`size-7 ${s <= stars ? "fill-accent text-accent" : "text-line-strong"}`} aria-hidden />
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {needs.amount && (
          <Field
            label={`Monto en dólares (${CURRENCY})`}
            hint={parsedAmount !== null ? `≈ Bs ${formatBs(parsedAmount)} al tipo de cambio referencial.` : "Por ejemplo 50,00"}
          >
            <input className="w-full" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} />
            {a.id === "add_bond" && <BondHint c={c} category={category} />}
          </Field>
        )}

        {needs.evidence && (
          <Field label="Enlace a la evidencia (foto, factura, informe)" hint={template?.evidenceHint ? `Se espera: ${template.evidenceHint}` : undefined}>
            <input className="w-full" placeholder="https://…" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
          </Field>
        )}

        {needs.verdict && (
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">¿La entrega ocurrió?</legend>
            {[
              { v: true, label: "Sí, entregó", hint: "Se paga al productor." },
              { v: false, label: "No entregó", hint: "El comprador recupera sus vales." },
            ].map((o) => (
              <label
                key={String(o.v)}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${
                  verdict === o.v ? "border-brand bg-brand-soft" : "border-line-strong"
                }`}
              >
                <input type="radio" name="verdict" className="mt-1 accent-[var(--brand)]" checked={verdict === o.v} onChange={() => setVerdict(o.v)} />
                <span>
                  <b className="block">{o.label}</b>
                  <span className="text-ink-2">{o.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {money && (
          <p className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-4 text-sm">
            <span className="text-ink-2">{money.label}</span>
            <Money amount={money.amount} category={category} size="lg" />
          </p>
        )}

        {a.confirm &&
          !settled &&
          (a.irreversible ? (
            <Notice tone="warning" title="No se puede deshacer">
              {a.confirm}
            </Notice>
          ) : (
            <Notice tone="neutral">{a.confirm}</Notice>
          ))}

        {showError && !settled && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <TxSteps phase={tx.phase} error={tx.error} hash={tx.hash} failedAt={tx.failedAt} success={successMessage(a, category)}>
          {a.id === "buy" && (
            <Link href="/me" className="link">
              Ver mis vales
            </Link>
          )}
        </TxSteps>

        <div className="flex flex-col gap-2">
          {!settled && (
            <button
              type="button"
              className={`${a.tone === "danger" ? "btn-danger" : "btn"} btn-lg w-full`}
              disabled={tx.busy}
              aria-busy={tx.busy}
              onClick={submit}
            >
              {tx.busy ? (
                <>
                  <Spinner /> {BUSY_LABEL[tx.phase]}
                </>
              ) : address ? (
                a.irreversible ? (
                  `Sí, ${a.label.charAt(0).toLowerCase()}${a.label.slice(1)}`
                ) : (
                  a.label
                )
              ) : (
                "Entrar para continuar"
              )}
            </button>
          )}
          <button type="button" className={`${alert && !settled ? "btn-secondary" : "btn-ghost"} w-full`} onClick={onClose}>
            {settled ? "Cerrar" : alert ? "Mejor no" : "Volver"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function BondHint({ c, category }: { c: Campaign; category: CategoryDef }) {
  const next = c.milestones.findIndex((m) => !m.released);
  if (next < 0) return null;
  const required = requiredBondFor(c, next);
  if (required <= c.bond_total) return null;
  return (
    <span className="mt-2 block text-ink-2">
      Para aprobar el próximo hito se necesita un aval total de <Money amount={required} category={category} size="sm" showBs={false} /> (hoy hay{" "}
      <Money amount={c.bond_total} category={category} size="sm" showBs={false} />
      ).
    </span>
  );
}

/**
 * Quantity (board 03, "¿Cuántos litros?"): 52 px minus and plus buttons around a filled middle with the
 * number in the amount face and the unit next to it. Typing works too.
 */
export function Stepper({
  value,
  onChange,
  step = 1,
  max,
  label = "Cantidad",
  unit,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  max?: number;
  label?: string;
  /** "litros": shown after the number. */
  unit?: string;
}) {
  const clamp = (n: number) => Math.max(step, max !== undefined ? Math.min(max, n) : n);
  const side =
    "flex size-13 shrink-0 items-center justify-center rounded-md border-[1.5px] border-line-strong bg-surface text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:border-line disabled:text-ink-3 disabled:hover:bg-surface";
  return (
    <div className="flex w-full max-w-xs items-center gap-2">
      <button type="button" className={side} onClick={() => onChange(clamp(value - step))} disabled={value <= step} aria-label="Uno menos">
        <Minus className="size-[22px]" aria-hidden />
      </button>
      <div className="flex h-13 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md bg-surface-2 px-2 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-focus">
        <input
          type="number"
          inputMode="numeric"
          className="min-h-0 w-[4ch] min-w-0 rounded-none border-0 bg-transparent p-0 text-right font-display text-2xl font-extrabold text-ink tabular-nums [appearance:textfield] [font-stretch:110%] focus:shadow-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          style={{ width: `${Math.max(2, String(value).length) + 0.5}ch` }}
          value={value}
          min={step}
          max={max}
          step={step}
          onChange={(e) => {
            const n = Math.floor(Number(e.target.value));
            if (Number.isFinite(n)) onChange(clamp(n));
          }}
          aria-label={label}
        />
        {unit && <span className="truncate text-ink-2">{unit}</span>}
      </div>
      <button type="button" className={side} onClick={() => onChange(clamp(value + step))} disabled={max !== undefined && value + step > max} aria-label="Uno más">
        <Plus className="size-[22px]" aria-hidden />
      </button>
    </div>
  );
}
