<#
.SYNOPSIS
  Builds and deploys the Ayni contract (crate: despensa) to Stellar TESTNET.

.DESCRIPTION
  - Creates (or reuses) testnet identities: despensa-admin, -seller, -verifier, -buyer, -treasury
    (funded by Friendbot).
  - Token: by default deploys a demo dollar token "DUSD" (issued by despensa-admin) so the demo can mint freely.
    Use -Token usdc to settle in Circle's testnet USDC instead (what Pollar wallets hold; get it at faucet.circle.com).
    Use -Token blend to settle in Blend's own testnet USDC (only for a smoke test against Blend's real pool).
  - Yield pool (fixed for good at deploy, see docs/DESIGN.md 5.2):
      -YieldPool mock     deploys contracts/mock-yield at -MockAprBps for the chosen token ("rendimiento de prueba")
      -YieldPool blend    Blend's TestnetV2 pool (only lists Blend's own test USDC: use with -Token blend)
      -YieldPool none     no yield
      -YieldPool C...     any pool contract with the Blend v2 interface that lists the token
  - Deploys the contract with constructor args (no fee: Ayni's only lever is a share of yield, 0 by default),
    allowlists despensa-verifier, marks despensa-seller as an identity-verified seller (demo only),
    and writes deployments/<Out>.json (public data only).
  - The dispute window must be between 1 and 30 days (86400..2592000 seconds).
  - To allow another verifier later:
      stellar contract invoke --id <contract> --source-account despensa-admin --network testnet -- set_verifier --verifier G... --allowed true

.EXAMPLE
  ./scripts/deploy-testnet.ps1 -Token usdc -YieldPool mock
  ./scripts/deploy-testnet.ps1 -Token blend -YieldPool blend -Out testnet-blend-smoke
#>
param(
  [ValidateSet('demo', 'usdc', 'blend')] [string] $Token = 'demo',
  [string] $YieldPool = 'mock',
  [int] $MockAprBps = 1000,
  [long] $DisputeWindowSeconds = 259200,
  [string] $Out = 'testnet'
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
# Blend's testnet USDC and pool (github.com/blend-capital/blend-utils, testnet.contracts.json).
$BLEND_USDC_ISSUER = 'GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56'
$BLEND_USDC_SAC = 'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU'
$BLEND_POOL = 'CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF'

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

Write-Host '> Building contracts...'
& stellar contract build | Out-Null

$admin = Get-OrCreateKey 'despensa-admin'
$seller = Get-OrCreateKey 'despensa-seller'
$verifier = Get-OrCreateKey 'despensa-verifier'
$buyer = Get-OrCreateKey 'despensa-buyer'
$treasury = Get-OrCreateKey 'despensa-treasury'

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
elseif ($Token -eq 'blend') {
  $asset = "USDC:$BLEND_USDC_ISSUER"
  $tokenId = $BLEND_USDC_SAC
}
else {
  $asset = "USDC:$USDC_ISSUER"
  $tokenId = $USDC_SAC
}

$poolKind = $YieldPool
$poolId = $null
switch ($YieldPool) {
  'none' { $poolId = $null }
  'blend' { $poolId = $BLEND_POOL }
  'mock' {
    Write-Host "> Deploying the mock yield pool ($MockAprBps bps a year, test yield only)..."
    $poolId = Invoke-Stellar @(
      'contract', 'deploy',
      '--wasm', 'target/wasm32v1-none/release/mock_yield.wasm',
      '--source-account', 'despensa-admin', '--network', 'testnet',
      '--alias', "$Out-mock-yield",
      '--', '--admin', $admin, '--asset', $tokenId, '--apr_bps', "$MockAprBps"
    )
  }
  default { $poolKind = 'custom'; $poolId = $YieldPool }
}

Write-Host '> Deploying the Ayni contract...'
$deployArgs = @(
  'contract', 'deploy',
  '--wasm', 'target/wasm32v1-none/release/despensa.wasm',
  '--source-account', 'despensa-admin',
  '--network', 'testnet',
  '--alias', $(if ($Out -eq 'testnet') { 'despensa' } else { $Out }),
  '--',
  '--admin', $admin,
  '--token', $tokenId,
  '--treasury', $treasury,
  '--dispute_window', "$DisputeWindowSeconds"
)
if ($poolId) {
  # Option<Address> is a JSON argument ("C..."). Windows PowerShell 5.1 strips unescaped quotes
  # from native arguments, so there they must be written as \"; PowerShell 7.3+ passes them as is.
  $q = if ($PSVersionTable.PSVersion.Major -lt 7) { '\"' } else { '"' }
  $deployArgs += @('--yield_pool', "$q$poolId$q")
}
$contractId = Invoke-Stellar $deployArgs

# Sellers can only pick verifiers the admin has allowlisted. Allow the demo verifier.
Write-Host '> Allowlisting the demo verifier...'
Invoke-Stellar @(
  'contract', 'invoke', '--id', $contractId,
  '--source-account', 'despensa-admin', '--network', 'testnet',
  '--', 'set_verifier', '--verifier', $verifier, '--allowed', 'true'
) | Out-Null

# Demo only: the CLI seller passed the (off-chain) identity check, so it can ask for advances.
Write-Host '> Marking the demo seller as verified...'
Invoke-Stellar @(
  'contract', 'invoke', '--id', $contractId,
  '--source-account', 'despensa-verifier', '--network', 'testnet',
  '--', 'set_seller_verified', '--caller', $verifier, '--seller', $seller, '--verified', 'true'
) | Out-Null

$deployment = [ordered]@{
  network          = 'testnet'
  rpcUrl           = 'https://soroban-testnet.stellar.org'
  passphrase       = 'Test SDF Network ; September 2015'
  contractId       = $contractId
  token            = [ordered]@{ asset = $asset; contractId = $tokenId }
  treasury         = $treasury
  yieldPool        = [ordered]@{ kind = $poolKind; contractId = $poolId; aprBps = $(if ($poolKind -eq 'mock') { $MockAprBps } else { $null }) }
  liquidBps        = 2000
  buyerYieldBps    = 5000
  protocolYieldBps = 0
  disputeWindow    = $DisputeWindowSeconds
  accounts         = [ordered]@{ admin = $admin; seller = $seller; verifier = $verifier; buyer = $buyer; treasury = $treasury }
  allowedVerifiers = @($verifier)
  verifiedSellers  = @($seller)
  deployedAt       = (Get-Date).ToUniversalTime().ToString('o')
}
New-Item -ItemType Directory -Force -Path (Join-Path $root 'deployments') | Out-Null
$deployment | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 (Join-Path $root "deployments/$Out.json")

Write-Host ''
Write-Host "Ayni contract     : $contractId"
Write-Host "Settlement token  : $asset ($tokenId)"
Write-Host "Yield pool        : $poolKind $poolId"
Write-Host "Explorer          : https://stellar.expert/explorer/testnet/contract/$contractId"
Write-Host "Saved to deployments/$Out.json"
if ($poolKind -eq 'mock') {
  Write-Host 'The mock pays yield from its own balance: send it a little of the token (a plain transfer).'
}
Write-Host 'Remember: add the new contract ID to Pollar (Wallets > Sponsored fees > contract rules).'
