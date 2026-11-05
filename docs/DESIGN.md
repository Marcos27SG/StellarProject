# Pacta: Design of the Anti-Scam Pre-Sale

> **"La leche de mañana, al precio de hoy."** Producers pre-sell future products at a locked price. Buyers' money is protected on Stellar until they receive the product. Producers don't start from zero: good track records unlock advances.

## 1. The problem we are solving

| Pain | Evidence |
|---|---|
| Prices change every day, so nobody can plan | The boliviano went from the Bs 6.96 peg to about Bs 12 per US$ (2026). Food prices rose an average of 87% (Defensoría del Pueblo, Jul–Sep 2026). |
| Producers depend on one buyer and one road | During the May–June 2026 blockades, PIL Andina (the main dairy company) collected only 60% of the milk. Santa Cruz dairy farmers lost more than 900,000 L. Cochabamba lost about Bs 2M a day. |
| **Pre-sales get scammed** | Santa Cruz apartment pre-sales (*preventa*): the Inmoba/Barja case (about 200 victims, US$10–12M), Akros 7 (about 100 victims, up to US$200k each). Kickstarter: about **9%** of funded projects never deliver, and only **13%** of those backers were refunded (Mollick, Wharton 2015). |
| Producers have no capital to start | A pure pay-on-delivery model leaves them financing production alone. |

**Goal:** buyers must never lose their money to a producer who doesn't deliver, *and* producers should still be able to get working capital.

## 2. What we borrowed from systems that work

