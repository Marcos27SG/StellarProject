<#
.SYNOPSIS
  Builds and deploys the Pacta contract (crate: despensa) to Stellar TESTNET.

.DESCRIPTION
  - Creates (or reuses) testnet identities: despensa-admin, -seller, -verifier, -buyer (funded by Friendbot).
  - Token: by default deploys a demo dollar token "DUSD" (issued by despensa-admin) so the demo can mint freely.
    Use -Token usdc to settle in Circle's testnet USDC instead (what Pollar wallets hold; get it at faucet.circle.com).
  - Deploys the contract with constructor args, allowlists despensa-verifier as a verifier,
    and writes deployments/testnet.json (public data only).
  - The dispute window must be between 1 and 30 days (86400..2592000 seconds).
  - To allow another verifier later:
      stellar contract invoke --id <contract> --source-account despensa-admin --network testnet -- set_verifier --verifier G... --allowed true

.EXAMPLE
  ./scripts/deploy-testnet.ps1
  ./scripts/deploy-testnet.ps1 -Token usdc -FeeBps 200 -DisputeWindowSeconds 259200
#>
param(
  [ValidateSet('demo', 'usdc')] [string] $Token = 'demo',
  [int] $FeeBps = 200,
  [long] $DisputeWindowSeconds = 259200
)

# The Stellar CLI prints progress to stderr; Windows PowerShell 5.1 would treat that as a
# terminating error under 'Stop', so failures are detected through $LASTEXITCODE instead.
$ErrorActionPreference = 'Continue'
$env:Path = "$env:USERPROFILE\.cargo\bin;C:\Program Files (x86)\Stellar CLI;" + $env:Path
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Circle testnet USDC (same asset Pollar enables on testnet wallets).
$USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
$USDC_SAC = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'

function Invoke-Stellar([string[]] $cliArgs) {
  $out = & stellar @cliArgs 2>$null
  if ($LASTEXITCODE -ne 0) { throw "stellar $($cliArgs -join ' ') failed" }
  return ($out | Out-String).Trim()
}

function Get-OrCreateKey([string] $name) {
  & stellar keys public-key $name 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { & stellar keys generate $name --network testnet --fund 2>$null | Out-Null }
  return Invoke-Stellar @('keys', 'public-key', $name)
}

Write-Host '> Building contract...'
& stellar contract build | Out-Null

$admin = Get-OrCreateKey 'despensa-admin'
$seller = Get-OrCreateKey 'despensa-seller'
$verifier = Get-OrCreateKey 'despensa-verifier'
$buyer = Get-OrCreateKey 'despensa-buyer'

if ($Token -eq 'demo') {
  $asset = "DUSD:$admin"
  Write-Host "> Deploying demo token $asset ..."
  & stellar contract asset deploy --asset $asset --source-account despensa-admin --network testnet --alias dusd 2>$null | Out-Null
  $tokenId = Invoke-Stellar @('contract', 'id', 'asset', '--asset', $asset, '--network', 'testnet')
  foreach ($who in 'despensa-seller', 'despensa-buyer', 'despensa-verifier') {
    & stellar tx new change-trust --source-account $who --line $asset --network testnet 2>$null | Out-Null
  }
  foreach ($to in $seller, $buyer) {
    # 1,000 DUSD (7 decimals)
    Invoke-Stellar @('contract', 'invoke', '--id', $tokenId, '--source-account', 'despensa-admin', '--network', 'testnet', '--', 'mint', '--to', $to, '--amount', '10000000000') | Out-Null
  }
}
else {
  $asset = "USDC:$USDC_ISSUER"
  $tokenId = $USDC_SAC
}

Write-Host '> Deploying the Pacta contract...'
$contractId = Invoke-Stellar @(
  'contract', 'deploy',
  '--wasm', 'target/wasm32v1-none/release/despensa.wasm',
  '--source-account', 'despensa-admin',
  '--network', 'testnet',
  '--alias', 'despensa',
  '--',
  '--admin', $admin,
  '--token', $tokenId,
  '--fee_bps', "$FeeBps",
  '--dispute_window', "$DisputeWindowSeconds"
)

# Sellers can only pick verifiers the admin has allowlisted. Allow the demo verifier.
Write-Host '> Allowlisting the demo verifier...'
Invoke-Stellar @(
  'contract', 'invoke', '--id', $contractId,
  '--source-account', 'despensa-admin', '--network', 'testnet',
  '--', 'set_verifier', '--verifier', $verifier, '--allowed', 'true'
) | Out-Null

$deployment = [ordered]@{
  network        = 'testnet'
  rpcUrl         = 'https://soroban-testnet.stellar.org'
  passphrase     = 'Test SDF Network ; September 2015'
  contractId     = $contractId
  token          = [ordered]@{ asset = $asset; contractId = $tokenId }
  feeBps         = $FeeBps
  disputeWindow  = $DisputeWindowSeconds
  accounts       = [ordered]@{ admin = $admin; seller = $seller; verifier = $verifier; buyer = $buyer }
  allowedVerifiers = @($verifier)
  deployedAt     = (Get-Date).ToUniversalTime().ToString('o')
}
New-Item -ItemType Directory -Force -Path (Join-Path $root 'deployments') | Out-Null
$deployment | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 (Join-Path $root 'deployments/testnet.json')

Write-Host ''
Write-Host "Pacta contract    : $contractId"
Write-Host "Settlement token  : $asset ($tokenId)"
Write-Host "Explorer          : https://stellar.expert/explorer/testnet/contract/$contractId"
Write-Host 'Saved to deployments/testnet.json'
