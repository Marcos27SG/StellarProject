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
