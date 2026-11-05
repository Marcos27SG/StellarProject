#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    vec, Address, Env, String, Vec,
};

const USDC: i128 = 10_000_000; // 1 USDC, 7 decimals
const PRICE: i128 = USDC;
const DAY: u64 = 86_400;
const WINDOW: u64 = 3 * DAY;
const FEE: u32 = 200; // 2% of payouts -> guarantee pool
const START: u64 = 1_000;

struct Setup<'a> {
    env: Env,
    client: DespensaClient<'a>,
    token: TokenClient<'a>,
    sac: StellarAssetClient<'a>,
    admin: Address,
    seller: Address,
    verifier: Address,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(START);

    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let verifier = Address::generate(&env);
    let issuer = Address::generate(&env);

    let sac_contract = env.register_stellar_asset_contract_v2(issuer);
    let token_addr = sac_contract.address();
    let token = TokenClient::new(&env, &token_addr);
    let sac = StellarAssetClient::new(&env, &token_addr);

    let contract_id = env.register(Despensa, (admin.clone(), token_addr, FEE, WINDOW));
    let client = DespensaClient::new(&env, &contract_id);
    client.set_verifier(&verifier, &true);

    Setup {
        env,
        client,
        token,
        sac,
        admin,
        seller,
        verifier,
    }
}

fn milestones(env: &Env, bps: u32) -> Vec<MilestoneInput> {
    vec![
        env,
        MilestoneInput {
            title: String::from_str(env, "Compra de alimento para el ganado"),
            bps,
        },
    ]
}

fn input(env: &Env, min: u32, max: u32, ms: Vec<MilestoneInput>) -> CampaignInput {
    let now = env.ledger().timestamp();
    CampaignInput {
        title: String::from_str(env, "Leche fresca - diciembre (1 L)"),
        metadata_uri: String::from_str(env, "ipfs://despensa-demo"),
        unit_price: PRICE,
        min_units: min,
        max_units: max,
        sale_end: now + 7 * DAY,
        delivery_deadline: now + 37 * DAY,
        milestones: ms,
    }
}

fn funded(s: &Setup, amount: i128) -> Address {
    let who = Address::generate(&s.env);
    s.sac.mint(&who, &amount);
    who
}

fn evidence(env: &Env) -> String {
    String::from_str(env, "ipfs://foto-factura-alimento")
}

#[test]
fn happy_path_advance_then_pay_on_delivery() {
    let s = setup();
    let id = s
        .client
        .create_campaign(&s.seller, &s.verifier, &input(&s.env, 5, 10, milestones(&s.env, 2_000)));

    // New producer (tier 1): advance must be 100% backed by a bond.
    s.sac.mint(&s.seller, &(2 * USDC));
    s.client.add_bond(&id, &s.seller, &(2 * USDC));

    let b1 = funded(&s, 6 * USDC);
    let b2 = funded(&s, 4 * USDC);
    s.client.buy(&id, &b1, &6);
    s.client.buy(&id, &b2, &4);
    assert_eq!(s.client.campaign(&id).status, Status::Active); // sold out

    // Advance: 20% of 10 units, minus 2% fee.
    s.client.submit_milestone(&id, &0, &evidence(&s.env));
    let net = s.client.approve_milestone(&id, &0);
    assert_eq!(net, 2 * USDC - 400_000);

    // Buyer 1 confirms at the pickup point -> remaining 80% of 6 units paid.
    let net = s.client.confirm_delivery(&id, &b1, &6);
    assert_eq!(net, 48_000_000 - 960_000);

    // Seller marks buyer 2 delivered; paid after the dispute window.
    s.client.mark_delivered(&id, &b2, &4);
    assert_eq!(
        s.client.try_finalize_delivery(&id, &b2),
        Err(Ok(Error::TooEarly))
    );
    s.env.ledger().set_timestamp(START + WINDOW + 1);
    let net = s.client.finalize_delivery(&id, &b2);
    assert_eq!(net, 32_000_000 - 640_000);

    let c = s.client.campaign(&id);
    assert_eq!(c.status, Status::Completed);
    assert_eq!(c.escrow, 0);

    // Bond comes back in full.
    assert_eq!(s.client.withdraw_bond(&id, &s.seller), 2 * USDC);
    assert_eq!(s.token.balance(&s.seller), 98_000_000 + 2 * USDC);

    // 2% of everything paid out sits in the guarantee pool.
    assert_eq!(s.client.config().pool, 2_000_000);
    assert_eq!(s.token.balance(&s.client.address), 2_000_000);

    let rep = s.client.reputation(&s.seller);
    assert_eq!(rep.completed, 1);
    assert_eq!(rep.streak, 1);
    assert_eq!(rep.units_delivered, 10);
    assert_eq!(s.client.tier(&s.seller).tier, 2);

    let stats = s.client.buyer_stats(&b1);
    assert_eq!(stats.units_bought, 6);
    assert_eq!(stats.units_received, 6);
    assert_eq!(stats.campaigns_received, 1);
}

