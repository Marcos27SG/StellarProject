"use client";

// Small UI primitives shared by every screen (design boards 03–05). Colors come from the tokens in
// globals.css only. Every status is an icon plus a word; color never carries the meaning alone.

import {
  Check,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clock,
  Eye,
  Info,
  Lock,
  RotateCw,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { config } from "@/lib/config";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";
import { Puntada } from "./Puntada";

// ------------------------------------------------------------------ loading

/** The busy indicator inside buttons and the transaction stepper. Pair it with words ("Firmando…"). */
export function Spinner({ className = "size-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`shrink-0 animate-[spin_0.9s_linear_infinite] ${className}`} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity={0.3} strokeWidth={3} />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

/** A placeholder block. Skeletons repeat the real layout so nothing jumps when data arrives. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xs bg-surface-2 ${className}`} aria-hidden />;
}

/** The campaign card while it loads (same shape as CampaignCard). */
export function CampaignCardSkeleton() {
  return (
    <div className="card flex flex-col gap-3.5 p-3.5" aria-hidden>
      <div className="flex gap-3">
        <Skeleton className="size-[76px] shrink-0 rounded-md" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <Skeleton className="h-4 w-[85%]" />
          <Skeleton className="h-3 w-[60%]" />
          <Skeleton className="h-3 w-[40%]" />
        </div>
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-[22px] w-[40%]" />
        <Skeleton className="h-3.5 w-[22%]" />
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
      <Skeleton className="h-3 w-[70%]" />
    </div>
  );
}

/** A voucher while it loads (same shape as VoucherTicket). */
export function VoucherSkeleton() {
  return (
    <div className="card flex flex-col gap-3 p-4" aria-hidden>
      <div className="flex justify-between">
        <Skeleton className="h-7 w-28 rounded-full" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 shrink-0 rounded-md" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-[70%]" />
          <Skeleton className="h-3 w-[45%]" />
        </div>
      </div>
      <Skeleton className="h-11 w-full rounded-md" />
    </div>
  );
}

// ------------------------------------------------------------------ empty

/** Two diamonds, one still dashed: something that hasn't been woven yet. */
function EmptyDrawing() {
  return (
    <svg viewBox="0 0 60 36" fill="none" strokeLinejoin="round" className="h-[72px] w-[120px]" aria-hidden>
      <path d="M20 4 L34 18 L20 32 L6 18 Z" className="stroke-line-strong" strokeWidth={2.2} strokeDasharray="4 3" />
      <path d="M40 4 L54 18 L40 32 L26 18 Z" className="stroke-brand" strokeWidth={2.2} />
    </svg>
  );
}

/** Nothing here yet: says why, and invites the next step. `icon` replaces the drawing for errors. */
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
    <div className="card flex flex-col items-center gap-3 px-5 py-7 text-center shadow-none">
      {icon ? <div className="text-brand [&>svg]:size-10">{icon}</div> : <EmptyDrawing />}
      <h2 className="t-title-2">{title}</h2>
      {children && <div className="max-w-md text-ink-2">{children}</div>}
      {action && (
        <Link href={action.href} className="btn mt-1">
          {action.label}
        </Link>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ pills

export type PillTone = "brand" | "accent" | "info" | "warning" | "success" | "danger" | "neutral";

const PILL: Record<PillTone, string> = {
  brand: "bg-brand-soft text-brand",
  accent: "bg-accent-soft text-accent-ink",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-surface-2 text-ink-2",
};

/** A status: tinted fill + icon + word (board 03, "Estados"). */
export function Pill({ tone, icon: Icon, children, className = "" }: { tone: PillTone; icon: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex h-7 shrink-0 items-center gap-[5px] rounded-full pr-2.5 pl-[7px] text-sm leading-none font-bold whitespace-nowrap ${PILL[tone]} ${className}`}>
      <Icon className="size-4" strokeWidth={2.2} aria-hidden />
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ notices

export type Tone = "info" | "warning" | "danger" | "success" | "neutral" | "brand";

const TONES: Record<Tone, { box: string; icon: LucideIcon; iconCls: string }> = {
  info: { box: "bg-info-soft", icon: Info, iconCls: "text-info" },
  warning: { box: "bg-warning-soft", icon: TriangleAlert, iconCls: "text-warning" },
  danger: { box: "bg-danger-soft", icon: CircleAlert, iconCls: "text-danger" },
  success: { box: "bg-success-soft", icon: CircleCheck, iconCls: "text-success" },
  neutral: { box: "bg-surface-2", icon: Info, iconCls: "text-ink-2" },
  // The green tint means "your money is here": only for where money waits.
  brand: { box: "bg-brand-soft", icon: Lock, iconCls: "text-brand" },
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
    <div id={id} className={`flex flex-wrap items-start gap-x-2.5 gap-y-2 rounded-md px-3.5 py-3 text-ink ${t.box}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon className={`mt-0.5 size-5 shrink-0 ${t.iconCls}`} aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={title ? "text-ink-2" : ""}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

/**
 * A dismissible tip (board 05, "Primera vez"). Never for fees, deadlines or risks: those can't be
 * closed. Remembered per browser under `id`; until the browser answers, it isn't shown.
 */
export function Tip({ id, title, children }: { id: string; title?: ReactNode; children: ReactNode }) {
  const key = `ayni-tip-${id}`;
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(key) === "1");
    } catch {
      setHidden(false);
    }
  }, [key]);
  if (hidden) return null;
  const close = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      /* storage blocked: closes for this visit only */
    }
  };
  return (
    <div className="flex items-start gap-2.5 rounded-md bg-info-soft py-3 pr-1 pl-3.5 text-ink">
      <Info className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
      <p className="min-w-0 flex-1 pt-px">
        {title && <b className="font-bold">{title} </b>}
        {children}
      </p>
      <button type="button" onClick={close} aria-label="Cerrar consejo" className="-my-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2/60">
        <X className="size-[18px]" aria-hidden />
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ hint (accessible tooltip)

/**
 * An "i" help affordance for non-critical explanations. Opens on hover, keyboard focus and tap; Esc or
 * a tap outside closes it. The text is linked with aria-describedby, so screen readers read it with
 * the button. The icon is 24 px but the tap area is 44. Never put fees, risks or irreversible
 * consequences only in here.
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
    const width = Math.min(300, window.innerWidth - 16);
    const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8);
    const below = r.bottom + 8 + 160 < window.innerHeight;
    setPos(below ? { top: r.bottom + 8, left, width } : { bottom: window.innerHeight - r.top + 8, left, width });
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
        className="relative -my-1 inline-flex size-6 shrink-0 translate-y-0.5 items-center justify-center rounded-full align-baseline text-brand before:absolute before:-inset-2.5 before:content-[''] hover:bg-surface-2"
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
        <Info className="size-[18px]" aria-hidden />
      </button>
      <span
        id={id}
        role="tooltip"
        hidden={!open}
        style={{ position: "fixed", ...pos }}
        onPointerEnter={enter}
        onPointerLeave={leave}
        className="z-50 rounded-md bg-ink px-3.5 py-3 text-left text-base leading-snug font-normal text-bg shadow-lift [&_a]:font-bold [&_a]:text-brand-soft"
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
        <b className="font-bold">{g.term}:</b> {g.definition}
      </Hint>
    </span>
  );
}

// ------------------------------------------------------------------ data display

/** A label and its value. Use inside a <dl>. `lg` uses the amount style (Archivo, tabular). */
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
      <dt className="t-detail text-ink-2">{label}</dt>
      <dd className={`tabular-nums ${size === "lg" ? "t-amount" : "font-bold"} ${tone === "danger" ? "text-danger" : ""}`}>{value}</dd>
      {hint && <dd className="t-detail text-ink-2">{hint}</dd>}
    </div>
  );
}

/**
 * A horizontal bar. `marker` draws the dark tick (e.g. the all-or-nothing minimum) at that value; it
 * sticks out above and below the track so it reads even where the fill covers it. `muted` is the
 * fill of a sale that didn't reach its minimum.
 */
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
  tone?: "brand" | "muted" | "danger";
  size?: "md" | "lg";
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const mark = marker !== undefined && max > 0 ? Math.min(100, (marker / max) * 100) : null;
  const fill = { brand: "bg-brand", muted: "bg-line-strong", danger: "bg-danger" }[tone];
  return (
    <div
      className={`relative w-full rounded-full bg-surface-2 ${size === "lg" ? "h-3" : "h-2"}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <div className={`h-full rounded-full ${fill} transition-[width] duration-(--motion-base) ease-standard`} style={{ width: `${pct}%` }} />
      {mark !== null && (
        <div className={`absolute w-0.5 bg-ink ${size === "lg" ? "-top-1 h-5" : "-top-1 h-4"}`} style={{ left: `calc(${mark}% - 1px)` }} aria-hidden />
      )}
    </div>
  );
}

/** "Ver la prueba": the on-chain record, one tap away and never in the main flow. */
export function ExplorerLink({ path, children = "Ver la prueba" }: { path: string; children?: ReactNode }) {
  return (
    <a
      href={`${config.explorer}/${path}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-11 items-center gap-1.5 font-bold text-brand underline-offset-2 hover:underline"
    >
      <Eye className="size-[18px]" aria-hidden />
      {children}
      <span className="sr-only">(se abre en otra pestaña)</span>
    </a>
  );
}

/** A form field: the label always visible above, the control, then the error (how to fix it) or the hint. */
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
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1.5 block text-[0.9375rem] font-bold text-ink">{label}</span>
      {children}
      {error ? (
        <span className="t-detail mt-1.5 flex items-start gap-1.5 text-danger" role="alert">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </span>
      ) : (
        hint && <span className="t-detail mt-1.5 block text-ink-2">{hint}</span>
      )}
    </label>
  );
}

