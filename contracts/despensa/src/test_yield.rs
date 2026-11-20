#![cfg(test)]
//! Yield tests, against `contracts/mock-yield` (same interface as a Blend v2 pool).
extern crate std;

use super::*;
use mock_yield::{MockPool, MockPoolClient};
use soroban_sdk::{
    testutils::{Address as _, Events as _, Ledger, MockAuth, MockAuthInvoke},
    token::{StellarAssetClient, TokenClient},
    vec, Address, Env, Event, IntoVal, String, Vec,
};

const USDC: i128 = 10_000_000;
const PRICE: i128 = USDC;
const DAY: u64 = 86_400;
const YEAR: u64 = 31_536_000;
const WINDOW: u64 = 3 * DAY;
const START: u64 = 1_000;
const SCALAR_12: i128 = 1_000_000_000_000;

struct Y<'a> {
    env: Env,
    client: DespensaClient<'a>,
    pool: MockPoolClient<'a>,
    token: TokenClient<'a>,
    sac: StellarAssetClient<'a>,
    admin: Address,
    treasury: Address,
    seller: Address,
    verifier: Address,
}

fn ysetup<'a>(apr_bps: u32) -> Y<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(START);
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let seller = Address::generate(&env);
    let verifier = Address::generate(&env);
    let issuer = Address::generate(&env);
    let token_addr = env.register_stellar_asset_contract_v2(issuer).address();
    let token = TokenClient::new(&env, &token_addr);
    let sac = StellarAssetClient::new(&env, &token_addr);

    let pool_admin = Address::generate(&env);
    let pool_id = env.register(MockPool, (pool_admin, token_addr.clone(), apr_bps));
    // The mock pays yield out of its own balance: give it a reserve.
    sac.mint(&pool_id, &(10_000 * USDC));

    let contract_id = env.register(
        Despensa,
        (admin.clone(), token_addr, treasury.clone(), WINDOW, Some(pool_id.clone())),
    );
    let client = DespensaClient::new(&env, &contract_id);
    client.set_verifier(&verifier, &true);
    client.set_seller_verified(&verifier, &seller, &true);
    Y {
        pool: MockPoolClient::new(&env, &pool_id),
        env,
        client,
        token,
        sac,
        admin,
        treasury,
        seller,
        verifier,
    }
}

fn input(env: &Env, min: u32, max: u32, price: i128, ms: Vec<MilestoneInput>) -> CampaignInput {
    let now = env.ledger().timestamp();
    CampaignInput {
        title: String::from_str(env, "Leche fresca"),
        metadata_uri: String::from_str(env, "ipfs://demo"),
        unit_price: price,
        min_units: min,
        max_units: max,
        sale_end: now + 7 * DAY,
        delivery_deadline: now + 37 * DAY,
        milestones: ms,
    }
}

fn milestone(env: &Env, bps: u32) -> Vec<MilestoneInput> {
    vec![
        env,
        MilestoneInput {
            title: String::from_str(env, "Alimento"),
            bps,
        },
    ]
}

fn funded(y: &Y, amount: i128) -> Address {
    let who = Address::generate(&y.env);
    y.sac.mint(&who, &amount);
    who
}

fn later(y: &Y, seconds: u64) {
    let now = y.env.ledger().timestamp();
    y.env.ledger().set_timestamp(now + seconds);
}

fn emitted<E: Event>(y: &Y, e: E) -> bool {
    let x = e.to_xdr(&y.env, &y.client.address);
    y.env
        .events()
        .all()
        .filter_by_contract(&y.client.address)
        .events()
        .contains(&x)
}

#[test]
fn idle_money_goes_to_the_pool_above_the_liquidity_buffer() {
    let y = ysetup(1_000);
    let cfg = y.client.yield_config();
    assert_eq!(cfg.pool, Some(y.pool.address.clone()));
    assert!(cfg.enabled);
    assert_eq!(cfg.liquid_bps, 2_000);
    assert_eq!((cfg.buyer_yield_bps, cfg.protocol_yield_bps), (5_000, 0));

    let id = y
        .client
        .create_campaign(&y.seller, &y.verifier, &input(&y.env, 1, 10, PRICE, Vec::new(&y.env)));
    let b = funded(&y, 10 * USDC);
    // Below the 1 USDC minimum, nothing is supplied.
    y.client.buy(&id, &b, &1);
    assert_eq!(y.client.yield_config().invested, 0);
    // Then 80% of everything goes to the pool, 20% stays idle.
    y.client.buy(&id, &b, &9);
    let cfg = y.client.yield_config();
    assert_eq!(cfg.idle, 2 * USDC);
    assert_eq!(cfg.invested, 8 * USDC);
    assert_eq!(y.client.total_value(), 10 * USDC);
    assert_eq!(y.token.balance(&y.client.address), 2 * USDC);
}

