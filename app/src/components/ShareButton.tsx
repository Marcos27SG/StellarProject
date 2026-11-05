"use client";

// Share a link the way people in Bolivia actually do: the phone's share sheet when there is one
// (it includes WhatsApp), otherwise a small dialog with WhatsApp and "copy link". One button either way.

import { Check, Link2, MessageCircle, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog } from "./ui";

export function ShareButton({
  path,
  title,
  text,
  className = "",
  label = "Compartir",
  variant = "secondary",
}: {
  /** Path on this site, e.g. /campaign/3. The origin is added on the client. */
  path: string;
  title: string;
  /** Message that goes before the link. */
  text: string;
  className?: string;
  label?: string;
  variant?: "secondary" | "ghost";
}) {
  const [native, setNative] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Clipboard can be blocked (permissions, embedded browsers): then show the link, selected.
  const [manual, setManual] = useState<string | null>(null);
  useEffect(() => setNative(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);

  const url = () => `${window.location.origin}${path}`;

  const click = async () => {
    if (!native) return setOpen(true);
    try {
      await navigator.share({ title, text, url: url() });
    } catch {
      // Cancelled by the user, or blocked: nothing to do.
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setManual(url());
    }
  };

  return (
    <>
      <button type="button" className={`${variant === "ghost" ? "btn-ghost" : "btn-secondary"} ${className}`} onClick={click}>
        <Share2 className="size-4" aria-hidden /> {label}
      </button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Compartir">
          <div className="grid gap-2">
            <a
              className="btn-secondary justify-start"
              href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url()}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="size-4" aria-hidden /> Enviar por WhatsApp
            </a>
            <button type="button" className="btn-secondary justify-start" onClick={copy} aria-live="polite">
              {copied ? <Check className="size-4 text-success" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
              {copied ? "Enlace copiado" : "Copiar enlace"}
            </button>
            {manual && (
              <label className="block text-sm text-ink-2">
                Copia el enlace:
                <input readOnly autoFocus value={manual} onFocus={(e) => e.currentTarget.select()} className="mt-1 w-full font-mono" />
              </label>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
