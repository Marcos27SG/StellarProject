import { useId } from "react";
import { MARK } from "./Logo";

/**
 * La puntada (board 02): the brand's only animation. The two diamonds come in from the sides and
 * interlock in 480 ms, then the over-under stitch appears. It plays when a promise is kept: only on
 * "Completado" and "Cobraste". Remount it (change `key`) to play it again.
 *
 * With reduced motion the keyframes collapse to 0.01 ms (globals.css), so it appears already
 * interlocked. Decorative: the word next to it ("Completado") carries the meaning.
 */
export function Puntada({ className = "size-10" }: { className?: string }) {
  const maskId = `puntada-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const t = "var(--motion-puntada) var(--motion-ease-enter) both";
  return (
    <svg viewBox="0 0 32 32" fill="none" strokeLinejoin="round" className={`shrink-0 overflow-visible ${className}`} aria-hidden>
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
        <rect width="32" height="32" fill="#fff" />
        <path d={MARK.cut} stroke="#000" strokeWidth={MARK.stroke * 2} />
      </mask>
      {/* Moving: plain diamonds sliding in. Hidden on the last frame. */}
      <g style={{ animation: `puntada-swap-out ${t}` }}>
        <path d={MARK.left} strokeWidth={MARK.stroke} className="stroke-brand" style={{ animation: `puntada-left ${t}` }} />
        <path d={MARK.right} strokeWidth={MARK.stroke} className="stroke-accent" style={{ animation: `puntada-right ${t}` }} />
      </g>
      {/* Woven: the logo, shown on the last frame. */}
      <g style={{ animation: `puntada-swap-in ${t}` }}>
        <path d={MARK.left} strokeWidth={MARK.stroke} className="stroke-brand" />
        <path d={MARK.right} strokeWidth={MARK.stroke} className="stroke-accent" mask={`url(#${maskId})`} />
        <path d={MARK.over} strokeWidth={MARK.stroke} className="stroke-brand" />
      </g>
    </svg>
  );
}