/** An input with a fixed prefix ("$us") and/or suffix ("≈ Bs 10,80", "litros") inside the field. */
export function AffixInput({ prefix, suffix, className = "", ...input }: { prefix?: ReactNode; suffix?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className={`field-box ${className}`}>
      {prefix && <span className="shrink-0 font-bold text-ink-2">{prefix}</span>}
      <input {...input} />
      {suffix && <span className="shrink-0 text-[0.9375rem] whitespace-nowrap text-ink-2">{suffix}</span>}
    </span>
  );
}

// ------------------------------------------------------------------ money movement status

export type MoneyState = "pending" | "unconfirmed" | "completed" | "failed";

const MONEY: Record<MoneyState, { label: string; icon: LucideIcon; tone: PillTone }> = {
  pending: { label: "Pendiente", icon: Clock, tone: "warning" },
  // Not a failure and not "Pendiente": we stopped hearing back, so it may or may not have gone through.
  unconfirmed: { label: "Sin confirmar", icon: CircleHelp, tone: "warning" },
  completed: { label: "Completado", icon: CircleCheck, tone: "success" },
  failed: { label: "Falló", icon: CircleAlert, tone: "danger" },
};

/** Status of a movement of money, as icon + word. */
export function MoneyStatus({ state, label }: { state: MoneyState; label?: string }) {
  const m = MONEY[state];
  return (
    <Pill tone={m.tone} icon={m.icon}>
      {label ?? m.label}
    </Pill>
  );
}

