# Ayni

**Pre-sales of local products at a locked price, protected on Stellar.**
Producers pre-sell (milk, eggs, quesillo, vegetable baskets…). Buyers' money is held in a Soroban contract, in dollars (USDC), and reaches the producer only when it is delivered. If the minimum isn't reached, buyers get 100% back. If the producer fails, buyers are refunded from what's left in escrow and then the producer's bond (*aval*), which covers every advance. Only identity-verified producers can ask for advances. While it waits, the money earns yield in a lending pool (Blend), shared between buyer and producer. Producers build on-chain reputation (streaks, ratings, tiers) that raises how much they can get in advance.

Built for the **Stellar Bolivia 2026 National Startups Hackathon**. *Lo que das, vuelve.*

> **Naming.** The product was called *Despensa*, then *Pacta*, and since 18 Nov 2026 is **Ayni** (the Andean principle of reciprocity). Internal identifiers keep the old name so nothing deployed breaks: the `despensa/` folder, the `despensa` crate and wasm, `app/src/lib/despensa.ts`, `NEXT_PUBLIC_DESPENSA_CONTRACT_ID`, the metadata schema id `despensa.campaign/v1`, and the Stellar CLI identities `despensa-*`. Read [docs/DESIGN.md](docs/DESIGN.md) for the full mechanism and research.

## Status

