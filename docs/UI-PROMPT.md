# Prompt: Pacta web UI (multi-product, scalable)

> Paste everything below the line into your AI coding assistant (Claude Code, Cursor, etc.) from the `despensa/` folder.
> To use it in v0 or Lovable instead, drop the "Existing code" section and ask for a standalone Next.js + Tailwind app with mocked data that matches the types in section 4.

---

You are a senior product designer and front-end engineer. Redesign and extend the web UI of **Pacta** (formerly Despensa), a pre-sale marketplace on Stellar (Soroban). It is for the Stellar Bolivia 2026 hackathon (build window 9–22 Nov 2026, live pitch in Santa Cruz). Ship a polished, mobile-first UI that judges can demo in 3 minutes. Build it so that **milk is only the first product**: adding eggs, cheese, vegetable baskets, coffee, or apartment pre-sales must not require editing any component.

## 1. Product in one paragraph

Producers pre-sell future products at a locked price ("La leche de mañana, al precio de hoy"). Buyers pay in USDC. The money sits in a Soroban contract and reaches the producer only on delivery. Protections enforced on-chain: an all-or-nothing goal (`min_units`), a supply cap (`max_units`), pay-on-delivery confirmed by QR, milestone advances that need a verifier's approval and a bond (*aval solidario*, which anyone can post), a dispute window, a default waterfall (escrow, then bond, then pool), and a 2% community guarantee pool. Producers build on-chain reputation (completions, streaks, 1–5★ ratings, tiers 0–4) that unlocks bigger advances. Read `docs/DESIGN.md` for the full mechanism.

## 2. Users and their jobs

| Role | Who | Main jobs |
|---|---|---|
| **Comprador** (buyer) | Families, restaurants, small shops in Bolivia. Low crypto literacy, on a phone. | Find a pre-sale, understand why the money is safe, buy, show a QR at pickup, confirm, dispute, get a refund, rate, gift a voucher. |
| **Productor** (seller) | Dairy farmers, co-ops, growers; later real-estate developers. | Create a pre-sale, post a bond, close the sale, submit milestone evidence, deliver by scanning QR, track reputation and tier. |
| **Verificador** | A producers' association, the platform, or a certified engineer for real estate. | Approve milestone evidence, resolve disputes, declare a default. |
| **Garante** (guarantor) | A co-op, family, or NGO. | Post a bond for a producer, withdraw it after completion. |
| **Visitante / jurado** | Judges, press, curious users. | See that the money and rules are real and on-chain, without logging in. |

One wallet can hold several roles. The UI derives roles from the connected address (`address === campaign.seller`, `=== campaign.verifier`, has a holding, has a bond). There is no role picker.

## 3. Existing code: keep it, build on it