#[test]
fn delivered_unit_yield_is_split_between_buyer_and_seller() {
    let y = ysetup(1_000); // 10% a year
    let id = y
        .client
        .create_campaign(&y.seller, &y.verifier, &input(&y.env, 10, 10, PRICE, Vec::new(&y.env)));
    let b = funded(&y, 10 * USDC);
    y.client.buy(&id, &b, &10); // sold out -> Active
    later(&y, YEAR);

    // 8 USDC in the pool for a year at 10%: 0.8 USDC of yield (minus share rounding).
    let cv = y.client.campaign_value(&id);
    assert_eq!(cv.escrow, 10 * USDC);
    let yld = cv.escrow_value - cv.escrow;
    assert!((7_999_990..=8_000_000).contains(&yld), "yield {yld}");
    assert_eq!(y.client.holding_yield(&id, &b), yld / 2);

    let paid = y.client.confirm_delivery(&id, &b, &10);
    assert!(emitted(
        &y,
        YieldPaid {
            id,
            to: b.clone(),
            amount: yld / 2,
            kind: YieldKind::Buyer
        }
    ));
    assert_eq!(paid, 10 * USDC + (yld - yld / 2));
    assert_eq!(y.token.balance(&y.seller), paid);
    assert_eq!(y.token.balance(&b), yld / 2);
    assert_eq!(y.client.holding(&id, &b).yield_paid, yld / 2);
    let c = y.client.campaign(&id);
    assert_eq!(c.status, Status::Completed);
    assert_eq!((c.escrow, c.escrow_shares, c.yield_paid, c.yield_loss), (0, 0, yld, 0));
    // The payout needed the pool: it was withdrawn in the same call. Only dust is left.
    let cfg = y.client.yield_config();
    assert!(cfg.idle + cfg.invested <= 2, "left {}", cfg.idle + cfg.invested);
    assert_eq!(cfg.yield_paid, yld);
}

#[test]
fn split_rounding_with_a_protocol_share_never_pays_more_than_burned() {
    let y = ysetup(777);
    y.client.set_yield_split(&5_000, &2_000);
    let price = 3_333_333;
    let id = y
        .client
        .create_campaign(&y.seller, &y.verifier, &input(&y.env, 7, 7, price, Vec::new(&y.env)));
    // Later changes never apply to a live campaign.
    y.client.set_yield_split(&9_000, &0);
    let c = y.client.campaign(&id);
    assert_eq!((c.buyer_yield_bps, c.protocol_yield_bps), (5_000, 2_000));

    let b1 = funded(&y, 10 * USDC);
    let b2 = funded(&y, 10 * USDC);
    y.client.buy(&id, &b1, &4);
    y.client.buy(&id, &b2, &3);
    for (who, units, wait) in [(&b1, 1u32, 40 * DAY), (&b2, 2, 91 * DAY), (&b1, 3, 13 * DAY), (&b2, 1, DAY)] {
        later(&y, wait);
        let before = y.client.campaign_value(&id);
        let (s0, b0, t0) = (
            y.token.balance(&y.seller),
            y.token.balance(who),
            y.token.balance(&y.treasury),
        );
        y.client.confirm_delivery(&id, who, &units);
        let after = y.client.campaign_value(&id);
        let (ds, db, dt) = (
            y.token.balance(&y.seller) - s0,
            y.token.balance(who) - b0,
            y.token.balance(&y.treasury) - t0,
        );
        let principal = units as i128 * price;
        assert_eq!(before.escrow - after.escrow, principal);
        let burned = before.escrow_value - after.escrow_value;
        let total = ds + db + dt;
        // Paid out what the burned shares were worth, give or take one stroop of rounding.
        assert!((burned - total).abs() <= 1, "burned {burned} paid {total}");
        let yld = total - principal;
        assert!(yld > 0);
        assert_eq!(db, yld * 5_000 / 10_000);
        assert_eq!(dt, yld * 2_000 / 10_000);
        assert_eq!(ds, total - db - dt);
    }
    assert_eq!(y.client.campaign(&id).status, Status::Completed);
    assert!(y.client.total_value() <= 3);
}

