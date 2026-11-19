# Prompt: Implement the Ayni design system in the web app

> **How to use it**
> 1. The design boards are already in `despensa/docs/design/` (01 to 07). They were unpacked from the design tool's export, `Ayni · Identidad y producto.html`. Don't give the assistant that export: it's a 1.9 MB bundle of compressed, base64-encoded pages and fonts that only renders through JavaScript, so the assistant can't read it. If the design changes, re-export it and unpack it again the same way.
> 2. Open your coding assistant (Claude Code, Cursor…) in the `despensa/` folder and paste everything below the line.
> 3. If a later design round adds screen mockups, save them as `docs/design/08-…html` onward and list them under `DESIGN FILES` at the end.

---

You are a senior front-end engineer and design engineer. Implement the new **Ayni** brand and design system in our existing web app, close to the designs, without breaking anything that works today.

## 1. Context

**Ayni** (formerly Pacta, formerly Despensa) is a pre-sale marketplace on Stellar for the Stellar Bolivia 2026 hackathon. Producers pre-sell at a locked price. The buyer's money waits in a Soroban smart contract, in USDC, until the product is delivered. If the sale doesn't reach its minimum, the buyer gets everything back automatically. Other protections: pay on delivery via QR, disputes, milestone advances backed by a bond, a 2% community guarantee pool, and on-chain reputation tiers. "Ayni" is the Andean principle of reciprocity: every transaction reciprocates.

The app **already works end to end on testnet**. This job is a **visual and UX re-skin plus the rename**. It is not a rewrite.

Read these first:
- `app/UI.md`: architecture, layers, screens, components, color rules. **Its rules still apply.**
- `docs/DESIGN.md`: how the contract and the protections work.
- `docs/AYNI-DESIGN-PROMPT.md`: the brief the designs were made from.
- The design boards in `docs/design/`.

## 2. What the designs cover

The designs are the **design system only** ("Ronda 2 · Sistema de diseño · Tejido"). There are **no screen mockups**. The boards are:

| File | Contents |
|---|---|
| `01-color.html` | Color tokens, light and dark, with contrast ratios and usage rules |
| `02-type-space-shape-motion.html` | Type scale (mobile and desktop), spacing, radii, elevation, motion, "la puntada" |
| `03-components-action-reputation.html` | Buttons, fields, category chips, status pills, tiers, streak, stars |
| `04-components-money-delivery.html` | Funding bar, campaign card, voucher with QR, transaction states |
| `05-components-layers-states.html` | Bottom sheet, alert dialog, toasts, tips, empty, loading, offline |
| `06-icons.html` | Five category icons and the interface icon set (24 px grid, 2 px stroke) |
| `07-dark-mode.html` | The same components with the dark tokens |

Each board is static HTML with inline styles. Open it in a browser to see it, and read its source for exact values.

So for screens, **keep each screen's current layout and information** and rebuild it with the new tokens and components. Change a layout only where a new component requires it (for example the bottom sheet for checkout), and write down every layout change you make.

## 3. Stack (do not upgrade)

- `app/`: Next.js **15.5.29** App Router, React **19.1.0**, TypeScript, Tailwind **4.2.4**, `lucide-react` 1.61.0, `zod`, `vitest`, `@pollar/react` (Google login, embedded wallet, sponsored fees), `@stellar/stellar-sdk`, `qrcode.react`.
- The dev machine runs **Node 20.16** on Windows (PowerShell 5.1). Don't upgrade Next, React or Tailwind. Check that any new dependency supports Node 20.16, and prefer none.
- Fonts: load them with `next/font/google`, not with a `<link>` tag. They replace Geist, Geist Mono and Fraunces in `layout.tsx`:
  - **Archivo** for display, titles and amounts. Load it with `axes: ["wdth"]`: the scale uses width 115 for display and title-1 and width 110 for title-2 and amounts. Without the axis the headings render at normal width.
  - **Atkinson Hyperlegible** for everything else. It isn't variable: load weights `400` and `700`.
  - Amounts use `font-variant-numeric: tabular-nums`.

## 4. What must NOT change

