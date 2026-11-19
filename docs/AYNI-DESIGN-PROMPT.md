# Prompt: Ayni — brand identity and full UI/UX design

> Paste everything below the line into your design tool (Claude, v0, Figma AI, Lovable, Midjourney for the moodboards…).
> It is written to be iterated on: start with **Round 1 (brand directions)**, pick one, then ask for Rounds 2 and 3 with that direction.

---

You are a senior brand designer and product (UI/UX) designer. Design the brand identity and the complete mobile-first interface of **Ayni**, a pre-sale marketplace built on the Stellar blockchain, for the Stellar Bolivia 2026 national startups hackathon (live pitch in Santa Cruz, Bolivia, late November 2026). The product already works on testnet; we need it to look and feel like a real, trustworthy company that judges remember.

## 1. The name and why we chose it

**Ayni** (Quechua and Aymara) is the Andean principle of **reciprocity**: *"hoy por ti, mañana por mí"*. In an ayni, a community helps you build your house or harvest your field, and you return that work when they need it. Nobody keeps score with money; the obligation is social, public and always honored.

That is exactly what our product does. **Every transaction reciprocates:**

| Ayni in the community | Ayni in the product |
|---|---|
| I give my work today, you return it tomorrow | The buyer pays today, the producer delivers tomorrow. The money waits in between and only moves when the promise is kept. |
| The community vouches for you | *Aval solidario*: a co-op, family or neighbor can post a bond so a new producer gets an advance. |
| Everyone contributes a little to a common reserve | 2% of every payout goes to a **community guarantee pool** that protects buyers if a producer fails. |
| Your word is your reputation | Every delivery builds a public, permanent reputation (streaks, ratings, tiers) that unlocks bigger advances. |
| Trust is visible, not hidden | All money and rules are public on-chain. Anyone can check them without logging in. |

The brand must carry that idea: **trust that comes back**. Not charity, not a bank — a pact between equals, enforced by code nobody can bend.

## 2. The problem

- **Prices in Bolivia change every day.** The boliviano went from the Bs 6.96 peg to about Bs 12 per dollar, and food prices rose ~87% in 2026. Families want to lock a price; producers want guaranteed demand.
- **Pre-selling should solve that, but pre-sales are where people get scammed.** The Santa Cruz apartment pre-sale scams left hundreds of victims and over US$10M lost. Paying in advance means trusting the seller with your money.
- **Producers have no working capital.** During the 2026 road blockades, dairy farmers lost hundreds of thousands of liters with no safety net.

## 3. What Ayni is

**Producers pre-sell at a locked price. The buyer's money waits in a Stellar smart contract, in dollars (USDC), until the product arrives. If it never arrives, the buyer gets the money back automatically.**

1. **Publicar** — A producer creates a pre-sale: product, price, minimum and maximum units, delivery date.
2. **Reservar** — Buyers pay into the contract (not to Ayni, not to the producer). If the minimum isn't reached, everyone gets 100% back.
3. **Entregar** — At pickup the producer scans the buyer's QR, the buyer confirms on their phone, and the producer is paid. A dispute freezes the payment until a verifier decides.
4. **Proteger** — If the producer disappears, buyers are refunded from what's left in the contract, then from the producer's bond, then from the community pool.
5. **Crecer** — Every completed delivery raises the producer's tier (Nuevo → Confiable → Destacado → Ejemplar), unlocking advances of up to 50% with smaller bonds.

It starts with **food** (fresh milk, eggs, vegetable baskets, coffee), moves to **B2B supply** (restaurants, school breakfasts), and later to **apartment pre-sales**, where the scams are biggest. The design must work for a $2 liter of milk and a $60,000 apartment.

## 4. Who uses it