#[test]
fn failed_campaign_refunds_principal_plus_all_its_yield() {
    let y = ysetup(10_000); // 100% a year, to make a week visible
    let id = y
        .client
        .create_campaign(&y.seller, &y.verifier, &input(&y.env, 8, 10, PRICE, Vec::new(&y.env)));
    let b1 = funded(&y, 5 * USDC);
    let b2 = funded(&y, 2 * USDC);
    y.client.buy(&id, &b1, &5);
    y.client.buy(&id, &b2, &2);
    later(&y, 7 * DAY);
    assert_eq!(y.client.close_sale(&id), Status::Failed);

    let y1 = y.client.holding_yield(&id, &b1);
    let y2 = y.client.holding_yield(&id, &b2);
    assert!(y1 > 0 && y2 > 0);
    let r1 = y.client.claim_refund(&id, &b1);
    let r2 = y.client.claim_refund(&id, &b2);
    // Every buyer gets 100% of the price and every bit of its yield (per unit of principal).
    assert_eq!(r1, 5 * USDC + y1);
    assert!((r2 - (2 * USDC + y2)).abs() <= 1);
    assert_eq!(y.client.holding(&id, &b1).yield_paid, y1);
    assert_eq!(y.token.balance(&y.seller), 0);
    assert!(y.client.total_value() <= 2);
}

#[test]
fn default_after_advance_refunds_full_price_and_bond_keeps_its_yield() {
    let y = ysetup(1_000);
    let coop = funded(&y, 2 * USDC);
    let id = y
        .client
        .create_campaign(&y.seller, &y.verifier, &input(&y.env, 10, 10, PRICE, milestone(&y.env, 2_000)));
    y.client.add_bond(&id, &coop, &(2 * USDC));
    let b1 = funded(&y, 5 * USDC);
    let b2 = funded(&y, 5 * USDC);
    y.client.buy(&id, &b1, &5);
    y.client.buy(&id, &b2, &5);
    later(&y, 30 * DAY);
    y.client.submit_milestone(&id, &0, &String::from_str(&y.env, "ipfs://factura"));
    // The advance is exactly the principal: its yield stays in escrow for the buyers.
    assert_eq!(y.client.approve_milestone(&id, &0), 2 * USDC);
    assert_eq!(y.token.balance(&y.seller), 2 * USDC);
    later(&y, 60 * DAY);

    let bond_before = y.client.campaign_value(&id);
    y.client.declare_default(&id);
    let c = y.client.campaign(&id);
    assert_eq!(c.bond_slashed, 2 * USDC);
    assert_eq!(c.refund_per_unit, PRICE);

    let r1 = y.client.claim_refund(&id, &b1);
    let r2 = y.client.claim_refund(&id, &b2);
    assert!(r1 > 5 * USDC && r2 > 5 * USDC, "refunds {r1} {r2}");
    // The co-op lost its principal to the buyers but keeps what its bond earned.
    let back = y.client.withdraw_bond(&id, &coop);
    let bond_yield = bond_before.bond_value - bond_before.bond;
    assert!(bond_yield > 0);
    assert!((back - bond_yield).abs() <= 1, "back {back} vs earned {bond_yield}");
    assert!(y.client.total_value() <= 3);
}

#[test]
fn bond_yield_goes_to_whoever_posted_it() {
    let y = ysetup(1_000);
    let coop = funded(&y, 2 * USDC);
    let id = y
        .client
        .create_campaign(&y.seller, &y.verifier, &input(&y.env, 10, 10, PRICE, milestone(&y.env, 2_000)));
    y.sac.mint(&y.seller, &USDC);
    y.client.add_bond(&id, &coop, &(2 * USDC));
    y.client.add_bond(&id, &y.seller, &USDC);
    let b = funded(&y, 10 * USDC);
    y.client.buy(&id, &b, &10);
    later(&y, YEAR);
    y.client.confirm_delivery(&id, &b, &10);
    let back_coop = y.client.withdraw_bond(&id, &coop);
    let back_seller = y.client.withdraw_bond(&id, &y.seller);
    assert!(back_coop > 2 * USDC && back_seller > USDC);
    // Two thirds and one third of the bond yield (same posting time).
    assert!(((back_coop - 2 * USDC) - 2 * (back_seller - USDC)).abs() <= 2);
    assert!(emitted(
        &y,
        YieldPaid {
            id,
            to: y.seller.clone(),
            amount: back_seller - USDC,
            kind: YieldKind::Bond
        }
    ));
    assert_eq!(y.client.try_withdraw_bond(&id, &coop), Err(Ok(Error::NothingToClaim)));
}