- **The Soroban contract** (`contracts/`) and the deployment. Everything here is UI.
- **The data and rules layers:** `src/lib/despensa.ts`, `events.ts`, `contract-spec.ts`, `hooks.ts`, `actions.ts` (`nextActions`, `argsFor`), `wizard.ts`, `reputation.ts`, `format.ts`, `src/lib/metadata/`, and `src/catalog/`. Components keep rendering the `Action[]` from `nextActions`. **Never re-derive a contract rule in a component.**
  - **One exception:** you may edit user-visible **strings** in these files for the rename (for example the "Pacta" in the error messages in `wizard.ts` and `despensa.ts`). Change no logic, and keep their tests passing.
- **Internal identifiers:** the `despensa/` folder, the crate, `lib/despensa.ts`, env var names and the metadata schema id (`despensa.campaign/v1`). Only **user-visible** text and assets get renamed. Code comments may keep the old names.
- **Real data only.** The boards contain placeholder numbers, names, codes and photos. Wire every value to the real hooks. Never ship mock data. If a component shows something the app or contract has no data for, don't fake it: list it in your report.
- **Existing behavior:** read-only mode when there's no Pollar key, transaction states (`TxSteps` → Completado / Pendiente / Falló, and "Sin confirmar" when Pollar's submit times out), live polling during the delivery hand-off, WhatsApp share, the printable poster, link previews, and the Pollar confirm prompt staying on top of our dialogs.

## 5. Treat the HTML as a spec, not as code to paste

The board HTML is a visual reference. Don't copy its markup, inline styles or scripts into the app. Instead:
- Pull the values out of it (colors, fonts, sizes, spacing, radii, shadows, motion) and turn them into **tokens**.
- Rebuild each component with our components and tokens. Draw the icons with `lucide-react` where one matches the board's icon closely enough, and as our own SVG (2 px stroke, round caps and joins, `currentColor`) where none does, like the category icons and the tier and streak diamonds.
- Where the HTML is ambiguous, inconsistent between boards or missing a state, pick the most consistent option and write the decision down.

## 6. Known conflicts between the boards and the app

These are already known. Follow the app, not the board, and keep the board's look:

1. **Tier names and limits.** The board shows 4 tiers (Nuevo 0% advance with a 100% bond, Confiable up to 20%, Destacado up to 35%, Ejemplar up to 50%). The contract has **5**: Restringido 0%, Nuevo 20%, Confiable 30%, Destacado 40%, Ejemplar 50%, each with its own bond cover. Take names and numbers from `TIER_NAMES` and `TIER_LIMITS` in `reputation.ts`, and design a tier-0 "Restringido" badge (zero filled diamonds, warning tone, icon and word) in the same style.
2. **"Si no se entrega, recuperas el 100%."** This line on the campaign card overpromises. A full refund is guaranteed only when the minimum isn't reached. After advances have been paid, a buyer is refunded up to the price paid, from the escrow, then the bond, then the pool, which is capped at 20% per default. Use wording that is true for that campaign, consistent with `ProtectionExplainer`. The same applies to the pool tip ("de ahí sale tu reembolso"): say the pool **helps cover** refunds.
3. **"Tu vale y QR funcionan sin internet."** Not true: the app has no service worker or offline cache. Show the "Sin señal" notice with the age of the data, without that sentence. Don't add a service worker in this job.
4. **"Te avisamos al confirmarse" and the "Avisos" icon.** The app has no notifications. "Pendiente" says the app will keep checking while the page is open. Leave out the Avisos icon.
5. **Voucher codes such as `AYN-4821`.** These don't exist: the QR encodes a URL. Show the code only if you can derive it in the UI from the real voucher or campaign ids, deterministically. Otherwise leave it out. Either way, report what you did.
6. **Named verifier and dispute time** ("la Asociación de Lecheros… en máximo 3 días"). Take the verifier's label from `verifiers.ts` and the time from the campaign's `dispute_window`.
7. **Fee line "Comisión $us 0,00"** in the confirm sheet. Show it only if it's what the buyer really pays. Network fees are sponsored, and the 2% fee comes out of the producer's payout, not the buyer's payment.
8. **Navigation.** The icon set (Inicio, Vale, Mi puesto, Cuenta) and the "fixed" elevation suggest a bottom tab bar, and "Mi puesto" would replace today's "Vender". **Ask me in Stage 0**. Don't change the navigation before I answer.
9. **Status labels.** The board's set is: Para recoger, Por confirmar, En curso, Pendiente, Completado, Falló, En disputa, Reembolsado. Map the app's existing states onto these. Keep "Sin confirmar" for a submit timeout: it means something different from "Pendiente".

