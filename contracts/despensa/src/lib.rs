#![no_std]
//! # Despensa: pre-sale escrow for local products on Stellar
//!
//! Producers pre-sell vouchers for future products ("1 L of milk in December") at a locked price.
//! Buyers' money is held in this contract, in a stable token (USDC), and only reaches the producer
//! when it is earned:
//!
//! * **All-or-nothing goal**: if not enough units are sold, everyone gets 100% back.
//! * **Milestone advances**: only identity-verified producers can receive part of the money up
//!   front (to buy feed, seeds, materials), only when an independent verifier approves evidence of
//!   progress, and only up to a limit set by the producer's on-chain reputation tier.
//! * **Bond / "aval solidario"**: every advance is 100% backed by a bond posted by the producer or
//!   by guarantors (co-op, family, other producers). The bond is slashed to refund buyers on
//!   default, so a default after advances still returns the full price.
//! * **Pay on delivery**: the rest of each unit's price is released only when the buyer confirms
//!   reception (or the seller's delivery claim survives a dispute window).
//! * **Reputation**: completed campaigns, streaks, defaults and ratings live on-chain and unlock
//!   bigger advances over time.
//!
//! The same mechanism scales to off-plan real estate ("pre-venta" of apartments): milestones become
//! construction stages certified by an engineer, like Dubai's and India's escrow regulations.

mod events;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, panic_with_error, token, Address, Env, String, Vec};

use events::*;
pub use types::*;

#[contract]
pub struct Despensa;

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
}

fn token_client(env: &Env) -> token::TokenClient<'_> {
    let addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
    token::TokenClient::new(env, &addr)
}

fn admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

fn dispute_window(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&DataKey::DisputeWindow)
        .unwrap_or(0)
}

fn check_window(seconds: u64) -> Result<(), Error> {
    if !(MIN_DISPUTE_WINDOW..=MAX_DISPUTE_WINDOW).contains(&seconds) {
        return Err(Error::WindowOutOfRange);
    }
    Ok(())
}

fn is_allowed_verifier(env: &Env, who: &Address) -> bool {
    let key = DataKey::Verifier(who.clone());
    let allowed: bool = env.storage().persistent().get(&key).unwrap_or(false);
    if allowed {
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
    }
    allowed
}

fn is_seller_verified(env: &Env, seller: &Address) -> bool {
    let key = DataKey::SellerVerified(seller.clone());
    let verified: bool = env.storage().persistent().get(&key).unwrap_or(false);
    if verified {
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
    }
    verified
}

fn get_campaign(env: &Env, id: u64) -> Result<Campaign, Error> {
    let key = DataKey::Campaign(id);
    let c: Campaign = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::NotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
    Ok(c)
}

