use soroban_sdk::{contractevent, Address};

use crate::types::{Status, YieldKind};

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CampaignCreated {
    #[topic]
    pub id: u64,
    #[topic]
    pub seller: Address,
    pub unit_price: i128,
    pub max_units: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Purchased {
    #[topic]
    pub id: u64,
    #[topic]
    pub buyer: Address,
    pub units: u32,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BondPosted {
    #[topic]
    pub id: u64,
    #[topic]
    pub provider: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StatusChanged {
    #[topic]
    pub id: u64,
    pub status: Status,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdvanceReleased {
    #[topic]
    pub id: u64,
    pub milestone: u32,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeliveryMarked {
    #[topic]
    pub id: u64,
    #[topic]
    pub buyer: Address,
    pub units: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Delivered {
    #[topic]
    pub id: u64,
    #[topic]
    pub buyer: Address,
    pub units: u32,
    pub paid_to_seller: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Disputed {
    #[topic]
    pub id: u64,
    #[topic]
    pub buyer: Address,
    pub units: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Refunded {
    #[topic]
    pub id: u64,
    #[topic]
    pub buyer: Address,
    pub units: u32,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifierSet {
    #[topic]
    pub verifier: Address,
    pub allowed: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SellerVerified {
    #[topic]
    pub seller: Address,
    pub verified: bool,
    /// The admin or allowlisted verifier who set the flag.
    pub by: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminChanged {
    #[topic]
    pub admin: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Rated {
    #[topic]
    pub seller: Address,
    pub id: u64,
    pub stars: u32,
}

/// Yield paid out with a payout: to the buyer, the seller, a bond provider or Ayni's treasury.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct YieldPaid {
    #[topic]
    pub id: u64,
    #[topic]
    pub to: Address,
    pub amount: i128,
    pub kind: YieldKind,
}

/// A payout was smaller than its principal because the lending pool lost money.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct YieldLoss {
    #[topic]
    pub id: u64,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct YieldConfigChanged {
    pub enabled: bool,
    pub liquid_bps: u32,
    pub buyer_yield_bps: u32,
    pub protocol_yield_bps: u32,
}

/// Money moved between the contract and the lending pool (positive: supplied, negative:
/// withdrawn). For the transparency page.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Rebalanced {
    pub moved: i128,
    pub idle: i128,
    pub invested: i128,
}
