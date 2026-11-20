//! Everything that talks to the lending pool lives here. The rest of the contract only sees
//! `YieldSource::{value, deposit, withdraw}`.
//!
//! The pool is a Blend v2 lending pool (or, on testnet, `contracts/mock-yield`, which has the
//! same interface). Checked against the deployed Blend v2 pool on testnet (wasm hash
//! a41fc53d…350e) and `blend-contracts-v2/pool/src`:
//!
//! * `submit(from, spender, to, requests) -> Positions`. The deployed v2 pool still takes
//!   `spender` and `to`. It calls `spender.require_auth()` (and `from`, when different), then
//!   `token.transfer(spender -> pool)` for supplies and `token.transfer(pool -> to)` for
//!   withdrawals. We are `from`, `spender` and `to`, so the first auth is implicit (we are the
//!   direct caller) and the nested token transfer needs `authorize_as_current_contract`.
//! * Request type 0 = supply (no collateral: we never borrow), 1 = withdraw. Asking to withdraw
//!   more than the position withdraws all of it.
//! * Value of the position = b-tokens x `b_rate` / 1e12 (Blend v2 `SCALAR_12`), rounded down.
//!   b-tokens come back in `Positions.supply`, keyed by the reserve index.
//! * The pool panics when it cannot act (frozen for supplies, utilization at 100% for
//!   withdrawals). We call it with `try_submit`, so a failure becomes `Error::YieldUnavailable`.
//!
//! `blend-contract-sdk` needs soroban-sdk 25, so this is a minimal client whose types match the
//! deployed spec field for field.

use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contractclient, contracttype, vec, Address, Env, IntoVal, Map, Symbol, Vec,
};

use crate::types::{DataKey, Error};

pub const SCALAR_12: i128 = 1_000_000_000_000;
const SUPPLY: u32 = 0;
const WITHDRAW: u32 = 1;

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

#[allow(dead_code)]
#[contractclient(name = "PoolClient")]
pub trait Pool {
    fn submit(env: Env, from: Address, spender: Address, to: Address, requests: Vec<Request>)
        -> Positions;
    fn get_reserve(env: Env, asset: Address) -> Reserve;
}

/// Reads the reserve for `token` (also used once by the constructor to check the pool lists it).
pub fn read_reserve(env: &Env, pool: &Address, token: &Address) -> Result<Reserve, Error> {
    match PoolClient::new(env, pool).try_get_reserve(token) {
        Ok(Ok(r)) => Ok(r),
        _ => Err(Error::YieldUnavailable),
    }
}

/// The contract's single supply position in the lending pool.
pub struct YieldSource {
    pool: Option<Address>,
    token: Address,
    index: u32,
    b_tokens: i128,
    b_rate: i128,
}

impl YieldSource {
    /// One cross-contract read (`get_reserve`) when there is a position, none otherwise.
    pub fn load(env: &Env, token: &Address) -> Result<Self, Error> {
        let s = env.storage().instance();
        let pool: Option<Address> = s.get(&DataKey::YieldPool);
        let b_tokens: i128 = s.get(&DataKey::BTokens).unwrap_or(0);
        let mut b_rate = SCALAR_12;
        if let Some(p) = &pool {
            if b_tokens > 0 {
                b_rate = read_reserve(env, p, token)?.data.b_rate;
            }
        }
        Ok(YieldSource {
            pool,
            token: token.clone(),
            index: s.get(&DataKey::ReserveIndex).unwrap_or(0),
            b_tokens,
            b_rate,
        })
    }

    pub fn has_pool(&self) -> bool {
        self.pool.is_some()
    }

    /// What the position is worth now, rounded down.
    pub fn value(&self) -> i128 {
        self.b_tokens * self.b_rate / SCALAR_12
    }

    /// Supplies `amount` of idle tokens to the pool.
    pub fn deposit(&mut self, env: &Env, amount: i128) -> Result<(), Error> {
        let pool = self.pool.clone().ok_or(Error::YieldUnavailable)?;
        let me = env.current_contract_address();
        env.authorize_as_current_contract(vec![
            env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: self.token.clone(),
                    fn_name: Symbol::new(env, "transfer"),
                    args: (me, pool.clone(), amount).into_val(env),
                },
                sub_invocations: vec![env],
            }),
        ]);
        let first = self.b_tokens == 0;
        self.submit(env, &pool, SUPPLY, amount)?;
        if first {
            self.b_rate = read_reserve(env, &pool, &self.token)?.data.b_rate;
        }
        Ok(())
    }

    /// Withdraws `amount` (or everything, if `amount` is at least the position's value) back
    /// into the contract. Returns what arrived.
    pub fn withdraw(&mut self, env: &Env, amount: i128) -> Result<i128, Error> {
        let pool = self.pool.clone().ok_or(Error::YieldUnavailable)?;
        let value = self.value();
        if amount <= 0 || value <= 0 {
            return Ok(0);
        }
        // value + 1 is always worth more than the position: the pool then takes it all.
        let (ask, out) = if amount >= value {
            (value + 1, value)
        } else {
            (amount, amount)
        };
        self.submit(env, &pool, WITHDRAW, ask)?;
        Ok(out)
    }

    fn submit(&mut self, env: &Env, pool: &Address, kind: u32, amount: i128) -> Result<(), Error> {
        let me = env.current_contract_address();
        let requests = vec![
            env,
            Request {
                address: self.token.clone(),
                amount,
                request_type: kind,
            },
        ];
        match PoolClient::new(env, pool).try_submit(&me, &me, &me, &requests) {
            Ok(Ok(pos)) => {
                self.b_tokens = pos.supply.get(self.index).unwrap_or(0);
                Ok(())
            }
            _ => Err(Error::YieldUnavailable),
        }
    }

    pub fn save(&self, env: &Env) {
        env.storage()
            .instance()
            .set(&DataKey::BTokens, &self.b_tokens);
    }
}
