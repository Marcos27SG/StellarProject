# Ayni: Design of the Anti-Scam Pre-Sale

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

| Precedent | Mechanism | How Ayni uses it |
|---|---|---|
| **Dubai off-plan escrow (Law 8/2007)** | Buyer payments go into a project escrow account. Funds are released only against construction milestones certified by an independent engineer. Developers must post a guarantee of about 20%. | `approve_milestone` by an independent **verifier**. Advances only for identity-verified sellers, backed 100% by a **bond**. |
| **India RERA (2016)** | 70% of collections go into a separate account. Withdrawals must be proportional to certified progress (engineer + architect + accountant). | Advances are capped, and paid as a share of what is still undelivered. |
| **Kickstarter** | All-or-nothing funding. | `min_units`: if the goal isn't reached, buyers get a 100% refund. |
| **Marketplace buyer protection** (e.g. Mercado Pago) | The seller is paid when the buyer confirms receipt, or automatically after a time window. | `confirm_delivery`, or `mark_delivered` + `finalize_delivery` after the dispute window. |
| **Bolivian solidarity-group microcredit** (BancoSol's *grupos solidarios*) | Group members guarantee each other's loans. | **Aval solidario**: anyone (a co-op, family, other producers) can post the bond. |
| **Community Supported Agriculture / Sarafu vouchers** | Consumers prepay a farm's season. Producers issue vouchers redeemable for their goods. | Vouchers are tokenized claims: transferable and giftable. |
| **ERC-4626 vaults** | Depositors hold shares of a pot; yield raises the share price. | Escrow and bonds hold internal shares of one lending-pool position, so yield is attributed fairly and rounding never pays out more than the contract holds. |

## 3. The protections (all enforced by the Soroban contract)

1. **Money held in the contract, in USDC.** Buyers' money sits in the contract, not with Ayni or the producer. Nobody can withdraw outside the rules.
2. **All-or-nothing goal.** Below `min_units` by `sale_end`, the campaign `Failed` and `claim_refund` returns 100% (plus the yield it earned).
3. **Supply cap.** A producer can't sell more than `max_units` (what it can actually produce).
4. **Pay on delivery.** Each unit's remaining price is released only when the buyer confirms with the QR, or when the seller's delivery claim survives the **dispute window** (3 days by default).
5. **Advances only for verified sellers, always fully bonded.** A producer can receive part of the money up front (feed, seeds, materials) only if:
   - its identity was checked off-chain (CI, NIT or co-op membership) and an allowlisted verifier or the admin set the on-chain flag (`set_seller_verified`). Only the flag is stored: no documents, names or ID numbers go into the contract, its events or metadata. Unverified sellers sell pay-on-delivery only (`NotVerified`). A revoked seller gets no new advances; advances already paid stay paid;
   - an independent verifier approves the evidence. The verifier must be on the contract's **allowlist** (`set_verifier`), so a producer can't appoint a friend;
   - the total stays within the producer's **tier limit**;
   - a **bond** covers **100%** of everything advanced, at every tier. Anyone can post it (*aval solidario*).
6. **Default waterfall.** If the producer vanishes, the verifier calls `declare_default`, or `settle` runs after the deadline. Buyers are refunded from **(a)** the remaining escrow, then **(b)** the bond. There is no common fund: one campaign's default never touches anyone else's money.
7. **The money earns while it waits.** Idle escrow and bonds are supplied to a lending pool (Blend). Who gets the yield is fixed per campaign at creation (section 5).

**What this does and doesn't guarantee.** Below the minimum, buyers get 100% back. If the seller doesn't deliver, escrow plus a bond that covers every advance returns 100% of the price, at every tier. The one exception is the lending pool itself losing money (bad debt): then payouts shrink pro rata, the loss is recorded on-chain (`YieldLoss`) and shown in the app. Nothing is "guaranteed" or "risk-free", and the app never says so.

## 4. Reputation: producers "work toward something"

The on-chain `Reputation` record holds: completed campaigns, defaults, units delivered and refunded, **streak** (consecutive completed campaigns), best streak, and 1–5★ ratings from buyers who actually received or were refunded.

Reputation only raises the **ceiling** for advances. It never lowers the bond:

| Tier | Who | Max advance | Bond required (share of the advance) |
|---|---|---|---|
| 0 Restringido | defaulted, and hasn't yet completed 3 campaigns in a row per default | 0% (pay-on-delivery only) | 100% |
| 1 Nuevo | new producer | 20% | 100% |
| 2 Confiable | 1–2 completed | 30% | 100% |
| 3 Destacado | 3–5 completed | 40% | 100% |
| 4 Ejemplar | 6+ completed | 50% | 100% |

An average below 3★ (with 5+ ratings) caps the producer at tier 1. A default always sends the producer to tier 0: campaigns completed before it don't offset it. **A new producer still gets something real:** guaranteed demand, a locked price, proof of funds sitting in escrow, and a share of the yield on delivery. Once verified and with a guarantor, they can also get a 20% advance from day one.

## 5. Money flow

### 5.1 Principal: worked example

A new, verified producer pre-sells 10 L at 1 USDC each, with a 20% milestone. There is no fee.

| Step | Escrow | Producer receives |
|---|---|---|
| 10 units sold | 10.00 | 0 |
| Co-op posts a 2.00 bond | 10.00 (+2.00 bond) | 0 |
| Milestone approved: 20% of 10 | 8.00 | 2.00 |
| Buyer A confirms 6 units: 80% × 6 | 3.20 | 4.80 |
| Buyer B's 4 units finalized after the window | 0 | 3.20 |
| Completed: bond returned to the co-op | — | **10.00 in total** (plus its yield share) |

**If the producer vanishes after the advance and after delivering A's 6 units:** escrow is 3.20 but 4.00 is owed, so 0.80 comes from the bond. Buyer B gets a **100% refund**. The bond returns 1.20 to the co-op. The producer's reputation drops to tier 0.

### 5.2 Yield

**Where the money sits.** The contract holds one supply position in the lending pool for everything. `total_value` = idle USDC in the contract + the position's value. `liquid_bps` of it (20% by default, admin-settable between 10% and 100%) stays idle so most payouts don't touch the pool. Inflows above the target (and at least 1 USDC) are supplied in the same call; if the pool refuses, the money just stays idle and the buy still succeeds. A payout that needs more than the idle balance withdraws the gap plus the refill to the target in the same call. If the pool can't pay (frozen, or fully lent out), the call fails with `YieldUnavailable` and nothing changes. Anyone can call `rebalance()`.

**Shares.** Every inflow (`buy`, `add_bond`) mints internal shares at the current share price. Each campaign keeps `escrow_shares` next to its principal `escrow`; each bond provider keeps its own shares next to its principal. When principal `g` leaves an escrow holding `escrow` principal, `escrow_shares × g / escrow` shares are burned (all of them on the last outflow). Their value minus `g` is the yield. Rounding always favours the pot: minting rounds down, an exact-amount payout burns shares rounded up, and a value rounds down, so the contract can never pay more than it holds. 10⁶ virtual shares (ERC-4626 "decimals offset") stop share-price manipulation by a first depositor with a one-stroop campaign.

**Who gets it.**

| Outflow | Yield goes to |
|---|---|
| Delivered unit (`confirm_delivery`, `finalize_delivery`, dispute resolved as delivered) | `buyer_yield_bps` (50% by default) to the buyer, in the same call; `protocol_yield_bps` (0 by default, at most 20%) to Ayni's treasury; the rest, and the rounding, to the seller |
| Refunded unit (failed or defaulted campaign) | 100% to the buyer |
| Bond withdrawal | 100% to whoever posted the bond (the seller, a co-op, family) |
| Advance | Paid at exactly its principal; the yield it earned stays in escrow and is shared out with later deliveries and refunds |
| Default | Bond shares worth exactly the slashed principal move into escrow; the bond provider keeps the yield on the rest |
| Rounding dust at completion | the seller |

The split is a snapshot taken when the campaign is created, like the dispute window: an admin change only applies to new campaigns.

**Simplification.** Yield is attributed per unit of principal, not per buyer's holding time. Every voucher of a campaign earns the same yield per dollar, whether it was bought on the first day of the sale or the last.

**Losses are never hidden.** If the pool position is worth less than its principal (bad debt), every payout shrinks pro rata, the contract never pays more than it holds, and each short payout emits `YieldLoss { id, amount }`. On a delivered unit the loss falls on the seller; on a refund, on the buyer; on a bond, on its provider. Totals are in `campaign(id).yield_loss` and `yield_config().yield_loss`.

**The pool is fixed at deploy.** An admin who could change the pool address could point it at a contract of their own and the next deposit would leave with the escrow. So the pool is a constructor argument; the admin can only pause new deposits, set `liquid_bps`, set the split for new campaigns, and `exit_yield()` (pull everything back into the contract). Changing pools means deploying a new contract.

**Testnet.** Blend's testnet pools hold Blend's own test USDC, not the Circle testnet USDC that Pollar wallets use. The testnet deployment therefore supplies to `contracts/mock-yield`, which implements the subset of Blend v2's pool interface we call at a fixed rate, and the app labels it "rendimiento de prueba".

All of this is covered by unit tests: `contracts/despensa/src/test.rs` (rules, including a reputation-farming attack and a check that the contract always holds what it owes) and `test_yield.rs` (yield split and rounding, refunds, bonds, pool losses, the liquidity buffer, a frozen pool, `exit_yield`, admin limits, the nested authorization for supplies, and a solvency invariant checked after every step of a 400-step random scenario).

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
| Producer takes the money and disappears | Only advances to identity-verified sellers, approved by a verifier and 100% bonded, ever leave escrow. The rest is refunded. Reputation is wiped. |
| Fake milestone evidence (verifier fooled or colluding) | The advance is capped by tier and fully backed by the bond, so buyers still get the full price back. Evidence links are public on-chain. |
| Producer falsely claims delivery | The buyer disputes within the window, the verifier decides, and payment is frozen meanwhile. |
| Buyer takes the goods and refuses to confirm | The seller uses `mark_delivered`, which pays automatically after the window unless disputed. |
| Producer buys their own vouchers to fake demand or traction | `SelfDealing`: the seller and verifier can't buy, receive transfers, or be the same address. |
| Overselling | The supply cap is enforced on-chain. |
| Verifier abuse | The verifier can only route money between buyers and the producer, never to itself. Roadmap: multi-signature verifier (association board). |
| Producer appoints a friend as verifier | Only allowlisted verifiers can back a campaign (`VerifierNotAllowed`). Removing a verifier blocks new campaigns only, so live ones can still be resolved. |
| Reputation farming: dust campaigns bought from a second wallet to reach tier 4, then a big advance and a planned default | There is no common fund to take from: the ring only gets its own money back, because every advance is fully bonded. The verifier is allowlisted, the seller must be identity-verified, and a default drops the producer to tier 0 whatever came before. |
| Admin key stolen or misused | The admin can't move money or touch a live campaign. Its yield powers only move money between the contract and the pool fixed at deploy (tested: `admin_functions_never_move_user_money`). The dispute window is bounded (1 to 30 days) and fixed per campaign, as is the yield split; Ayni's share is capped at 20%. Handover takes two steps (`propose_admin`, `accept_admin`). |
| Lending pool fails (bad debt, frozen, fully lent out) | Losses are passed on pro rata and recorded (`YieldLoss`), never hidden. A pool that can't pay makes the payout fail cleanly with `YieldUnavailable`; it can be retried later, and the 20% idle buffer covers most payouts. `exit_yield()` pulls everything back. |
| Share-price manipulation (one-stroop campaign, then a donation) | Virtual shares make it unprofitable; all rounding favours the pot. |
| Oversized or never-ending campaigns | Titles, links and evidence have length caps. A delivery deadline can be at most 5 years out, so `settle` always becomes possible. |

**Trust that remains off-chain:** the verifier's honesty about physical evidence and disputes, the admin's choice of verifiers, and buyers checking their notifications within the dispute window. All three are explicit, limited and public.

**Known gaps:**

- A producer can mark a delivery that never happened and is paid if the buyer doesn't dispute within the window. There are no notifications yet.
- Reputation can be farmed with cheap campaigns, because a completed campaign counts the same whatever its size.
- Yield depends on the lending pool's own risk (Blend's oracle, its backstop, its admin). It is disclosed behind "Más detalles", never promised.
- A bond's coverage is checked against its principal, not its current value: after a pool loss, a "100%" bond can be worth less.
- One buyer's unresolved dispute makes `settle` default the whole campaign, so an inactive verifier hurts an honest producer.
- The contract can't be upgraded: a fix means a new deployment, and reputation doesn't carry over.

## 8. On-chain vs off-chain

- **On-chain (Soroban):** all money, every rule, vouchers, reputation, ratings, milestone evidence links, the "verified seller" flag, the yield position and its accounting.
- **Off-chain:** product photos and descriptions (`metadata_uri`), the identity check itself (documents stay with the verifier), WhatsApp notifications, streak and badge visuals, Bs ↔ USDC conversion (Pollar ramps).

## 9. Roadmap

1. **Pollar ramps:** pay with a Bolivian bank QR in Bs, which settles in USDC. Producers cash out.
2. **Yield on mainnet:** point a new deployment at a real Blend pool that holds Circle USDC, after checking its backstop and oracle. Early warning when a seller runs late, with the buyer choosing to wait or take a refund.
3. **Trustless Work:** B2B supply contracts (restaurants, school breakfasts) as milestone escrows.
4. **Streaks and badges for buyers** ("supports 5 local producers"), plus WhatsApp alerts for dispute windows.
5. **Real-estate pre-sales (apartments):** the same contract with construction milestones, an engineer as verifier, and a developer bond like Dubai's 20%. Longer windows and larger units.
6. **Mainnet:** a security audit (SCF Audit Bank) before handling real money, plus a multi-signature verifier.