| Role | Who | What they need to feel |
|---|---|---|
| **Comprador** | Families, small restaurants and shops in Bolivia. On a mid-range Android phone, often on mobile data. Low crypto literacy. | "My money is safe and I understand why." |
| **Productor** | Dairy farmers, egg producers, growers, co-ops; later real-estate developers. Practical, busy, often not tech-savvy. | "I sold before producing, and my good record is paying off." |
| **Verificador** | A producers' association, the platform, a certified engineer. | "I can review evidence and decide quickly and fairly." |
| **Garante** | A co-op, family member or NGO that posts a bond. | "I'm backing someone I trust, and I can see the risk." |
| **Visitante / jurado** | Judges, press, curious people. | "This is real: the money and the rules are visible." |

One account can hold several roles; there is no role picker. Users sign in with **Google** (embedded wallet by Pollar, fees sponsored), so they never see seed phrases, gas or the word "blockchain" unless they go looking for proof.

## 5. Brand: what we need from you

### Personality
- **Trustworthy like a bank, warm like a market stall.** Calm, solid, honest — never hype.
- **Rooted in Bolivia, not a folklore costume.** Andean, Chiquitano and Oriente references are welcome as *inspiration* (textile geometry of the aguayo, the color of earth, highland light, market life), not as decoration pasted on.
- **Plain Spanish (es-BO).** Short sentences, "tú", no jargon. Crypto words stay hidden behind a "Ver la prueba" link.
- **Equals, not donors.** Reciprocity, not charity: avoid hands-reaching-down imagery, pity, or "help the poor farmer" tones.

### Respect and guardrails
- Ayni is a living indigenous practice. Treat it with respect: no sacred symbols used literally as a logo (e.g. the chakana, the wiphala), no caricatured indigenous figures, no "tribal" fonts.
- No crypto clichés: no neon on black, no 3D coins flying, no rocket ships, no "to the moon".
- Color is never the only signal: every status has an icon and a word.
- WCAG 2.1 AA contrast in light and dark mode.

