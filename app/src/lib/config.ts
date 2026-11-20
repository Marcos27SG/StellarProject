// Public runtime configuration (all values are safe to expose in the browser).
// Defaults point at the testnet deployment in ../deployments/testnet.json.

export const config = {
  contractId:
    process.env.NEXT_PUBLIC_DESPENSA_CONTRACT_ID ??
    "CDDIJ4LNQ3OR2XR5MM36L552FXMBLXXNNJDWJUWA5M57E6LPRRKWG66X",
  rpcUrl: process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org",
  networkPassphrase:
    process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015",
  network: (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet") as "testnet" | "mainnet",
  /** Symbol shown for the settlement token (USDC; DUSD on a demo-token deployment). */
  tokenSymbol: process.env.NEXT_PUBLIC_TOKEN_SYMBOL ?? "USDC",
  /** Issuer of the settlement token (Circle testnet USDC); used to open its trustline in Pollar wallets. */
  tokenIssuer:
    process.env.NEXT_PUBLIC_TOKEN_ISSUER ?? "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  /** Where testers get test USDC. */
  faucetUrl: "https://faucet.circle.com",
  /** Display-only exchange rate (BCB reference ~Bs 12 per US$, Nov 2026). */
  bobPerUsd: Number(process.env.NEXT_PUBLIC_BOB_PER_USD ?? "12"),
  pollarKey: process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY ?? "",
  explorer: "https://stellar.expert/explorer/testnet",
  /**
   * Where a seller asks for the identity check that unlocks advances (a WhatsApp number and/or an
   * email of the verifier or of Ayni). The check happens off-chain; the app stores no documents.
   */
  verifyWhatsapp: process.env.NEXT_PUBLIC_VERIFY_WHATSAPP ?? "",
  verifyEmail: process.env.NEXT_PUBLIC_VERIFY_EMAIL ?? "",
  /** Gateway used to read ipfs:// campaign metadata. */
  ipfsGateway: process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "https://ipfs.io/ipfs/",
};

export const TOKEN_DECIMALS = 7;
