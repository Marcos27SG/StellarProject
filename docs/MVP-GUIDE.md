# Pacta MVP: setup and end-to-end walkthrough

How to run the full flow on Stellar **testnet** with Pollar wallets:
login → get test USDC → producer creates a pre-sale → buyer buys (money held in escrow) → sale closes → producer delivers by QR → buyer confirms → producer is paid → history.

> Status (2026-11-13): the happy path below was run end to end on testnet with two Pollar accounts (Google login),
> from login to the producer being paid and rated. See section 8 for what was checked and what was not.

## 1. What runs where

| Piece | Where |
|---|---|
| Contract | `CCGR4QPJLH565PVUQMB3HO3O2AKBBVDFITDRWMURPXECFIL22FRV32OJ` on testnet ([explorer](https://stellar.expert/explorer/testnet/contract/CCGR4QPJLH565PVUQMB3HO3O2AKBBVDFITDRWMURPXECFIL22FRV32OJ)) |
| Settlement token | Circle testnet USDC, `USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` (token contract `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`) |
| Wallets, login, fees | Pollar (`@pollar/react` 0.12, SDK API v3) |
| Web app | Next.js in `app/`, all config in `NEXT_PUBLIC_*` variables |

The earlier DUSD demo deployment is kept for reference in `deployments/testnet-dusd.json`. Pollar wallets can't hold DUSD, so the app no longer uses it.

## 2. Keys

| Key | Prefix | Where it goes | Public? |
|---|---|---|---|
| Pollar publishable key | `pub_testnet_` | `app/.env.local` → `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY` | Yes. It ships in the browser bundle by design; the **allowed origins** list in the dashboard is what stops other sites from using it. |
| Pollar secret key | `sec_testnet_` | Not used by this MVP. If a backend ever needs it: server-only env var **without** `NEXT_PUBLIC_`. | **No.** Never in `app/.env.local` or the client. |

- The file is `despensa/app/.env.local`, next to `package.json`. Next.js does not read `despensa/.env.local`.
- `.env*` files are git-ignored; only `app/.env.example` is committed.
- Per environment: local uses `app/.env.local`; staging and production set the same variable in the host's build settings (for example Vercel → Environment Variables), with a `pub_mainnet_` key only for production.

## 3. Pollar dashboard setup (one time, at dashboard.pollar.xyz, app "pacta")

1. **Developers → API keys:** create a publishable key (shown only once) and paste it into `app/.env.local`.
2. **Developers → Websites → Allowed origins:** add the exact origin you open the app on, e.g. `http://localhost:3000`. If port 3000 is busy, Next.js moves to 3001: add `http://localhost:3001` too. No wildcards for ports.
3. **Developers → Websites → Allowed redirect URIs:** add `http://localhost:3000` (and `:3001`). While this list is empty, every Google login is refused (`APPLICATION_HAS_NO_REDIRECT_URIS`). The bare origin is enough; no callback path is needed.
   - Leave **Allow native clients** on the API key **off**: it is for mobile apps, does nothing for a web app, and lets any non-browser client use the key without the origin check.
4. **Users → Sign-in:** enable Google. Enabling email code too lets one person test with two accounts.
5. **Wallets → Starting balance:** Funding Mode **Immediate**; click **Fund in test mode** so the funding wallet has XLM for account reserves.
6. **Wallets → Tokens:** **Add token → Search on Stellar** for issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` (testnet USDC). The "Recommended" USDC uses the mainnet issuer `GA5Z…`, which is wrong on testnet.
7. **Wallets → Sponsored fees → Contract sponsorship rules:** add contract `CCGR4QPJLH565PVUQMB3HO3O2AKBBVDFITDRWMURPXECFIL22FRV32OJ` (all methods). Without it users with 0 XLM cannot pay network fees. The test run used **Sponsor all contracts**; switch to the single-contract rule before going live, or the app pays fees for any contract a user calls.
8. Optional, **Wallets → Settings → Signature confirmation:** "always ask" (default) shows Pollar's confirm modal before each signature.

## 4. Run locally

```bash
cd despensa/app
npm install
cp .env.example .env.local     # then paste the publishable key
npm run dev                    # http://localhost:3000 (or 3001 if 3000 is busy)
```

Before opening the browser, check the key and origin against Pollar (prints the key's prefix only):

```bash
npm run pollar:check -- http://localhost:3000
```

`✓ 200` means Pollar accepts the key from that origin, and the app's dashboard config is printed. `✗ 403 ORIGIN_NOT_ALLOWED` means the origin is missing under Developers → Websites.

Checks: `npm test`, `npx tsc --noEmit`, `npx eslint src`, `npm run spec:check`, `npm run build` (stop `npm run dev` first).

Wallets → **Signing rules** does not need setup: it only governs `signAuthEntry`, which Pacta doesn't use. Pacta's calls are signed as whole transactions, which the default **Transaction rules** (5 operations, 10 XLM fee cap) already allow.

## 5. Walkthrough

You need two accounts: a **producer** (A) and a **buyer** (B). Use two Google accounts, or Google and email code, in two browser profiles or one normal and one private window.

| # | Who | Do | What you should see |
|---|---|---|---|
| 1 | A and B | **Entrar con Google** | The header button turns into your balance. While Pollar activates the account a spinner and "Activando tu billetera" show; actions wait. |
| 2 | A and B | Header balance → **Tu cuenta** | Your Stellar address with a copy button. If "Activa USDC en tu billetera" shows, press **Activar** and **Confirm** in Pollar (sponsored, free). The producer needs it too, or the payment can't reach them. Accounts created after USDC was enabled in Pollar get it at login. |
| 3 | B | Open [faucet.circle.com](https://faucet.circle.com), pick **Stellar Testnet**, paste the address, request USDC. Back in the app: **Ya cargué**. | Balance shows the USDC. |
| 4 | A | **Vender → Nueva preventa**: product type, name, price, goal, dates. Publish and sign. | Steps "Preparando → Firmando → Confirmando → Listo". The pre-sale appears in **Mercado**. |
| 5 | B | Open the pre-sale, choose a quantity, **Comprar**, sign. | Funding bar moves; the voucher shows in **Mis vales → En preventa**. Balance drops by the price. |
| 6 | A | **Vender** → the campaign → **Cerrar preventa y empezar** (once the goal is met). | Status goes to Active. Buyer's voucher moves to **Por recibir**. |
| 7 | B | **Mis vales** → **Mostrar mi vale** (QR). | A QR for the hand-off. |
| 8 | A | Scan the buyer's QR with the producer's phone (signed in as A), or on one computer open the QR's link in A's window: `/producer/deliver?campaign=<id>&buyer=<buyer G…>&units=<n>`. Press **Entregué…** and sign. | "Pago pendiente — esperando que el comprador confirme". Buyer's voucher moves to **Por confirmar**. |
| 9 | B | Confirm reception in **Mis vales**. | Payment released: producer receives the price minus the 2% fee. |
| 10 | B | **Calificar al productor**. | Rating and streak show on the producer's profile. |
| 11 | Both | **Tu cuenta → Movimientos** (Pollar history), and **Transparencia** (contract totals). | Movimientos lists the transactions *you* signed, with sponsored fees. Money you receive (the producer's payout) shows in your balance and on Transparencia, not in Movimientos. |

Every signature opens Pollar's **Confirm transaction** prompt (the app's "Prompt" signature-confirmation setting). Pacta's own dialogs step aside while it is open.

Refund path (not run yet): create a pre-sale whose goal is not met; after the sale end, anyone presses **Cerrar preventa**, and buyers see **Pedir reembolso** in **Mis vales**.

## 6. Common errors

| Message or symptom | Cause | Fix |
|---|---|---|
| Yellow "Modo demostración" banner, no **Entrar** button | No key loaded | Key in `app/.env.local` (not `despensa/.env.local`), then restart `npm run dev`. |
| "Este sitio no está autorizado en Pollar" / `Origin not allowed` | Origin not allowlisted | Add the exact `http://localhost:PORT` under Allowed origins. |
| Google login refused, `APPLICATION_HAS_NO_REDIRECT_URIS` or `REDIRECT_URI_NOT_ALLOWED` | Redirect list empty or missing the origin | Add it under Allowed redirect URIs. |
| "Tu billetera se está activando…" | Account still being created on Stellar | Wait a few seconds. If it stays, check the funding wallet has XLM. |
| "Tu billetera todavía no acepta USDC" | No USDC trustline | **Tu cuenta → Activar**, or enable the testnet USDC issuer under Tokens. |
| "No tienes saldo suficiente" | Not enough USDC | Faucet, then **Ya cargué**. |
| "Tu billetera no tiene XLM para la comisión de red…" (`txInsufficientBalance`) on publish, buy or any contract action | Pollar didn't sponsor the call, so the 0-XLM wallet had to pay the fee | Add the contract under Sponsored fees → contract rules (or turn on Sponsor all contracts), and fund the gas wallet. |
| **Activar** USDC fails or the trustline never appears | Testnet USDC isn't enabled under Tokens, so the trustline isn't sponsored | Enable issuer `GBBD47…FLA5` under Wallets → Tokens. New logins get the trustline automatically. |
| "Demasiados intentos seguidos" | Pollar rate limit (`RATE_LIMITED`) | Wait a minute. |
| A contract message ("La preventa ya cerró", "No quedan suficientes unidades"…) | The contract refused the action | Shown as-is; nothing moved. |
| "Sin confirmar — la red tardó en responder…" | Pollar or testnet took too long to answer (the SDK waits up to 90 s) | **Don't repeat it yet.** Reload the page after a minute: if the state changed, it went through. |

## 7. Before production

- **Audit the contract.** It has unit tests but no audit.
- Mainnet: deploy with mainnet USDC (`GA5Z…`), a live Pollar app with `pub_mainnet_` keys, no localhost origins, and real redirect URIs.
- Mainnet Pollar wallets are Turnkey co-signed or self-custody: test the `cosign_pending` path and wallet recovery.
- Verifiers: today only the CLI identity `despensa-verifier` is allowlisted. Milestone advances and disputes need real verifiers allowlisted with `set_verifier`.
- Campaign metadata is stored inline on-chain (base64). Move to IPFS or HTTPS with a pinning service before real catalogues.
- On-ramp: Bolivian bank QR → USDC via Pollar ramps (needs KYC).
- Monitoring: keep the Pollar funding and gas wallets topped up; low-balance alerts aren't available yet.

## 8. Test run, 2026-11-13 (testnet)

Producer `GD357X5I…VYZ2` and buyer `GBRBVDEM…KYOU`, both Pollar wallets from Google login, pre-sale `0` ("Leche fresca de prueba (MVP)", $1.00/litre, goal 2, max 20, no milestones).

| Step | Result |
|---|---|
| Login, wallet activation | ✅ Account created on Stellar, reserve sponsored by Pollar, 0 XLM of its own |
| USDC trustline (Activar) | ✅ Sponsored; Cancel in Pollar's prompt shows "Cancelaste la firma. No se movió nada." |
| Publish pre-sale | ✅ after enabling contract sponsorship (first try: `txInsufficientBalance`, nothing moved) |
| Buy 2 litres | ✅ $2.00 in escrow; buyer 20 → 18 USDC |
| Close sale | ✅ on-chain; the UI reported a 30 s timeout as a failure, which led to the "Sin confirmar" fix |
| Deliver by QR link | ✅ "Pago pendiente" |
| Confirm + rate | ✅ Campaign Completed; producer received **1.96 USDC**; 0.04 to the guarantee pool; rating 4★; producer tier 1 → 2 |
| History | ✅ Pollar Movimientos lists each signed call; Transparencia shows $2.00 sold, 100% delivered, pool $0.04 |

Not run: refund path, disputes, milestone advances, transfer of vouchers, the "Sin confirmar" state in the browser (covered by unit tests), phones (QR scan with a camera), mainnet.
