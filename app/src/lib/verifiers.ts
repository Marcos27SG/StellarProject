// Verifiers the create wizard offers as one-tap choices, so producers don't paste a 56-character
// address. On testnet that's the deployment's verifier account (deployments/testnet.json), labeled
// as a test account. Real associations can be added with NEXT_PUBLIC_KNOWN_VERIFIERS, a JSON array:
//   [{"address":"G…","name":"Asociación de Lecheros de Punata","note":"…","categories":["dairy.milk"]}]

import { config } from "./config";

export interface KnownVerifier {
  address: string;
  name: string;
  note?: string;
  /** Category ids this verifier covers. Omitted = all. */
  categories?: string[];
}

const TESTNET: KnownVerifier[] = [
  {
    address: "GDVZDGLLY2COW6VGW6GT5A47KWHWNVIE3YQ2THQV6IZWTSCR6DISG2AN",
    name: "Verificador de prueba de Ayni",
    note: "Cuenta de demostración en testnet. En producción sería una asociación o cooperativa.",
  },
];

function fromEnv(): KnownVerifier[] {
  try {
    const raw = process.env.NEXT_PUBLIC_KNOWN_VERIFIERS;
    if (!raw) return [];
    const list = JSON.parse(raw) as KnownVerifier[];
    return Array.isArray(list) ? list.filter((v) => typeof v?.address === "string" && typeof v?.name === "string") : [];
  } catch {
    return [];
  }
}

export const KNOWN_VERIFIERS: KnownVerifier[] = [...fromEnv(), ...(config.network === "testnet" ? TESTNET : [])];

export function verifiersFor(categoryId: string, exclude?: string | null): KnownVerifier[] {
  return KNOWN_VERIFIERS.filter((v) => (!v.categories || v.categories.includes(categoryId)) && v.address !== exclude);
}
