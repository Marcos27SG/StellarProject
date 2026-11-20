#!/usr/bin/env bash
# End-to-end smoke test against a TESTNET deployment (default deployments/testnet.json; pass another
# file as $1, e.g. deployments/testnet-blend-smoke.json). Uses the CLI identities despensa-*; the
# seller must be verified and the buyer and seller must hold the settlement token.
#
#   A. Pay on delivery with an advance: verified seller creates a campaign with a 20% milestone and
#      posts a 100% bond -> buyer reserves (money above the 20% buffer goes to the yield pool)
#      -> sale closes -> verifier approves the advance -> buyer confirms -> seller paid, buyer gets
#      its share of the yield -> seller withdraws the bond with its yield.
#   B. Seller cancels during the sale -> buyer refunded 100% plus yield.
#   C. Seller takes an advance and vanishes -> verifier declares default -> buyer refunded 100%
#      (escrow + bond) plus yield.
#
# With the mock pool, set BUMP=1 to raise its b_rate 1% before each payout (simulated test yield,
# so the numbers are visible within minutes). Prints the resources of `buy` and
# `confirm_delivery` (simulation of the same call just before sending it).
set -euo pipefail

cd "$(dirname "$0")/.."
export PATH="$PATH:/c/Program Files (x86)/Stellar CLI"
DEP="${1:-deployments/testnet.json}"

json() { node -e "const d=JSON.parse(require('fs').readFileSync('$DEP','utf8').replace(/^﻿/,'')); console.log($1)"; }
CONTRACT=$(json d.contractId)
TOKEN=$(json d.token.contractId)
POOL=$(json "d.yieldPool && d.yieldPool.contractId || ''")
POOL_KIND=$(json "d.yieldPool && d.yieldPool.kind || 'none'")
SELLER=$(json d.accounts.seller)
VERIFIER=$(json d.accounts.verifier)
BUYER=$(json d.accounts.buyer)
UNIT=${UNIT:-10000000} # unit price in stroops (1.00 by default)

inv() { stellar contract invoke --id "$CONTRACT" --network testnet "$@" 2>/dev/null; }
view() { inv --source-account despensa-admin --send=no -- "$@"; }
balance() { stellar contract invoke --id "$TOKEN" --network testnet --source-account despensa-admin --send=no -- balance --id "$1" 2>/dev/null | tr -d '"'; }
field() { node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.parse(s)$1))"; }
usd() { node -e "console.log((Number($1)/1e7).toFixed(7))"; }

# Resources of a contract call, from simulating it (instructions, ledger reads/writes, bytes, fee).
measure() {
  local label=$1 source=$2; shift 2
  local xdr sim
  xdr=$(stellar contract invoke --id "$CONTRACT" --network testnet --source-account "$source" --build-only -- "$@" 2>/dev/null)
  sim=$(stellar tx simulate --source-account "$source" --network testnet "$xdr" 2>/dev/null)
  echo "$sim" | stellar xdr decode --type TransactionEnvelope --input single-base64 --output json 2>/dev/null | node -e "
    let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{
      const tx=JSON.parse(s).tx.tx; const d=tx.ext.v1; const r=d.resources;
      const fp=r.footprint;
      console.log('  [$label] instructions=' + r.instructions + ' disk_read_bytes=' + r.disk_read_bytes +
        ' write_bytes=' + r.write_bytes + ' read_entries=' + fp.read_only.length + ' write_entries=' + fp.read_write.length +
        ' resource_fee=' + d.resource_fee + ' stroops (' + (Number(d.resource_fee)/1e7) + ' XLM), tx_fee=' + tx.fee);
    });"
}

bump() {
  if [ "${BUMP:-0}" = "1" ] && [ "$POOL_KIND" = "mock" ]; then
    local r
    r=$(stellar contract invoke --id "$POOL" --network testnet --source-account despensa-admin --send=no -- get_reserve --asset "$TOKEN" 2>/dev/null | field .data.b_rate)
    stellar contract invoke --id "$POOL" --network testnet --source-account despensa-admin -- set_b_rate --b_rate "$(node -e "console.log((BigInt('$r')*101n/100n).toString())")" >/dev/null 2>&1
    echo "  (mock pool b_rate +1%: simulated test yield)"
  fi
}

NOW=$(date +%s)
input() { # title min max milestone_bps
  local ms='[]'
  [ "$4" != "0" ] && ms="[{\"title\":\"Compra de insumos\",\"bps\":$4}]"
  echo "{\"title\":\"$1\",\"metadata_uri\":\"ipfs://despensa-demo\",\"unit_price\":\"$UNIT\",\"min_units\":$2,\"max_units\":$3,\"sale_end\":$((NOW + 3600)),\"delivery_deadline\":$((NOW + 86400)),\"milestones\":$ms}"
}