#[test]
fn a_pool_loss_shrinks_payouts_pro_rata_and_is_recorded() {
    let y = ysetup(0);
    let id = y
        .client
        .create_campaign(&y.seller, &y.verifier, &input(&y.env, 10, 10, PRICE, Vec::new(&y.env)));
    let b1 = funded(&y, 5 * USDC);
    let b2 = funded(&y, 5 * USDC);
    y.client.buy(&id, &b1, &5);
    y.client.buy(&id, &b2, &5);
    // Bad debt: the pool position (8 USDC) loses half its value. 10 USDC are now worth 6.
    y.pool.set_b_rate(&(SCALAR_12 / 2));
    assert_eq!(y.client.total_value(), 6 * USDC);
    assert_eq!(y.client.holding_yield(&id, &b1), 0); // a delivery loss falls on the seller

    let paid = y.client.confirm_delivery(&id, &b1, &5);
    assert!((paid - 3 * USDC).abs() <= 1, "paid {paid}");
    assert!(emitted(&y, YieldLoss { id, amount: 5 * USDC - paid }));
    assert_eq!(y.token.balance(&b1), 0);
    let paid2 = y.client.confirm_delivery(&id, &b2, &5);
    assert!(paid + paid2 <= 6 * USDC);
    let c = y.client.campaign(&id);
    assert_eq!(c.yield_loss, 10 * USDC - paid - paid2);
    assert_eq!(y.client.yield_config().yield_loss, c.yield_loss);
}

#[test]
fn a_pool_loss_on_a_refund_is_passed_on_not_hidden() {
    let y = ysetup(0);
    let id = y
        .client
        .create_campaign(&y.seller, &y.verifier, &input(&y.env, 8, 10, PRICE, Vec::new(&y.env)));
    let b = funded(&y, 5 * USDC);
    y.client.buy(&id, &b, &5);
    y.pool.set_b_rate(&(SCALAR_12 * 9 / 10));
    later(&y, 7 * DAY);
    y.client.close_sale(&id);
    let shown = y.client.holding_yield(&id, &b);
    assert!(shown < 0);
    let r = y.client.claim_refund(&id, &b);
    assert_eq!(r, 5 * USDC + shown);
    assert!(emitted(&y, YieldLoss { id, amount: -shown }));
}

#[test]
fn rebalance_and_the_buffer_follow_the_admin_settings() {
    let y = ysetup(1_000);
    let id = y
        .client
        .create_campaign(&y.seller, &y.verifier, &input(&y.env, 1, 20, PRICE, Vec::new(&y.env)));
    let b = funded(&y, 20 * USDC);
    y.client.buy(&id, &b, &10);
    assert_eq!(y.client.yield_config().invested, 8 * USDC);

    // A bigger buffer: rebalance pulls money back toward 50% idle.
    y.client.set_yield(&true, &5_000);
    assert_eq!(y.client.rebalance(), -3 * USDC);
    let cfg = y.client.yield_config();
    assert_eq!((cfg.idle, cfg.invested), (5 * USDC, 5 * USDC));
    assert_eq!(y.client.rebalance(), 0);

    // Paused: new money stays idle, and rebalance does not supply.
    y.client.set_yield(&false, &2_000);
    y.client.buy(&id, &b, &5);
    assert_eq!(y.client.yield_config().invested, 5 * USDC);
    assert_eq!(y.client.rebalance(), 0);
    // Resumed: rebalance supplies down to the 20% target.
    y.client.set_yield(&true, &2_000);
    assert_eq!(y.client.rebalance(), 7 * USDC);

    // Bounds.
    assert_eq!(y.client.try_set_yield(&true, &999), Err(Ok(Error::InvalidInput)));
    assert_eq!(y.client.try_set_yield(&true, &10_001), Err(Ok(Error::InvalidInput)));
    assert_eq!(y.client.try_set_yield_split(&5_000, &2_001), Err(Ok(Error::InvalidInput)));
    assert_eq!(y.client.try_set_yield_split(&9_000, &2_000), Err(Ok(Error::InvalidInput)));
}

