import { useId } from "react";

// The Ayni mark and wordmark (design board "Tejido", docs/design/01–07): two diamonds, green and amber,
// woven like a stitch. The green one passes over the amber one at the top crossing and under it at the
// bottom, so neither sits on top of the other: reciprocity. Colors come from tokens, so the mark follows
// light and dark mode.
//
// The board draws the over-under with a stroke in the page color. Here the gap is a mask on the amber
// diamond instead, so the mark works on any surface (page, card, toast, poster) without knowing its color.

/** Geometry on a 32×32 grid, shared with the puntada animation. */
export const MARK = {
  stroke: 3.2,
  left: "M12 7 L21 16 L12 25 L3 16 Z",
  right: "M20 7 L29 16 L20 25 L11 16 Z",
  /** Where the green strand crosses over the amber one: the gap is cut along this line. */
  cut: "M13.6 8.6 L18.4 13.4",
  /** The green strand redrawn over the gap. */
  over: "M13 8 L19 14",
} as const;

export type MarkTone = "brand" | "inverse";

const TONE: Record<MarkTone, { left: string; right: string }> = {
  brand: { left: "stroke-brand", right: "stroke-accent" },
  // On the inverse surface (bg-ink: toasts), the green strand turns pale so it reads on dark and light ink.
  inverse: { left: "stroke-brand-soft", right: "stroke-accent" },
};

export function AyniMark({ className = "size-7", title, tone = "brand" }: { className?: string; title?: string; tone?: MarkTone }) {
  const maskId = `ayni-cut-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true };
  const t = TONE[tone];
  return (
    <svg viewBox="0 0 32 32" fill="none" strokeLinejoin="round" className={`shrink-0 ${className}`} {...a11y}>
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
        <rect width="32" height="32" fill="#fff" />
        <path d={MARK.cut} stroke="#000" strokeWidth={MARK.stroke * 2} strokeLinecap="butt" />
      </mask>
      <path d={MARK.left} strokeWidth={MARK.stroke} className={t.left} />
      <path d={MARK.right} strokeWidth={MARK.stroke} className={t.right} mask={`url(#${maskId})`} />
      <path d={MARK.over} strokeWidth={MARK.stroke} strokeLinecap="butt" className={t.left} />
    </svg>
  );
}

/** Mark + "ayni" (lowercase, as on the boards) in Archivo at width 115. `size` scales both. */
export function Logo({ size = "md", className = "" }: { size?: "md" | "lg"; className?: string }) {
  const s = size === "lg" ? { mark: "size-9", text: "text-[1.875rem]" } : { mark: "size-8", text: "text-2xl" };
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <AyniMark className={s.mark} />
      <span className={`font-display leading-none font-extrabold tracking-[-0.01em] text-ink [font-stretch:115%] ${s.text}`}>ayni</span>
    </span>
  );
}