fn save_campaign(env: &Env, c: &Campaign) {
    let key = DataKey::Campaign(c.id);
    env.storage().persistent().set(&key, c);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

fn get_holding(env: &Env, id: u64, buyer: &Address) -> Holding {
    env.storage()
        .persistent()
        .get(&DataKey::Holding(id, buyer.clone()))
        .unwrap_or_default()
}

fn save_holding(env: &Env, id: u64, buyer: &Address, h: &Holding) {
    let key = DataKey::Holding(id, buyer.clone());
    env.storage().persistent().set(&key, h);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

fn get_rep(env: &Env, who: &Address) -> Reputation {
    env.storage()
        .persistent()
        .get(&DataKey::Rep(who.clone()))
        .unwrap_or_default()
}

fn save_rep(env: &Env, who: &Address, r: &Reputation) {
    let key = DataKey::Rep(who.clone());
    env.storage().persistent().set(&key, r);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

fn get_buyer(env: &Env, who: &Address) -> BuyerStats {
    env.storage()
        .persistent()
        .get(&DataKey::Buyer(who.clone()))
        .unwrap_or_default()
}

fn save_buyer(env: &Env, who: &Address, s: &BuyerStats) {
    let key = DataKey::Buyer(who.clone());
    env.storage().persistent().set(&key, s);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

fn get_bond(env: &Env, id: u64, who: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Bond(id, who.clone()))
        .unwrap_or(0)
}

fn save_bond(env: &Env, id: u64, who: &Address, amount: i128) {
    let key = DataKey::Bond(id, who.clone());
    env.storage().persistent().set(&key, &amount);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

// ---------------------------------------------------------------------------
// Business rules
// ---------------------------------------------------------------------------

/// Reputation -> how much a verified producer may receive in advance. Every advance is backed
/// 100% by the bond at every tier: reputation raises the ceiling, never lowers the bond.
///
/// | Tier | Who                           | Max advance | Bond required (of advance) |
/// |------|-------------------------------|-------------|----------------------------|
/// | 0    | Defaulted, streak not rebuilt | 0%          | 100%                       |
/// | 1    | New producer                  | 20%         | 100%                       |
/// | 2    | 1-2 completed campaigns       | 30%         | 100%                       |
/// | 3    | 3-5 completed campaigns       | 40%         | 100%                       |
/// | 4    | 6+ completed campaigns        | 50%         | 100%                       |
///
/// An average rating below 3 stars (with 5+ ratings) caps the producer at tier 1.
///
/// A default always sends the producer to tier 0. It gets out by completing 3 campaigns in a
/// row for every default on record. Only the streak since the last default counts: campaigns
/// completed before it cannot offset it.
fn tier_for(rep: &Reputation) -> TierInfo {
    if rep.defaulted > 0 && rep.streak < rep.defaulted.saturating_mul(3) {
        return TierInfo {
            tier: 0,
            max_advance_bps: 0,
            bond_cover_bps: 10_000,
        };
    }
    let mut tier = match rep.completed {
        0 => 1,
        1..=2 => 2,
        3..=5 => 3,
        _ => 4,
    };
    if rep.rating_count >= 5 && rep.rating_sum < rep.rating_count * 3 && tier > 1 {
        tier = 1;
    }
    let max_advance_bps = match tier {
        1 => 2_000,
        2 => 3_000,
        3 => 4_000,
        _ => 5_000,
    };
    TierInfo {
        tier,
        max_advance_bps,
        bond_cover_bps: 10_000,
    }
}

/// Pays `gross` out of the campaign escrow to the seller, in full (there is no payout fee).
/// Returns the amount the seller received.
fn pay_seller(env: &Env, c: &mut Campaign, gross: i128) -> i128 {
    if gross <= 0 {
        return 0;
    }
    c.escrow -= gross;
    token_client(env).transfer(&env.current_contract_address(), &c.seller, &gross);
    gross
}

/// Releases the remaining price of `units` delivered to `buyer`.
fn deliver(env: &Env, c: &mut Campaign, buyer: &Address, h: &mut Holding, units: u32) -> i128 {
    let gross = (units as i128) * c.unit_price * (BPS - c.released_bps as i128) / BPS;
    let first_time = h.delivered == 0;
    c.delivered += units;
    h.delivered += units;
    let net = pay_seller(env, c, gross);

    let mut stats = get_buyer(env, buyer);
    stats.units_received += units;
    if first_time {
        stats.campaigns_received += 1;
    }
    save_buyer(env, buyer, &stats);

    let mut rep = get_rep(env, &c.seller);
    rep.units_delivered += units;
    save_rep(env, &c.seller, &rep);

    Delivered {
        id: c.id,
        buyer: buyer.clone(),
        units,
        paid_to_seller: net,
    }
    .publish(env);
    net
}

fn set_status(env: &Env, c: &mut Campaign, status: Status) {
    c.status = status;
    StatusChanged { id: c.id, status }.publish(env);
}

fn complete_if_done(env: &Env, c: &mut Campaign) {
    if c.status == Status::Active && c.delivered == c.sold {
        complete(env, c);
    }
}

fn complete(env: &Env, c: &mut Campaign) {
    // Rounding dust left in escrow belongs to the seller: every unit was delivered.
    if c.escrow > 0 {
        let dust = c.escrow;
        pay_seller(env, c, dust);
    }
    let mut rep = get_rep(env, &c.seller);
    rep.completed += 1;
    rep.streak += 1;
    if rep.streak > rep.best_streak {
        rep.best_streak = rep.streak;
    }
    save_rep(env, &c.seller, &rep);
    set_status(env, c, Status::Completed);
}

fn fail(env: &Env, c: &mut Campaign) {
    // No advances are possible before the sale closes, so the escrow covers 100%.
    c.refund_per_unit = c.unit_price;
    set_status(env, c, Status::Failed);
}

/// Producer did not deliver: refund buyers from (1) what is left in escrow, then (2) the bond.
/// There is no common fund: one campaign's default never touches anyone else's money.
fn default_campaign(env: &Env, c: &mut Campaign) {
    let undelivered = c.sold - c.delivered;
    let owed = (undelivered as i128) * c.unit_price;
    let mut shortfall = owed - c.escrow;
    if shortfall < 0 {
        shortfall = 0;
    }
    let from_bond = if c.bond_total < shortfall {
        c.bond_total
    } else {
        shortfall
    };

    c.bond_slashed = from_bond;
    c.escrow += from_bond;
    c.refund_per_unit = if undelivered > 0 {
        let per_unit = c.escrow / undelivered as i128;
        if per_unit > c.unit_price {
            c.unit_price
        } else {
            per_unit
        }
    } else {
        0
    };

    let mut rep = get_rep(env, &c.seller);
    rep.defaulted += 1;
    rep.streak = 0;
    rep.units_refunded += undelivered;
    save_rep(env, &c.seller, &rep);
    set_status(env, c, Status::Defaulted);
}

fn require_status(c: &Campaign, status: Status) -> Result<(), Error> {
    if c.status != status {
        return Err(Error::WrongStatus);
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contractimpl]
impl Despensa {
    /// `token`: settlement asset (USDC Stellar Asset Contract).
    /// `treasury`: receives Ayni's share of the yield, if the admin ever sets one. Fixed for good.
    /// `dispute_window`: seconds a buyer has to dispute a seller's delivery claim
    /// (between `MIN_DISPUTE_WINDOW` and `MAX_DISPUTE_WINDOW`).
    pub fn __constructor(
        env: Env,
        admin: Address,
        token: Address,
        treasury: Address,
        dispute_window: u64,
    ) {
        if check_window(dispute_window).is_err() {
            panic_with_error!(&env, Error::WindowOutOfRange);
        }
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Token, &token);
        s.set(&DataKey::Treasury, &treasury);
        s.set(&DataKey::DisputeWindow, &dispute_window);
        s.set(&DataKey::NextId, &0u64);
        bump_instance(&env);
    }

    // ----------------------------------------------------------------- admin
    //
    // What the admin can do is deliberately narrow: the dispute window for *new* campaigns
    // (bounded) and the verifier allowlist. It can never move money, change a live campaign, or
    // replace a campaign's verifier.

    /// Dispute window for campaigns created from now on. Existing campaigns keep theirs.
    pub fn set_dispute_window(env: Env, seconds: u64) -> Result<(), Error> {
        admin(&env).require_auth();
        check_window(seconds)?;
        env.storage()
            .instance()
            .set(&DataKey::DisputeWindow, &seconds);
        bump_instance(&env);
        Ok(())
    }

    /// Adds or removes a verifier (association, co-op, certified engineer) from the allowlist.
    /// Removing one only blocks *new* campaigns: campaigns it already backs keep it, so they
    /// can still be resolved.
    pub fn set_verifier(env: Env, verifier: Address, allowed: bool) -> Result<(), Error> {
        admin(&env).require_auth();
        let key = DataKey::Verifier(verifier.clone());
        if allowed {
            env.storage().persistent().set(&key, &true);
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        } else {
            env.storage().persistent().remove(&key);
        }
        bump_instance(&env);
        VerifierSet { verifier, allowed }.publish(&env);
        Ok(())
    }

    /// Marks a seller as identity-verified (or revokes it). The check itself (CI, NIT or co-op
    /// membership) happens off-chain; only the flag is stored. Callable by the admin or an
    /// allowlisted verifier. Revoking blocks new advances; advances already paid are unaffected.
    pub fn set_seller_verified(
        env: Env,
        caller: Address,
        seller: Address,
        verified: bool,
    ) -> Result<(), Error> {
        caller.require_auth();
        if caller != admin(&env) && !is_allowed_verifier(&env, &caller) {
            return Err(Error::VerifierNotAllowed);
        }
        if caller == seller {
            return Err(Error::SelfDealing);
        }
        let key = DataKey::SellerVerified(seller.clone());
        if verified {
            env.storage().persistent().set(&key, &true);
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        } else {
            env.storage().persistent().remove(&key);
        }
        bump_instance(&env);
        SellerVerified {
            seller,
            verified,
            by: caller,
        }
        .publish(&env);
        Ok(())
    }

    /// Step 1 of an admin handover. Nothing changes until `new_admin` calls `accept_admin`,
    /// so a typo in the address cannot lock the contract.
    pub fn propose_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        admin(&env).require_auth();
        env.storage()
            .instance()
            .set(&DataKey::PendingAdmin, &new_admin);
        bump_instance(&env);
        Ok(())
    }

    /// Step 2: the proposed admin takes over.
    pub fn accept_admin(env: Env) -> Result<(), Error> {
        let s = env.storage().instance();
        let new_admin: Address = s.get(&DataKey::PendingAdmin).ok_or(Error::NoPendingAdmin)?;
        new_admin.require_auth();
        s.set(&DataKey::Admin, &new_admin);
        s.remove(&DataKey::PendingAdmin);
        bump_instance(&env);
        AdminChanged { admin: new_admin }.publish(&env);
        Ok(())
    }

    // -------------------------------------------------------------- producer

    /// Creates a pre-sale. Advances (milestones) need an identity-verified seller and are capped
    /// by the seller's tier. Anyone can sell pay-on-delivery only, without milestones.
    /// The verifier must be on the admin's allowlist: a seller cannot appoint a friend.
    pub fn create_campaign(
        env: Env,
        seller: Address,
        verifier: Address,
        input: CampaignInput,
    ) -> Result<u64, Error> {
        seller.require_auth();
        if seller == verifier {
            return Err(Error::SelfDealing);
        }
        if !is_allowed_verifier(&env, &verifier) {
            return Err(Error::VerifierNotAllowed);
        }
        let now = env.ledger().timestamp();
        if input.title.len() == 0
            || input.unit_price <= 0
            || input.min_units == 0
            || input.min_units > input.max_units
            || input.sale_end <= now
            || input.delivery_deadline <= input.sale_end
            || input.delivery_deadline > now + MAX_HORIZON
            || input.milestones.len() > MAX_MILESTONES
        {
            return Err(Error::InvalidInput);
        }
        if input.title.len() > MAX_TITLE_LEN || input.metadata_uri.len() > MAX_URI_LEN {
            return Err(Error::TooLong);
        }
        if !input.milestones.is_empty() && !is_seller_verified(&env, &seller) {
            return Err(Error::NotVerified);
        }

        let tier = tier_for(&get_rep(&env, &seller));
        let mut total_bps: u32 = 0;
        let mut milestones: Vec<Milestone> = Vec::new(&env);
        for m in input.milestones.iter() {
            if m.bps == 0 || m.bps as i128 > BPS || m.title.len() == 0 {
                return Err(Error::InvalidInput);
            }
            if m.title.len() > MAX_TITLE_LEN {
                return Err(Error::TooLong);
            }
            total_bps += m.bps;
            milestones.push_back(Milestone {
                title: m.title,
                bps: m.bps,
                evidence: String::from_str(&env, ""),
                released: false,
            });
        }
        if total_bps > tier.max_advance_bps {
            return Err(Error::AdvanceTooHigh);
        }

        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(0);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));
        bump_instance(&env);

        let c = Campaign {
            id,
            seller: seller.clone(),
            verifier,
            title: input.title,
            metadata_uri: input.metadata_uri,
            unit_price: input.unit_price,
            min_units: input.min_units,
            max_units: input.max_units,
            sale_end: input.sale_end,
            delivery_deadline: input.delivery_deadline,
            milestones,
            bond_cover_bps: tier.bond_cover_bps,
            dispute_window: dispute_window(&env),
            status: Status::Funding,
            sold: 0,
            delivered: 0,
            pending: 0,
            refunded: 0,
            released_bps: 0,
            advanced: 0,
            escrow: 0,
            bond_total: 0,
            bond_slashed: 0,
            refund_per_unit: 0,
            created_at: now,
        };
        save_campaign(&env, &c);
        CampaignCreated {
            id,
            seller,
            unit_price: c.unit_price,
            max_units: c.max_units,
        }
        .publish(&env);
        Ok(id)
    }

    /// The seller or any guarantor ("aval solidario") locks a bond behind the campaign.
    pub fn add_bond(env: Env, id: u64, provider: Address, amount: i128) -> Result<(), Error> {
        provider.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidInput);
        }
        let mut c = get_campaign(&env, id)?;
        if c.status != Status::Funding && c.status != Status::Active {
            return Err(Error::WrongStatus);
        }
        token_client(&env).transfer(&provider, &env.current_contract_address(), &amount);
        save_bond(&env, id, &provider, get_bond(&env, id, &provider) + amount);
        c.bond_total += amount;
        save_campaign(&env, &c);
        BondPosted {
            id,
            provider,
            amount,
        }
        .publish(&env);
        Ok(())
    }

    /// Closes the sale: anyone after `sale_end`, or the seller earlier once the goal is reached.
    pub fn close_sale(env: Env, id: u64) -> Result<Status, Error> {
        let mut c = get_campaign(&env, id)?;
        require_status(&c, Status::Funding)?;
        if env.ledger().timestamp() < c.sale_end {
            c.seller.require_auth();
            if c.sold < c.min_units {
                return Err(Error::MinNotReached);
            }
        }
        if c.sold >= c.min_units {
            set_status(&env, &mut c, Status::Active);
        } else {
            fail(&env, &mut c);
        }
        save_campaign(&env, &c);
        Ok(c.status)
    }

    /// Seller cancels. During the sale everyone is refunded 100% with no penalty.
    /// Once production started (Active), cancelling counts as a default.
    pub fn cancel(env: Env, id: u64) -> Result<Status, Error> {
        let mut c = get_campaign(&env, id)?;
        c.seller.require_auth();
        match c.status {
            Status::Funding => fail(&env, &mut c),
            Status::Active => default_campaign(&env, &mut c),
            _ => return Err(Error::WrongStatus),
        }
        save_campaign(&env, &c);
        Ok(c.status)
    }

    /// Seller attaches proof of progress (photo/video/document URL or IPFS CID).
    pub fn submit_milestone(env: Env, id: u64, index: u32, evidence: String) -> Result<(), Error> {
        let mut c = get_campaign(&env, id)?;
        c.seller.require_auth();
        require_status(&c, Status::Active)?;
        if evidence.len() == 0 {
            return Err(Error::InvalidInput);
        }
        if evidence.len() > MAX_EVIDENCE_LEN {
            return Err(Error::TooLong);
        }
        let mut m = c.milestones.get(index).ok_or(Error::NotFound)?;
        if m.released {
            return Err(Error::AlreadyReleased);
        }
        m.evidence = evidence;
        c.milestones.set(index, m);
        save_campaign(&env, &c);
        Ok(())
    }

    /// Verifier approves a milestone -> advance released to the seller, if the bond covers it
    /// and the seller is still verified.
    pub fn approve_milestone(env: Env, id: u64, index: u32) -> Result<i128, Error> {
        let mut c = get_campaign(&env, id)?;
        c.verifier.require_auth();
        require_status(&c, Status::Active)?;
        if !is_seller_verified(&env, &c.seller) {
            return Err(Error::NotVerified);
        }
        let mut m = c.milestones.get(index).ok_or(Error::NotFound)?;
        if m.released {
            return Err(Error::AlreadyReleased);
        }
        if m.evidence.len() == 0 {
            return Err(Error::MissingEvidence);
        }
        let undelivered = c.sold - c.delivered;
        let gross = (undelivered as i128) * c.unit_price * (m.bps as i128) / BPS;
        let required_bond = (c.advanced + gross) * (c.bond_cover_bps as i128) / BPS;
        if c.bond_total < required_bond {
            return Err(Error::BondTooLow);
        }
        c.advanced += gross;
        c.released_bps += m.bps;
        m.released = true;
        c.milestones.set(index, m);
        let net = pay_seller(&env, &mut c, gross);
        save_campaign(&env, &c);
        AdvanceReleased {
            id,
            milestone: index,
            amount: gross,
        }
        .publish(&env);
        Ok(net)
    }

    /// Seller declares it handed `units` to `buyer`. Paid after the dispute window unless disputed.
    pub fn mark_delivered(env: Env, id: u64, buyer: Address, units: u32) -> Result<(), Error> {
        let mut c = get_campaign(&env, id)?;
        c.seller.require_auth();
        require_status(&c, Status::Active)?;
        if units == 0 {
            return Err(Error::InvalidInput);
        }
        let mut h = get_holding(&env, id, &buyer);
        if h.disputed {
            return Err(Error::DisputeOpen);
        }
        if h.units < units {
            return Err(Error::InsufficientUnits);
        }
        h.units -= units;
        h.pending += units;
        h.pending_since = env.ledger().timestamp();
        c.pending += units;
        save_holding(&env, id, &buyer, &h);
        save_campaign(&env, &c);
        DeliveryMarked { id, buyer, units }.publish(&env);
        Ok(())
    }

    // ----------------------------------------------------------------- buyer

    /// Buy `units` vouchers at the locked price. Money stays in escrow.
    pub fn buy(env: Env, id: u64, buyer: Address, units: u32) -> Result<i128, Error> {
        buyer.require_auth();
        if units == 0 {
            return Err(Error::InvalidInput);
        }
        let mut c = get_campaign(&env, id)?;
        if c.status != Status::Funding || env.ledger().timestamp() >= c.sale_end {
            return Err(Error::SaleClosed);
        }
        if buyer == c.seller || buyer == c.verifier {
            return Err(Error::SelfDealing);
        }
        if c.sold + units > c.max_units {
            return Err(Error::SoldOut);
        }
        let amount = (units as i128) * c.unit_price;
        token_client(&env).transfer(&buyer, &env.current_contract_address(), &amount);
        c.sold += units;
        c.escrow += amount;

        let mut h = get_holding(&env, id, &buyer);
        h.units += units;
        save_holding(&env, id, &buyer, &h);

        let mut stats = get_buyer(&env, &buyer);
        stats.purchases += 1;
        stats.units_bought += units;
        save_buyer(&env, &buyer, &stats);

        if c.sold == c.max_units {
            set_status(&env, &mut c, Status::Active);
        }
        save_campaign(&env, &c);
        Purchased {
            id,
            buyer,
            units,
            amount,
        }
        .publish(&env);
        Ok(amount)
    }

    /// Gift or pass vouchers to someone else (e.g. family abroad buys for parents in Bolivia).
    pub fn transfer_units(env: Env, id: u64, from: Address, to: Address, units: u32) -> Result<(), Error> {
        from.require_auth();
        if units == 0 || from == to {
            return Err(Error::InvalidInput);
        }
        let c = get_campaign(&env, id)?;
        if c.status != Status::Funding && c.status != Status::Active {
            return Err(Error::WrongStatus);
        }
        if to == c.seller || to == c.verifier {
            return Err(Error::SelfDealing);
        }
        let mut hf = get_holding(&env, id, &from);
        if hf.units < units {
            return Err(Error::InsufficientUnits);
        }
        let mut ht = get_holding(&env, id, &to);
        hf.units -= units;
        ht.units += units;
        save_holding(&env, id, &from, &hf);
        save_holding(&env, id, &to, &ht);
        Ok(())
    }

    /// Buyer confirms reception (e.g. scanning the producer's QR at the pickup point).
    /// Pays the producer immediately. Confirms pending units first.
    pub fn confirm_delivery(env: Env, id: u64, buyer: Address, units: u32) -> Result<i128, Error> {
        buyer.require_auth();
        if units == 0 {
            return Err(Error::InvalidInput);
        }
        let mut c = get_campaign(&env, id)?;
        require_status(&c, Status::Active)?;
        let mut h = get_holding(&env, id, &buyer);
        if h.pending + h.units < units {
            return Err(Error::InsufficientUnits);
        }
        let from_pending = if h.pending < units { h.pending } else { units };
        h.pending -= from_pending;
        c.pending -= from_pending;
        h.units -= units - from_pending;
        if h.pending == 0 {
            h.disputed = false;
        }
        let net = deliver(&env, &mut c, &buyer, &mut h, units);
        complete_if_done(&env, &mut c);
        save_holding(&env, id, &buyer, &h);
        save_campaign(&env, &c);
        Ok(net)
    }

    /// Buyer says the seller's delivery claim is false. Freezes it until the verifier decides.
    pub fn dispute(env: Env, id: u64, buyer: Address) -> Result<(), Error> {
        buyer.require_auth();
        let c = get_campaign(&env, id)?;
        require_status(&c, Status::Active)?;
        let mut h = get_holding(&env, id, &buyer);
        if h.pending == 0 {
            return Err(Error::NothingToClaim);
        }
        h.disputed = true;
        save_holding(&env, id, &buyer, &h);
        Disputed {
            id,
            buyer,
            units: h.pending,
        }
        .publish(&env);
        Ok(())
    }

    /// After the dispute window, anyone can finalize an undisputed delivery claim.
    pub fn finalize_delivery(env: Env, id: u64, buyer: Address) -> Result<i128, Error> {
        let mut c = get_campaign(&env, id)?;
        require_status(&c, Status::Active)?;
        let mut h = get_holding(&env, id, &buyer);
        if h.pending == 0 {
            return Err(Error::NothingToClaim);
        }
        if h.disputed {
            return Err(Error::DisputeOpen);
        }
        if env.ledger().timestamp() < h.pending_since + c.dispute_window {
            return Err(Error::TooEarly);
        }
        let units = h.pending;
        h.pending = 0;
        c.pending -= units;
        let net = deliver(&env, &mut c, &buyer, &mut h, units);
        complete_if_done(&env, &mut c);
        save_holding(&env, id, &buyer, &h);
        save_campaign(&env, &c);
        Ok(net)
    }

    /// Rate the producer once per campaign (after receiving products or being refunded).
    pub fn rate(env: Env, id: u64, buyer: Address, stars: u32) -> Result<(), Error> {
        buyer.require_auth();
        if stars == 0 || stars > 5 {
            return Err(Error::InvalidInput);
        }
        let c = get_campaign(&env, id)?;
        let mut h = get_holding(&env, id, &buyer);
        if h.delivered == 0 && h.refunded == 0 {
            return Err(Error::NothingToClaim);
        }
        if h.rated {
            return Err(Error::AlreadyRated);
        }
        h.rated = true;
        save_holding(&env, id, &buyer, &h);
        let mut rep = get_rep(&env, &c.seller);
        rep.rating_sum += stars;
        rep.rating_count += 1;
        save_rep(&env, &c.seller, &rep);
        Rated {
            seller: c.seller,
            id,
            stars,
        }
        .publish(&env);
        Ok(())
    }

    /// Refund for failed or defaulted campaigns.
    pub fn claim_refund(env: Env, id: u64, buyer: Address) -> Result<i128, Error> {
        buyer.require_auth();
        let mut c = get_campaign(&env, id)?;
        if c.status != Status::Failed && c.status != Status::Defaulted {
            return Err(Error::WrongStatus);
        }
        let mut h = get_holding(&env, id, &buyer);
        let units = h.units + h.pending;
        if units == 0 {
            return Err(Error::NothingToClaim);
        }
        let amount = (units as i128) * c.refund_per_unit;
        h.units = 0;
        h.pending = 0;
        h.disputed = false;
        h.refunded += units;
        c.refunded += units;
        c.escrow -= amount;
        if amount > 0 {
            token_client(&env).transfer(&env.current_contract_address(), &buyer, &amount);
        }
        save_holding(&env, id, &buyer, &h);
        save_campaign(&env, &c);
        Refunded {
            id,
            buyer,
            units,
            amount,
        }
        .publish(&env);
        Ok(amount)
    }

    // -------------------------------------------------------------- verifier

    /// Verifier decides a dispute: delivered (pay seller) or not (vouchers go back to the buyer).
    pub fn resolve_dispute(env: Env, id: u64, buyer: Address, delivered: bool) -> Result<(), Error> {
        let mut c = get_campaign(&env, id)?;
        c.verifier.require_auth();
        require_status(&c, Status::Active)?;
        let mut h = get_holding(&env, id, &buyer);
        if !h.disputed {
            return Err(Error::NoDispute);
        }
        let units = h.pending;
        h.pending = 0;
        h.disputed = false;
        c.pending -= units;
        if delivered {
            deliver(&env, &mut c, &buyer, &mut h, units);
            complete_if_done(&env, &mut c);
        } else {
            h.units += units;
        }
        save_holding(&env, id, &buyer, &h);
        save_campaign(&env, &c);
        Ok(())
    }

    /// Verifier declares a default early (producer vanished, fraud detected).
    pub fn declare_default(env: Env, id: u64) -> Result<(), Error> {
        let mut c = get_campaign(&env, id)?;
        c.verifier.require_auth();
        require_status(&c, Status::Active)?;
        default_campaign(&env, &mut c);
        save_campaign(&env, &c);
        Ok(())
    }

    // ------------------------------------------------------------ settlement

    /// After the delivery deadline plus two dispute windows (time to finalize last deliveries),
    /// anyone can settle: Completed if everything was delivered, otherwise Defaulted.
    /// Unfinalized or disputed deliveries count as undelivered (buyer-protective).
    pub fn settle(env: Env, id: u64) -> Result<Status, Error> {
        let mut c = get_campaign(&env, id)?;
        require_status(&c, Status::Active)?;
        if env.ledger().timestamp() < c.delivery_deadline + 2 * c.dispute_window {
            return Err(Error::TooEarly);
        }
        if c.delivered == c.sold {
            complete(&env, &mut c);
        } else {
            default_campaign(&env, &mut c);
        }
        save_campaign(&env, &c);
        Ok(c.status)
    }

    /// Bond providers withdraw: 100% if completed/failed, the unslashed share if defaulted.
    pub fn withdraw_bond(env: Env, id: u64, provider: Address) -> Result<i128, Error> {
        provider.require_auth();
        let c = get_campaign(&env, id)?;
        let bond = get_bond(&env, id, &provider);
        if bond == 0 {
            return Err(Error::NothingToClaim);
        }
        let amount = match c.status {
            Status::Completed | Status::Failed => bond,
            Status::Defaulted => bond * (c.bond_total - c.bond_slashed) / c.bond_total,
            _ => return Err(Error::WrongStatus),
        };
        save_bond(&env, id, &provider, 0);
        if amount > 0 {
            token_client(&env).transfer(&env.current_contract_address(), &provider, &amount);
        }
        Ok(amount)
    }

    // ----------------------------------------------------------------- views

    pub fn config(env: Env) -> Config {
        let s = env.storage().instance();
        Config {
            admin: s.get(&DataKey::Admin).unwrap(),
            token: s.get(&DataKey::Token).unwrap(),
            treasury: s.get(&DataKey::Treasury).unwrap(),
            dispute_window: s.get(&DataKey::DisputeWindow).unwrap_or(0),
            campaigns: s.get(&DataKey::NextId).unwrap_or(0),
        }
    }

    pub fn is_verifier(env: Env, verifier: Address) -> bool {
        is_allowed_verifier(&env, &verifier)
    }

    pub fn is_seller_verified(env: Env, seller: Address) -> bool {
        is_seller_verified(&env, &seller)
    }

    pub fn pending_admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PendingAdmin)
    }

    pub fn campaign(env: Env, id: u64) -> Result<Campaign, Error> {
        get_campaign(&env, id)
    }

    pub fn holding(env: Env, id: u64, buyer: Address) -> Holding {
        get_holding(&env, id, &buyer)
    }

    pub fn bond_of(env: Env, id: u64, provider: Address) -> i128 {
        get_bond(&env, id, &provider)
    }

    pub fn reputation(env: Env, seller: Address) -> Reputation {
        get_rep(&env, &seller)
    }

    pub fn tier(env: Env, seller: Address) -> TierInfo {
        tier_for(&get_rep(&env, &seller))
    }

    pub fn buyer_stats(env: Env, buyer: Address) -> BuyerStats {
        get_buyer(&env, &buyer)
    }
}
