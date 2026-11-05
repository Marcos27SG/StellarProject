// The bundled spec must cover everything the app calls, with the argument names it sends.
// If the contract changes, `npm run spec:sync` regenerates the spec and this test points at the
// call sites that need updating.

import { contract } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { CONTRACT_SPEC, CONTRACT_SPEC_SOURCE } from "./contract-spec";
import { config } from "./config";
import { previewCampaign, toCampaignInput, newDraft } from "./wizard";
import { getCategory } from "@/catalog";

const spec = new contract.Spec(CONTRACT_SPEC);

/** Every contract method the app calls (lib/despensa.ts reads, argsFor writes, the create wizard). */
const CALLS: Record<string, string[]> = {
  config: [],
  campaign: ["id"],
  holding: ["id", "buyer"],
  reputation: ["seller"],
  tier: ["seller"],
  buyer_stats: ["buyer"],
  bond_of: ["id", "provider"],
  is_verifier: ["verifier"],
  create_campaign: ["seller", "verifier", "input"],
  buy: ["id", "buyer", "units"],
  transfer_units: ["id", "from", "to", "units"],
  confirm_delivery: ["id", "buyer", "units"],
  dispute: ["id", "buyer"],
  finalize_delivery: ["id", "buyer"],
  rate: ["id", "buyer", "stars"],
  claim_refund: ["id", "buyer"],
  add_bond: ["id", "provider", "amount"],
  close_sale: ["id"],
  cancel: ["id"],
  submit_milestone: ["id", "index", "evidence"],
  mark_delivered: ["id", "buyer", "units"],
  approve_milestone: ["id", "index"],
  resolve_dispute: ["id", "buyer", "delivered"],
  declare_default: ["id"],
  withdraw_bond: ["id", "provider"],
  settle: ["id"],
};

function structFields(name: string): string[] {
  const entry = spec.findEntry(name);
  if (entry.type !== "scSpecEntryUdtStructV0") throw new Error(`${name} is not a struct in the spec`);
  return entry.udtStructV0.fields.map((f) => f.name.toString()).sort();
}

describe("bundled contract spec", () => {
  it("was generated from the contract the app points at", () => {
    expect(CONTRACT_SPEC_SOURCE).toBe(config.contractId);
  });

  it.each(Object.entries(CALLS))("has %s with the arguments the app sends", (method, args) => {
    const fn = spec.getFunc(method);
    expect(fn.inputs.map((i) => i.name.toString())).toEqual(args);
  });

  it("Campaign fields match what the app reads", () => {
    const sample = previewCampaign(newDraft(getCategory("dairy.milk"), new Date(), 2000), "G", 10_000, 0);
    expect(structFields("Campaign")).toEqual(Object.keys(sample).sort());
  });

  it("CampaignInput fields match what the wizard writes", () => {
    const input = toCampaignInput({ ...newDraft(getCategory("dairy.milk"), new Date(), 2000) }, "data:x");
    expect(structFields("CampaignInput")).toEqual(Object.keys(input).sort());
  });
});
