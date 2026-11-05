"use client";

// Small UI primitives shared by every screen. Colors come from the tokens in globals.css only.

import {
  Check,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock,
  ExternalLink,
  Info,
  LoaderCircle,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { config } from "@/lib/config";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-2 ${className}`} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface-2 px-6 py-12 text-center">
      {icon && <div className="text-ink-3">{icon}</div>}
      <h2 className="h-section">{title}</h2>
      {children && <div className="max-w-md text-sm text-ink-2">{children}</div>}
      {action && (
        <Link href={action.href} className="btn-secondary mt-2">
          {action.label}
        </Link>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ notices

export type Tone = "info" | "warning" | "danger" | "success" | "neutral";

const TONES: Record<Tone, { cls: string; icon: LucideIcon }> = {
  info: { cls: "bg-info-soft text-info", icon: Info },
  warning: { cls: "bg-warning-soft text-warning", icon: TriangleAlert },
  danger: { cls: "bg-danger-soft text-danger", icon: CircleAlert },
  success: { cls: "bg-success-soft text-success", icon: CircleCheck },
  neutral: { cls: "bg-surface-2 text-ink-2", icon: Info },
};

/** A message with an icon (color never carries the meaning alone). Errors are announced. */
export function Notice({
  tone = "info",
  title,
  children,
  action,
  icon,
  id,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  id?: string;
}) {
  const t = TONES[tone];
  const Icon = icon ?? t.icon;
  return (
    <div id={id} className={`flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl px-4 py-3 text-sm ${t.cls}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "text-ink-2" : ""}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

// ------------------------------------------------------------------ hint (accessible tooltip)

/**
 * A "?" help affordance for non-critical explanations. Opens on hover, keyboard focus and tap; Esc or
 * a tap outside closes it. The text is linked with aria-describedby, so screen readers read it with
 * the button. Never put fees, risks or irreversible consequences only in here.
 */
export function Hint({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = hover || focus || pinned;

  const close = useCallback(() => {
    setHover(false);
    setFocus(false);
    setPinned(false);
  }, []);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(288, window.innerWidth - 16);
    const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8);
    const below = r.bottom + 8 + 140 < window.innerHeight;
    setPos(below ? { top: r.bottom + 6, left, width } : { bottom: window.innerHeight - r.top + 6, left, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !document.getElementById(id)?.contains(t)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", close, { passive: true, capture: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
    };
  }, [open, close, id]);

  const enter = () => {
    if (timer.current) clearTimeout(timer.current);
    place();
    setHover(true);
  };
  const leave = () => {
    timer.current = setTimeout(() => setHover(false), 120);
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={id}
        className="-my-1 inline-flex size-6 shrink-0 translate-y-0.5 items-center justify-center rounded-full align-baseline text-ink-3 hover:bg-surface-2 hover:text-ink"
        onPointerEnter={(e) => e.pointerType === "mouse" && enter()}
        onPointerLeave={(e) => e.pointerType === "mouse" && leave()}
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) {
            place();
            setFocus(true);
          }
        }}
        onBlur={() => setFocus(false)}
        onClick={() => {
          place();
          setPinned((p) => !p);
        }}
      >
        <CircleHelp className="size-4" aria-hidden />
      </button>
      <span
        id={id}
        role="tooltip"
        hidden={!open}
        style={{ position: "fixed", ...pos }}
        onPointerEnter={enter}
        onPointerLeave={leave}
        className="z-50 rounded-xl bg-ink px-3 py-2 text-left text-sm leading-relaxed font-normal text-bg shadow-lift"
      >
        {children}
      </span>
    </>
  );
}

/** A glossary term with its plain-language definition behind a Hint. */
export function Term({ k, children }: { k: GlossaryKey; children?: ReactNode }) {
  const g = GLOSSARY[k];
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <span>{children ?? g.term}</span>
      <Hint label={`Qué es: ${g.term}`}>
        <b className="font-semibold">{g.term}:</b> {g.definition}
      </Hint>
    </span>
  );
}