#[test]
fn goal_not_reached_everyone_refunded() {
    let s = setup();
    let id = s
        .client
        .create_campaign(&s.seller, &s.verifier, &input(&s.env, 5, 10, Vec::new(&s.env)));
    let b = funded(&s, 3 * USDC);
    s.client.buy(&id, &b, &3);

    // Seller cannot close early below the goal.
    assert_eq!(s.client.try_close_sale(&id), Err(Ok(Error::MinNotReached)));

    s.env.ledger().set_timestamp(START + 7 * DAY);
    assert_eq!(s.client.close_sale(&id), Status::Failed);
    assert_eq!(s.client.claim_refund(&id, &b), 3 * USDC);
    assert_eq!(s.token.balance(&b), 3 * USDC);
    assert_eq!(
        s.client.try_claim_refund(&id, &b),
        Err(Ok(Error::NothingToClaim))
    );
}

#[test]
fn producer_vanishes_buyers_refunded_from_escrow_and_bond() {
    let s = setup();
    let id = s
        .client
        .create_campaign(&s.seller, &s.verifier, &input(&s.env, 5, 10, milestones(&s.env, 2_000)));
    s.sac.mint(&s.seller, &(2 * USDC));
    s.client.add_bond(&id, &s.seller, &(2 * USDC));

    let b1 = funded(&s, 5 * USDC);
    let b2 = funded(&s, 5 * USDC);
    s.client.buy(&id, &b1, &5);
    s.client.buy(&id, &b2, &5);
    s.client.submit_milestone(&id, &0, &evidence(&s.env));
    s.client.approve_milestone(&id, &0); // seller took the 20% advance
    s.client.confirm_delivery(&id, &b1, &5); // b1 got its milk

    // ... then the producer disappears. Nobody can settle before deadline + 2 windows.
    s.env.ledger().set_timestamp(START + 37 * DAY);
    assert_eq!(s.client.try_settle(&id), Err(Ok(Error::TooEarly)));
    s.env.ledger().set_timestamp(START + 37 * DAY + 2 * WINDOW);
    assert_eq!(s.client.settle(&id), Status::Defaulted);

    // b2 is made whole: 80% left in escrow + 20% slashed from the bond.
    let c = s.client.campaign(&id);
    assert_eq!(c.refund_per_unit, PRICE);
    assert_eq!(c.bond_slashed, USDC);
    assert_eq!(s.client.claim_refund(&id, &b2), 5 * USDC);
    assert_eq!(s.token.balance(&b2), 5 * USDC);

    // Seller only gets back the unslashed part of the bond.
    assert_eq!(s.client.withdraw_bond(&id, &s.seller), USDC);

    // Reputation hit: no more advances until trust is rebuilt.
    let rep = s.client.reputation(&s.seller);
    assert_eq!(rep.defaulted, 1);
    assert_eq!(rep.streak, 0);
    assert_eq!(rep.units_refunded, 5);
    assert_eq!(s.client.tier(&s.seller).max_advance_bps, 0);
    assert_eq!(
        s.client
            .try_create_campaign(&s.seller, &s.verifier, &input(&s.env, 1, 5, milestones(&s.env, 1_000))),
        Err(Ok(Error::AdvanceTooHigh))
    );
    // Still allowed to sell with pay-on-delivery only.
    s.client
        .create_campaign(&s.seller, &s.verifier, &input(&s.env, 1, 5, Vec::new(&s.env)));

    // Contract holds exactly the guarantee pool (fees), nothing is lost or stuck.
    assert_eq!(s.token.balance(&s.client.address), s.client.config().pool);
}

