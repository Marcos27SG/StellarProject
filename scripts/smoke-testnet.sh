#!/usr/bin/env bash
# End-to-end smoke test against the TESTNET deployment in deployments/testnet.json.
# Flow: producer creates a pre-sale -> buyer buys 2 vouchers -> producer closes the sale
#       -> buyer confirms reception -> producer is paid, campaign completes.
set -euo pipefail

cd "$(dirname "$0")/.."
export PATH="$PATH:/c/Program Files (x86)/Stellar CLI"

json() { node -e "const d=require('./deployments/testnet.json'); console.log($1)"; }
CONTRACT=$(json d.contractId)
TOKEN=$(json d.token.contractId)
SELLER=$(json d.accounts.seller)
VERIFIER=$(json d.accounts.verifier)
BUYER=$(json d.accounts.buyer)

inv() { stellar contract invoke --id "$CONTRACT" --network testnet "$@" 2>/dev/null; }
balance() { stellar contract invoke --id "$TOKEN" --network testnet --source-account despensa-admin -- balance --id "$1" 2>/dev/null; }

NOW=$(date +%s)
INPUT=$(cat <<EOF
{"title":"Leche fresca Punata - 1 L","metadata_uri":"ipfs://despensa-demo","unit_price":"10000000","min_units":1,"max_units":10,"sale_end":$((NOW + 3600)),"delivery_deadline":$((NOW + 86400)),"milestones":[]}
EOF
)

echo "> seller balance before: $(balance "$SELLER")"
ID=$(inv --source-account despensa-seller -- create_campaign --seller "$SELLER" --verifier "$VERIFIER" --input "$INPUT")
echo "> created campaign $ID"

inv --source-account despensa-buyer -- buy --id "$ID" --buyer "$BUYER" --units 2 >/dev/null
echo "> buyer bought 2 vouchers (escrow holds them)"

STATUS=$(inv --source-account despensa-seller -- close_sale --id "$ID")
echo "> sale closed early by producer: $STATUS"

PAID=$(inv --source-account despensa-buyer -- confirm_delivery --id "$ID" --buyer "$BUYER" --units 2)
echo "> buyer confirmed reception, producer received: $PAID (2 units - 2% fee)"

echo "> campaign status: $(inv --source-account despensa-buyer -- campaign --id "$ID" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.parse(s).status))")"
echo "> seller balance after:  $(balance "$SELLER")"
echo "> producer reputation:   $(inv --source-account despensa-buyer -- reputation --seller "$SELLER")"
echo "Explorer: https://stellar.expert/explorer/testnet/contract/$CONTRACT"
