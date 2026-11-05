# Pacta

**Pre-sales of local products at a locked price, protected on Stellar.**
Producers pre-sell (milk, eggs, quesillo, vegetable baskets…). Buyers' money is held in a Soroban contract, in dollars (USDC), and reaches the producer only when it is delivered. If the producer fails, buyers are refunded from what's left in escrow, the producer's bond and a community guarantee pool. Producers build on-chain reputation (streaks, ratings, tiers) that unlocks advances.

Built for the **Stellar Bolivia 2026 National Startups Hackathon**. *No es una promesa. Es un pacto.*

> **Naming.** The product was called *Despensa* until Nov 2026 and is now **Pacta**. Internal identifiers keep the old name so nothing deployed breaks: the `despensa/` folder, the `despensa` crate and wasm, `app/src/lib/despensa.ts`, `NEXT_PUBLIC_DESPENSA_CONTRACT_ID`, the metadata schema id `despensa.campaign/v1`, and the Stellar CLI identities `despensa-*`. Read [docs/DESIGN.md](docs/DESIGN.md) for the full mechanism and research.

## Status

| Piece | State |
|---|---|
| Soroban contract (`contracts/despensa`) | ✅ 35 functions, 18 unit tests passing |
| Testnet deployment | ✅ `CCGR4QPJLH565PVUQMB3HO3O2AKBBVDFITDRWMURPXECFIL22FRV32OJ` ([explorer](https://stellar.expert/explorer/testnet/contract/CCGR4QPJLH565PVUQMB3HO3O2AKBBVDFITDRWMURPXECFIL22FRV32OJ)), settled in Circle testnet USDC (the earlier DUSD demo deployment is recorded in `deployments/testnet-dusd.json`) |
| On-chain smoke test | ✅ create → buy → close → confirm delivery → producer paid, reputation updated |
| Web app (`app/`, Next.js + Pollar) | ✅ Google login, sponsored fees and the full pay-on-delivery flow run end to end on testnet with Pollar wallets (2026-11-13; see [docs/MVP-GUIDE.md](docs/MVP-GUIDE.md)). Refunds, disputes and milestones not yet run through the UI |

## Repository layout

```
contracts/despensa/   Soroban smart contract (Rust)
  src/lib.rs          contract logic: escrow, milestones, bonds, pool, disputes, reputation
  src/types.rs        data types and errors
  src/test.rs         18 scenario tests (happy path, default, pool cap, disputes, allowlist, farming attack, solvency…)
app/                  Next.js 15 web app (Spanish UI), Pollar wallets, Stellar JS SDK
scripts/              deploy-testnet.ps1 (Windows), smoke-testnet.sh (bash)
deployments/          testnet.json: contract and account IDs (public data)
docs/DESIGN.md        mechanism, research, threat model, roadmap
```

## Prerequisites

- Rust (stable) + target: `rustup target add wasm32v1-none`
- Stellar CLI 30+ (`winget install Stellar.StellarCLI` on Windows, or `brew install stellar-cli` on Mac)
- Node.js **20.19+** recommended (20.16 works with the pinned Tailwind 4.2.4)

## Contract

```bash
cargo test                 # 18 tests
stellar contract build     # -> target/wasm32v1-none/release/despensa.wasm
```

Deploy to testnet. This creates or funds the identities `despensa-admin/seller/verifier/buyer`, a demo DUSD token and the contract, and allowlists `despensa-verifier` as a verifier:

```powershell
./scripts/deploy-testnet.ps1             # demo token (mintable, for demos)
./scripts/deploy-testnet.ps1 -Token usdc # Circle testnet USDC (what Pollar wallets hold)
```

Admin controls (the admin can't move money or change a live campaign):

```bash
# Allow or remove a verifier. Producers can only appoint allowlisted verifiers.
stellar contract invoke --id <contract> --source-account despensa-admin --network testnet -- set_verifier --verifier G... --allowed true
# Dispute window for new campaigns, 1 to 30 days in seconds. Live campaigns keep theirs.
stellar contract invoke --id <contract> --source-account despensa-admin --network testnet -- set_dispute_window --seconds 259200
# Share of the guarantee pool one default may use, in basis points (default 2000 = 20%).
stellar contract invoke --id <contract> --source-account despensa-admin --network testnet -- set_pool_cap --bps 2000
# Hand the admin role over in two steps: propose, then the new admin accepts.
stellar contract invoke --id <contract> --source-account despensa-admin --network testnet -- propose_admin --new_admin G...
stellar contract invoke --id <contract> --source-account <new-admin> --network testnet -- accept_admin
```

After a redeploy, point the app at the new contract (`NEXT_PUBLIC_DESPENSA_CONTRACT_ID`) and refresh its bundled copy of the contract interface: `cd app && npm run spec:sync`.

End-to-end check on testnet:

```bash
bash scripts/smoke-testnet.sh
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
4. Under Wallets → Sponsored fees → contract rules, add the Pacta contract so users pay zero fees.
5. Testnet USDC comes from [faucet.circle.com](https://faucet.circle.com).

## Ecosystem integrations

- **Pollar:** Google login, embedded wallets, fee sponsorship. Next: Bolivian bank QR → USDC on-ramp.
- **Soroban:** the core contract (custom, since it handles pooled multi-buyer escrow with per-unit refunds).
- **Next:** Blend/Vaquita yield on escrow, and Trustless Work for B2B supply contracts. See the roadmap in DESIGN.md.

## ⚠️ Notes

- Testnet only. The contract is **not audited**: don't use it with real money yet.
- The hackathon build window is 9–22 Nov 2026. Check with the organizers how pre-existing code is treated, and keep the git history to show what was built when.
