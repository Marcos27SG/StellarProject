use soroban_sdk::{contracterror, contracttype, Address, String, Vec};

/// Basis points denominator (100% = 10_000).
pub const BPS: i128 = 10_000;
/// Max number of advance milestones per campaign.
pub const MAX_MILESTONES: u32 = 5;

/// Dispute window bounds. The admin cannot set a window so short that a seller's delivery claim
/// pays out before buyers can react, nor so long that payouts and settlement never happen.
pub const MIN_DISPUTE_WINDOW: u64 = 86_400; // 1 day
pub const MAX_DISPUTE_WINDOW: u64 = 30 * 86_400; // 30 days
/// A delivery deadline can be at most this far in the future (covers multi-year construction).
pub const MAX_HORIZON: u64 = 5 * 365 * 86_400;

/// Length caps in bytes, so nobody can bloat a campaign entry that every buyer pays to rewrite.
pub const MAX_TITLE_LEN: u32 = 256;
pub const MAX_URI_LEN: u32 = 4_096;
pub const MAX_EVIDENCE_LEN: u32 = 1_024;

/// Yield defaults and bounds.
/// Share of a delivered unit's yield that goes to its buyer (the rest goes to the seller).
pub const DEFAULT_BUYER_YIELD_BPS: u32 = 5_000;
/// Ayni's share of a delivered unit's yield is at most 20% (0 by default).
pub const MAX_PROTOCOL_YIELD_BPS: u32 = 2_000;
/// Share of everything held that stays idle in the contract, so most payouts skip the pool.
pub const DEFAULT_LIQUID_BPS: u32 = 2_000;
pub const MIN_LIQUID_BPS: u32 = 1_000;
/// Smallest automatic supply to the pool (1 USDC): smaller ones are not worth the fees.
pub const MIN_DEPOSIT: i128 = 10_000_000;
/// Virtual shares (ERC-4626 decimals offset) against share-price manipulation.
pub const VIRTUAL_SHARES: i128 = 1_000_000;

/// ~5s per ledger -> 17_280 ledgers per day.
pub const DAY_LEDGERS: u32 = 17_280;
pub const TTL_THRESHOLD: u32 = 30 * DAY_LEDGERS;
pub const TTL_EXTEND: u32 = 120 * DAY_LEDGERS;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotFound = 1,
    InvalidInput = 2,
    WrongStatus = 3,
    SaleClosed = 4,
    SoldOut = 5,
    InsufficientUnits = 6,
    AdvanceTooHigh = 7,
    BondTooLow = 8,
    TooEarly = 9,
    AlreadyRated = 10,
    NothingToClaim = 11,
    MissingEvidence = 12,
    AlreadyReleased = 13,
    /// Reserved: the payout fee was removed in model v2. Kept so codes never shift.
    FeeTooHigh = 14,
    SelfDealing = 15,
    DisputeOpen = 16,
    NoDispute = 17,
    MinNotReached = 18,
    /// The verifier is not on the admin's allowlist.
    VerifierNotAllowed = 19,
    /// Dispute window outside MIN_DISPUTE_WINDOW..=MAX_DISPUTE_WINDOW.
    WindowOutOfRange = 20,
    /// A title, link or evidence string is longer than its cap.
    TooLong = 21,
    NoPendingAdmin = 22,
    /// Advances (milestones) need a seller whose identity a verifier checked off-chain.
    NotVerified = 23,
    /// The lending pool cannot pay out right now (frozen or fully lent out). Nothing changed.
    YieldUnavailable = 24,
}

/// Lifecycle of a pre-sale campaign.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Status {
    /// Accepting purchases. Money is 100% refundable.
    Funding,
    /// Goal reached, sale closed. Producer is producing / delivering.
    Active,
    /// Every sold unit was delivered. Bonds are returned.
    Completed,
    /// Goal not reached (or cancelled before production). Full refunds.
    Failed,
    /// Producer did not deliver. Buyers are refunded from escrow, then the bond.
    Defaulted,
}