// ------------------------------------------------------------------ transactions

/**
 * idle → preparing → signing → confirming → done. `pending`: the network accepted it, not yet in a
 * ledger (don't retry; the app keeps checking while the page is open). `unconfirmed`: we stopped
 * hearing back (a timeout), so it may or may not have gone through. Never report either as a failure.
 * `error`: nothing moved.
 */
export type TxPhase = "idle" | "preparing" | "signing" | "confirming" | "pending" | "unconfirmed" | "done" | "error";

const STEPS = [
  { key: "preparing", label: "Preparando", doing: "Preparando la operación…" },
  { key: "signing", label: "Firmando", doing: "Firmando con tu cuenta de Google…" },
  { key: "confirming", label: "Confirmando", doing: "Confirmando en la red de Stellar…" },
] as const;

/** What a busy button says, per phase ("Firmando…"). */
export const BUSY_LABEL: Partial<Record<TxPhase, string>> = { preparing: "Preparando…", signing: "Firmando…", confirming: "Confirmando…" };

type StepState = "done" | "doing" | "todo" | "failed" | "waiting" | "unknown";

const STEP_SR: Record<StepState, string> = {
  done: "hecho",
  doing: "en curso",
  todo: "por hacer",
  failed: "falló",
  waiting: "pendiente",
  unknown: "sin confirmar",
};