// ------------------------------------------------------------------ data display

/** A label and its value. Use inside a <dl>. */
export function Stat({
  label,
  value,
  hint,
  size = "md",
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  size?: "md" | "lg";
  tone?: "danger";
}) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className={`font-semibold tabular-nums ${size === "lg" ? "text-2xl" : "text-base"} ${tone === "danger" ? "text-danger" : ""}`}>{value}</dd>
      {hint && <dd className="text-sm text-ink-2">{hint}</dd>}
    </div>
  );
}

/** A horizontal bar. `marker` draws a tick (e.g. the all-or-nothing goal) at that value. */
export function ProgressBar({
  value,
  max,
  label,
  marker,
  tone = "brand",
  size = "md",
}: {
  value: number;
  max: number;
  label: string;
  marker?: number;
  tone?: "brand" | "danger";
  size?: "md" | "lg";
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const mark = marker !== undefined && max > 0 ? Math.min(100, (marker / max) * 100) : null;
  return (
    <div
      className={`relative w-full overflow-hidden rounded-full bg-surface-2 ${size === "lg" ? "h-3" : "h-2"}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <div className={`h-full rounded-full ${tone === "danger" ? "bg-danger" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      {mark !== null && <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `calc(${mark}% - 1px)` }} aria-hidden />}
    </div>
  );
}

export function ExplorerLink({ path, children }: { path: string; children: ReactNode }) {
  return (
    <a
      href={`${config.explorer}/${path}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-medium text-brand underline-offset-2 hover:underline"
    >
      {children}
      <ExternalLink className="size-3.5" aria-hidden />
      <span className="sr-only">(se abre en otra pestaña)</span>
    </a>
  );
}

/** A form field: label, control, then either the error or the hint. */
export function Field({
  label,
  hint,
  error,
  children,
  wide,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`block text-sm ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1.5 block font-medium text-ink">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 flex items-start gap-1 text-danger" role="alert">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {error}
        </span>
      ) : (
        hint && <span className="mt-1.5 block text-ink-2">{hint}</span>
      )}
    </label>
  );
}

// ------------------------------------------------------------------ money movement status

export type MoneyState = "pending" | "completed" | "failed";

const MONEY: Record<MoneyState, { label: string; icon: LucideIcon; cls: string }> = {
  pending: { label: "Pendiente", icon: Clock, cls: "bg-info-soft text-info" },
  completed: { label: "Completado", icon: CircleCheck, cls: "bg-success-soft text-success" },
  failed: { label: "Falló", icon: CircleX, cls: "bg-danger-soft text-danger" },
};