#[test]
fn guarantee_pool_tops_up_refunds_for_trusted_producers() {
    let s = setup();
    // A producer with 6 completed campaigns (tier 4): 50% advance, bond covers only 10% of it.
    s.env.as_contract(&s.client.address, || {
        s.env.storage().persistent().set(
            &DataKey::Rep(s.seller.clone()),
            &Reputation {
                completed: 6,
                streak: 6,
                best_streak: 6,
                ..Default::default()
            },
        );
    });
    assert_eq!(s.client.tier(&s.seller).tier, 4);

    // A healthy pool: one default may use up to 20% of it.
    s.sac.mint(&s.admin, &(30 * USDC));
    s.client.fund_pool(&s.admin, &(30 * USDC));

    let id = s
        .client
        .create_campaign(&s.seller, &s.verifier, &input(&s.env, 10, 10, milestones(&s.env, 5_000)));
    s.sac.mint(&s.seller, &(USDC / 2));
    s.client.add_bond(&id, &s.seller, &(USDC / 2));
    let b1 = funded(&s, 5 * USDC);
    let b2 = funded(&s, 5 * USDC);
    s.client.buy(&id, &b1, &5);
    s.client.buy(&id, &b2, &5);
    s.client.submit_milestone(&id, &0, &evidence(&s.env));
    s.client.approve_milestone(&id, &0); // 5 USDC advance, 0.1 fee -> pool

    // Verifier detects fraud and declares default early.
    s.client.declare_default(&id);
    let c = s.client.campaign(&id);
    // 10 USDC owed: escrow 5 + bond 0.5 + 4.5 from the pool (under the 20% cap of 30.1).
    assert_eq!(c.refund_per_unit, PRICE);
    assert_eq!(s.client.config().pool, 301_000_000 - 45_000_000);
    assert_eq!(s.client.claim_refund(&id, &b1), 5 * USDC);
    assert_eq!(s.client.claim_refund(&id, &b2), 5 * USDC);
    assert_eq!(s.client.withdraw_bond(&id, &s.seller), 0);
    assert_eq!(s.token.balance(&s.client.address), s.client.config().pool);
}

#[test]
fn one_default_cannot_empty_the_guarantee_pool() {
    let s = setup();
    s.env.as_contract(&s.client.address, || {
        s.env.storage().persistent().set(
            &DataKey::Rep(s.seller.clone()),
            &Reputation {
                completed: 6,
                ..Default::default()
            },
        );
    });
    // A small pool: 3 USDC. The shortfall below (4.5) is bigger than the whole pool.
    s.sac.mint(&s.admin, &(3 * USDC));
    s.client.fund_pool(&s.admin, &(3 * USDC));

    let id = s
        .client
        .create_campaign(&s.seller, &s.verifier, &input(&s.env, 10, 10, milestones(&s.env, 5_000)));
    s.sac.mint(&s.seller, &(USDC / 2));
    s.client.add_bond(&id, &s.seller, &(USDC / 2));
    let b = funded(&s, 10 * USDC);
    s.client.buy(&id, &b, &10);
    s.client.submit_milestone(&id, &0, &evidence(&s.env));
    s.client.approve_milestone(&id, &0); // pool is now 3.1
    s.client.declare_default(&id);

    // Only 20% of the pool (0.62) is used: escrow 5 + bond 0.5 + 0.62 = 6.12 for 10 units.
    let c = s.client.campaign(&id);
    assert_eq!(c.refund_per_unit, 6_120_000);
    assert_eq!(s.client.config().pool, 31_000_000 - 6_200_000);
    assert_eq!(s.client.claim_refund(&id, &b), 61_200_000);
    assert_eq!(s.token.balance(&s.client.address), s.client.config().pool);

    // The cap is the admin's to tune, within 0..=100%.
    assert_eq!(s.client.try_set_pool_cap(&10_001), Err(Ok(Error::InvalidInput)));
    s.client.set_pool_cap(&5_000);
    assert_eq!(s.client.config().pool_cap_bps, 5_000);
}