| Precedent | Mechanism | How Pacta uses it |
|---|---|---|
| **Dubai off-plan escrow (Law 8/2007)** | Buyer payments go into a project escrow account. Funds are released only against construction milestones certified by an independent engineer. Developers must post a guarantee of about 20%. | `approve_milestone` by an independent **verifier**. Advances are backed by a **bond**. |
| **India RERA (2016)** | 70% of collections go into a separate account. Withdrawals must be proportional to certified progress (engineer + architect + accountant). | Advances are capped, and paid as a share of what is still undelivered. |
| **Kickstarter** | All-or-nothing funding. | `min_units`: if the goal isn't reached, buyers get a 100% refund. |
| **Marketplace buyer protection** (e.g. Mercado Pago) | The seller is paid when the buyer confirms receipt, or automatically after a time window. | `confirm_delivery`, or `mark_delivered` + `finalize_delivery` after the dispute window. |
| **Bolivian solidarity-group microcredit** (BancoSol's *grupos solidarios*) | Group members guarantee each other's loans. | **Aval solidario**: anyone (a co-op, family, other producers) can post the bond. |
| **Community Supported Agriculture / Sarafu vouchers** | Consumers prepay a farm's season. Producers issue vouchers redeemable for their goods. | Vouchers are tokenized claims: transferable and giftable. |

## 3. The seven protections (all enforced by the Soroban contract)

1. **Money held in the contract, in USDC.** Buyers' money sits in the contract, not with Pacta or the producer. Nobody can withdraw outside the rules.
2. **All-or-nothing goal.** Below `min_units` by `sale_end`, the campaign `Failed` and `claim_refund` returns 100%.
3. **Supply cap.** A producer can't sell more than `max_units` (what it can actually produce).
4. **Pay on delivery.** Each unit's remaining price is released only when the buyer confirms with the QR, or when the seller's delivery claim survives the **dispute window** (3 days by default).
5. **Milestone advances, backed by a bond.** A producer can receive part of the money up front (feed, seeds, materials) only if:
   - an independent verifier approves the evidence. The verifier must be on the contract's **allowlist** (`set_verifier`), so a producer can't appoint a friend;
   - the total stays within the producer's **tier limit**;
   - a **bond** covers `bond_cover_bps` of everything advanced. Anyone can post it (*aval solidario*).
6. **Default waterfall.** If the producer vanishes, the verifier calls `declare_default`, or `settle` runs after the deadline. Buyers are refunded from **(a)** the remaining escrow, **(b)** the bond, **(c)** the guarantee pool.
7. **Guarantee pool.** A 2% fee on every payout to producers funds a common pool that tops up refunds. Anyone (the platform, NGOs, donors) can add to it with `fund_pool`. One default can use at most **20% of the pool** (`pool_cap_bps`), so no single campaign can empty it.

**What this does and doesn't guarantee.** At tiers 0 and 1 every advance is fully bonded, so buyers always get 100% back. At tiers 2 to 4 the bond covers only part of the advance and the capped pool covers the rest when it can. If the pool is short, buyers of a defaulted campaign lose up to 15% (tier 2), 30% (tier 3) or 45% (tier 4) of what they paid.

## 4. Reputation: producers "work toward something"

The on-chain `Reputation` record holds: completed campaigns, defaults, units delivered and refunded, **streak** (consecutive completed campaigns), best streak, and 1–5★ ratings from buyers who actually received or were refunded.

| Tier | Who | Max advance | Bond required (share of the advance) |
|---|---|---|---|
| 0 Restringido | defaulted, and hasn't yet completed 3 campaigns in a row per default | 0% (pay-on-delivery only) | 100% |
| 1 Nuevo | new producer | 20% | 100% |
| 2 Confiable | 1–2 completed | 30% | 50% |
| 3 Destacado | 3–5 completed | 40% | 25% |
| 4 Ejemplar | 6+ completed | 50% | 10% (the rest is covered by the pool) |

An average below 3★ (with 5+ ratings) caps the producer at tier 1. A default always sends the producer to tier 0: campaigns completed before it don't offset it. **A new producer still gets something real:** guaranteed demand, a locked price, and proof of funds sitting in escrow. With a guarantor, they can also get a 20% advance from day one.

## 5. Money flow: worked example

A new producer pre-sells 10 L at 1 USDC each, with a 20% milestone and a 2% fee:

| Step | Escrow | Producer receives | Pool |
|---|---|---|---|
| 10 units sold | 10.00 | 0 | 0 |
| Co-op posts a 2.00 bond | 10.00 (+2.00 bond) | 0 | 0 |
| Milestone approved: 20% of 10 | 8.00 | 1.96 | 0.04 |
| Buyer A confirms 6 units: 80% × 6 | 3.20 | 4.704 | 0.096 |
| Buyer B's 4 units finalized after the window | 0 | 3.136 | 0.064 |
| Completed: bond returned to the co-op | — | **9.80 in total** | 0.20 |

**If the producer vanishes after the advance and after delivering A's 6 units:** escrow is 3.20 but 4.00 is owed, so 0.80 comes from the bond. Buyer B gets a **100% refund**. The bond returns 1.20 to the co-op. The producer's reputation drops to tier 0.

All of this is covered by unit tests (`contracts/despensa/src/test.rs`, 18 scenarios, including a reputation-farming attack and a check that the contract always holds what it owes). The happy path was run end-to-end on testnet (`scripts/smoke-testnet.sh`).

## 6. Lifecycle

```
create_campaign ──► Funding ──(sold out / close_sale with min reached)──► Active ──(all delivered)──► Completed
                       │                                                    │
                       └─(sale_end, below min / cancel)──► Failed           ├─(deadline + 2 windows, undelivered: settle)──► Defaulted
                                                                            ├─(verifier: declare_default)────────────────► Defaulted
                                                                            └─(seller: cancel)──────────────────────────► Defaulted
```

## 7. Threat model

| Attack | Defense |
|---|---|
| Producer takes the money and disappears | Only verified, bonded advances ever leave escrow. The rest is refunded. Reputation is wiped. |
| Fake milestone evidence (verifier fooled or colluding) | The advance is capped by tier and backed by the bond, with the pool as backstop. Evidence links are public on-chain. |
| Producer falsely claims delivery | The buyer disputes within the window, the verifier decides, and payment is frozen meanwhile. |
| Buyer takes the goods and refuses to confirm | The seller uses `mark_delivered`, which pays automatically after the window unless disputed. |
| Producer buys their own vouchers to fake demand or traction | `SelfDealing`: the seller and verifier can't buy, receive transfers, or be the same address. |
| Overselling | The supply cap is enforced on-chain. |
| Verifier abuse | The verifier can only route money between buyers and the producer, never to itself. Roadmap: multi-signature verifier (association board). |
| Producer appoints a friend as verifier | Only allowlisted verifiers can back a campaign (`VerifierNotAllowed`). Removing a verifier blocks new campaigns only, so live ones can still be resolved. |
| Reputation farming: dust campaigns bought from a second wallet to reach tier 4, then a big advance and a planned default, refunded from the pool | Three gates. The verifier is allowlisted. A default drops the producer to tier 0 whatever came before. One default takes at most 20% of the pool. Farming itself is still possible, so reputation alone is not a defense (see below). |
| Admin key stolen or misused | The admin can't move money or touch a live campaign. The dispute window is bounded (1 to 30 days) and fixed per campaign at creation. The fee is capped at 10%. Handover takes two steps (`propose_admin`, `accept_admin`). |
| Oversized or never-ending campaigns | Titles, links and evidence have length caps. A delivery deadline can be at most 5 years out, so `settle` always becomes possible. |

**Trust that remains off-chain:** the verifier's honesty about physical evidence and disputes, the admin's choice of verifiers, and buyers checking their notifications within the dispute window. All three are explicit, limited and public.

**Known gaps:**

- A producer can mark a delivery that never happened and is paid if the buyer doesn't dispute within the window. There are no notifications yet.
- Reputation can be farmed with cheap campaigns, because a completed campaign counts the same whatever its size.
- Tiers 2 to 4 are under-bonded by design (see section 3).
- One buyer's unresolved dispute makes `settle` default the whole campaign, so an inactive verifier hurts an honest producer.
- The contract can't be upgraded: a fix means a new deployment, and reputation doesn't carry over.

## 8. On-chain vs off-chain

- **On-chain (Soroban):** all money, every rule, vouchers, reputation, ratings, milestone evidence links.
- **Off-chain:** product photos and descriptions (`metadata_uri`), WhatsApp notifications, streak and badge visuals, Bs ↔ USDC conversion (Pollar ramps).

## 9. Roadmap

1. **Pollar ramps:** pay with a Bolivian bank QR in Bs, which settles in USDC. Producers cash out.
2. **Yield on escrow (Blend / Vaquita / Pollar Earn):** money waiting for delivery earns interest, which can fund discounts or the pool.
3. **Trustless Work:** B2B supply contracts (restaurants, school breakfasts) as milestone escrows.
4. **Streaks and badges for buyers** ("supports 5 local producers"), plus WhatsApp alerts for dispute windows.
5. **Real-estate pre-sales (apartments):** the same contract with construction milestones, an engineer as verifier, and a developer bond like Dubai's 20%. Longer windows and larger units.
6. **Mainnet:** a security audit (SCF Audit Bank) before handling real money, plus a multi-signature verifier.
