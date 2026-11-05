# Pacta: pre-sales that can't run away with your money

> **"No es una promesa. Es un pacto."** *(It's not a promise. It's a pact.)*

**Pacta lets producers pre-sell at a locked price. Buyers' money waits in a Stellar smart contract, in dollars, until the product arrives. If it never arrives, buyers get their money back automatically.**

## The problem: in Bolivia, nobody can plan, and nobody can trust a pre-sale

- **Prices move every day.** The boliviano went from the Bs 6.96 peg to about Bs 12 per dollar, and food prices rose about 87% (Defensoría del Pueblo, Jul–Sep 2026). Buyers want to lock a price. Producers want guaranteed demand.
- **Pre-selling should fix that, but it's where people get burned.** In the Santa Cruz apartment pre-sale scams, Inmoba/Barja alone left about 200 victims and US$10–12M lost. Worldwide, about 9% of funded Kickstarter projects never deliver, and only 13% of those backers get refunded.
- **Producers have no working capital and no safety net.** During the 2026 blockades, PIL collected only 60% of the milk, and Santa Cruz dairy farmers lost more than 900,000 L.

**The root cause:** paying in advance means trusting the seller with your money. Pacta removes that trust.

## How it works

1. **List.** A producer creates a pre-sale: product, price in USDC, minimum and maximum units, delivery date.
2. **Pay into the contract.** The money goes to a Soroban contract, not to Pacta and not to the producer. If the minimum isn't reached, buyers get a 100% refund.
3. **Deliver.** The buyer scans a QR code to confirm, and the producer is paid. Disputes freeze the payment until a verifier decides.
4. **Default.** If the producer disappears, buyers are refunded from the remaining escrow, then from the producer's bond, then from a community guarantee pool funded by 2% of every payout.
5. **Grow.** Every delivery builds an on-chain reputation that unlocks bigger advances (up to 50%) with smaller bonds.

## Why this is a good idea

- **The blockchain is essential.** The product is a neutral holder of money with rules nobody can bend. Any bank or app in that role asks you to trust it instead.
- **Stellar fits the job.** It has USDC, fees of a fraction of a cent (sponsored, so free for users) and Soroban to enforce the rules. Pollar gives users a Google login wallet, so they never touch crypto.
- **Both sides win.** Buyers get a dollar price lock and protection. Producers get demand before they produce, then working capital as they earn trust.
- **It copies systems that already work:** Dubai's off-plan escrow, India's RERA, Kickstarter's all-or-nothing goal and BancoSol's solidarity groups (anyone can post a producer's bond).
- **One engine, many markets.** It starts with milk and eggs, then moves to B2B supply (restaurants, school breakfasts) and finally to apartment pre-sales, where the scams are biggest.
- **It already runs.** The contract is live on Stellar testnet (35 functions, 18 tests), passes an end-to-end on-chain test, and the web app reads live data.

## Pros and cons

| ✅ Pros | ⚠️ Cons and how we handle them |
|---|---|
| Buyers can't lose money to a producer who never delivers | **A human verifier checks real-world evidence.** Advances are capped and bonded, evidence is public, and a multi-signature board is on the roadmap. |
| A price in dollars protects both sides from boliviano swings | **Converting bolivianos to USDC adds friction.** A bank-QR on-ramp through Pollar is on the roadmap. |
| Producers get pre-sold demand, plus advances once they have a track record | **New producers start with small advances.** A co-op or family member can post their bond from day one. |
| Reputation is public and portable, so trust compounds | **A two-sided marketplace has a cold start.** We start with co-ops (one co-op brings many producers) and B2B buyers. |
| Almost no fees, and users never see crypto | **Bolivia's stablecoin rules are still young, and the contract isn't audited.** We stay on testnet until an audit. |

**Business model (to validate):** a platform fee on successful payouts (today's 2% goes to the guarantee pool), yield on money waiting in escrow (Blend or Vaquita), and verification fees for large pre-sales such as real estate.

## Name options

"Despensa" means pantry, so the name boxes us into food just as the roadmap reaches real estate. **Recommendation: rename the company Pacta and keep "Despensa" as the name of the food line** (Pacta Despensa, and later Pacta Hogar for homes).

| Name | Why it works | Watch out |
|---|---|---|
| **Pacta** ⭐ | A smart contract is a pact the code enforces. It works in Spanish and English, for milk or apartments. | It's a common word, so check the domain and trademark. An unrelated climate tool is called PACTA. |
| **Prevé** | Blends *preventa* (pre-sale) with *prevé* (plan ahead), which is the whole point when prices change daily. | The accent disappears in URLs and handles. |
| **Firme** | From *precio firme* (firm price), and slang for "legit, for real". | Hard to own in search results. |
| **Ayni** | The Andean principle of reciprocity: you help me today, I return it tomorrow. A strong story for Bolivian judges. | It doesn't explain itself abroad, and many brands use it. |
| **Avala** | From *aval* (guarantee) and the solidarity bond: "vouch for it". | It highlights the bond more than the pre-sale. |
| **Cumple** | "You only pay if they deliver" (*si cumple*). | It's also everyday Spanish for "birthday". |
