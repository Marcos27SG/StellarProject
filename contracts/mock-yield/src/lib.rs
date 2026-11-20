#![no_std]
//! # Mock yield pool (testnet and tests only)
//!
//! Blend's testnet pools hold Blend's own test USDC, not the Circle testnet USDC that Pollar
//! wallets use, so the Ayni demo on testnet supplies to this mock instead. It implements only
//! what Ayni calls on a Blend v2 pool, with the same function names, argument order and types:
//!
//! * `submit(from, spender, to, requests)` with request type 0 (supply) and 1 (withdraw),
//! * `get_positions(address)` and `get_reserve(asset)`.
//!
//! b-tokens are valued with a `b_rate` in 12-decimal fixed point, like Blend v2. The rate grows
//! at a fixed simple APR set by the admin. The admin can also set the rate directly (to simulate
//! a loss) or freeze the pool (to simulate a pool that cannot pay out), but has no function that
//! moves anyone's tokens: only `submit` moves funds, and only for the position's owner.
//!
//! Yield is paid out of whatever USDC the mock holds. Whoever runs the demo tops it up with a
//! plain token transfer. In the app this is labelled "rendimiento de prueba".

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env, Map,
    Vec,
};

pub const SCALAR_12: i128 = 1_000_000_000_000;
const BPS: i128 = 10_000;
const YEAR: i128 = 31_536_000;
const DAY_LEDGERS: u32 = 17_280;

