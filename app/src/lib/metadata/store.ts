// MetadataStore: resolves and publishes campaign metadata behind `metadata_uri`.
//
//   data:application/json;base64,...   inline (hackathon default, stored on-chain, keep < ~1 KB)
//   https://...                         fetched + validated
//   ipfs://<cid>                        fetched through a gateway + validated (publishing is a stub)
//   anything else                       legacy plain text -> { category: "generic", description }
//
// Never throws from resolve(): failures come back as `degraded: true` with the fallback document.

import { config } from "@/lib/config";
import { fallbackMetadata, parseMetadata, type CampaignMetadata } from "./schema";

export type MetadataSource = "inline" | "https" | "ipfs" | "legacy";

export interface ResolvedMetadata {
  meta: CampaignMetadata;
  source: MetadataSource;
  /** True when the document could not be fetched or validated; render with a "detalles no disponibles" note. */
  degraded: boolean;
  error?: string;
}

export interface MetadataStore {
  resolve(uri: string): Promise<ResolvedMetadata>;
  /** Returns the string to store in `metadata_uri`. */
  publish(doc: CampaignMetadata): Promise<string>;
}

export interface MetadataAdapter {
  source: MetadataSource;
  canResolve(uri: string): boolean;
  resolve(uri: string): Promise<CampaignMetadata>;
  publish?(doc: CampaignMetadata): Promise<string>;
}

// ------------------------------------------------------------------ inline

const INLINE_PREFIX = "data:application/json;base64,";
/** Above this the document still works, but the wizard should warn (it is stored on-chain). */
export const INLINE_SOFT_LIMIT = 1024;
/** Above this publishing is refused. */
export const INLINE_HARD_LIMIT = 4096;

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Drops empty optional fields so the on-chain string stays small. */
function compact(doc: CampaignMetadata): CampaignMetadata {
  const out: Record<string, unknown> = { ...doc };
  for (const k of ["images", "documents"] as const) {
    if (Array.isArray(out[k]) && (out[k] as unknown[]).length === 0) delete out[k];
  }
  if (out.attributes && Object.keys(out.attributes as object).length === 0) delete out.attributes;
  return out as CampaignMetadata;
}

export function encodeInline(doc: CampaignMetadata): string {
  return INLINE_PREFIX + toBase64(JSON.stringify(compact(parseMetadata(doc))));
}

/** Size in bytes of the string that will be stored on-chain. */
export function inlineSize(doc: CampaignMetadata): number {
  return encodeInline(doc).length;
}

export const inlineAdapter: MetadataAdapter = {
  source: "inline",
  canResolve: (uri) => uri.startsWith(INLINE_PREFIX),
  async resolve(uri) {
    return parseMetadata(JSON.parse(fromBase64(uri.slice(INLINE_PREFIX.length))));
  },
  async publish(doc) {
    const uri = encodeInline(doc);
    if (uri.length > INLINE_HARD_LIMIT) {
      throw new Error(
        `Los detalles ocupan ${uri.length} bytes (máximo ${INLINE_HARD_LIMIT}). Acorta la descripción o usa enlaces para las fotos.`,
      );
    }
    return uri;
  },
};

// ------------------------------------------------------------------ https / ipfs

const FETCH_TIMEOUT_MS = 6000;

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export const httpsAdapter: MetadataAdapter = {
  source: "https",
  canResolve: (uri) => uri.startsWith("https://"),
  resolve: async (uri) => parseMetadata(await fetchJson(uri)),
};

/** CIDv0 (Qm…, base58) or CIDv1 (b…, base32). Anything else is not worth a network call. */
const CID_RE = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})(\/.*)?$/;

export function isValidIpfsUri(uri: string): boolean {
  return uri.startsWith("ipfs://") && CID_RE.test(uri.slice("ipfs://".length));
}

export const ipfsAdapter: MetadataAdapter = {
  source: "ipfs",
  canResolve: (uri) => uri.startsWith("ipfs://"),
  async resolve(uri) {
    if (!isValidIpfsUri(uri)) throw new Error("Identificador IPFS no válido.");
    const gateway = config.ipfsGateway.replace(/\/?$/, "/");
    return parseMetadata(await fetchJson(gateway + uri.slice("ipfs://".length)));
  },
  async publish() {
    // Stub: pinning needs a server-side key (Pinata / web3.storage). Use the inline adapter for now.
    throw new Error("Publicar en IPFS aún no está disponible. Usa los detalles en línea.");
  },
};

// ------------------------------------------------------------------ legacy

export const legacyAdapter: MetadataAdapter = {
  source: "legacy",
  canResolve: () => true,
  resolve: async (uri) => fallbackMetadata(uri.trim()),
};

// ------------------------------------------------------------------ store

export function createMetadataStore(
  adapters: MetadataAdapter[] = [inlineAdapter, httpsAdapter, ipfsAdapter, legacyAdapter],
  publisher: MetadataAdapter = inlineAdapter,
): MetadataStore {
  return {
    async resolve(uri) {
      const adapter = adapters.find((a) => a.canResolve(uri)) ?? legacyAdapter;
      try {
        return { meta: await adapter.resolve(uri), source: adapter.source, degraded: false };
      } catch (e) {
        // A plain web page (not JSON) behind an https link: keep it reachable as a link.
        const meta = fallbackMetadata();
        if (adapter.source === "https") meta.documents = [{ label: "Ver detalles del producto", url: uri }];
        return {
          meta,
          source: adapter.source,
          degraded: true,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },
    async publish(doc) {
      if (!publisher.publish) throw new Error(`El adaptador ${publisher.source} no puede publicar.`);
      return publisher.publish(doc);
    },
  };
}

export const metadataStore = createMetadataStore();

// ------------------------------------------------------------------ per-campaign cache

const cache = new Map<string, Promise<ResolvedMetadata>>();

/** Resolves a campaign's metadata once per (id, uri) and caches the promise. */
export function resolveCampaignMetadata(
  c: { id: bigint | number | string; metadata_uri: string },
  store: MetadataStore = metadataStore,
): Promise<ResolvedMetadata> {
  const key = `${c.id.toString()}|${c.metadata_uri}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = store.resolve(c.metadata_uri);
    cache.set(key, hit);
  }
  return hit;
}

export function clearMetadataCache() {
  cache.clear();
}