/// A production milestone that unlocks an advance for the producer
/// (e.g. "feed bought", "harvest started", for real estate: "foundations poured").
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    pub title: String,
    /// Share of the price of every *undelivered* unit released when approved.
    pub bps: u32,
    /// Proof submitted by the seller (URL / IPFS CID / hash). Empty until submitted.
    pub evidence: String,
    pub released: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneInput {
    pub title: String,
    pub bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CampaignInput {
    pub title: String,
    pub metadata_uri: String,
    pub unit_price: i128,
    pub min_units: u32,
    pub max_units: u32,
    pub sale_end: u64,
    pub delivery_deadline: u64,
    pub milestones: Vec<MilestoneInput>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Campaign {
    pub id: u64,
    pub seller: Address,
    /// Independent party that approves milestones and resolves disputes
    /// (a producers' association, the platform, or for real estate a certified engineer).
    pub verifier: Address,
    pub title: String,
    /// Off-chain product details: photos, description, pickup points.
    pub metadata_uri: String,
    /// Price per unit in the settlement token's smallest unit (USDC: 7 decimals).
    pub unit_price: i128,
    /// All-or-nothing goal: below this the campaign fails and everyone is refunded.
    pub min_units: u32,
    /// Supply cap: the producer cannot sell more than it can produce.
    pub max_units: u32,
    pub sale_end: u64,
    pub delivery_deadline: u64,
    pub milestones: Vec<Milestone>,
    /// Snapshot of the seller's tier when the campaign was created.
    pub bond_cover_bps: u32,
    /// Snapshot of the dispute window (seconds) when the campaign was created.
    /// Later admin changes never apply to a live campaign.
    pub dispute_window: u64,
    pub status: Status,
    pub sold: u32,
    /// Units confirmed delivered (paid out to the seller).
    pub delivered: u32,
    /// Units the seller marked delivered, waiting for buyer confirmation / dispute window.
    pub pending: u32,
    pub refunded: u32,
    /// Sum of released milestone bps (applies to every unit not delivered at release time).
    pub released_bps: u32,
    /// Gross advances paid to the seller so far.
    pub advanced: i128,
    /// Tokens held for this campaign (buyer deposits - payouts - refunds).
    pub escrow: i128,
    /// Total bond posted by the seller and guarantors ("aval solidario").
    pub bond_total: i128,
    /// Part of the bond used to refund buyers on default.
    pub bond_slashed: i128,
    /// Set when the campaign fails or defaults: principal returned per unit (yield comes on top).
    pub refund_per_unit: i128,
    pub created_at: u64,
    /// Vault shares backing `escrow` (principal). Their value minus `escrow` is the yield.
    pub escrow_shares: i128,
    /// Vault shares backing the bonds still in the contract.
    pub bond_shares: i128,
    /// Shares originally minted for the bonds not yet withdrawn (to split `bond_shares`).
    pub bond_shares_posted: i128,
    /// Bond principal still in the contract (posted - slashed - withdrawn).
    pub bond_left: i128,
    /// Snapshot of the yield split when the campaign was created (admin changes never apply to
    /// a live campaign): buyer's and Ayni's share of a delivered unit's yield.
    pub buyer_yield_bps: u32,
    pub protocol_yield_bps: u32,
    /// Yield paid out so far, to anyone (buyers, seller, bond providers, Ayni).
    pub yield_paid: i128,
    /// Money the lending pool lost on this campaign's payouts so far.
    pub yield_loss: i128,
}

/// A buyer's vouchers in one campaign.
#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Holding {
    /// Vouchers held (not delivered, not pending, not refunded). Transferable.
    pub units: u32,
    /// Units the seller says were delivered, awaiting confirmation.
    pub pending: u32,
    pub pending_since: u64,
    pub disputed: bool,
    pub delivered: u32,
    pub refunded: u32,
    pub rated: bool,
    /// Yield this buyer has been paid so far in this campaign.
    pub yield_paid: i128,
}

/// One bond provider's stake in a campaign.
#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct BondPos {
    pub principal: i128,
    pub shares: i128,
}

/// Who received a piece of yield.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum YieldKind {
    Buyer,
    Seller,
    Bond,
    Protocol,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct YieldConfig {
    /// Lending pool, fixed at deploy. None: yield is off for good.
    pub pool: Option<Address>,
    /// New deposits into the pool (the admin can pause them; money already there stays).
    pub enabled: bool,
    pub liquid_bps: u32,
    /// Split given to campaigns created from now on.
    pub buyer_yield_bps: u32,
    pub protocol_yield_bps: u32,
    /// Tokens idle in the contract.
    pub idle: i128,
    /// Current value of the pool position.
    pub invested: i128,
    pub total_shares: i128,
    /// Yield paid out so far, all campaigns.
    pub yield_paid: i128,
    /// Losses passed on so far, all campaigns.
    pub yield_loss: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CampaignValue {
    /// Principal in escrow and what it is worth now (principal + yield, or less after a loss).
    pub escrow: i128,
    pub escrow_value: i128,
    /// Bond principal still backing the campaign (posted - slashed - withdrawn) and its value.
    pub bond: i128,
    pub bond_value: i128,
}

/// On-chain track record of a producer. Drives the tier (how much may be advanced).
#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Reputation {
    pub completed: u32,
    pub defaulted: u32,
    pub units_delivered: u32,
    pub units_refunded: u32,
    /// Consecutive campaigns completed without default.
    pub streak: u32,
    pub best_streak: u32,
    pub rating_sum: u32,
    pub rating_count: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TierInfo {
    pub tier: u32,
    /// Max share of the sale that can be paid in advance through milestones.
    pub max_advance_bps: u32,
    /// Bond required, as a share of the advances paid. 100% at every tier since model v2.
    pub bond_cover_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct BuyerStats {
    pub purchases: u32,
    pub units_bought: u32,
    pub units_received: u32,
    /// Number of campaigns in which the buyer received products (local producers supported).
    pub campaigns_received: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub token: Address,
    /// Receives Ayni's share of the yield (`protocol_yield_bps`, 0 by default). Fixed at deploy.
    pub treasury: Address,
    /// Dispute window new campaigns get. Each campaign keeps its own snapshot.
    pub dispute_window: u64,
    pub campaigns: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Token,
    Treasury,
    DisputeWindow,
    PendingAdmin,
    /// Allowlisted verifier (present = allowed).
    Verifier(Address),
    /// Seller whose identity was checked off-chain (present = verified). Only the flag lives on
    /// chain: no documents, names or ID numbers.
    SellerVerified(Address),
    // Yield (instance storage).
    YieldPool,
    YieldEnabled,
    LiquidBps,
    BuyerYieldBps,
    ProtocolYieldBps,
    ReserveIndex,
    BTokens,
    TotalShares,
    YieldPaid,
    YieldLoss,
    NextId,
    Campaign(u64),
    Holding(u64, Address),
    Bond(u64, Address),
    Rep(Address),
    Buyer(Address),
}