// Field names and types match Blend v2's pool spec exactly (alphabetical, as in the spec).

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Request {
    pub address: Address,
    pub amount: i128,
    pub request_type: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Positions {
    pub collateral: Map<u32, i128>,
    pub liabilities: Map<u32, i128>,
    pub supply: Map<u32, i128>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReserveConfig {
    pub c_factor: u32,
    pub decimals: u32,
    pub enabled: bool,
    pub index: u32,
    pub l_factor: u32,
    pub max_util: u32,
    pub r_base: u32,
    pub r_one: u32,
    pub r_three: u32,
    pub r_two: u32,
    pub reactivity: u32,
    pub supply_cap: i128,
    pub util: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReserveData {
    pub b_rate: i128,
    pub b_supply: i128,
    pub backstop_credit: i128,
    pub d_rate: i128,
    pub d_supply: i128,
    pub ir_mod: i128,
    pub last_time: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Reserve {
    pub asset: Address,
    pub config: ReserveConfig,
    pub data: ReserveData,
    pub scalar: i128,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum MockError {
    BadRequest = 1,
    Frozen = 2,
    NoLiquidity = 3,
    InvalidAmount = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
enum Key {
    Admin,
    Asset,
    BRate,
    LastTime,
    AprBps,
    Frozen,
    BSupply,
    Supply(Address),
}

#[contract]
pub struct MockPool;

fn get<V: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(env: &Env, k: &Key) -> Option<V> {
    env.storage().instance().get(k)
}

fn current_rate(env: &Env) -> i128 {
    let rate: i128 = get(env, &Key::BRate).unwrap();
    let last: u64 = get(env, &Key::LastTime).unwrap();
    let apr: u32 = get(env, &Key::AprBps).unwrap();
    let dt = env.ledger().timestamp().saturating_sub(last) as i128;
    rate + rate * apr as i128 * dt / (BPS * YEAR)
}

fn accrue(env: &Env) -> i128 {
    let rate = current_rate(env);
    let s = env.storage().instance();
    s.set(&Key::BRate, &rate);
    s.set(&Key::LastTime, &env.ledger().timestamp());
    rate
}

fn supply_of(env: &Env, who: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&Key::Supply(who.clone()))
        .unwrap_or(0)
}

fn positions(env: &Env, who: &Address) -> Positions {
    let mut supply = Map::new(env);
    let b = supply_of(env, who);
    if b > 0 {
        supply.set(0u32, b);
    }
    Positions {
        collateral: Map::new(env),
        liabilities: Map::new(env),
        supply,
    }
}

fn bump(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(30 * DAY_LEDGERS, 120 * DAY_LEDGERS);
}

#[contractimpl]
impl MockPool {
    pub fn __constructor(env: Env, admin: Address, asset: Address, apr_bps: u32) {
        let s = env.storage().instance();
        s.set(&Key::Admin, &admin);
        s.set(&Key::Asset, &asset);
        s.set(&Key::BRate, &SCALAR_12);
        s.set(&Key::LastTime, &env.ledger().timestamp());
        s.set(&Key::AprBps, &apr_bps);
        s.set(&Key::Frozen, &false);
        s.set(&Key::BSupply, &0i128);
        bump(&env);
    }

    /// Same contract as Blend v2: `spender` (and `from`, when different) must authorize; supply
    /// pulls tokens from `spender`, withdraw sends them to `to`.
    pub fn submit(
        env: Env,
        from: Address,
        spender: Address,
        to: Address,
        requests: Vec<Request>,
    ) -> Positions {
        spender.require_auth();
        if from != spender {
            from.require_auth();
        }
        if get::<bool>(&env, &Key::Frozen).unwrap_or(false) {
            panic_with_error!(&env, MockError::Frozen);
        }
        let asset: Address = get(&env, &Key::Asset).unwrap();
        let tok = token::TokenClient::new(&env, &asset);
        let me = env.current_contract_address();
        let rate = accrue(&env);
        let mut b_supply: i128 = get(&env, &Key::BSupply).unwrap_or(0);
        let mut mine = supply_of(&env, &from);
        for r in requests.iter() {
            if r.address != asset || r.amount <= 0 {
                panic_with_error!(&env, MockError::BadRequest);
            }
            match r.request_type {
                0 => {
                    // b-tokens minted round down, like Blend's to_b_token_down.
                    let b = r.amount * SCALAR_12 / rate;
                    if b <= 0 {
                        panic_with_error!(&env, MockError::InvalidAmount);
                    }
                    tok.transfer(&spender, &me, &r.amount);
                    mine += b;
                    b_supply += b;
                }
                1 => {
                    // b-tokens burned round up; asking for more than the position takes it all.
                    let mut burn = (r.amount * SCALAR_12 + rate - 1) / rate;
                    let mut out = r.amount;
                    if burn > mine {
                        burn = mine;
                        out = mine * rate / SCALAR_12;
                    }
                    if tok.balance(&me) < out {
                        panic_with_error!(&env, MockError::NoLiquidity);
                    }
                    mine -= burn;
                    b_supply -= burn;
                    if out > 0 {
                        tok.transfer(&me, &to, &out);
                    }
                }
                _ => panic_with_error!(&env, MockError::BadRequest),
            }
        }
        let key = Key::Supply(from.clone());
        env.storage().persistent().set(&key, &mine);
        env.storage()
            .persistent()
            .extend_ttl(&key, 30 * DAY_LEDGERS, 120 * DAY_LEDGERS);
        env.storage().instance().set(&Key::BSupply, &b_supply);
        bump(&env);
        positions(&env, &from)
    }

    pub fn get_positions(env: Env, address: Address) -> Positions {
        positions(&env, &address)
    }

    pub fn get_reserve(env: Env, asset: Address) -> Reserve {
        let mine: Address = get(&env, &Key::Asset).unwrap();
        if asset != mine {
            panic_with_error!(&env, MockError::BadRequest);
        }
        Reserve {
            asset,
            config: ReserveConfig {
                c_factor: 0,
                decimals: 7,
                enabled: true,
                index: 0,
                l_factor: 0,
                max_util: 0,
                r_base: 0,
                r_one: 0,
                r_three: 0,
                r_two: 0,
                reactivity: 0,
                supply_cap: i128::MAX,
                util: 0,
            },
            data: ReserveData {
                b_rate: current_rate(&env),
                b_supply: get(&env, &Key::BSupply).unwrap_or(0),
                backstop_credit: 0,
                d_rate: SCALAR_12,
                d_supply: 0,
                ir_mod: 0,
                last_time: env.ledger().timestamp(),
            },
            scalar: 10_000_000,
        }
    }

    // ------------------------------------------------------------------ admin (simulation only)

    /// Simple APR in basis points from now on.
    pub fn set_apr(env: Env, apr_bps: u32) {
        get::<Address>(&env, &Key::Admin).unwrap().require_auth();
        accrue(&env);
        env.storage().instance().set(&Key::AprBps, &apr_bps);
    }

    /// Sets the b-token rate directly. Lowering it simulates bad debt in a real pool.
    pub fn set_b_rate(env: Env, b_rate: i128) {
        get::<Address>(&env, &Key::Admin).unwrap().require_auth();
        if b_rate <= 0 {
            panic_with_error!(&env, MockError::InvalidAmount);
        }
        let s = env.storage().instance();
        s.set(&Key::BRate, &b_rate);
        s.set(&Key::LastTime, &env.ledger().timestamp());
    }

    /// A frozen pool rejects every request, like a pool that cannot pay out.
    pub fn set_frozen(env: Env, frozen: bool) {
        get::<Address>(&env, &Key::Admin).unwrap().require_auth();
        env.storage().instance().set(&Key::Frozen, &frozen);
    }

    pub fn apr_bps(env: Env) -> u32 {
        get(&env, &Key::AprBps).unwrap()
    }
}