/// The attack the allowlist and the pool cap exist for: a producer farms reputation with a
/// second wallet and dust campaigns, then takes a big advance and defaults on purpose, so the
/// "buyer" (the same person) is refunded from the community's pool.
#[test]
fn reputation_farming_ring_is_gated_and_its_take_is_capped() {
    let s = setup();
    let accomplice = funded(&s, 200 * USDC);
    let dust = |env: &Env| CampaignInput {
        unit_price: 1, // one stroop
        ..input(env, 1, 1, Vec::new(env))
    };

    // Gate 1: the ring cannot appoint its own verifier.
    let friend = Address::generate(&s.env);
    assert_eq!(
        s.client.try_create_campaign(&s.seller, &friend, &dust(&s.env)),
        Err(Ok(Error::VerifierNotAllowed))
    );

    // Farming itself still works with an honest allowlisted verifier (it never has to act):
    // six one-stroop campaigns reach the top tier. Reputation alone is not a defense.
    for _ in 0..6 {
        let id = s.client.create_campaign(&s.seller, &s.verifier, &dust(&s.env));
        s.client.buy(&id, &accomplice, &1);
        s.client.confirm_delivery(&id, &accomplice, &1);
    }
    assert_eq!(s.client.tier(&s.seller).tier, 4);

    // Honest users' fees have built a 100 USDC pool.
    s.sac.mint(&s.admin, &(100 * USDC));
    s.client.fund_pool(&s.admin, &(100 * USDC));
    let pool_before = s.client.config().pool;

    // The sting: 100 USDC sale, 50% advance, 10% bond. It only goes through if an allowlisted
    // verifier approves fake evidence (fooled or colluding): that is gate 2, off-chain.
    let id = s
        .client
        .create_campaign(&s.seller, &s.verifier, &input(&s.env, 100, 100, milestones(&s.env, 5_000)));
    s.sac.mint(&s.seller, &(5 * USDC));
    s.client.add_bond(&id, &s.seller, &(5 * USDC));
    s.client.buy(&id, &accomplice, &100);
    s.client.submit_milestone(&id, &0, &evidence(&s.env));
    let advance = s.client.approve_milestone(&id, &0);
    assert_eq!(s.client.cancel(&id), Status::Defaulted);
    let refund = s.client.claim_refund(&id, &accomplice);
    let bond_back = s.client.withdraw_bond(&id, &s.seller);

    // Gate 3: even then, the ring takes at most 20% of the pool, not the 45 USDC it is "owed".
    let pool_after = s.client.config().pool;
    let fee_paid = 50 * USDC - advance; // the ring's own 2% fee went into the pool first
    let taken = pool_before + fee_paid - pool_after;
    assert_eq!(taken, (pool_before + fee_paid) * 2_000 / 10_000);
    let ring_profit = advance + refund + bond_back - 100 * USDC - 5 * USDC;
    assert_eq!(ring_profit, taken - fee_paid);
    assert!(ring_profit < 45 * USDC / 2);

    // The six farmed completions do not soften the default: straight to tier 0, and out of it
    // only after three completed campaigns in a row.
    assert_eq!(s.client.tier(&s.seller).tier, 0);
    for done in 1..=3 {
        let id = s.client.create_campaign(&s.seller, &s.verifier, &dust(&s.env));
        s.client.buy(&id, &accomplice, &1);
        s.client.confirm_delivery(&id, &accomplice, &1);
        assert_eq!(s.client.tier(&s.seller).tier, if done < 3 { 0 } else { 4 });
    }
}

#[test]
fn only_allowlisted_verifiers_can_back_new_campaigns() {
    let s = setup();
    let coop = Address::generate(&s.env);
    assert!(!s.client.is_verifier(&coop));
    assert_eq!(
        s.client
            .try_create_campaign(&s.seller, &coop, &input(&s.env, 1, 5, Vec::new(&s.env))),
        Err(Ok(Error::VerifierNotAllowed))
    );

    s.client.set_verifier(&coop, &true);
    assert!(s.client.is_verifier(&coop));
    let id = s
        .client
        .create_campaign(&s.seller, &coop, &input(&s.env, 1, 5, Vec::new(&s.env)));

    // Removing a verifier blocks new campaigns only. The one it already backs can still be
    // resolved by it, so buyers are never left without a referee.
    s.client.set_verifier(&coop, &false);
    assert_eq!(
        s.client
            .try_create_campaign(&s.seller, &coop, &input(&s.env, 1, 5, Vec::new(&s.env))),
        Err(Ok(Error::VerifierNotAllowed))
    );
    let b = funded(&s, 2 * USDC);
    s.client.buy(&id, &b, &2);
    s.client.close_sale(&id);
    s.client.declare_default(&id);
    assert_eq!(s.client.claim_refund(&id, &b), 2 * USDC);
}

