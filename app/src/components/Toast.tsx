"use client";

// Toasts (board 05, "Avisos"): a short line after something happened, with at most one action.
// Success uses the dark ink and the logo; an error says first that the money is safe.
// They are never the only place information appears, stay at least 8 s, pause while hovered or
// focused, and can be closed. Announced politely to screen readers.

import { CircleAlert, X } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AyniMark } from "./Logo";

export interface ToastInput {
  tone?: "success" | "error";
  text: ReactNode;
  /** One action: a link ("Ver vale") or a callback ("Reintentar"). */
  action?: { label: string; href?: string; onClick?: () => void };
  /** Milliseconds; never less than 8000. */
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

/** `const toast = useToast(); toast({ text: "Reserva guardada. Ya está en Mis vales.", action: { label: "Ver vale", href: "/me" } })` */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const push = useCallback((t: ToastInput) => {
    const id = next.current++;
    // One at a time: a new toast replaces the previous one.
    setItems([{ ...t, id }]);
  }, []);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-bar,0px)+16px)] z-40 flex justify-center px-4 print:hidden"
      >
        {items.map((t) => (
          <Toast key={t.id} item={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const [paused, setPaused] = useState(false);
  const error = item.tone === "error";
  const ms = Math.max(8000, item.duration ?? 8000);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(onClose, ms);
    return () => clearTimeout(t);
  }, [paused, ms, onClose]);

  const actionCls = `inline-flex min-h-11 shrink-0 items-center rounded-md px-2.5 font-bold ${error ? "text-danger" : "text-brand-soft"}`;
  return (
    <div
      className={`pointer-events-auto flex w-full max-w-sm animate-[rise-in_var(--motion-base)_var(--motion-ease-enter)] items-center gap-3 rounded-md py-1.5 pr-1 pl-3.5 shadow-lift ${
        error ? "bg-danger-soft text-ink" : "bg-ink text-bg"
      }`}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {error ? <CircleAlert className="size-[22px] shrink-0 text-danger" aria-hidden /> : <AyniMark tone="inverse" className="size-[22px]" />}
      <p className="min-w-0 flex-1 py-1.5 text-[0.9375rem] leading-snug">{item.text}</p>
      {item.action &&
        (item.action.href ? (
          <Link href={item.action.href} className={actionCls} onClick={onClose}>
            {item.action.label}
          </Link>
        ) : (
          <button
            type="button"
            className={actionCls}
            onClick={() => {
              item.action?.onClick?.();
              onClose();
            }}
          >
            {item.action.label}
          </button>
        ))}
      <button type="button" onClick={onClose} aria-label="Cerrar aviso" className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full ${error ? "text-ink-2" : "text-bg"}`}>
        <X className="size-[18px]" aria-hidden />
      </button>
    </div>
  );
}
