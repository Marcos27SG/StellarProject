// Spanish messages for failures that come back from Pollar (outcome codes) or from the network.
// Pollar reports transaction failures as a returned value, not a throw, so this reads
// { code, details, message, resultCode }. A contract error inside `details` wins: it says
// what actually went wrong (sold out, sale closed...).

import { friendlyError } from "./despensa";

export interface FailureLike {
  code?: string;
  details?: string;
  message?: string;
  resultCode?: string;
}

const CODES: Record<string, string> = {
  SDK_WALLET_NOT_READY: "Tu cuenta se está activando en Stellar. Espera unos segundos y vuelve a intentar.",
  SDK_WALLET_REQUIRED: "Tu cuenta todavía no está lista. Sal y vuelve a entrar.",
  SDK_WALLET_PROVISIONING_FAILED: "No se pudo activar tu cuenta. Sal y vuelve a entrar; si sigue, avísanos.",
  SDK_WALLET_RECOVERY_REQUIRED: "Tu cuenta necesita un método de recuperación antes de firmar.",
  SDK_NETWORK_TIMEOUT: "La conexión tardó demasiado. Revisa tu internet y vuelve a intentar.",
  SDK_CONFIRMATION_DECLINED: "Cancelaste la firma. No se movió nada.",
  SDK_CREDITS_INSUFFICIENT: "El servicio de firmas no está disponible ahora mismo. Intenta más tarde.",
  SDK_BILLING_OVERDUE: "El servicio de firmas no está disponible ahora mismo. Intenta más tarde.",
  RATE_LIMITED: "Demasiados intentos seguidos. Espera un minuto y vuelve a intentar.",
  TX_INSUFFICIENT_BALANCE: "No tienes saldo suficiente en tu cuenta.",
  TX_NO_TRUSTLINE: "Tu cuenta todavía no acepta USDC. Actívalo desde el menú de tu cuenta.",
  TX_INSUFFICIENT_FEE: "La red está congestionada. Vuelve a intentar en un momento.",
  TX_FEE_LIMIT_EXCEEDED: "La red está congestionada. Vuelve a intentar en un momento.",
  TX_BAD_SEQUENCE: "Otra operación tuya se cruzó con esta. Vuelve a intentar.",
  TX_TOO_LATE: "La operación venció antes de llegar a la red. Vuelve a intentar.",
  TX_SOURCE_NOT_FOUND: "Tu cuenta todavía no existe en Stellar. Espera unos segundos y vuelve a intentar.",
  TX_LOW_RESERVE: "Tu cuenta no tiene la reserva mínima de XLM.",
  TX_NOT_AUTHORIZED: "Tu cuenta no tiene permiso para esta operación.",
};

// Stellar transaction result codes (Pollar passes them through in resultCode, details or message).
const RESULT_CODES: [RegExp, string][] = [
  [
    /txInsufficientBalance/,
    "Tu cuenta no tiene XLM para la comisión de red y esta operación no está patrocinada. (Pollar: Sponsored fees → contract rules.)",
  ],
  [/txInsufficientFee/, CODES.TX_INSUFFICIENT_FEE],
  [/txBadSeq/, CODES.TX_BAD_SEQUENCE],
  [/txTooLate/, CODES.TX_TOO_LATE],
  [/txNoAccount/, CODES.TX_SOURCE_NOT_FOUND],
  [/txBadAuth/, "La firma no es válida para esta operación. Sal y vuelve a entrar."],
];

const CONTRACT_ERROR = /Error\(Contract, #\d+\)/;

export function walletErrorMessage(f: FailureLike): string {
  for (const text of [f.details, f.message]) {
    if (text && CONTRACT_ERROR.test(text)) return friendlyError(text);
  }
  if (f.code && CODES[f.code]) return CODES[f.code];
  for (const text of [f.resultCode, f.details, f.message]) {
    const hit = text && RESULT_CODES.find(([re]) => re.test(text));
    if (hit) return hit[1];
  }
  const raw = f.message ?? f.details ?? f.resultCode ?? f.code;
  if (raw && /origin/i.test(raw) && /allow/i.test(raw)) {
    return "Este sitio no está autorizado en Pollar. Agrega su dirección en Developers → Websites.";
  }
  return raw ? friendlyError(raw) : "No se pudo completar la operación. Vuelve a intentar.";
}

/**
 * True when we stopped waiting rather than the network saying no: the transaction may have landed.
 * Covers Pollar's client timeout (thrown or returned) and its "submitted, no answer" code.
 */
export function isTimeout(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const { code, message } = e as { code?: unknown; message?: unknown };
  if (code === "SDK_NETWORK_TIMEOUT" || code === "TX_SUBMIT_UNCONFIRMED") return true;
  return typeof message === "string" && /timed? ?out/i.test(message);
}

/** A Pollar wallet's on-chain state, as the rest of the app needs it. */
export type WalletReadiness = "ready" | "preparing" | "failed";

export function readinessOf(w: { provisioning?: string; existsOnStellar?: boolean } | null): WalletReadiness | null {
  if (!w) return null;
  if (w.provisioning === "FAILED") return "failed";
  if (w.provisioning === "READY") return "ready";
  if (w.provisioning === "CREATING") return "preparing";
  // NONE or not reported: trust the on-chain flag when there is one.
  return w.existsOnStellar === false ? "preparing" : "ready";
}