- `app/`: Next.js 15 App Router, React 19, TypeScript, **Tailwind 4.2.4 (pinned: the dev machine runs Node 20.16, so don't upgrade Tailwind or Next)**, `@pollar/react` (Google login, embedded wallets, fee sponsorship), `@stellar/stellar-sdk`, `qrcode.react`.
- `app/src/lib/despensa.ts`: the contract data layer (typed reads, `buildXdr`, `friendlyError`, `usd()`, `bs()`, labels). Keep this as the single place that talks to the contract. Don't call the SDK from components.
- `app/src/lib/config.ts`: env config (contract ID, token symbol, Bs per USD rate, Pollar key).
- `app/src/components/Wallet.tsx`: Pollar provider, `useWallet`, `useAction`. When `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY` is empty the app is **read-only**: show a clear banner and disabled actions with a tooltip, never broken buttons.
- Existing routes: `/`, `/campaign/[id]`, `/producer`, `/producer/deliver`.
- **Don't change the Soroban contract** (`contracts/despensa`). It is deployed and tested. Everything in this prompt is UI and off-chain metadata.
- Check new dependencies against Node 20.16. Prefer: `lucide-react` icons, hand-written primitives (or shadcn/ui components copied into `components/ui/`), `zod` for metadata validation. No component framework that brings its own CSS system.

## 4. Scalability architecture (the most important part)

The contract is already product-agnostic: a campaign is `title`, `metadata_uri`, `unit_price`, `min_units`, `max_units`, `sale_end`, `delivery_deadline`, and up to **5** milestones (`title` + `bps`). Today "leche" and "litro" appear only in UI copy and form defaults. Keep it that way: **all product specifics live in (a) a category registry in code and (b) per-campaign metadata off-chain.**

### 4.1 Category registry

Create `app/src/catalog/` with one file per category and an index:

```ts
// app/src/catalog/types.ts
export type DeliveryMode = "pickup" | "home_delivery" | "recurring_pickup" | "handover";

export interface UnitDef {
  singular: string;          // "litro", "docena", "canasta", "departamento"
  plural: string;            // "litros", "docenas", "canastas", "departamentos"
  short?: string;            // "L", "doc."
  step: number;              // min purchase increment, e.g. 1 for most, 5 for "5 L packs"
  maxPerOrder?: number;      // UI cap per purchase (the contract caps by max_units)
}

export interface AttributeField {
  key: string;               // "fat_content", "breed", "floor", "bedrooms"
  label: string;             // Spanish label
  type: "text" | "number" | "select" | "boolean" | "date" | "url";
  options?: { value: string; label: string }[];
  unit?: string;             // "%", "m²"
  required?: boolean;
  showOnCard?: boolean;      // surfaces as a chip on the marketplace card
}

export interface MilestoneTemplate {
  title: string;             // "Compra de alimento para el ganado", "Fundaciones vaciadas"
  suggestedPct: number;      // share of the price; the UI clamps to the producer's tier limit
  evidenceHint: string;      // what proof the verifier expects
}

export interface CategoryDef {
  id: string;                // "dairy.milk", "eggs", "veg_basket", "real_estate.apartment"
  group: "alimentos" | "bebidas" | "artesania" | "inmuebles" | "otros";
  label: string;             // "Leche fresca"
  icon: string;              // lucide icon name or emoji, rendered by <CategoryIcon/>
  accent: string;            // design-token name, not a hex value
  unit: UnitDef;
  deliveryMode: DeliveryMode;
  perishable: boolean;
  attributes: AttributeField[];
  milestoneTemplates: MilestoneTemplate[];   // max 5 (contract limit)
  verifierLabel: string;     // "Asociación de productores", "Ingeniero certificado"
  defaults: {                // pre-fill the create wizard
    saleDays: number;
    deliveryDays: number;
    minUnits: number;
    maxUnits: number;
  };
  priceDisplay: { decimals: 0 | 2 };         // 2 for milk; 0 for a US$60,000 apartment
  copy?: Partial<Record<"tagline" | "deliveryVerb" | "confirmVerb" | "voucherNoun", string>>;
  // e.g. deliveryVerb: "entregar" vs "entregar llaves"; voucherNoun: "vale" vs "reserva"
}
```

Seed it with **at least these four**, so the system is proven generic and not "milk plus exceptions":

1. `dairy.milk`: litro, recurring pickup, perishable, attributes (tipo: entera/descremada, origen, punto de recojo), milestone "Compra de alimento para el ganado" (20%).
2. `eggs`: docena, pickup, perishable.
3. `veg_basket`: canasta, weekly recurring pickup, attributes for the contents list.
4. `real_estate.apartment` (roadmap demo, behind a "Próximamente" flag): departamento, handover, not perishable, 0-decimal prices, 12–36-month deadlines, 5 construction milestones (excavación, fundaciones, obra gruesa, instalaciones, acabados), verifier "Ingeniero certificado", attributes for m², dormitorios, piso, and permit document URLs.

Rules:
- Components receive a `CategoryDef` and never contain a literal product word ("leche", "litro", "departamento"). Grep for these words outside `catalog/` as a check.
- Unknown or missing categories fall back to a `generic` category ("unidad"/"unidades"), so campaigns created by older versions or other clients still render.
- Adding a category = adding one file to `catalog/` and one line to its index. No other file changes.

### 4.2 Campaign metadata (off-chain, versioned)

`metadata_uri` holds a pointer to (or the inline body of) a JSON document. Define and validate it with zod:

```ts
export interface CampaignMetadataV1 {
  schema: "despensa.campaign/v1";
  category: string;                 // CategoryDef.id
  description: string;
  images: string[];                 // URLs or ipfs:// CIDs
  attributes: Record<string, string | number | boolean>;  // keys from CategoryDef.attributes
  producer: { displayName: string; location?: string; whatsapp?: string };
  delivery: { mode: DeliveryMode; points?: { name: string; address?: string; schedule?: string }[] };
  documents?: { label: string; url: string }[];           // permits, certificates
}
```

- Build a `MetadataStore` interface with `resolve(uri) => Promise<CampaignMetadata>` and `publish(doc) => Promise<string>`, plus adapters:
  - `inline` (hackathon default): `metadata_uri = "data:application/json;base64,..."`. Keep the document under about 1 KB (images by URL only), because it is stored on-chain.
  - `https` / `ipfs`: fetch and validate. Publishing to IPFS can be a stub for now.
  - `legacy`: plain text (what the current demo campaigns hold). Treat it as `{ category: "generic", description: text }`.
- Cache resolved metadata per campaign ID. On a validation failure, render the campaign with the fallback and a small "detalles no disponibles" note. Never crash the page.

### 4.3 Status × role → next action

Put all "what can this person do now" logic in one pure, unit-testable function, `lib/actions.ts`:

```ts
nextActions(campaign, holding, role, now, disputeWindow) => Action[]  // ordered, first = primary CTA
```

| Status | Comprador | Productor | Verificador | Garante |
|---|---|---|---|---|
| Funding | buy, transfer/gift | add bond, close sale (once `min_units` is reached), cancel (free) | — | add bond |
| Active | show QR, confirm, dispute (within the window), finalize (after the window), transfer | submit milestone evidence, deliver (scan QR) / mark delivered, cancel (counts as default) | approve milestone, resolve dispute, declare default | — |
| Completed | rate (once) | — | — | withdraw bond |
| Failed | claim refund (100%) | — | — | withdraw bond |
| Defaulted | claim refund (from escrow + bond + pool), rate | — | — | withdraw what's left of the bond |
| any, after the deadline | — | settle | settle | settle |

Components render `Action[]`. They don't re-derive rules. Each action has a Spanish label, a one-line explanation of its consequence, and a confirm step if it is irreversible or costs money.

## 5. Screens

Mobile-first (design at 360 px, scale up to 1280 px). Spanish (Bolivia), `es-BO` number and date formats.

1. **Mercado `/`**
   - A short hero with a category-aware tagline (rotates or follows the selected category) and the 4 trust chips.
   - Category chips (from the registry, with counts), search, a status filter (En preventa / En entrega / Completadas), sort (closing soon, most funded, best-rated producer).
   - **Campaign card:** category icon/image, title, price per unit with "precio bloqueado", USDC and ≈ Bs, a funding bar with a goal marker, days left, attribute chips (`showOnCard`), producer trust line (tier, streak, ★), status pill.
   - Skeleton loading, empty state per category, network error with a retry.
2. **Campaña `/campaign/[id]`**
   - Gallery, description, and attributes rendered from the category schema.
   - **Sticky buy panel** (bottom sheet on mobile): unit stepper using `unit.step` and pluralized unit names, live total in USDC and Bs, "100% reembolsable si no se llega a la meta".
   - **Lifecycle timeline:** Preventa → Producción → Entrega → Completada, with real dates and the current step highlighted. Failed and Defaulted are explicit alternate endings.
   - **Milestones:** % released, evidence links, verifier approval state.
   - **"Cómo está protegido tu dinero":** the key differentiator, written per campaign with real numbers ("Si no se venden 50 litros antes del 12 nov, recuperas el 100%"). Expandable "¿Qué pasa si el productor no cumple?" with a small waterfall graphic (escrow, then aval, then fondo).
   - **Transparency box:** escrow, bond, amount advanced, refunded, and a contract link to stellar.expert.
   - **My vouchers** (if any): QR to show at pickup, quantity by state (held / pending confirmation / delivered / refunded), dispute-window countdown, gift to another address.
   - Role panels below (producer, verifier, guarantor), driven by `nextActions`.
3. **Mis vales `/me`** (new): every holding across campaigns, grouped by "por recoger", "por confirmar", "recibidos", "reembolsos"; buyer stats ("Apoyas a 3 productores locales").
4. **Productor `/producer`**
   - Dashboard: campaigns with an "acción pendiente" badge, the reputation card, and **tier progress** ("2 entregas más para Destacado: adelantos de hasta 40%").
   - **Create wizard:** (1) choose a category → (2) product details from the category's attribute schema plus photos → (3) price, goal, cap, and dates (defaults from the category), with a live preview card → (4) milestones from the templates, clamped to the tier's `max_advance_bps`, showing the required bond → (5) verifier address and review, with a plain-language summary of the money flow (use the worked example in DESIGN.md §5 as the model).
5. **Entregar `/producer/deliver`:** camera QR scan, enter units, confirm. Large touch targets; it works outdoors in sunlight.
6. **Verificador `/verify`** (new): an inbox of milestones awaiting approval and open disputes, with evidence, deadlines, and approve/reject buttons.
7. **Productor público `/p/[address]`** (new): reputation, past campaigns, ratings, badges. This is what a buyer checks before trusting someone.
8. **Transparencia `/transparencia`** (new, for judges): total in escrow, guarantee pool balance, campaigns by status, delivered vs refunded units, explorer links. All read live from the contract.

## 6. Design system

- **Tone:** warm, local, trustworthy. A market stall, not a crypto exchange. Avoid "blockchain", "smart contract", and "wallet" in primary copy. Use **vale** (voucher), **custodia** (escrow), **aval** (bond), **verificador**, and **dólares digitales**, with a glossary tooltip (ⓘ) on first use. Put the technical proof (tx hashes, contract ID) one tap away, in a "Ver en Stellar" link.
- **Tokens:** define colors, radii, spacing, and shadows as CSS variables in `globals.css` (Tailwind 4 `@theme`). Use semantic names: `--color-trust`, `--color-funding`, `--color-active`, `--color-done`, `--color-danger`, `--color-muted`. Category accents are tokens too. Support dark mode through the same tokens.
- **Money:** the price is locked in USD. Show `0,60 USDC` as the primary figure and `≈ Bs 7,20` as secondary, with "tipo de cambio referencial". The token symbol comes from `config.tokenSymbol`. Decimals come from `category.priceDisplay`. Use a `<Money amount category />` component everywhere.
- **Quantities:** one `<Qty n category />` component that pluralizes ("1 litro", "3 litros", "1 departamento").
- **Status pills, tier badges, streak flame, star rating:** one component each, reused everywhere.
- **Accessibility:** WCAG AA contrast, 44 px touch targets, visible focus, labelled inputs, nothing conveyed by color alone (pair every status with an icon and text), `prefers-reduced-motion`.
- **Performance:** the marketplace makes N contract reads. Show skeletons, cache with a small in-memory store (or SWR), and never block the whole page on one slow call.

## 7. Transaction UX

Every write goes through one `useAction` flow with visible steps: **Preparando → Firma (Pollar) → Enviando → Confirmado ✓** (with an explorer link) or a **friendly error** from `friendlyError`. Disable double submits. After success, refresh only the affected campaign and holding. Fees are sponsored, so never mention gas.

## 8. Deliverables

1. `catalog/` with the 4 categories plus `generic`, and the `MetadataStore` with the inline, https, and legacy adapters.
2. `lib/actions.ts` (`nextActions`) with unit tests for each status × role cell in §4.3.
3. A shared component library in `components/` (Money, Qty, StatusPill, TierBadge, Progress, Timeline, ProtectionExplainer, CampaignCard, BuyPanel, VoucherQR, ActionButton, CategoryIcon, EmptyState, Skeleton).
4. All screens in §5, responsive, in Spanish.
5. A `/dev/catalog` page (dev only) that renders a sample card and detail page for every category. Use it to prove the scalability claim in the pitch.
6. A short `app/UI.md`: how to add a category, the metadata schema, and the component inventory.

## 9. Acceptance criteria

- [ ] Adding a fifth category (e.g. `coffee`, per kg) touches only `catalog/` and renders correctly in the marketplace, detail page, create wizard, and `/dev/catalog`.
- [ ] No product-specific words outside `catalog/` (check with grep).
- [ ] The existing on-chain demo campaigns (plain-text `metadata_uri`) still render, through the legacy fallback.
- [ ] The real-estate sample (US$60,000 per unit, 20 units, 5 milestones, a 24-month deadline) displays without layout breaks or wrong number formats.
- [ ] Read-only mode (no Pollar key) is clear and never shows a broken action.
- [ ] At 360 px wide: no horizontal scroll, the buy panel is reachable with a thumb, and the QR is scannable.
- [ ] `npm run build` and `npm run lint` pass on Node 20.16.
- [ ] Demo script works end to end: browse → open the milk campaign → read the protections → buy → show the QR → producer scans → confirm → rate → reputation updates.

Work in small, reviewable steps: catalog and metadata first, then `nextActions` and its tests, then components, then screens. Show me the category types and the metadata schema before you build screens on top of them.
