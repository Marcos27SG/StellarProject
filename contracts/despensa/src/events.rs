use soroban_sdk::{contractevent, Address};

use crate::types::Status;

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
