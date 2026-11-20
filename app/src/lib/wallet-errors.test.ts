import { describe, expect, it } from "vitest";
import { isTimeout, readinessOf, walletErrorMessage } from "./wallet-errors";

describe("walletErrorMessage", () => {
  it("prefers the contract error inside details", () => {
    expect(walletErrorMessage({ code: "TX_CONTRACT_FAILED", details: "HostError: Error(Contract, #5)" })).toBe(
      "No quedan suficientes unidades.",
    );
  });

  it("maps known Pollar codes to Spanish", () => {
    expect(walletErrorMessage({ code: "SDK_WALLET_NOT_READY" })).toMatch(/activando/);
    expect(walletErrorMessage({ code: "RATE_LIMITED" })).toMatch(/minuto/);
    expect(walletErrorMessage({ code: "TX_INSUFFICIENT_BALANCE" })).toMatch(/saldo/);
  });

  it("maps Stellar result codes, wherever Pollar puts them", () => {
    expect(walletErrorMessage({ code: "TX_SUBMIT_FAILED", resultCode: "txInsufficientBalance" })).toMatch(/XLM/);
    expect(walletErrorMessage({ message: "txInsufficientBalance" })).toMatch(/patrocinada/);
    expect(walletErrorMessage({ details: "tx_failed: txBadSeq" })).toMatch(/se cruzó/);
  });

  it("explains an origin that is not allowlisted", () => {
    expect(walletErrorMessage({ message: "Origin not allowed" })).toMatch(/Websites/);
  });

  it("falls back to the raw text, then to a generic message", () => {
    expect(walletErrorMessage({ message: "something odd" })).toBe("something odd");
    expect(walletErrorMessage({})).toMatch(/No se pudo/);
  });
});

describe("isTimeout", () => {
  it("recognises Pollar timeouts, thrown or returned", () => {
    expect(isTimeout(new Error("Request timed out after 30000ms"))).toBe(true);
    expect(isTimeout({ code: "SDK_NETWORK_TIMEOUT" })).toBe(true);
    expect(isTimeout({ status: "error", code: "TX_SUBMIT_UNCONFIRMED" })).toBe(true);
  });

  it("does not treat real rejections as timeouts", () => {
    expect(isTimeout({ code: "TX_SUBMIT_FAILED", resultCode: "txInsufficientBalance" })).toBe(false);
    expect(isTimeout(new Error("Error(Contract, #4)"))).toBe(false);
    expect(isTimeout(null)).toBe(false);
  });
});

describe("readinessOf", () => {
  it("follows provisioning", () => {
    expect(readinessOf(null)).toBeNull();
    expect(readinessOf({ provisioning: "READY" })).toBe("ready");
    expect(readinessOf({ provisioning: "CREATING" })).toBe("preparing");
    expect(readinessOf({ provisioning: "FAILED" })).toBe("failed");
  });

  it("uses existsOnStellar when provisioning is not reported", () => {
    expect(readinessOf({})).toBe("ready");
    expect(readinessOf({ provisioning: "NONE", existsOnStellar: false })).toBe("preparing");
  });
});

describe("model v2 contract errors", () => {
  it("explains a lending pool that cannot pay right now, without jargon", () => {
    const msg = walletErrorMessage({ code: "TX_SUBMIT_FAILED", details: "HostError: Error(Contract, #24)" });
    expect(msg).toBe("Sin liquidez por ahora, intenta en unos minutos. No se movió tu dinero.");
    expect(msg).not.toMatch(/blend|pool|token/i);
  });

  it("explains that advances need a verified identity", () => {
    expect(walletErrorMessage({ message: "Error(Contract, #23)" })).toMatch(/verificar tu identidad/);
  });
});