/** Status of a movement of money, as icon + word. */
export function MoneyStatus({ state, label }: { state: MoneyState; label?: string }) {
  const m = MONEY[state];
  const Icon = m.icon;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${m.cls}`}>
      <Icon className="size-3.5" aria-hidden />
      {label ?? m.label}
    </span>
  );
}

// ------------------------------------------------------------------ transactions

/**
 * idle → preparing → signing → confirming → done. `pending`: the network accepted it but has not
 * confirmed it yet (don't retry). `error`: nothing moved.
 */
/**
 * `pending`: the network accepted it, not yet in a ledger. `unconfirmed`: we stopped hearing back
 * (a timeout), so it may or may not have gone through. Never report either as a failure.
 */
export type TxPhase = "idle" | "preparing" | "signing" | "confirming" | "pending" | "unconfirmed" | "done" | "error";

const STEPS: { key: TxPhase; label: string }[] = [
  { key: "preparing", label: "Preparando" },
  { key: "signing", label: "Firmando" },
  { key: "confirming", label: "Confirmando en Stellar" },
];

export function TxSteps({
  phase,
  error,
  hash,
  success,
  children,
}: {
  phase: TxPhase;
  error?: string;
  hash?: string;
  /** One line saying what just happened, shown once confirmed (see successMessage in lib/actions). */
  success?: string;
  /** Extra content for the confirmed state, e.g. a link to the next step. */
  children?: ReactNode;
}) {
  if (phase === "idle") return null;
  const link = hash ? <ExplorerLink path={`tx/${hash}`}>Ver en Stellar</ExplorerLink> : null;
  if (phase === "done") {
    return (
      <div className="space-y-2 rounded-xl bg-success-soft px-4 py-3 text-sm" role="status" aria-live="polite">
        <MoneyStatus state="completed" />
        {success && <p className="font-medium text-ink">{success}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {children}
          {link}
        </div>
      </div>
    );
  }
  if (phase === "pending") {
    return (
      <div className="space-y-2 rounded-xl bg-info-soft px-4 py-3 text-sm" role="status" aria-live="polite">
        <MoneyStatus state="pending" />
        <p className="text-ink">La red recibió la operación y todavía no la confirma. No la repitas: puede tardar unos minutos.</p>
        {link}
      </div>
    );
  }
  if (phase === "unconfirmed") {
    return (
      <div className="space-y-2 rounded-xl bg-warning-soft px-4 py-3 text-sm" role="status" aria-live="polite">
        <MoneyStatus state="pending" label="Sin confirmar" />
        <p className="text-ink">
          La red tardó en responder y no sabemos todavía si la operación pasó. Revisa esta página en un minuto antes de
          repetirla: si ya cambió, se completó.
        </p>
        {link}
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div className="space-y-2 rounded-xl bg-danger-soft px-4 py-3 text-sm" role="alert">
        <MoneyStatus state="failed" />
        <p className="text-ink">
          {error} <span className="text-ink-2">No se movió tu dinero.</span>
        </p>
        {link}
      </div>
    );
  }
  const at = STEPS.findIndex((s) => s.key === phase);
  return (
    <ol className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" aria-live="polite">
      {STEPS.map((s, i) => (
        <li key={s.key} className={`flex items-center gap-1.5 ${i <= at ? "text-ink" : "text-ink-3"}`}>
          {i < at ? (
            <Check className="size-4 text-success" aria-hidden />
          ) : i === at ? (
            <LoaderCircle className="size-4 animate-spin text-brand" aria-hidden />
          ) : (
            <span className="size-4 rounded-full border border-line-strong" aria-hidden />
          )}
          {s.label}
          {i < at && <span className="sr-only"> (hecho)</span>}
        </li>
      ))}
    </ol>
  );
}

// ------------------------------------------------------------------ dialog

/**
 * True while another layer (Pollar's signature prompt) needs the screen. A native modal <dialog>
 * sits in the browser's top layer and makes the rest of the page inert, so a prompt rendered as an
 * ordinary overlay would be hidden and unclickable behind it. The wallet provider sets this.
 */
export const DialogSuspendContext = createContext(false);

/** Modal dialog on desktop, bottom sheet on phones. Uses the native <dialog> (focus trap, Esc). */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const suspended = useContext(DialogSuspendContext);
  // Set when we close the element only to step aside, so its close event doesn't close the dialog for good.
  const stepAside = useRef(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const show = open && !suspended;
    if (show && !d.open) d.showModal();
    if (!show && d.open) {
      stepAside.current = open;
      d.close();
    }
  }, [open, suspended]);
  return (
    <dialog
      ref={ref}
      onClose={() => {
        if (stepAside.current) {
          stepAside.current = false;
          return;
        }
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className="m-0 mt-auto w-full max-w-none rounded-t-2xl bg-surface p-0 text-ink shadow-lift backdrop:bg-scrim sm:m-auto sm:max-w-md sm:rounded-2xl"
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-2">
        <h2 className="h-section">{title}</h2>
        <button type="button" onClick={onClose} className="inline-flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2" aria-label="Cerrar">
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto px-5 pt-2 pb-5">{children}</div>
    </dialog>
  );
}
