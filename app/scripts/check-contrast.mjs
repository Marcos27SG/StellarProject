// WCAG 2.1 contrast check for the color tokens in src/app/globals.css, light and dark.
// Usage: npm run contrast   (exits 1 if any pair is below its minimum)

import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2];
  return out;
}
const lightBlock = css.slice(css.indexOf(":root,"), css.indexOf("@media (prefers-color-scheme: dark)"));
const darkBlock = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"), css.indexOf("@theme inline"));
const light = tokens(lightBlock);
const dark = { ...light, ...tokens(darkBlock) };

const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => {
  const [r, g, b] = rgb(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const TEXT = 4.5;
const UI = 3;
// [foreground, background, minimum, what]
const PAIRS = [
  ["ink", "bg", TEXT, "Body text"],
  ["ink", "surface", TEXT, "Body text on cards"],
  ["ink-2", "bg", TEXT, "Secondary text"],
  ["ink-2", "surface-2", TEXT, "Secondary text on fills"],
  ["ink-3", "surface", TEXT, "Placeholders on inputs"],
  ["ink-3", "surface-2", TEXT, "Disabled button label"],
  ["brand-ink", "brand", TEXT, "Primary button"],
  ["brand-ink", "brand-hover", TEXT, "Primary button, hover"],
  ["brand", "bg", TEXT, "Links"],
  ["brand", "surface", TEXT, "Links on cards"],
  ["brand", "brand-soft", TEXT, "Selected option"],
  ["brand", "surface-2", UI, "Progress fill on track"],
  ["line-strong", "surface", UI, "Control borders"],
  ["line-strong", "bg", UI, "Control borders on page"],
  ["accent", "surface", UI, "Stars and streak icons"],
  ["accent", "bg", UI, "Stars on page"],
  ["success", "success-soft", TEXT, "Success message"],
  ["warning", "warning-soft", TEXT, "Warning message"],
  ["warning", "surface", TEXT, "Warning text on cards"],
  ["danger", "danger-soft", TEXT, "Error message"],
  ["danger", "surface", TEXT, "Error text on cards"],
  ["info", "info-soft", TEXT, "Info / pending message"],
  ["ink-2", "info-soft", TEXT, "Secondary text in a notice"],
  ["ink-2", "warning-soft", TEXT, "Secondary text in a notice"],
  ["ink-2", "danger-soft", TEXT, "Secondary text in a notice"],
  ["ink-2", "brand-soft", TEXT, "Secondary text in the money box"],
  ["ink-2", "success-soft", TEXT, "Secondary text in a notice"],
  ["line-strong", "surface-2", UI, "Control borders on fills"],
  // Accent text (tier and streak labels, "Por confirmar" pill).
  ["accent-ink", "bg", TEXT, "Accent text on page"],
  ["accent-ink", "surface", TEXT, "Accent text on cards"],
  ["accent-ink", "accent-soft", TEXT, "Accent pill"],
  ["accent", "accent-soft", UI, "Diamonds on a tier tile"],
  // Focus ring (drawn with a 2 px gap, so it sits on the page, a card or a fill, never on the brand).
  ["focus", "bg", UI, "Focus ring on page"],
  ["focus", "surface", UI, "Focus ring on cards"],
  ["focus", "surface-2", UI, "Focus ring on fills"],
  // Raised surfaces (in dark mode, elevation lightens the surface instead of casting a shadow).
  ["ink", "surface-over", TEXT, "Text in sheets and dialogs"],
  ["ink-2", "surface-over", TEXT, "Secondary text in sheets"],
  ["ink-3", "surface-over", TEXT, "Placeholders in sheets"],
  ["brand", "surface-over", TEXT, "Links in sheets"],
  ["line-strong", "surface-over", UI, "Control borders in sheets"],
  ["ink-2", "surface-fixed", TEXT, "Secondary text on the fixed bar"],
  // Toasts and tooltips use the inverse pair (bg-ink, text-bg) with brand-soft for their link.
  ["bg", "ink", TEXT, "Toast and tooltip text"],
  ["brand-soft", "ink", TEXT, "Toast and tooltip link"],
  // Destructive button: white on danger in light, page color on danger in dark.
  ["surface", "danger", TEXT, "Destructive button"],
  ["seg-delivered-ink", "seg-delivered", TEXT, "Chart label: delivered"],
  ["seg-pending-ink", "seg-pending", TEXT, "Chart label: pending"],
  ["seg-todo-ink", "seg-todo", TEXT, "Chart label: to deliver"],
  ["seg-refunded-ink", "seg-refunded", TEXT, "Chart label: refunded"],
];

let failures = 0;
for (const [mode, t] of [["light", light], ["dark", dark]]) {
  console.log(`\n${mode}`);
  for (const [fg, bg, min, what] of PAIRS) {
    if (!t[fg] || !t[bg]) {
      console.log(`  missing token: ${fg} or ${bg}`);
      failures++;
      continue;
    }
    const r = ratio(t[fg], t[bg]);
    const ok = r >= min;
    if (!ok) failures++;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${r.toFixed(2).padStart(5)} (min ${min})  ${what}: ${fg} on ${bg}`);
  }
}
console.log(failures ? `\n${failures} pair(s) below WCAG AA` : "\nAll pairs pass WCAG AA.");
process.exit(failures ? 1 : 0);