#[test]
fn dispute_window_is_bounded_and_fixed_per_campaign() {
    let s = setup();
    // Zero would let a seller claim delivery and collect in the same minute.
    assert_eq!(s.client.try_set_dispute_window(&0), Err(Ok(Error::WindowOutOfRange)));
    assert_eq!(
        s.client.try_set_dispute_window(&(MIN_DISPUTE_WINDOW - 1)),
        Err(Ok(Error::WindowOutOfRange))
    );
    // A huge value would overflow the settlement date and freeze every campaign.
    assert_eq!(
        s.client.try_set_dispute_window(&u64::MAX),
        Err(Ok(Error::WindowOutOfRange))
    );
    assert_eq!(
        s.client.try_set_dispute_window(&(MAX_DISPUTE_WINDOW + 1)),
        Err(Ok(Error::WindowOutOfRange))
    );

    let id = s
        .client
        .create_campaign(&s.seller, &s.verifier, &input(&s.env, 1, 5, Vec::new(&s.env)));
    let b = funded(&s, 2 * USDC);
    s.client.buy(&id, &b, &2);
    s.client.close_sale(&id);
    s.client.mark_delivered(&id, &b, &2);

    // The admin shortens the window to the minimum: it must not apply to this campaign.
    s.client.set_dispute_window(&MIN_DISPUTE_WINDOW);
    assert_eq!(s.client.config().dispute_window, MIN_DISPUTE_WINDOW);
    assert_eq!(s.client.campaign(&id).dispute_window, WINDOW);
    s.env.ledger().set_timestamp(START + MIN_DISPUTE_WINDOW + 1);
    assert_eq!(
        s.client.try_finalize_delivery(&id, &b),
        Err(Ok(Error::TooEarly))
    );
    s.env.ledger().set_timestamp(START + WINDOW);
    s.client.finalize_delivery(&id, &b);

    // New campaigns get the new window.
    let id2 = s
        .client
        .create_campaign(&s.seller, &s.verifier, &input(&s.env, 1, 5, Vec::new(&s.env)));
    assert_eq!(s.client.campaign(&id2).dispute_window, MIN_DISPUTE_WINDOW);
}

#[test]
fn campaign_inputs_are_bounded() {
    let s = setup();
    let long = |n: usize| String::from_str(&s.env, &"a".repeat(n));

    let mut i = input(&s.env, 1, 5, Vec::new(&s.env));
    i.title = long(MAX_TITLE_LEN as usize + 1);
    assert_eq!(
        s.client.try_create_campaign(&s.seller, &s.verifier, &i),
        Err(Ok(Error::TooLong))
    );

    let mut i = input(&s.env, 1, 5, Vec::new(&s.env));
    i.metadata_uri = long(MAX_URI_LEN as usize + 1);
    assert_eq!(
        s.client.try_create_campaign(&s.seller, &s.verifier, &i),
        Err(Ok(Error::TooLong))
    );

    let ms = vec![
        &s.env,
        MilestoneInput {
            title: long(MAX_TITLE_LEN as usize + 1),
            bps: 1_000,
        },
    ];
    assert_eq!(
        s.client
            .try_create_campaign(&s.seller, &s.verifier, &input(&s.env, 1, 5, ms)),
        Err(Ok(Error::TooLong))
    );

    // A deadline that never comes would keep buyers' money out of reach of `settle`.
    let mut i = input(&s.env, 1, 5, Vec::new(&s.env));
    i.delivery_deadline = u64::MAX;
    assert_eq!(
        s.client.try_create_campaign(&s.seller, &s.verifier, &i),
        Err(Ok(Error::InvalidInput))
    );
    let mut i = input(&s.env, 1, 5, Vec::new(&s.env));
    i.delivery_deadline = START + MAX_HORIZON + 1;
    assert_eq!(
        s.client.try_create_campaign(&s.seller, &s.verifier, &i),
        Err(Ok(Error::InvalidInput))
    );

    // At the limits everything is accepted, and evidence is capped too.
    let mut i = input(&s.env, 1, 5, milestones(&s.env, 1_000));
    i.title = long(MAX_TITLE_LEN as usize);
    i.metadata_uri = long(MAX_URI_LEN as usize);
    i.delivery_deadline = START + MAX_HORIZON;
    let id = s.client.create_campaign(&s.seller, &s.verifier, &i);
    let b = funded(&s, 5 * USDC);
    s.client.buy(&id, &b, &5);
    assert_eq!(
        s.client
            .try_submit_milestone(&id, &0, &long(MAX_EVIDENCE_LEN as usize + 1)),
        Err(Ok(Error::TooLong))
    );
    s.client
        .submit_milestone(&id, &0, &long(MAX_EVIDENCE_LEN as usize));
}