#[test]
fn a_frozen_pool_fails_with_yield_unavailable_and_changes_nothing() {
    let y = ysetup(1_000);
    let id = y
        .client
        .create_campaign(&y.seller, &y.verifier, &input(&y.env, 10, 10, PRICE, Vec::new(&y.env)));
    let b1 = funded(&y, 1 * USDC);
    let b2 = funded(&y, 9 * USDC);
    y.client.buy(&id, &b1, &1);
    y.client.buy(&id, &b2, &9);
    later(&y, 30 * DAY);
    y.pool.set_frozen(&true);

    // A small payout fits in the idle buffer and still works.
    y.client.confirm_delivery(&id, &b1, &1);
    assert!(y.token.balance(&y.seller) >= USDC);

    // A big one needs the pool: it fails cleanly and nothing moves.
    let c0 = y.client.campaign(&id);
    let h0 = y.client.holding(&id, &b2);
    let (s0, bal0) = (y.token.balance(&y.seller), y.token.balance(&y.client.address));
    assert_eq!(
        y.client.try_confirm_delivery(&id, &b2, &9),
        Err(Ok(Error::YieldUnavailable))
    );
    assert_eq!(y.client.campaign(&id), c0);
    assert_eq!(y.client.holding(&id, &b2), h0);
    assert_eq!(y.token.balance(&y.seller), s0);
    assert_eq!(y.token.balance(&y.client.address), bal0);
    assert_eq!(y.client.try_exit_yield(), Err(Ok(Error::YieldUnavailable)));

    // New money still comes in; it just stays idle.
    let id2 = y
        .client
        .create_campaign(&y.seller, &y.verifier, &input(&y.env, 1, 5, PRICE, Vec::new(&y.env)));
    let b3 = funded(&y, 5 * USDC);
    let invested = y.client.yield_config().invested;
    y.client.buy(&id2, &b3, &5);
    assert_eq!(y.client.yield_config().invested, invested);

    // Once the pool pays again, the same call goes through.
    y.pool.set_frozen(&false);
    y.client.confirm_delivery(&id, &b2, &9);
    assert_eq!(y.client.campaign(&id).status, Status::Completed);
}

#[test]
fn exit_yield_pulls_everything_back_into_the_contract() {
    let y = ysetup(1_000);
    let id = y
        .client
        .create_campaign(&y.seller, &y.verifier, &input(&y.env, 1, 10, PRICE, Vec::new(&y.env)));
    let b = funded(&y, 10 * USDC);
    y.client.buy(&id, &b, &10);
    later(&y, YEAR);
    let total = y.client.total_value();
    let got = y.client.exit_yield();
    assert_eq!(got, total - 2 * USDC);
    let cfg = y.client.yield_config();
    assert_eq!((cfg.invested, cfg.enabled), (0, false));
    assert_eq!(cfg.idle, total);
    assert_eq!(y.token.balance(&y.client.address), total);
    // New buys stay idle until the admin turns deposits back on.
    let b2 = funded(&y, 5 * USDC);
    let id2 = y
        .client
        .create_campaign(&y.seller, &y.verifier, &input(&y.env, 1, 10, PRICE, Vec::new(&y.env)));
    y.client.buy(&id2, &b2, &5);
    assert_eq!(y.client.yield_config().invested, 0);
}

