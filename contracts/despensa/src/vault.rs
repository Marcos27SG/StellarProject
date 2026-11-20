//! Share accounting for the money the contract holds (ERC-4626 style).
//!
//! All escrow and bonds sit in one pot: idle tokens in the contract plus one supply position in
//! the lending pool. Every inflow mints shares at the current share price; each campaign escrow
//! and each bond keeps its shares next to its principal. When principal leaves, the matching
//! shares are burned and their current value is paid out; value minus principal is the yield
//! (negative if the pool lost money).
//!
//! Rounding always favours the pot, so the contract can never pay more than it holds:
//! * minting rounds shares down,
//! * paying an exact amount burns shares rounded up,
//! * the value of burned shares rounds down.
//! `VIRTUAL_SHARES` (OpenZeppelin's "decimals offset") makes the first-depositor inflation attack
//! unprofitable: a seller can set a one-stroop price, so share price cannot be left to chance.

use soroban_sdk::{token, Address, Env, Vec};

use crate::types::*;
use crate::yield_source::YieldSource;

pub struct Vault {
    token: Address,
    /// Tokens sitting in the contract.
    pub idle: i128,
    /// Payouts queued in this call and not sent yet (`flush`).
    out: i128,
    payments: Vec<(Address, i128)>,
    /// Shares outstanding (escrow and bonds of every campaign).
    pub shares: i128,
    pub source: YieldSource,
}

fn cfg_u32(env: &Env, key: &DataKey, default: u32) -> u32 {
    env.storage().instance().get(key).unwrap_or(default)
}

pub fn liquid_bps(env: &Env) -> u32 {
    cfg_u32(env, &DataKey::LiquidBps, DEFAULT_LIQUID_BPS)
}

pub fn yield_enabled(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::YieldEnabled)
        .unwrap_or(false)
}

impl Vault {
    pub fn load(env: &Env) -> Result<Vault, Error> {
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let idle = token::TokenClient::new(env, &token).balance(&env.current_contract_address());
        let source = YieldSource::load(env, &token)?;
        Ok(Vault {
            token,
            idle,
            out: 0,
            payments: Vec::new(env),
            shares: env
                .storage()
                .instance()
                .get(&DataKey::TotalShares)
                .unwrap_or(0),
            source,
        })
    }

    /// Everything the shares are worth right now.
    pub fn total(&self) -> i128 {
        self.idle + self.source.value() - self.out
    }

    /// Mints shares for `amount` that has just arrived (and is not yet in `idle`).
    pub fn mint(&mut self, amount: i128) -> i128 {
        let s = amount * (self.shares + VIRTUAL_SHARES) / (self.total() + 1);
        self.shares += s;
        self.idle += amount;
        s
    }

    pub fn value_of(&self, shares: i128) -> i128 {
        if shares <= 0 {
            return 0;
        }
        shares * (self.total() + 1) / (self.shares + VIRTUAL_SHARES)
    }

    /// Shares worth at least `amount` (rounded up).
    pub fn shares_for(&self, amount: i128) -> i128 {
        if amount <= 0 {
            return 0;
        }
        let num = amount * (self.shares + VIRTUAL_SHARES);
        let den = self.total() + 1;
        (num + den - 1) / den
    }

    /// Burns `shares` and returns their value. The caller queues payouts of at most that value
    /// right away; anything it does not pay out stays in the pot for everyone.
    pub fn burn(&mut self, shares: i128) -> i128 {
        let v = self.value_of(shares);
        self.shares -= shares;
        v
    }

    pub fn pay(&mut self, to: &Address, amount: i128) {
        if amount > 0 {
            self.out += amount;
            self.payments.push_back((to.clone(), amount));
        }
    }

    /// Sends the queued payouts. If the contract does not hold enough idle tokens, withdraws the
    /// gap (plus the refill to the liquidity target) from the pool in the same call. If the pool
    /// cannot pay, fails with `YieldUnavailable`, and the whole call is rolled back.
    pub fn flush(&mut self, env: &Env) -> Result<(), Error> {
        if self.out > self.idle {
            let need = self.out - self.idle;
            let invested = self.source.value();
            let after = self.idle + invested - self.out;
            let target = after * liquid_bps(env) as i128 / BPS;
            let want = (need + target).min(invested);
            self.idle += self.source.withdraw(env, want)?;
            if self.idle < self.out {
                return Err(Error::YieldUnavailable);
            }
        }
        let tok = token::TokenClient::new(env, &self.token);
        let me = env.current_contract_address();
        for (to, amount) in self.payments.iter() {
            tok.transfer(&me, &to, &amount);
        }
        self.idle -= self.out;
        self.out = 0;
        self.payments = Vec::new(env);
        Ok(())
    }

    fn target(&self, env: &Env) -> i128 {
        self.total() * liquid_bps(env) as i128 / BPS
    }

    /// After an inflow: supply what is above the liquidity target, if it is worth a call. A pool
    /// that refuses just leaves the money idle; the inflow itself never fails because of it.
    pub fn invest_excess(&mut self, env: &Env) {
        if !yield_enabled(env) || !self.source.has_pool() {
            return;
        }
        let excess = self.idle - self.out - self.target(env);
        if excess >= MIN_DEPOSIT && self.source.deposit(env, excess).is_ok() {
            self.idle -= excess;
        }
    }

    /// Moves money between idle and the pool toward the target. Returns the amount moved
    /// (positive: supplied, negative: withdrawn).
    pub fn rebalance(&mut self, env: &Env) -> Result<i128, Error> {
        if !self.source.has_pool() {
            return Ok(0);
        }
        let target = self.target(env);
        let idle = self.idle - self.out;
        if idle > target {
            let excess = idle - target;
            if yield_enabled(env) && excess >= MIN_DEPOSIT {
                self.source.deposit(env, excess)?;
                self.idle -= excess;
                return Ok(excess);
            }
        } else if idle < target {
            let got = self.source.withdraw(env, target - idle)?;
            self.idle += got;
            return Ok(-got);
        }
        Ok(0)
    }

    /// Pulls the whole position back into the contract.
    pub fn exit(&mut self, env: &Env) -> Result<i128, Error> {
        let value = self.source.value();
        let got = self.source.withdraw(env, value)?;
        self.idle += got;
        Ok(got)
    }

    pub fn save(&self, env: &Env) {
        env.storage()
            .instance()
            .set(&DataKey::TotalShares, &self.shares);
        self.source.save(env);
    }
}