#[test]
fn admin_handover_takes_two_steps() {
    let s = setup();
    assert_eq!(s.client.try_accept_admin(), Err(Ok(Error::NoPendingAdmin)));

    let board = Address::generate(&s.env);
    s.client.propose_admin(&board);
    // Proposing changes nothing yet.
    assert_eq!(s.client.config().admin, s.admin);
    assert_eq!(s.client.pending_admin(), Some(board.clone()));

    s.client.accept_admin();
    // It is the proposed admin, not the old one, who must sign the acceptance.
    assert_eq!(s.env.auths()[0].0, board);
    assert_eq!(s.client.config().admin, board);
    assert_eq!(s.client.pending_admin(), None);
    assert_eq!(s.client.try_accept_admin(), Err(Ok(Error::NoPendingAdmin)));

    // The new admin now signs admin calls.
    s.client.set_fee(&100);
    assert_eq!(s.env.auths()[0].0, board);
}

/// What the contract owes right now: every campaign's escrow, the pool, and the bonds that
/// providers could still withdraw.
fn liabilities(s: &Setup, ids: &[u64], bonds: &[(u64, Address)]) -> i128 {
    let mut total = s.client.config().pool;
    for id in ids {
        total += s.client.campaign(id).escrow;
    }
    for (id, provider) in bonds {
        let c = s.client.campaign(id);
        let bond = s.client.bond_of(id, provider);
        total += match c.status {
            Status::Defaulted => bond * (c.bond_total - c.bond_slashed) / c.bond_total,
            _ => bond,
        };
    }
    total
}

/// Solvency invariant: after every step the contract holds exactly what it owes
/// (plus at most a few stroops of rounding dust, never less).
#[test]
fn contract_always_holds_what_it_owes() {
    let s = setup();
    // Awkward numbers on purpose, so every division rounds.
    let odd = |env: &Env, min: u32, max: u32, ms: Vec<MilestoneInput>| CampaignInput {
        unit_price: 3_333_333,
        ..input(env, min, max, ms)
    };
    let coop = funded(&s, 50 * USDC);
    let b1 = funded(&s, 100 * USDC);
    let b2 = funded(&s, 100 * USDC);
    let seller2 = Address::generate(&s.env);
    let seller3 = Address::generate(&s.env);
    s.sac.mint(&seller3, &(10 * USDC));

    let mut ids: std::vec::Vec<u64> = std::vec::Vec::new();
    let mut bonds: std::vec::Vec<(u64, Address)> = std::vec::Vec::new();
    let check = |ids: &[u64], bonds: &[(u64, Address)]| {
        let dust = s.token.balance(&s.client.address) - liabilities(&s, ids, bonds);
        assert!((0..=3).contains(&dust), "contract is off by {dust} stroops");
    };

    // A: completes, with a 15% advance backed by a co-op bond and partial deliveries.
    let a = s
        .client
        .create_campaign(&s.seller, &s.verifier, &odd(&s.env, 3, 7, milestones(&s.env, 1_500)));
    ids.push(a);
    s.client.add_bond(&a, &coop, &(4 * USDC));
    bonds.push((a, coop.clone()));
    s.client.buy(&a, &b1, &4);
    s.client.buy(&a, &b2, &3);
    check(&ids, &bonds);
    s.client.confirm_delivery(&a, &b1, &1);
    s.client.submit_milestone(&a, &0, &evidence(&s.env));
    s.client.approve_milestone(&a, &0);
    check(&ids, &bonds);

    // B: never reaches its goal.
    let b = s
        .client
        .create_campaign(&seller2, &s.verifier, &odd(&s.env, 5, 9, Vec::new(&s.env)));
    ids.push(b);
    s.client.buy(&b, &b2, &2);

    // C: defaults after an advance; bond and pool cover part of the shortfall.
    let c = s
        .client
        .create_campaign(&seller3, &s.verifier, &odd(&s.env, 2, 9, milestones(&s.env, 2_000)));
    ids.push(c);
    s.client.add_bond(&c, &seller3, &(3 * USDC));
    s.client.add_bond(&c, &coop, &(2 * USDC));
    bonds.push((c, seller3.clone()));
    bonds.push((c, coop.clone()));
    s.client.buy(&c, &b1, &5);
    s.client.buy(&c, &b2, &4);
    s.client.submit_milestone(&c, &0, &evidence(&s.env));
    s.client.approve_milestone(&c, &0);
    s.client.confirm_delivery(&c, &b1, &2);
    s.client.mark_delivered(&c, &b2, &1);
    s.client.dispute(&c, &b2);
    check(&ids, &bonds);
    s.client.declare_default(&c);
    check(&ids, &bonds);
    s.client.claim_refund(&c, &b1);
    check(&ids, &bonds);

    // A finishes: one delivery by claim + window, one after a dispute, the rest confirmed.
    s.client.mark_delivered(&a, &b1, &3);
    s.client.mark_delivered(&a, &b2, &1);
    s.client.dispute(&a, &b2);
    s.client.resolve_dispute(&a, &b2, &true);
    check(&ids, &bonds);
    s.env.ledger().set_timestamp(START + WINDOW);
    s.client.finalize_delivery(&a, &b1);
    s.client.confirm_delivery(&a, &b2, &2);
    assert_eq!(s.client.campaign(&a).status, Status::Completed);
    check(&ids, &bonds);

    // B fails at the end of its sale.
    s.env.ledger().set_timestamp(START + 7 * DAY);
    assert_eq!(s.client.close_sale(&b), Status::Failed);
    s.client.claim_refund(&b, &b2);
    check(&ids, &bonds);

    // Everyone collects what is theirs.
    s.client.claim_refund(&c, &b2);
    s.client.withdraw_bond(&a, &coop);
    s.client.withdraw_bond(&c, &seller3);
    s.client.withdraw_bond(&c, &coop);
    check(&ids, &bonds);

    // Nothing is left but the pool and rounding dust.
    let left = s.token.balance(&s.client.address) - s.client.config().pool;
    assert!((0..=20).contains(&left), "{left} stroops stuck outside the pool");
}