| Piece | State |
|---|---|
| Soroban contract (`contracts/despensa`) | ✅ Model v2 (no common fund, verified sellers, 100% bonds, yield). 41 functions, 34 unit tests passing |
| Testnet deployment | ✅ `CDDIJ4LNQ3OR2XR5MM36L552FXMBLXXNNJDWJUWA5M57E6LPRRKWG66X` ([explorer](https://stellar.expert/explorer/testnet/contract/CDDIJ4LNQ3OR2XR5MM36L552FXMBLXXNNJDWJUWA5M57E6LPRRKWG66X)), settled in Circle testnet USDC, supplying to the test pool `CAIUUT5OP4GFWLKRSRDVE4UVXPRCZZMPXTUQLILULGUXZC3JHFJJW6X5` ("rendimiento de prueba", see below). Earlier deployments: `deployments/testnet-usdc-v1.json` (model v1 with the guarantee pool) and `deployments/testnet-dusd.json` |
| On-chain smoke test | ✅ verified seller, advance with a 100% bond, buy (yield on), confirm delivery with the yield split; cancel with refund + yield; default refunded from escrow + bond. Also run against **Blend's real testnet pool** with Blend's test USDC (`CAZPTUP3GIJSTAB3LPUZFC4VBWY3MI2W4ERXIQBKLZSOB7YWODQ4H64X`, `deployments/testnet-blend-smoke.json`) |
| Web app (`app/`, Next.js + Pollar) | ✅ Google login, sponsored fees and the full pay-on-delivery flow run end to end on testnet with Pollar wallets (2026-11-13; see [docs/MVP-GUIDE.md](docs/MVP-GUIDE.md)). Refunds, disputes and milestones not yet run through the UI |

## Repository layout

```
contracts/despensa/   Soroban smart contract (Rust)
  src/lib.rs          contract logic: escrow, verified sellers, milestones, bonds, disputes, reputation
  src/vault.rs        share accounting for yield (ERC-4626 style)
  src/yield.rs        the only code that talks to the lending pool (Blend v2 interface)
  src/types.rs        data types and errors
  src/test.rs         20 scenario tests (happy path, default at every tier, verification, disputes, allowlist, farming attack, solvency…)
  src/test_yield.rs   14 yield tests (split, refunds, bonds, pool losses, buffer, frozen pool, admin limits, random solvency run)
contracts/mock-yield/ test-only pool with the subset of Blend v2's interface we call, at a fixed rate
app/                  Next.js 15 web app (Spanish UI), Pollar wallets, Stellar JS SDK
scripts/              deploy-testnet.ps1 (Windows), smoke-testnet.sh (bash)
deployments/          testnet.json: contract, pool and account IDs (public data); older deployments alongside
docs/DESIGN.md        mechanism, research, threat model, roadmap
```

## Prerequisites

- Rust (stable) + target: `rustup target add wasm32v1-none`
- Stellar CLI 30+ (`winget install Stellar.StellarCLI` on Windows, or `brew install stellar-cli` on Mac)
- Node.js **20.19+** recommended (20.16 works with the pinned Tailwind 4.2.4)

## Contract

```bash
cargo test                 # 34 tests
stellar contract build     # -> target/wasm32v1-none/release/despensa.wasm
```

Deploy to testnet. This creates or funds the identities `despensa-admin/seller/verifier/buyer/treasury`, optionally a demo DUSD token, the yield pool (a mock by default) and the contract; it allowlists `despensa-verifier` and marks `despensa-seller` as a verified seller:

```powershell
./scripts/deploy-testnet.ps1 -Token usdc -YieldPool mock   # Circle testnet USDC (what Pollar wallets hold) + test pool
./scripts/deploy-testnet.ps1 -Token demo -YieldPool none   # mintable demo token, no yield
./scripts/deploy-testnet.ps1 -Token blend -YieldPool blend -Out testnet-blend-smoke   # Blend's real testnet pool
```

**Yield on testnet.** Blend's testnet pools only list Blend's own test USDC, not the Circle testnet USDC that Pollar wallets hold. So the demo deployment supplies to `contracts/mock-yield` at a fixed rate, and the app labels it "rendimiento de prueba". The mock pays yield from its own balance: send it a little USDC. Its admin (`despensa-admin`) can also `set_b_rate` (simulate yield or a loss) and `set_frozen` (simulate a pool that can't pay); it has no function that moves anyone's funds. The yield pool is fixed for good at deploy.

Admin controls (the admin can't move money anywhere but between the contract and its fixed pool, or change a live campaign):

```bash
# Allow or remove a verifier. Producers can only appoint allowlisted verifiers.
stellar contract invoke --id <contract> --source-account despensa-admin --network testnet -- set_verifier --verifier G... --allowed true
# Dispute window for new campaigns, 1 to 30 days in seconds. Live campaigns keep theirs.
stellar contract invoke --id <contract> --source-account despensa-admin --network testnet -- set_dispute_window --seconds 259200
# Mark a seller as identity-verified after the off-chain check (admin or an allowlisted verifier). Only the flag is stored.
stellar contract invoke --id <contract> --source-account despensa-verifier --network testnet -- set_seller_verified --caller G...verifier --seller G... --verified true
# Pause or resume new deposits into the pool, and the share kept idle (1000..10000 bps, default 2000).
stellar contract invoke --id <contract> --source-account despensa-admin --network testnet -- set_yield --enabled true --liquid_bps 2000
# Yield split for new campaigns: buyer's share and Ayni's share of a delivered unit's yield (default 5000 and 0; Ayni at most 2000).
stellar contract invoke --id <contract> --source-account despensa-admin --network testnet -- set_yield_split --buyer_bps 5000 --protocol_bps 0
# Pull everything back from the pool into the contract (and pause deposits).
stellar contract invoke --id <contract> --source-account despensa-admin --network testnet -- exit_yield
# Anyone: move money between idle and the pool toward the target.
stellar contract invoke --id <contract> --source-account despensa-buyer --network testnet -- rebalance
# Hand the admin role over in two steps: propose, then the new admin accepts.
stellar contract invoke --id <contract> --source-account despensa-admin --network testnet -- propose_admin --new_admin G...
stellar contract invoke --id <contract> --source-account <new-admin> --network testnet -- accept_admin
```

After a redeploy, point the app at the new contract (`NEXT_PUBLIC_DESPENSA_CONTRACT_ID`) and refresh its bundled copy of the contract interface: `cd app && npm run spec:sync`.

End-to-end check on testnet (the CLI buyer and seller need the settlement token):

```bash
BUMP=1 bash scripts/smoke-testnet.sh                                          # mock pool; BUMP raises its rate 1% before each payout
UNIT=4000000 bash scripts/smoke-testnet.sh deployments/testnet-blend-smoke.json # Blend's real pool
```

## Web app

```bash
cd app
cp .env.example .env.local   # in app/; add NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY (pub_testnet_...) to enable login and signing
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit tests
npm run spec:check           # bundled contract interface still matches the deployed contract?
```

Pages:
- `/`: marketplace
- `/campaign/[id]`: details, protections, buy, my vouchers with a QR, confirm, dispute, refund, rate; verifier panel
- `/producer`: create a pre-sale, manage campaigns (bond, close the sale, milestone evidence, settle)
- `/producer/deliver`: opened by scanning the buyer's QR

**Pollar setup** at [dashboard.pollar.xyz](https://dashboard.pollar.xyz). The full checklist and an end-to-end walkthrough are in [docs/MVP-GUIDE.md](docs/MVP-GUIDE.md). In short:
1. Create an app on testnet and copy the publishable key into `app/.env.local`.
2. Under Developers → Websites, add `http://localhost:3000` to both Allowed origins and Allowed redirect URIs.
3. Under Wallets → Tokens, enable testnet USDC (issuer `GBBD47…FLA5`, not the mainnet `GA5Z…`). The current deployment already settles in it.
4. Under Wallets → Sponsored fees → contract rules, add the Ayni contract so users pay zero fees. **After every redeploy, add the new contract ID.** Calls into the yield pool happen inside the Ayni contract, so only the Ayni contract needs the rule.
5. Testnet USDC comes from [faucet.circle.com](https://faucet.circle.com).

## Ecosystem integrations

- **Pollar:** Google login, embedded wallets, fee sponsorship. Next: Bolivian bank QR → USDC on-ramp.
- **Soroban:** the core contract (custom, since it handles pooled multi-buyer escrow with per-unit refunds).
- **Blend:** idle escrow and bonds are supplied to a Blend v2 lending pool; the yield is shared between buyer and producer (DESIGN.md §5.2). On testnet, a mock with the same interface, plus a smoke run on Blend's real pool.
- **Next:** Trustless Work for B2B supply contracts. See the roadmap in DESIGN.md.

## ⚠️ Notes

- Testnet only. The contract is **not audited**: don't use it with real money yet.
- The hackathon build window is 9–22 Nov 2026. Check with the organizers how pre-existing code is treated, and keep the git history to show what was built when.