/// No admin function can move money to the admin or anyone else: the only movement they can
/// cause is between the contract and its fixed pool, which leaves `total_value` unchanged (up to
/// one stroop of b-token rounding per supply).
#[test]
fn admin_functions_never_move_user_money() {
    let y = ysetup(1_000);
    let coop = funded(&y, 3 * USDC);
    let b = funded(&y, 10 * USDC);
    let id = y
        .client
        .create_campaign(&y.seller, &y.verifier, &input(&y.env, 1, 10, PRICE, milestone(&y.env, 2_000)));
    y.client.add_bond(&id, &coop, &(3 * USDC));
    y.client.buy(&id, &b, &10);
    later(&y, 90 * DAY);

    let people = [
        y.admin.clone(),
        y.treasury.clone(),
        y.seller.clone(),
        y.verifier.clone(),
        coop.clone(),
        b.clone(),
    ];
    let snapshot = |y: &Y| -> std::vec::Vec<i128> { people.iter().map(|p| y.token.balance(p)).collect() };
    let before = snapshot(&y);
    let total = y.client.total_value();
    let campaign = y.client.campaign(&id);
    let check = |y: &Y, step: &str| {
        assert_eq!(snapshot(y), before, "{step} moved someone's money");
        let t = y.client.total_value();
        assert!(t <= total && total - t <= 2, "{step}: total {total} -> {t}");
        assert_eq!(y.client.campaign(&id), campaign, "{step} changed a live campaign");
    };

    let newcomer = Address::generate(&y.env);
    y.client.set_dispute_window(&MIN_DISPUTE_WINDOW);
    check(&y, "set_dispute_window");
    y.client.set_verifier(&newcomer, &true);
    check(&y, "set_verifier");
    y.client.set_seller_verified(&y.admin, &newcomer, &true);
    check(&y, "set_seller_verified");
    y.client.set_yield_split(&0, &2_000);
    check(&y, "set_yield_split");
    y.client.set_yield(&true, &10_000);
    check(&y, "set_yield");
    y.client.rebalance();
    check(&y, "rebalance (to 100% idle)");
    y.client.set_yield(&true, &1_000);
    y.client.rebalance();
    check(&y, "rebalance (to 10% idle)");
    y.client.exit_yield();
    check(&y, "exit_yield");
    y.client.propose_admin(&newcomer);
    y.client.accept_admin();
    check(&y, "admin handover");
}

/// The contract's own authorization for the nested `token.transfer(contract -> pool)` comes from
/// `authorize_as_current_contract`, not from test auth mocking: only the buyer signs here.
#[test]
fn supply_to_the_pool_needs_only_the_buyers_signature() {
    let y = ysetup(1_000);
    let id = y
        .client
        .create_campaign(&y.seller, &y.verifier, &input(&y.env, 1, 10, PRICE, Vec::new(&y.env)));
    let b = funded(&y, 10 * USDC);
    let amount = 10 * USDC;
    y.env.mock_auths(&[MockAuth {
        address: &b,
        invoke: &MockAuthInvoke {
            contract: &y.client.address,
            fn_name: "buy",
            args: (id, b.clone(), 10u32).into_val(&y.env),
            sub_invokes: &[MockAuthInvoke {
                contract: &y.token.address,
                fn_name: "transfer",
                args: (b.clone(), y.client.address.clone(), amount).into_val(&y.env),
                sub_invokes: &[],
            }],
        },
    }]);
    y.client.buy(&id, &b, &10);
    // The supply would have failed (silently, leaving the money idle) without the contract's
    // own authorization.
    assert_eq!(y.client.yield_config().invested, 8 * USDC);
    assert_eq!(y.pool.get_positions(&y.client.address).supply.get(0), Some(8 * USDC));
}

// ---------------------------------------------------------------------------------- invariant

/// Tiny deterministic PRNG so the scenario is reproducible.
struct Lcg(u64);
impl Lcg {
    fn next(&mut self, n: u64) -> u64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (self.0 >> 33) % n
    }
}

/// Solvency: after every step, everything every party can claim is worth no more than what the
/// contract holds, and the shares of all escrows and bonds add up to the shares outstanding.
fn check_solvency(y: &Y, ids: &[u64], step: usize) {
    let total = y.client.total_value();
    let cfg = y.client.yield_config();
    let mut claims = 0;
    let mut shares = 0;
    for id in ids {
        let c = y.client.campaign(id);
        let v = y.client.campaign_value(id);
        claims += v.escrow_value + v.bond_value;
        shares += c.escrow_shares + c.bond_shares;
        assert!(c.escrow >= 0 && c.escrow_shares >= 0 && c.bond_shares >= 0, "step {step}");
    }
    assert!(claims <= total, "step {step}: claims {claims} > total {total}");
    assert_eq!(shares, cfg.total_shares, "step {step}: orphan shares");
    assert_eq!(total, cfg.idle + cfg.invested);
    assert_eq!(y.token.balance(&y.client.address), cfg.idle);
}