### What exists today (keep, evolve or replace — tell us why)
- Base color: deep, slightly desaturated **green** (`#1E6B47`, money, growth, "safe to go", tied to the producers' land).
- Accent: warm **amber** (`#A87406`), from coins and the aguayo, used only for small highlights (stars, streaks, "something to do" dots).
- Neutrals: **warm paper** tones (`#F7F4EE` background), so it feels like a market, not a bank terminal.
- Info blue (`#24609E`) for "in progress" states.
- Previous names: Despensa, then Pacta. Nothing visual is sacred; the reciprocity idea is.

### Name notes
"Ayni" doesn't explain itself to people outside the Andes, and other brands use the word. The **tagline must do the explaining**. Propose taglines in Spanish (with English versions) in this spirit:
- *"Hoy por ti, mañana por mí."*
- *"Pagas hoy. Recibes seguro."*
- *"Tu confianza vuelve."*
- *"Lo que das, vuelve."*

Product lines may later be named "Ayni Despensa" (food) and "Ayni Hogar" (homes). Consider how the brand system stretches to sub-brands.

## 6. Deliverables, in rounds

### Round 1 — Three brand directions
Give me **three clearly different directions**. For each:
1. A name for the direction and the one-sentence idea behind it (how it expresses reciprocity).
2. **Logo concept**: wordmark + symbol, described precisely and drawn (SVG if you can). Ideas to explore: two shapes that complete each other, a loop or exchange, an interlocking textile stitch, two hands as one form, a cycle of giving and returning. It must work at 16 px (favicon), on a printed market poster, and in one color.
3. **Palette** with hex values, light and dark mode, semantic colors (success, warning, error, info) and contrast ratios.
4. **Typography**: a display face and a text face (free Google Fonts), with sizes for mobile.
5. **Imagery and illustration style**: photography vs. illustration, how producers and products are shown, iconography style.
6. **Voice**: 5 sample lines of UI copy in Spanish (a button, an empty state, an error, a success, a push notification).
7. One **hero mock**: the marketplace home on a phone (360×800).

### Round 2 — Design system (for the chosen direction)
- Color tokens (`bg`, `surface`, `surface-2`, `line`, `ink`, `ink-2`, `brand`, `accent`, semantic pairs), light + dark.
- Type scale, spacing scale, radii, elevation, motion (subtle, purposeful; respect reduced motion).
- Components: buttons (primary, secondary, ghost, destructive), inputs, chips, status pills, tier badges, streak, stars, progress/funding bar, campaign card, voucher card with QR, dialog/bottom sheet, toast, tooltip/hint, empty state, skeleton, transaction-status stepper.
- Category icons for: leche, huevos, canasta de verduras, café, departamento — distinguished by icon and name, not color.

### Round 3 — All screens (mobile first, then desktop)
| Screen | Must show |
|---|---|
| **Landing / onboarding** | The promise in one sentence, how the money is protected in 3 steps, "Entrar con Google". Explain ayni in one line. |
| **Marketplace** (`/`) | Category chips, search, campaign cards (product, producer + tier, price in **$us** with **≈ Bs** reference, funding progress, days left, protection line), total money protected and pool size. |
| **Campaign** | Photos, price lock, funding bar, timeline (venta → producción → entrega), milestones, **"Cómo está protegido tu dinero"** with real numbers, producer reputation, share to WhatsApp, one sticky "Reservar" action. |
| **Checkout** | Quantity, total in $us and Bs, where the money goes (into the contract, not to anyone), what happens if it fails, confirm. |
| **Transaction states** | Preparando → Firmando → Confirmando, then Completado / Pendiente ("no la repitas") / Falló ("no se movió tu dinero"). |
| **Mis vales** (my vouchers) | Grouped by what needs doing: recoger (show QR), confirmar, reclamar reembolso, calificar. |
| **Pickup hand-off (two phones)** | Buyer shows a big QR; producer scans; buyer sees "¿Recibiste tu leche?" live; producer sees "Cobraste $us X". This is the demo's magic moment — make it feel like a handshake. |
| **Dispute and refund** | Calm, clear, no blame. What happens next and when. |
| **Producer dashboard** | Reputation, tier progress ("2 entregas más para Destacado"), streak, campaigns with pending-action badges. |
| **Create pre-sale wizard** (5 steps) | Product & category, price & quantities, dates, milestones/advances (clamped to tier), verifier & bond. Live preview of the card. |
| **Verifier inbox** | Milestones with evidence to approve, open disputes, decision with consequences shown. |
| **Garante view** | Post a bond for a producer, see exposure, withdraw after completion. |
| **Public producer profile** | Track record, ratings, streak, past campaigns. Shareable. |
| **Transparencia** | Live totals: money in escrow, delivered, refunded, pool; the rules and tier table. For judges and skeptics. |
| **Printable stall poster** | A4: product, price, protections, big QR. Readable from 2 meters at a market. |
| **Link preview / OG image** | How a campaign looks when shared on WhatsApp. |

Also design: empty states, loading skeletons, offline/error states, read-only mode (not signed in), dark mode, and the app icon.

## 7. Key UX principles

- **One primary action per screen.** Everything else secondary.
- **Show where the money is, always.** At every step a buyer should be able to answer: "Where is my money right now, and when does it move?"
- **Consequences before confirmation.** Irreversible actions say "No se puede deshacer" and show the amount that moves.
- **Progressive disclosure.** Simple first; details, fees and on-chain proof one tap away — but fees, risks and deadlines never hidden only in a tooltip.
- **Built for the market, not the office.** Large tap targets, readable in sunlight, works on 360 px wide screens and slow connections, shareable on WhatsApp.
- **Reciprocity made visible.** Show the loop: your reservation → their production → your delivery → their reputation → the pool that protects everyone. The user should feel part of a community ayni, not a transaction.

## 8. Output format

For each round: a short rationale, then the visuals (SVG/HTML/Figma frames or detailed specs), then open questions for us. Label everything in Spanish as it would appear in the app. When you make a design decision, say what problem it solves.