## 7. When the design conflicts with our rules

These rules win over the design. Follow the rule, keep the design's look as close as you can, and report the conflict:
- **WCAG 2.1 AA** contrast in light and dark mode (`npm run contrast` must pass), visible focus, tap targets of at least 44 px (48 px for main actions, as the board says), keyboard and screen-reader support, and `prefers-reduced-motion`.
- **Color is never the only signal:** every status has an icon and a word.
- **One primary action per screen.**
- **Money is always explained:** fees, risks, deadlines and "No se puede deshacer" are never only in a tooltip. Prices are shown as `$us` with the `≈ Bs` reference.
- **No crypto jargon in the main flow** (wallet, gas, blockchain, hash). On-chain proof stays behind "Ver la prueba" or explorer links.
- **Mobile first:** it must work at 360 px wide, with no horizontal scroll.

## 8. Plan: work in stages and check each one

Before writing code, run `git status` and tell me about any uncommitted changes. Don't discard or overwrite them. Work on a new branch, `ayni-ui`.

**Stage 0: inventory (no code yet).** Read all seven boards and give me:
1. A table: board component → existing component in `src/components/` or `globals.css` → what changes (new, restyled, restructured).
2. The design tokens you extracted (colors light and dark, type scale, spacing, radii, elevation, motion).
3. A table: each existing screen → which new components it will use → any layout change you propose.
4. Gaps and conflicts beyond those in section 6: things the boards show that we have no data for, states they don't show (loading, empty, error, read-only, Sin confirmar), and anything that breaks the rules in section 7.
5. Your questions, including the navigation question in section 6.8. **Stop here and wait for my answers.**

**Stage 1: brand and tokens.**
- Replace the palette in `src/app/globals.css`, light and dark. **Keep the app's token names** and map the board's names onto them:

  | Board token | App token |
  |---|---|
  | `bg`, `surface`, `surface-2`, `line` | same names |
  | `border` | `line-strong` |
  | `ink`, `ink-2`, `ink-3` | same names |
  | `brand` | `brand` |
  | `brand-strong` | `brand-hover` |
  | `brand-tint` | `brand-soft` |
  | `on-brand` | `brand-ink` |
  | `accent` | `accent` |
  | `accent-tint` | `accent-soft` |
  | `success`, `warning`, `info` and their `-tint` | same names with `-soft` |
  | `error` / `error-tint` | `danger` / `danger-soft` |

- Add only the tokens the boards really introduce: `accent-ink` (text in the accent tone, for tier and streak labels), `focus` (the focus ring), and the dialog scrim (`rgba(18,23,20,.52)`, the value `--scrim` takes). Map the board's 4 elevation levels onto `--elev-*` tokens. In dark mode use no shadows: raise the surface color per level, as the board says.
- The boards define no chart colors. Keep the `seg-*` tokens and re-tune them only if they fail contrast against the new background.
- Keep `.theme-light` for the poster and the voucher QR.
- Fonts as in section 3. Type scale (display, title-1, title-2, subtitle, body, detail, label, amount; mobile and desktop sizes), spacing (base 4, `space-0` to `space-9`) and radii (`radius-xs` to `radius-full`) as in board 02. Body text never goes below 16 px.
- Motion tokens: `motion-fast` 120 ms, `motion-base` 200 ms, `motion-slow` 320 ms, `motion-exit` 160 ms, `motion-puntada` 480 ms, with the three easing curves from board 02. Under `prefers-reduced-motion`, every transition becomes a 120 ms fade or an instant change.
- `npm run contrast` must pass. Add pairs to `scripts/check-contrast.mjs` for the new tokens: `accent-ink` on `bg` and on `accent-soft` (4.5:1), `focus` on `bg` and on `surface` (3:1), and `line-strong` on `surface` (3:1, already there).
- Update the "Color" section of `app/UI.md` with the new palette and the reasons behind it, including board 01's usage rules (amber is scarce, warning ≠ accent, the green tint means "your money is here").