function StepDot({ s }: { s: StepState }) {
  const base = "flex size-7 items-center justify-center rounded-full";
  switch (s) {
    case "done":
      return (
        <span className={`${base} bg-brand text-brand-ink`}>
          <Check className="size-4" strokeWidth={3} aria-hidden />
        </span>
      );
    case "doing":
      return (
        <span className={`${base} bg-info-soft text-info`}>
          <Spinner />
        </span>
      );
    case "failed":
      return (
        <span className={`${base} bg-danger-soft text-danger`}>
          <X className="size-4" strokeWidth={3} aria-hidden />
        </span>
      );
    case "waiting":
      return (
        <span className={`${base} bg-warning-soft text-warning`}>
          <Clock className="size-[17px]" strokeWidth={2.4} aria-hidden />
        </span>
      );
    case "unknown":
      return (
        <span className={`${base} bg-warning-soft text-warning`}>
          <CircleHelp className="size-[17px]" strokeWidth={2.4} aria-hidden />
        </span>
      );
    default:
      return <span className={`${base} border-2 border-line-strong`} />;
  }
}

/** The three steps in plain words, with connecting lines (board 04, "Estado de la operación"). */
function Stepper({ states }: { states: StepState[] }) {
  return (
    <ol aria-label="Estado de la operación" className="flex items-start">
      {STEPS.map((step, i) => {
        const s = states[i];
        const labelCls = s === "failed" ? "text-danger" : s === "waiting" || s === "unknown" ? "text-warning" : s === "todo" ? "text-ink-2" : "text-ink";
        return (
          <li key={step.key} className="contents">
            {i > 0 && <span className={`mx-1 mt-[13px] h-0.5 min-w-3 flex-1 ${states[i - 1] === "done" ? "bg-brand" : "bg-line"}`} aria-hidden />}
            <span className="flex w-[84px] shrink-0 flex-col items-center gap-1.5">
              <StepDot s={s} />
              <span className={`text-[0.8125rem] font-bold ${labelCls}`}>
                {step.label}
                <span className="sr-only">: {STEP_SR[s]}</span>
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const BOX: Record<"info" | "success" | "warning" | "danger", string> = {
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

function StatusBox({ tone, icon, children, alert }: { tone: keyof typeof BOX; icon: ReactNode; children: ReactNode; alert?: boolean }) {
  return (
    <div
      role={alert ? "alert" : "status"}
      aria-live={alert ? undefined : "polite"}
      className={`flex items-start gap-2 rounded-md px-3 py-2.5 text-base leading-snug font-bold ${BOX[tone]}`}
    >
      <span className="mt-px shrink-0 [&>svg]:size-[18px]">{icon}</span>
      <div className="min-w-0 flex-1 space-y-1">{children}</div>
    </div>
  );
}

/** Explains the rest of a status box in ink, at body weight. */
const Plain = ({ children }: { children: ReactNode }) => <p className="font-normal text-ink">{children}</p>;

export function TxSteps({
  phase,
  error,
  hash,
  success,
  failedAt = "signing",
  children,
}: {
  phase: TxPhase;
  error?: string;
  hash?: string;
  /** One line saying what just happened, shown once confirmed (see successMessage in lib/actions). */
  success?: string;
  /** The step that was running when it failed (useAction reports it). */
  failedAt?: TxPhase;
  /** Extra content for the confirmed state, e.g. a link to the next step. */
  children?: ReactNode;
}) {
  if (phase === "idle") return null;
  const proof = hash ? <ExplorerLink path={`tx/${hash}`} /> : null;
  const at = STEPS.findIndex((s) => s.key === phase);
  const failIdx = Math.max(0, STEPS.findIndex((s) => s.key === failedAt));
  const states: StepState[] = STEPS.map((_, i) => {
    switch (phase) {
      case "done":
        return "done";
      case "pending":
        return i < 2 ? "done" : "waiting";
      case "unconfirmed":
        return i < 2 ? "done" : "unknown";
      case "error":
        return i < failIdx ? "done" : i === failIdx ? "failed" : "todo";
      default:
        return i < at ? "done" : i === at ? "doing" : "todo";
    }
  });

  let box: ReactNode;
  if (phase === "done") {
    box = (
      <StatusBox tone="success" icon={<Puntada className="size-[22px]" />}>
        <p>Completado.</p>
        {success && <Plain>{success}</Plain>}
        {(children || proof) && (
          <div className="flex flex-wrap items-center gap-x-4 font-normal">
            {children}
            {proof}
          </div>
        )}
      </StatusBox>
    );
  } else if (phase === "pending") {
    box = (
      <StatusBox tone="warning" icon={<Clock aria-hidden />}>
        <p>Pendiente. La red está lenta: no la repitas.</p>
        <Plain>La red recibió la operación y todavía no la confirma. Seguimos revisando mientras tengas esta página abierta.</Plain>
        {proof}
      </StatusBox>
    );
  } else if (phase === "unconfirmed") {
    box = (
      <StatusBox tone="warning" icon={<CircleHelp aria-hidden />}>
        <p>Sin confirmar. No la repitas todavía.</p>
        <Plain>
          La red tardó en responder y no sabemos si la operación pasó. Revisa esta página en un minuto antes de repetirla: si ya cambió, se
          completó.
        </Plain>
        {proof}
      </StatusBox>
    );
  } else if (phase === "error") {
    box = (
      <StatusBox tone="danger" icon={<CircleAlert aria-hidden />} alert>
        <p>Falló. No se movió tu dinero.</p>
        {error && <Plain>{error}</Plain>}
        <Plain>Puedes intentarlo otra vez.</Plain>
        {proof}
      </StatusBox>
    );
  } else {
    box = (
      <StatusBox tone="info" icon={<RotateCw aria-hidden />}>
        <p>{STEPS[Math.max(0, at)].doing}</p>
      </StatusBox>
    );
  }

  return (
    <div className="space-y-3">
      <Stepper states={states} />
      {box}
    </div>
  );
}

// ------------------------------------------------------------------ dialogs

/**
 * True while another layer (Pollar's signature prompt) needs the screen. A native modal <dialog>
 * sits in the browser's top layer and makes the rest of the page inert, so a prompt rendered as an
 * ordinary overlay would be hidden and unclickable behind it. The wallet provider sets this.
 */
export const DialogSuspendContext = createContext(false);

const ALERT_TONE = {
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  brand: "bg-brand-soft text-brand",
} as const;

/**
 * Native <dialog> (focus trap, Esc), two shapes from board 05:
 * - `sheet` (default): a bottom sheet on phones, with a handle you can drag down to close; a centered
 *   dialog from 640 px. For "confirm before money moves": amount, where it goes, what if it fails.
 * - `alert`: a centered alert dialog with an icon, for irreversible actions. A tap outside doesn't
 *   close it; Esc and its own buttons do.
 * Both step aside while Pollar's confirm prompt is open (DialogSuspendContext).
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  variant = "sheet",
  icon: Icon,
  tone = "warning",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  variant?: "sheet" | "alert";
  /** Alert only: the icon in the circle above the title. */
  icon?: LucideIcon;
  tone?: keyof typeof ALERT_TONE;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const suspended = useContext(DialogSuspendContext);
  // Set when we close the element only to step aside, so its close event doesn't close the dialog for good.
  const stepAside = useRef(false);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const [dy, setDy] = useState(0);

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

  const alert = variant === "alert";

  // Drag the handle down to close (phones). Past 96 px it closes; otherwise it springs back.
  const onDown = (e: ReactPointerEvent) => {
    if (alert || window.matchMedia("(min-width: 640px)").matches) return;
    drag.current = { y: e.clientY, dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    setDy(drag.current.dy);
  };
  const onUp = () => {
    if (!drag.current) return;
    const closeIt = drag.current.dy > 96;
    drag.current = null;
    setDy(0);
    if (closeIt) onClose();
  };

  const shape = alert
    ? "m-auto w-[calc(100%-40px)] max-w-sm rounded-lg open:animate-[dialog-in_var(--motion-base)_var(--motion-ease-enter)]"
    : "m-0 mt-auto w-full max-w-none rounded-t-xl open:animate-[sheet-in_var(--motion-slow)_var(--motion-ease-enter)] sm:m-auto sm:max-w-md sm:rounded-lg sm:open:animate-[dialog-in_var(--motion-base)_var(--motion-ease-enter)]";

  return (
    <dialog
      ref={ref}
      role={alert ? "alertdialog" : undefined}
      onClose={() => {
        if (stepAside.current) {
          stepAside.current = false;
          return;
        }
        onClose();
      }}
      onClick={(e) => !alert && e.target === ref.current && onClose()}
      aria-labelledby={titleId}
      style={dy ? { transform: `translateY(${dy}px)` } : undefined}
      className={`bg-surface-over p-0 text-ink shadow-lift backdrop:bg-scrim open:backdrop:animate-[fade-in_var(--motion-base)_linear] ${shape}`}
    >
      {alert ? (
        <div className="space-y-3 p-5">
          {Icon && (
            <span className={`flex size-11 items-center justify-center rounded-full ${ALERT_TONE[tone]}`}>
              <Icon className="size-6" aria-hidden />
            </span>
          )}
          <h2 id={titleId} className="t-title-2">
            {title}
          </h2>
          <div>{children}</div>
        </div>
      ) : (
        <>
          <div className="touch-none px-5 pt-2.5 pb-2 sm:pt-5" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
            <div className="flex items-start justify-between gap-3">
              <h2 id={titleId} className="t-title-1 pt-1.5">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                onPointerDown={(e) => e.stopPropagation()}
                className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2"
                aria-label="Cerrar"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
          </div>
          <div className="max-h-[78vh] overflow-y-auto px-5 pt-1 pb-5">{children}</div>
        </>
      )}
    </dialog>
  );
}

/** One line of a confirm sheet: what on the left, how much on the right. */
export function SummaryRow({ label, value, strong }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? "font-bold" : ""}`}>
      <span className={strong ? "text-ink" : "text-ink-2"}>{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}

/** The green "your money is here" box: where the money goes and what happens if it fails. */
export function MoneyBox({ lines }: { lines: { icon: LucideIcon; text: ReactNode }[] }) {
  return (
    <div className="space-y-2 rounded-md bg-brand-soft p-3 text-ink">
      {lines.map(({ icon: Icon, text }, i) => (
        <p key={i} className="flex gap-2 leading-snug">
          <Icon className="mt-0.5 size-[18px] shrink-0 text-brand" aria-hidden />
          <span>{text}</span>
        </p>
      ))}
    </div>
  );
}