echo "Contract $CONTRACT  pool: $POOL_KIND $POOL"
echo "> seller verified: $(view is_seller_verified --seller "$SELLER")"
S0=$(balance "$SELLER"); B0=$(balance "$BUYER")
echo "> balances before: seller $(usd "$S0")  buyer $(usd "$B0")"

echo "== A. Pay on delivery with an advance"
A=$(inv --source-account despensa-seller -- create_campaign --seller "$SELLER" --verifier "$VERIFIER" --input "$(input 'Smoke A - leche' 1 10 2000)")
echo "> campaign $A created (20% advance)"
inv --source-account despensa-seller -- add_bond --id "$A" --provider "$SELLER" --amount $((UNIT)) >/dev/null
echo "> seller posted a $(usd $UNIT) bond (100% of the advance)"
measure buy despensa-buyer buy --id "$A" --buyer "$BUYER" --units 5
inv --source-account despensa-buyer -- buy --id "$A" --buyer "$BUYER" --units 5 >/dev/null
echo "> buyer reserved 5 ($(usd $((5 * UNIT)))). Pot: $(view yield_config | field '.idle+" idle, "+JSON.parse(s).invested+" in the pool"')"
inv --source-account despensa-seller -- close_sale --id "$A" >/dev/null
inv --source-account despensa-seller -- submit_milestone --id "$A" --index 0 --evidence "ipfs://factura-insumos" >/dev/null
ADV=$(inv --source-account despensa-verifier -- approve_milestone --id "$A" --index 0 | tr -d '"')
echo "> verifier approved the advance: seller got $(usd "$ADV")"
bump
echo "> buyer's yield so far (its share on delivery): $(usd "$(view holding_yield --id "$A" --buyer "$BUYER" | tr -d '"')")"
measure confirm_delivery despensa-buyer confirm_delivery --id "$A" --buyer "$BUYER" --units 5
PAID=$(inv --source-account despensa-buyer -- confirm_delivery --id "$A" --buyer "$BUYER" --units 5 | tr -d '"')
echo "> buyer confirmed: seller received $(usd "$PAID"); buyer's yield paid: $(usd "$(view holding --id "$A" --buyer "$BUYER" | field .yield_paid)")"
BOND=$(inv --source-account despensa-seller -- withdraw_bond --id "$A" --provider "$SELLER" | tr -d '"')
echo "> seller withdrew the bond: $(usd "$BOND")"
echo "> campaign A: $(view campaign --id "$A" | field '.status+" yield_paid="+JSON.parse(s).yield_paid+" yield_loss="+JSON.parse(s).yield_loss')"

echo "== B. Seller cancels during the sale"
B=$(inv --source-account despensa-seller -- create_campaign --seller "$SELLER" --verifier "$VERIFIER" --input "$(input 'Smoke B - huevos' 5 10 0)")
inv --source-account despensa-buyer -- buy --id "$B" --buyer "$BUYER" --units 3 >/dev/null
bump
echo "> cancelled: $(inv --source-account despensa-seller -- cancel --id "$B")"
R=$(inv --source-account despensa-buyer -- claim_refund --id "$B" --buyer "$BUYER" | tr -d '"')
echo "> buyer refunded $(usd "$R") for $(usd $((3 * UNIT))) paid"

echo "== C. Advance, then default"
C=$(inv --source-account despensa-seller -- create_campaign --seller "$SELLER" --verifier "$VERIFIER" --input "$(input 'Smoke C - quesillo' 1 10 2000)")
inv --source-account despensa-seller -- add_bond --id "$C" --provider "$SELLER" --amount $((UNIT)) >/dev/null
inv --source-account despensa-buyer -- buy --id "$C" --buyer "$BUYER" --units 5 >/dev/null
inv --source-account despensa-seller -- close_sale --id "$C" >/dev/null
inv --source-account despensa-seller -- submit_milestone --id "$C" --index 0 --evidence "ipfs://factura" >/dev/null
inv --source-account despensa-verifier -- approve_milestone --id "$C" --index 0 >/dev/null
bump
inv --source-account despensa-verifier -- declare_default --id "$C" >/dev/null
echo "> defaulted: refund_per_unit $(usd "$(view campaign --id "$C" | field .refund_per_unit)")"
R=$(inv --source-account despensa-buyer -- claim_refund --id "$C" --buyer "$BUYER" | tr -d '"')
echo "> buyer refunded $(usd "$R") for $(usd $((5 * UNIT))) paid (escrow + bond + yield)"
BOND=$(inv --source-account despensa-seller -- withdraw_bond --id "$C" --provider "$SELLER" | tr -d '"')
echo "> seller gets back from the slashed bond: $(usd "$BOND") (its yield only)"

echo "== Totals"
echo "> yield_config: $(view yield_config)"
echo "> balances after: seller $(usd "$(balance "$SELLER")")  buyer $(usd "$(balance "$BUYER")")"
echo "Explorer: https://stellar.expert/explorer/testnet/contract/$CONTRACT"
