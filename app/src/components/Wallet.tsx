"use client";

// Wallet abstraction: the rest of the app only talks to `useWallet()`.
// With a Pollar publishable key, users sign in with Google and Pollar signs + sponsors fees.
// Without a key the app runs read-only (useful for demos of on-chain data).

import { PollarProvider, usePollar } from "@pollar/react";
import { Copy, History, Loader2, LogOut, Wallet as WalletIcon } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { config } from "@/lib/config";
import { buildXdr, friendlyError, waitForTx } from "@/lib/despensa";
import { formatMoney, parseUsd, shortAddress } from "@/lib/format";
import { isTimeout, readinessOf, walletErrorMessage, type WalletReadiness } from "@/lib/wallet-errors";
import { Dialog, DialogSuspendContext, Notice, type TxPhase } from "./ui";

type Phase = Extract<TxPhase, "preparing" | "signing" | "confirming">;

/** `settled: false` means the network accepted the transaction but had not confirmed it yet. */
export interface Submitted {
  hash: string;
  settled: boolean;
}

/** A transaction that reached the network and failed there. Nothing moved. */
export class TxFailedError extends Error {
  constructor(public hash: string) {
    super("La red rechazó la operación.");
  }
}

/** We stopped hearing back before knowing the outcome. It may have gone through. */
export class TxUnconfirmedError extends Error {
  constructor(public hash?: string) {
    super("Sin confirmación todavía.");
  }
}

/** Whether the wallet can hold the settlement token yet. */
export type TrustlineState = "ok" | "missing" | "unknown";

interface WalletContextValue {
  enabled: boolean;
  address: string | null;
  /** null while signed out. Signing is only possible when "ready". */
  readiness: WalletReadiness | null;
  /** Spendable settlement-token balance (7-decimal integer); null until read. */
  balance: bigint | null;
  trustline: TrustlineState;
  connect: () => void;
  disconnect: () => void;
  submit: (method: string, args: Record<string, unknown>, onPhase?: (p: Phase) => void) => Promise<Submitted>;
  refreshBalance: () => void;
  /** Opens the settlement-token trustline (sponsored by the app). Returns an error message or null. */
  enableToken: () => Promise<string | null>;
  openWalletModal: () => void;
  openHistory: () => void;
}

export const READ_ONLY_REASON = "Modo demostración: ves datos reales de Stellar testnet, pero todavía no se puede reservar ni firmar.";
/** id of the one banner that explains read-only mode; disabled buttons point to it with aria-describedby. */
export const READ_ONLY_ID = "read-only-note";

const noop = () => {};
const WalletContext = createContext<WalletContextValue>({
  enabled: false,
  address: null,
  readiness: null,
  balance: null,
  trustline: "unknown",
  connect: noop,
  disconnect: noop,
  submit: async () => {
    throw new Error(READ_ONLY_REASON);
  },
  refreshBalance: noop,
  enableToken: async () => READ_ONLY_REASON,
  openWalletModal: noop,
  openHistory: noop,
});

export const useWallet = () => useContext(WalletContext);

const NOT_READY: Record<Exclude<WalletReadiness, "ready">, string> = {
  preparing: "Tu billetera se está activando en Stellar. Espera unos segundos y vuelve a intentar.",
  failed: "No se pudo activar tu billetera. Sal y vuelve a entrar.",
};

