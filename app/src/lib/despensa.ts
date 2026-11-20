// Typed access to the Ayni Soroban contract (crate and file keep the original name, despensa).
// Uses the JS Stellar SDK's contract client with the contract interface bundled in
// contract-spec.ts, so no generated bindings package and no interface download are needed.

import { contract, rpc, StrKey } from "@stellar/stellar-sdk";
import { config, TOKEN_DECIMALS } from "./config";
import { CONTRACT_SPEC } from "./contract-spec";

// ---------------------------------------------------------------- types (mirror the contract)

export type StatusTag = "Funding" | "Active" | "Completed" | "Failed" | "Defaulted";

export interface Milestone {
  title: string;
  bps: number;
  evidence: string;
  released: boolean;
}

export interface Campaign {
  id: bigint;
  seller: string;
  verifier: string;
  title: string;
  metadata_uri: string;
  unit_price: bigint;
  min_units: number;
  max_units: number;
  sale_end: bigint;
  delivery_deadline: bigint;
  milestones: Milestone[];
  bond_cover_bps: number;
  /** Seconds buyers have to dispute a delivery claim. Fixed when the campaign was created. */
  dispute_window: bigint;
  status: { tag: StatusTag };
  sold: number;
  delivered: number;
  pending: number;
  refunded: number;
  released_bps: number;
  advanced: bigint;
  escrow: bigint;
  bond_total: bigint;
  bond_slashed: bigint;
  /** Principal returned per unit after a failure or default (yield comes on top). */
  refund_per_unit: bigint;
  created_at: bigint;
  /** Internal shares of the yield pot backing `escrow`; their value minus `escrow` is the yield. */
  escrow_shares: bigint;
  bond_shares: bigint;
  bond_shares_posted: bigint;
  /** Bond principal still in the contract (posted - slashed - withdrawn). */
  bond_left: bigint;
  /** Share of a delivered unit's yield for the buyer and for Ayni, fixed at creation. */
  buyer_yield_bps: number;
  protocol_yield_bps: number;
  /** Yield paid out so far in this campaign, to anyone. */
  yield_paid: bigint;
  /** What the lending pool lost on this campaign's payouts (0 unless it had bad debt). */
  yield_loss: bigint;
}

export interface Holding {
  units: number;
  pending: number;
  pending_since: bigint;
  disputed: boolean;
  delivered: number;
  refunded: number;
  rated: boolean;
  /** Yield this buyer has been paid so far in this campaign. */
  yield_paid: bigint;
}

export interface Reputation {
  completed: number;
  defaulted: number;
  units_delivered: number;
  units_refunded: number;
  streak: number;
  best_streak: number;
  rating_sum: number;
  rating_count: number;
}

export interface TierInfo {
  tier: number;
  max_advance_bps: number;
  bond_cover_bps: number;
}

export interface BuyerStats {
  purchases: number;
  units_bought: number;
  units_received: number;
  campaigns_received: number;
}

export interface ContractConfig {
  admin: string;
  token: string;
  /** Receives Ayni's share of the yield (0 by default). There is no fee on payments. */
  treasury: string;
  /** Window new campaigns get. A live campaign uses its own `dispute_window`. */
  dispute_window: bigint;
  campaigns: bigint;
}

/** Where the money waits and what it has earned (lending pool fixed at deploy). */
export interface YieldConfig {
  pool: string | undefined;
  enabled: boolean;
  /** Share of everything kept idle in the contract. */
  liquid_bps: number;
  buyer_yield_bps: number;
  protocol_yield_bps: number;
  idle: bigint;
  /** Current value of the lending-pool position. */
  invested: bigint;
  total_shares: bigint;
  yield_paid: bigint;
  yield_loss: bigint;
}

export interface CampaignValue {
  escrow: bigint;
  escrow_value: bigint;
  bond: bigint;
  bond_value: bigint;
}

export interface MilestoneInput {
  title: string;
  bps: number;
}

export interface CampaignInput {
  title: string;
  metadata_uri: string;
  unit_price: bigint;
  min_units: number;
  max_units: number;
  sale_end: bigint;
  delivery_deadline: bigint;
  milestones: MilestoneInput[];
}

// ---------------------------------------------------------------- errors

