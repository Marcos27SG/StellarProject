// Checks the Pollar publishable key in .env.local against Pollar's SDK API, the way the browser
// calls it (with an Origin header), and prints what the dashboard has configured for the app.
//
//   npm run pollar:check                          # origin http://localhost:3000
//   npm run pollar:check -- http://localhost:3001
//
// Prints only the key's prefix, never the key.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envPath = fileURLToPath(new URL("../.env.local", import.meta.url));
const origin = process.argv[2] ?? "http://localhost:3000";

let key = "";
try {
  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY="));
  key = (line ?? "").split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
} catch {
  console.error(`✗ ${envPath} not found. Copy .env.example to .env.local in the app folder.`);
  process.exit(1);
}
if (!key) {
  console.error("✗ NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY is empty in .env.local (is the file saved?).");
  process.exit(1);
}
const prefix = key.match(/^(pub|sec)_(testnet|mainnet)_/)?.[0];
if (!prefix) console.warn("! The key does not start with pub_testnet_ or pub_mainnet_.");
if (prefix?.startsWith("sec_")) {
  console.error("✗ That is a SECRET key. It must never be in a NEXT_PUBLIC_ variable. Use the publishable key.");
  process.exit(1);
}
console.log(`Key ${prefix ?? "?"}…  origin ${origin}`);

const res = await fetch("https://sdk.api.pollar.xyz/v3/applications/config", {
  headers: { "x-pollar-api-key": key, Origin: origin },
});
const body = await res.json().catch(() => ({}));

const HINTS = {
  ORIGIN_NOT_ALLOWED: `Add ${origin} under Developers > Websites > Allowed origins (and Allowed redirect URIs).`,
  API_KEY_NOT_FOUND: "The key does not exist or was revoked. Create one under Developers > API keys.",
  API_KEY_EXPIRED: "The key expired. Create a new one under Developers > API keys.",
};
if (!res.ok || body.success === false) {
  console.error(`✗ ${res.status} ${body.code ?? ""}`);
  if (HINTS[body.code]) console.error(`  ${HINTS[body.code]}`);
  process.exit(1);
}

console.log(`✓ ${res.status} Pollar accepts this key from ${origin}.`);
// The config shape is not documented field by field; print it compactly so it can be eyeballed.
console.log(JSON.stringify(body.content ?? body, null, 2).slice(0, 4000));