function PollarBridge({ children }: { children: ReactNode }) {
  const {
    wallet,
    verified,
    login,
    logout,
    signAndSubmitTx,
    walletBalance,
    refreshWalletBalance,
    setTrustline,
    openWalletBalanceModal,
    openTxHistoryModal,
    confirmations,
  } = usePollar();
  // Pollar's "Confirm transaction" prompt is a normal overlay; our modal dialogs step aside for it.
  const promptOpen = confirmations.length > 0;
  const address = wallet?.address ?? null;
  const readiness = readinessOf(wallet);

  const refreshBalance = useCallback(() => {
    refreshWalletBalance().catch(() => {});
  }, [refreshWalletBalance]);

  // Read the balance once the account exists on-chain, and again whenever the account changes.
  useEffect(() => {
    if (address && readiness === "ready") refreshBalance();
  }, [address, readiness, refreshBalance]);

  const { balance, trustline } = useMemo((): { balance: bigint | null; trustline: TrustlineState } => {
    if (walletBalance.step !== "loaded") return { balance: null, trustline: "unknown" };
    const rec = walletBalance.data.balances.find(
      (b) => b.code === config.tokenSymbol && (!b.issuer || b.issuer === config.tokenIssuer) && !b.trustlineRemoved,
    );
    if (!rec) return { balance: 0n, trustline: "missing" };
    return { balance: parseUsd(rec.available ?? rec.balance ?? "0") ?? 0n, trustline: "ok" };
  }, [walletBalance]);

  const submit = useCallback(
    async (method: string, args: Record<string, unknown>, onPhase?: (p: Phase) => void): Promise<Submitted> => {
      if (!address) throw new Error("Inicia sesión primero.");
      if (readiness && readiness !== "ready") throw new Error(NOT_READY[readiness]);
      if (!verified) throw new Error("Estamos confirmando tu sesión. Vuelve a intentar en un momento.");
      onPhase?.("preparing");
      const xdr = await buildXdr(method, args, address);
      onPhase?.("signing");
      let out: Awaited<ReturnType<typeof signAndSubmitTx>>;
      try {
        out = await signAndSubmitTx(xdr);
      } catch (e) {
        if (isTimeout(e)) throw new TxUnconfirmedError();
        throw e;
      }
      if (out.status === "error" && isTimeout(out)) {
        if (!out.hash) throw new TxUnconfirmedError();
        // Pollar gave up waiting but the hash exists: ask Stellar ourselves.
        onPhase?.("confirming");
        const s = await waitForTx(out.hash);
        if (s === "failed") throw new TxFailedError(out.hash);
        if (s !== "success") throw new TxUnconfirmedError(out.hash);
        refreshBalance();
        return { hash: out.hash, settled: true };
      }
      if (out.status === "success") {
        refreshBalance();
        return { hash: out.hash, settled: true };
      }
      if (out.status === "pending") {
        // Accepted, not yet in a ledger: wait for it instead of reporting success early.
        onPhase?.("confirming");
        const s = await waitForTx(out.hash);
        if (s === "failed") throw new TxFailedError(out.hash);
        refreshBalance();
        return { hash: out.hash, settled: s === "success" };
      }
      if (out.status === "cosign_pending") throw new Error("Aprueba la operación en tu otro dispositivo.");
      const err = new Error(walletErrorMessage(out));
      throw out.hash ? Object.assign(new TxFailedError(out.hash), { message: err.message }) : err;
    },
    [address, readiness, verified, signAndSubmitTx, refreshBalance],
  );

  const enableToken = useCallback(async () => {
    try {
      const out = await setTrustline({ code: config.tokenSymbol, issuer: config.tokenIssuer });
      if (out.status !== "success") return walletErrorMessage(out as Parameters<typeof walletErrorMessage>[0]);
      refreshBalance();
      return null;
    } catch (e) {
      return walletErrorMessage({ message: friendlyError(e) });
    }
  }, [setTrustline, refreshBalance]);

  const value = useMemo<WalletContextValue>(
    () => ({
      enabled: true,
      address,
      readiness,
      balance,
      trustline,
      connect: () => login({ provider: "google" }),
      disconnect: logout,
      submit,
      refreshBalance,
      enableToken,
      openWalletModal: openWalletBalanceModal,
      openHistory: openTxHistoryModal,
    }),
    [address, readiness, balance, trustline, login, logout, submit, refreshBalance, enableToken, openWalletBalanceModal, openTxHistoryModal],
  );
  return (
    <WalletContext.Provider value={value}>
      <DialogSuspendContext.Provider value={promptOpen}>{children}</DialogSuspendContext.Provider>
    </WalletContext.Provider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  if (!config.pollarKey) return <>{children}</>;
  return (
    // Submit waits up to 90 s (SDK default 30 s): testnet contract calls signed and sent by Pollar
    // have taken longer than 30 s, and the SDK reported a timeout for a call that had succeeded.
    <PollarProvider client={{ apiKey: config.pollarKey, stellarNetwork: config.network, submitTimeoutMs: 90_000 }}>
      <PollarBridge>{children}</PollarBridge>
    </PollarProvider>
  );
}

/**
 * Runs a contract call and exposes its phase for TxSteps. `onDone` runs once it is confirmed or pending,
 * and again if a pending one is confirmed later.
 *
 * "Pendiente" and "Sin confirmar" with a hash keep being checked while this screen is open and the tab
 * is visible, so they turn into "Completado" (or "Falló") by themselves; that is what the Pendiente
 * message promises. `failedAt` is the step that was running when it failed, for the stepper.
 */
export function useAction() {
  const { submit, refreshBalance } = useWallet();
  const [state, setState] = useState<{ phase: TxPhase; error?: string; hash?: string; failedAt?: TxPhase }>({ phase: "idle" });
  const onDoneRef = useRef<(() => void) | undefined>(undefined);

  const run = useCallback(
    async (method: string, args: Record<string, unknown>, onDone?: () => void) => {
      onDoneRef.current = onDone;
      let last: TxPhase = "preparing";
      setState({ phase: "preparing" });
      try {
        const r = await submit(method, args, (phase) => {
          last = phase;
          setState({ phase });
        });
        setState({ phase: r.settled ? "done" : "pending", hash: r.hash });
        onDone?.();
        return true;
      } catch (e) {
        if (e instanceof TxUnconfirmedError) {
          // Not a failure: refresh what the caller shows so a change that did land appears.
          setState({ phase: "unconfirmed", hash: e.hash });
          onDone?.();
          return false;
        }
        setState({ phase: "error", error: friendlyError(e), hash: e instanceof TxFailedError ? e.hash : undefined, failedAt: last });
        return false;
      }
    },
    [submit],
  );

  // Keep checking a pending transaction while the screen is open.
  const { phase, hash } = state;
  useEffect(() => {
    if ((phase !== "pending" && phase !== "unconfirmed") || !hash) return;
    let stop = false;
    (async () => {
      while (!stop) {
        if (document.visibilityState === "visible") {
          const s = await waitForTx(hash, 20_000);
          if (stop) return;
          if (s === "success") {
            setState({ phase: "done", hash });
            refreshBalance();
            onDoneRef.current?.();
            return;
          }
          if (s === "failed") {
            setState({ phase: "error", error: "La red rechazó la operación.", hash, failedAt: "confirming" });
            return;
          }
        }
        await new Promise((r) => setTimeout(r, 5_000));
      }
    })();
    return () => {
      stop = true;
    };
  }, [phase, hash, refreshBalance]);

  const reset = useCallback(() => setState({ phase: "idle" }), []);
  const busy = state.phase === "preparing" || state.phase === "signing" || state.phase === "confirming";
  return { ...state, busy, run, reset };
}

/** Props for a button that is disabled because the app is read-only: points to the banner. */
export function readOnlyProps(enabled: boolean) {
  return enabled ? {} : { disabled: true, "aria-describedby": READ_ONLY_ID };
}

export function WalletButton() {
  const { enabled, address, readiness, balance, connect } = useWallet();
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  if (!address) {
    return (
      <button onClick={connect} className="btn btn-sm rounded-full">
        Entrar<span className="hidden sm:inline"> con Google</span>
      </button>
    );
  }
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line-strong px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2"
        aria-haspopup="dialog"
      >
        {readiness === "preparing" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <WalletIcon className="size-4" aria-hidden />
        )}
        <span className="tabular-nums">{balance === null ? shortAddress(address) : formatMoney(balance)}</span>
        <span className="sr-only">: tu cuenta</span>
      </button>
      <AccountDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function AccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { address, balance, disconnect, openWalletModal, openHistory } = useWallet();
  const [copied, setCopied] = useState(false);
  if (!address) return null;
  const copy = () => {
    navigator.clipboard?.writeText(address).then(() => setCopied(true), () => {});
  };
  // Pollar's own modals stack above ours; close ours first so focus lands in theirs.
  const thenClose = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <Dialog open={open} onClose={onClose} title="Tu cuenta">
      <div className="space-y-4">
        <div>
          <p className="text-sm text-ink-2">Saldo disponible</p>
          <p className="text-2xl font-semibold tabular-nums">
            {balance === null ? "…" : formatMoney(balance)} <span className="text-base text-ink-2">{config.tokenSymbol}</span>
          </p>
        </div>
        <div>
          <p className="text-sm text-ink-2">Dirección en Stellar (testnet)</p>
          <button type="button" onClick={copy} className="mt-1 inline-flex max-w-full items-center gap-2 rounded-sm bg-surface-2 px-3 py-2 text-left font-mono text-xs break-all">
            {address}
            <Copy className="size-4 shrink-0" aria-hidden />
          </button>
          <p className="mt-1 text-xs text-ink-2" role="status">
            {copied ? "Copiada." : ""}
          </p>
        </div>
        <TokenSetup />
        <div className="grid gap-2">
          <button type="button" className="btn btn-secondary w-full justify-start gap-2" onClick={thenClose(openWalletModal)}>
            <WalletIcon className="size-4" aria-hidden /> Ver billetera
          </button>
          <button type="button" className="btn btn-secondary w-full justify-start gap-2" onClick={thenClose(openHistory)}>
            <History className="size-4" aria-hidden /> Movimientos
          </button>
          <button type="button" className="btn btn-secondary w-full justify-start gap-2" onClick={thenClose(disconnect)}>
            <LogOut className="size-4" aria-hidden /> Salir
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * What a signed-in user must do before they can pay: wait for activation, open the USDC trustline,
 * or get test USDC. Renders nothing once the wallet is ready and funded.
 */
export function TokenSetup({ compact = false }: { compact?: boolean }) {
  const { enabled, address, readiness, balance, trustline, enableToken, refreshBalance } = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!enabled || !address) return null;

  if (readiness === "preparing") {
    return <Notice tone="info" icon={Loader2} title="Activando tu billetera">Pollar está creando tu cuenta en Stellar. Tarda unos segundos.</Notice>;
  }
  if (readiness === "failed") {
    return <Notice tone="danger" title="No se pudo activar tu billetera">Sal y vuelve a entrar. Si sigue, avísanos.</Notice>;
  }
  if (trustline === "missing") {
    const enable = async () => {
      setBusy(true);
      setError(await enableToken());
      setBusy(false);
    };
    return (
      <Notice
        tone="warning"
        title={`Activa ${config.tokenSymbol} en tu billetera`}
        action={
          <button type="button" className="btn btn-sm" onClick={enable} disabled={busy}>
            {busy ? "Activando…" : "Activar"}
          </button>
        }
      >
        Tu billetera todavía no acepta {config.tokenSymbol}. Activarlo es gratis.
        {error && <span className="mt-1 block text-danger">{error}</span>}
      </Notice>
    );
  }
  if (balance === 0n) {
    return (
      <Notice
        tone="info"
        title={`Tu billetera no tiene ${config.tokenSymbol}`}
        action={
          <button type="button" className="btn btn-sm btn-secondary" onClick={refreshBalance}>
            Ya cargué
          </button>
        }
      >
        {compact ? (
          <>
            Consigue {config.tokenSymbol} de prueba en{" "}
            <a className="underline" href={config.faucetUrl} target="_blank" rel="noreferrer">
              faucet.circle.com
            </a>
            .
          </>
        ) : (
          <>
            En{" "}
            <a className="underline" href={config.faucetUrl} target="_blank" rel="noreferrer">
              faucet.circle.com
            </a>{" "}
            elige <b>Stellar Testnet</b>, pega tu dirección y pide {config.tokenSymbol} de prueba (sin valor real).
          </>
        )}
      </Notice>
    );
  }
  return null;
}