const ERRORS: Record<number, [string, string]> = {
  1: ["NotFound", "No encontrado."],
  2: ["InvalidInput", "Datos inválidos."],
  3: ["WrongStatus", "La campaña no está en el estado correcto para esta acción."],
  4: ["SaleClosed", "La preventa ya cerró."],
  5: ["SoldOut", "No quedan suficientes unidades."],
  6: ["InsufficientUnits", "No tienes suficientes vales."],
  7: ["AdvanceTooHigh", "El adelanto supera el límite de tu nivel de reputación."],
  8: ["BondTooLow", "El aval no cubre este adelanto."],
  9: ["TooEarly", "Todavía no se puede: espera a que termine el plazo."],
  10: ["AlreadyRated", "Ya calificaste esta campaña."],
  11: ["NothingToClaim", "No hay nada que reclamar."],
  12: ["MissingEvidence", "Falta la evidencia del hito."],
  13: ["AlreadyReleased", "Este hito ya fue pagado."],
  14: ["FeeTooHigh", "Comisión demasiado alta."], // reserved: there is no fee since model v2
  15: ["SelfDealing", "El productor o el verificador no pueden comprar ni recibir sus propios vales."],
  16: ["DisputeOpen", "Hay una disputa abierta."],
  17: ["NoDispute", "No hay una disputa abierta."],
  18: ["MinNotReached", "Aún no se llegó al mínimo de ventas."],
  19: ["VerifierNotAllowed", "Este verificador no está autorizado. Elige uno de la lista o pide a Ayni que lo autorice."],
  20: ["WindowOutOfRange", "El plazo de disputa debe estar entre 1 y 30 días."],
  21: ["TooLong", "El texto es demasiado largo. Acórtalo e inténtalo de nuevo."],
  22: ["NoPendingAdmin", "No hay un cambio de administrador pendiente."],
  23: ["NotVerified", "Para pedir adelantos primero tienes que verificar tu identidad."],
  24: ["YieldUnavailable", "Sin liquidez por ahora, intenta en unos minutos. No se movió tu dinero."],
};

export function friendlyError(err: unknown): string {
  const raw =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : typeof err === "object" && err && "message" in err
          ? String((err as { message: unknown }).message)
          : JSON.stringify(err);
  const code = raw.match(/Error\(Contract, #(\d+)\)/);
  if (code && ERRORS[Number(code[1])]) return ERRORS[Number(code[1])][1];
  for (const [name, msg] of Object.values(ERRORS)) {
    if (raw.includes(name)) return msg;
  }
  return raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
}

// ---------------------------------------------------------------- client

// The interface comes bundled (contract-spec.ts, generated by `npm run spec:sync`) instead of
// being read from the network with Client.from(), which downloaded the contract code first:
// two extra RPC round trips, several seconds on testnet, before every first read.
const spec = new contract.Spec(CONTRACT_SPEC);
const clients = new Map<string, contract.Client>();

async function getClient(publicKey?: string): Promise<contract.Client> {
  const key = publicKey ?? "";
  let client = clients.get(key);
  if (!client) {
    client = new contract.Client(spec, {
      contractId: config.contractId,
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
      publicKey,
    });
    clients.set(key, client);
  }
  return client;
}

type Method = (args?: Record<string, unknown>) => Promise<contract.AssembledTransaction<unknown>>;

async function assemble(method: string, args?: Record<string, unknown>, publicKey?: string) {
  const client = await getClient(publicKey);
  const fn = (client as unknown as Record<string, Method>)[method];
  if (typeof fn !== "function") throw new Error(`Método desconocido: ${method}`);
  const tx = await (args ? fn.call(client, args) : fn.call(client));
  if (tx.simulation && rpc.Api.isSimulationError(tx.simulation)) {
    throw new Error(friendlyError(tx.simulation.error));
  }
  return tx;
}

function unwrap<T>(value: unknown): T {
  if (value && typeof value === "object" && "isOk" in value) {
    const r = value as { isOk(): boolean; unwrap(): T; unwrapErr(): unknown };
    if (r.isOk()) return r.unwrap();
    throw new Error(friendlyError(r.unwrapErr()));
  }
  return value as T;
}

/** Read-only call (simulated, never submitted). */
export async function read<T>(method: string, args?: Record<string, unknown>): Promise<T> {
  const tx = await assemble(method, args);
  return unwrap<T>(tx.result);
}

/** Builds and simulates a write call with `source` as the transaction source. Returns unsigned XDR. */
export async function buildXdr(
  method: string,
  args: Record<string, unknown>,
  source: string,
): Promise<string> {
  const tx = await assemble(method, args, source);
  return tx.toXDR();
}

/**
 * Waits until the network includes `hash` in a ledger. Returns "pending" if it is still unknown after
 * `timeoutMs`: the transaction may still land, so the UI must not tell the user to retry.
 */
export async function waitForTx(hash: string, timeoutMs = 45_000): Promise<"success" | "failed" | "pending"> {
  const server = new rpc.Server(config.rpcUrl);
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const r = await server.getTransaction(hash);
      if (r.status === rpc.Api.GetTransactionStatus.SUCCESS) return "success";
      if (r.status === rpc.Api.GetTransactionStatus.FAILED) return "failed";
    } catch {
      // Transient RPC error: try again.
    }
    await new Promise((res) => setTimeout(res, 1500));
  }
  return "pending";
}