#[test]
fn solvency_holds_after_every_step_of_a_long_random_scenario() {
    let y = ysetup(1_500);
    let mut rng = Lcg(0xA7_11);
    let buyers: std::vec::Vec<Address> = (0..5).map(|_| funded(&y, 1_000 * USDC)).collect();
    let coop = funded(&y, 1_000 * USDC);
    let sellers: std::vec::Vec<Address> = (0..3).map(|_| funded(&y, 1_000 * USDC)).collect();
    for s in &sellers {
        y.client.set_seller_verified(&y.verifier, s, &true);
    }
    let mut ids: std::vec::Vec<u64> = std::vec::Vec::new();
    let evidence = String::from_str(&y.env, "ipfs://x");

    for step in 0..400 {
        let op = rng.next(15);
        match op {
            0 if ids.len() < 6 => {
                let s = &sellers[rng.next(3) as usize];
                let price = 1_000_000 + rng.next(9_000_000) as i128;
                let ms = if rng.next(2) == 0 { milestone(&y.env, 2_000) } else { Vec::new(&y.env) };
                let max = 2 + rng.next(10) as u32;
                let min = 1 + rng.next(max as u64) as u32;
                if let Ok(Ok(id)) = y.client.try_create_campaign(s, &y.verifier, &input(&y.env, min, max, price, ms)) {
                    ids.push(id);
                    let bond = (max as i128) * price;
                    let _ = y.client.try_add_bond(&id, &coop, &bond);
                }
            }
            _ if ids.is_empty() => {}
            1 | 2 | 3 => {
                let id = ids[rng.next(ids.len() as u64) as usize];
                let b = &buyers[rng.next(5) as usize];
                let _ = y.client.try_buy(&id, b, &(1 + rng.next(3) as u32));
            }
            4 => later(&y, rng.next(20 * DAY)),
            5 => {
                let id = ids[rng.next(ids.len() as u64) as usize];
                let c = y.client.campaign(&id);
                if c.status == Status::Funding && c.sold >= c.min_units {
                    let _ = y.client.try_close_sale(&id);
                }
            }
            6 => {
                let id = ids[rng.next(ids.len() as u64) as usize];
                let _ = y.client.try_submit_milestone(&id, &0, &evidence);
                let _ = y.client.try_approve_milestone(&id, &0);
            }
            7 | 8 => {
                let id = ids[rng.next(ids.len() as u64) as usize];
                let b = &buyers[rng.next(5) as usize];
                let _ = y.client.try_confirm_delivery(&id, b, &1);
            }
            9 => {
                let id = ids[rng.next(ids.len() as u64) as usize];
                let b = &buyers[rng.next(5) as usize];
                let _ = y.client.try_mark_delivered(&id, b, &1);
                if rng.next(2) == 0 {
                    let _ = y.client.try_dispute(&id, b);
                    let _ = y.client.try_resolve_dispute(&id, b, &(rng.next(2) == 0));
                } else {
                    later(&y, WINDOW);
                    let _ = y.client.try_finalize_delivery(&id, b);
                }
            }
            10 => {
                let id = ids[rng.next(ids.len() as u64) as usize];
                if rng.next(4) == 0 {
                    let _ = y.client.try_declare_default(&id);
                } else {
                    let _ = y.client.try_settle(&id);
                }
            }
            11 => {
                let id = ids[rng.next(ids.len() as u64) as usize];
                for b in &buyers {
                    let _ = y.client.try_claim_refund(&id, b);
                }
            }
            12 => {
                let id = ids[rng.next(ids.len() as u64) as usize];
                let _ = y.client.try_withdraw_bond(&id, &coop);
            }
            13 => {
                let _ = y.client.try_rebalance();
            }
            _ => {
                // Now and then the pool's rate jumps up, or (rarely) down: losses must hold too.
                let r = y.pool.get_reserve(&y.token.address).data.b_rate;
                let new = if rng.next(5) == 0 { r * 97 / 100 } else { r * 101 / 100 };
                y.pool.set_b_rate(&new);
            }
        }
        check_solvency(&y, &ids, step);
    }

    // Wind everything down: every campaign settles, everyone collects, nothing is stuck.
    later(&y, 400 * DAY);
    for id in &ids {
        let _ = y.client.try_close_sale(id);
        let _ = y.client.try_settle(id);
        for b in &buyers {
            let _ = y.client.try_claim_refund(id, b);
        }
        let _ = y.client.try_withdraw_bond(id, &coop);
        check_solvency(&y, &ids, 9_999);
    }
    let left = y.client.total_value();
    assert!(left <= 3 * ids.len() as i128 + 50, "{left} stroops stuck");
}