#[test]
fn advances_need_evidence_bond_and_tier() {
    let s = setup();
    // New producer cannot ask for more than 20% in advance.
    assert_eq!(
        s.client
            .try_create_campaign(&s.seller, &s.verifier, &input(&s.env, 1, 10, milestones(&s.env, 3_000))),
        Err(Ok(Error::AdvanceTooHigh))
    );
    let id = s
        .client
        .create_campaign(&s.seller, &s.verifier, &input(&s.env, 1, 10, milestones(&s.env, 2_000)));
    let b = funded(&s, 10 * USDC);
    s.client.buy(&id, &b, &10);

    assert_eq!(
        s.client.try_approve_milestone(&id, &0),
        Err(Ok(Error::MissingEvidence))
    );
    s.client.submit_milestone(&id, &0, &evidence(&s.env));
    assert_eq!(
        s.client.try_approve_milestone(&id, &0),
        Err(Ok(Error::BondTooLow))
    );

    // A guarantor (e.g. the co-op) posts the bond: "aval solidario".
    let coop = funded(&s, 2 * USDC);
    s.client.add_bond(&id, &coop, &(2 * USDC));
    s.client.approve_milestone(&id, &0);
    assert_eq!(
        s.client.try_approve_milestone(&id, &0),
        Err(Ok(Error::AlreadyReleased))
    );
    assert_eq!(s.client.bond_of(&id, &coop), 2 * USDC);
}

#[test]
fn dispute_freezes_payment_until_verifier_decides() {
    let s = setup();
    let id = s
        .client
        .create_campaign(&s.seller, &s.verifier, &input(&s.env, 1, 5, Vec::new(&s.env)));
    let b = funded(&s, 3 * USDC);
    s.client.buy(&id, &b, &3);
    assert_eq!(s.client.close_sale(&id), Status::Active); // seller closes early, goal met

    // Seller falsely claims delivery; buyer disputes.
    s.client.mark_delivered(&id, &b, &2);
    s.client.dispute(&id, &b);
    s.env.ledger().set_timestamp(START + WINDOW + 1);
    assert_eq!(
        s.client.try_finalize_delivery(&id, &b),
        Err(Ok(Error::DisputeOpen))
    );
    assert_eq!(
        s.client.try_mark_delivered(&id, &b, &1),
        Err(Ok(Error::DisputeOpen))
    );

    // Verifier sides with the buyer: vouchers return, seller is not paid.
    s.client.resolve_dispute(&id, &b, &false);
    let h = s.client.holding(&id, &b);
    assert_eq!(h.units, 3);
    assert_eq!(h.pending, 0);
    assert_eq!(s.token.balance(&s.seller), 0);

    // Real delivery later, buyer confirms with the QR.
    assert_eq!(s.client.confirm_delivery(&id, &b, &3), 3 * USDC * 98 / 100);
    assert_eq!(s.client.campaign(&id).status, Status::Completed);
}