// ---------------------------------------------------------------- reads

export const getConfig = () => read<ContractConfig>("config");
export const getCampaign = (id: bigint) => read<Campaign>("campaign", { id });
export const getHolding = (id: bigint, buyer: string) => read<Holding>("holding", { id, buyer });
export const getReputation = (seller: string) => read<Reputation>("reputation", { seller });
export const getTier = (seller: string) => read<TierInfo>("tier", { seller });
export const getBuyerStats = (buyer: string) => read<BuyerStats>("buyer_stats", { buyer });
export const getBond = (id: bigint, provider: string) => read<bigint>("bond_of", { id, provider });
/** Is this address on the contract's verifier allowlist? Sellers can only appoint allowlisted verifiers. */
export const isVerifier = (verifier: string) => read<boolean>("is_verifier", { verifier });
/** Did a verifier check this seller's identity (off-chain)? Only verified sellers can ask for advances. */
export const isSellerVerified = (seller: string) => read<boolean>("is_seller_verified", { seller });
export const getYieldConfig = () => read<YieldConfig>("yield_config");
export const getCampaignValue = (id: bigint) => read<CampaignValue>("campaign_value", { id });
/** The buyer's share of the yield their vouchers have earned so far (not yet paid). */
export const getHoldingYield = (id: bigint, buyer: string) => read<bigint>("holding_yield", { id, buyer });

export async function listCampaigns(): Promise<Campaign[]> {
  const cfg = await getConfig();
  const ids: bigint[] = [];
  for (let i = cfg.campaigns - BigInt(1); i >= BigInt(0); i--) ids.push(i);
  const results = await Promise.allSettled(ids.map((id) => getCampaign(id)));
  return results
    .filter((r): r is PromiseFulfilledResult<Campaign> => r.status === "fulfilled")
    .map((r) => r.value);
}

// ---------------------------------------------------------------- helpers

const UNIT = BigInt(10) ** BigInt(TOKEN_DECIMALS);

export function toAmount(usd: string): bigint {
  const [whole, frac = ""] = usd.trim().split(".");
  const fracPadded = (frac + "0".repeat(TOKEN_DECIMALS)).slice(0, TOKEN_DECIMALS);
  return BigInt(whole || "0") * UNIT + BigInt(fracPadded || "0");
}

export function usd(amount: bigint): string {
  return (Number(amount) / Number(UNIT)).toLocaleString("es-BO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function bs(amount: bigint): string {
  return ((Number(amount) / Number(UNIT)) * config.bobPerUsd).toLocaleString("es-BO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function statusOf(c: Campaign): StatusTag {
  return c.status.tag;
}

export const STATUS_LABEL: Record<StatusTag, string> = {
  Funding: "En preventa",
  Active: "En entrega",
  Completed: "Completado",
  Failed: "No llegó al mínimo",
  Defaulted: "Incumplida",
};

export const TIER_LABEL = ["Restringido", "Nuevo", "Confiable", "Destacado", "Ejemplar"];

export function date(seconds: bigint): string {
  return new Date(Number(seconds) * 1000).toLocaleDateString("es-BO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function avgRating(r: Reputation): number | null {
  return r.rating_count > 0 ? r.rating_sum / r.rating_count : null;
}

/** A Stellar account (G…) or contract (C…) address. */
export function isValidAddress(addr: string): boolean {
  const a = addr.trim();
  return StrKey.isValidEd25519PublicKey(a) || StrKey.isValidContract(a);
}