**Stage 2: rename to Ayni (user-visible only).**
- The `Logo` and mark component (rename `PactaMark` to `AyniMark` and keep it as SVG in token colors; the wordmark is lowercase "ayni", as on the boards), `layout.tsx` metadata, page titles, `icon.svg`, `apple-icon.png`, `opengraph-image.png` and its alt text, the header, copy in pages and components, `glossary.ts`, `verifiers.ts` labels, `generateMetadata` link previews, and the user-visible strings in `wizard.ts` and `despensa.ts` (section 4's exception).
- To find leftovers, search for `Pacta` and `Despensa` in `src/` and `public/`. When you finish, nothing user-visible should say Pacta. "Despensa" may stay only as the food line name if the design uses it.

**Stage 3: primitives.** Restyle `ui.tsx` (`Notice`, `Hint`, `Stat`, `ProgressBar`, `Field`, `MoneyStatus`, `TxSteps`, `Dialog`, `EmptyState`, `Skeleton`), buttons (`btn-primary`, `btn-secondary`, `btn-ghost`, destructive; sizes lg 52, md 44, and sm 36 for desktop only; the loading state says what's happening, as in "Firmando…"), chips, `badges.tsx` (`StatusPill`, `TierBadge` with the diamonds, `Streak` as a woven row of diamonds, `Stars`), `FundingBar` (with the dark tick at the minimum and its four states), `Money`, `CategoryIcon` (the five category icons from board 06) and `VoucherQR`. Also:
- A **bottom sheet** for "confirm before money moves" (amount, where it goes, what happens if it fails) and the **alert dialog** for irreversible actions, both from board 05.
- **"La puntada"**, the brand animation: two diamonds come in from the sides and interlock in 480 ms. It plays only on "Completado" and "Cobraste". With reduced motion it appears already interlocked.
- Toasts, tips, empty states and skeletons that repeat the real card's shape (board 05).

Check them all, in light and dark, on `/dev/catalog`.

**Stage 4: screens, one at a time.** Apply the new components to each screen, keeping its current layout and data (section 2). Suggested order, from what the demo needs most:
1. `/` marketplace and `CampaignCard`
2. `/campaign/[id]`, with `BuyPanel`, `ProtectionExplainer`, `Timeline`, `ActionPanel` and `ShareButton`
3. Checkout (the bottom sheet) and transaction states
4. `/me` Mis vales and `VoucherQR`
5. `/producer/deliver`, the two-phone hand-off (the demo's key moment)
6. `/producer` dashboard and `/producer/new` wizard
7. `/verify`, `/p/[address]` and `/transparencia`
8. `/campaign/[id]/cartel` printable poster and the OG image

For each screen: build it, then check it at 360 px and at desktop width, in light and dark mode, and in its loading, empty, error and read-only states. Tell me what you checked before moving on.

**Stage 5: verify everything.**
- `npm run lint`, `npm test`, `npm run build` and `npm run contrast` all pass.
- Click through the full buyer flow on testnet with the dev server: reserve, show QR, the producer registers the delivery, confirm, rate. If you can't sign in, say so; don't skip it silently.
- Check that no page scrolls horizontally at 360 px and that there are no console errors.

## 9. Report

At the end of each stage, give me:
- What changed (files and screens), with screenshots if you can take them.
- The design decisions you made where the boards were unclear, and every layout change.
- Conflicts with sections 6 and 7 and how you resolved them.
- What's not done or not verified.

Commit after each stage with a clear message. Don't push, and don't merge into `master`, until I say so.

## DESIGN FILES

- `docs/design/01-color.html`
- `docs/design/02-type-space-shape-motion.html`
- `docs/design/03-components-action-reputation.html`
- `docs/design/04-components-money-delivery.html`
- `docs/design/05-components-layers-states.html`
- `docs/design/06-icons.html`
- `docs/design/07-dark-mode.html`
