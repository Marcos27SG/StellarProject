// The Pacta mark and wordmark, drawn from the intro video (video/scene.js, mark()):
// a brand disc with two interlocking rings, the left ring passing over the right one at the top.
// Colors come from tokens, so the mark follows light and dark mode.

const RING = 2.24;

export function PactaMark({ className = "size-7", title }: { className?: string; title?: string }) {
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true };
  return (
    <svg viewBox="0 0 32 32" className={`shrink-0 ${className}`} {...a11y}>
      <circle cx="16" cy="16" r="16" className="fill-brand" />
      <g fill="none" strokeLinecap="round" className="stroke-brand-ink" strokeWidth={RING}>
        <circle cx="12" cy="16" r="6.4" />
        <circle cx="20" cy="16" r="6.4" />
      </g>
      {/* Over-under: cut the right ring where the left one crosses it, then redraw the left ring on top. */}
      <path d="M14.225 9.999A6.4 6.4 0 0 1 17.369 12.516" fill="none" strokeLinecap="round" strokeWidth={4.93} className="stroke-brand" />
      <path d="M13.115 9.698A6.4 6.4 0 0 1 17.906 13.533" fill="none" strokeLinecap="round" strokeWidth={RING} className="stroke-brand-ink" />
    </svg>
  );
}

/** Mark + "Pacta" in the display face. `size` scales both. */
export function Logo({ size = "md", className = "" }: { size?: "md" | "lg"; className?: string }) {
  const s = size === "lg" ? { mark: "size-9", text: "text-3xl" } : { mark: "size-7", text: "text-xl" };
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <PactaMark className={s.mark} />
      <span className={`font-display font-semibold tracking-tight text-ink ${s.text}`}>Pacta</span>
    </span>
  );
}