#[test]
fn no_self_dealing() {
    let s = setup();
    assert_eq!(
        s.client
            .try_create_campaign(&s.seller, &s.seller, &input(&s.env, 1, 5, Vec::new(&s.env))),
        Err(Ok(Error::SelfDealing))
    );
    let id = s
        .client
        .create_campaign(&s.seller, &s.verifier, &input(&s.env, 1, 5, Vec::new(&s.env)));
    s.sac.mint(&s.seller, &USDC);
    assert_eq!(s.client.try_buy(&id, &s.seller, &1), Err(Ok(Error::SelfDealing)));
    s.sac.mint(&s.verifier, &USDC);
    assert_eq!(s.client.try_buy(&id, &s.verifier, &1), Err(Ok(Error::SelfDealing)));
}

#[test]
fn sale_rules_supply_cap_and_deadline() {
    let s = setup();
    let id = s
        .client
        .create_campaign(&s.seller, &s.verifier, &input(&s.env, 1, 5, Vec::new(&s.env)));
    let b = funded(&s, 10 * USDC);
    assert_eq!(s.client.try_buy(&id, &b, &6), Err(Ok(Error::SoldOut)));
    assert_eq!(s.client.try_buy(&id, &b, &0), Err(Ok(Error::InvalidInput)));
    s.env.ledger().set_timestamp(START + 7 * DAY);
    assert_eq!(s.client.try_buy(&id, &b, &1), Err(Ok(Error::SaleClosed)));
}

#[test]
fn vouchers_can_be_gifted_and_redeemed_by_the_receiver() {
    let s = setup();
    let id = s
        .client
        .create_campaign(&s.seller, &s.verifier, &input(&s.env, 1, 5, Vec::new(&s.env)));
    let migrant = funded(&s, 4 * USDC); // e.g. family member abroad
    let grandma = Address::generate(&s.env);
    s.client.buy(&id, &migrant, &4);
    s.client.transfer_units(&id, &migrant, &grandma, &3);
    assert_eq!(
        s.client.try_transfer_units(&id, &migrant, &s.seller, &1),
        Err(Ok(Error::SelfDealing))
    );
    s.client.close_sale(&id);
    s.client.confirm_delivery(&id, &grandma, &3);
    assert_eq!(s.client.holding(&id, &grandma).delivered, 3);
    assert_eq!(s.client.holding(&id, &migrant).units, 1);
}

#[test]
fn cancel_before_production_is_free_after_is_default() {
    let s = setup();
    let id = s
        .client
        .create_campaign(&s.seller, &s.verifier, &input(&s.env, 1, 5, Vec::new(&s.env)));
    let b = funded(&s, 2 * USDC);
    s.client.buy(&id, &b, &2);
    assert_eq!(s.client.cancel(&id), Status::Failed);
    assert_eq!(s.client.claim_refund(&id, &b), 2 * USDC);
    assert_eq!(s.client.reputation(&s.seller).defaulted, 0);

    let id2 = s
        .client
        .create_campaign(&s.seller, &s.verifier, &input(&s.env, 1, 5, Vec::new(&s.env)));
    s.client.buy(&id2, &b, &2);
    s.client.close_sale(&id2);
    assert_eq!(s.client.cancel(&id2), Status::Defaulted);
    assert_eq!(s.client.claim_refund(&id2, &b), 2 * USDC);
    assert_eq!(s.client.reputation(&s.seller).defaulted, 1);
}

#[test]
fn ratings_only_after_receiving_and_once() {
    let s = setup();
    let id = s
        .client
        .create_campaign(&s.seller, &s.verifier, &input(&s.env, 1, 5, Vec::new(&s.env)));
    let b = funded(&s, 2 * USDC);
    s.client.buy(&id, &b, &2);
    assert_eq!(s.client.try_rate(&id, &b, &5), Err(Ok(Error::NothingToClaim)));
    s.client.close_sale(&id);
    s.client.confirm_delivery(&id, &b, &1);
    assert_eq!(s.client.try_rate(&id, &b, &6), Err(Ok(Error::InvalidInput)));
    s.client.rate(&id, &b, &5);
    assert_eq!(s.client.try_rate(&id, &b, &4), Err(Ok(Error::AlreadyRated)));
    let rep = s.client.reputation(&s.seller);
    assert_eq!(rep.rating_sum, 5);
    assert_eq!(rep.rating_count, 1);
}
