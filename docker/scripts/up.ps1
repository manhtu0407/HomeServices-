# Start the Supabase CLI-owned local stack after bounded non-RAM preflight checks.

$ErrorActionPreference = "Stop"
$Profile = "lean"
$Instance = ""
$PortBase = ""
$seenOptions = @{}

for ($index = 0; $index -lt $args.Count; $index += 2) {
  $option = $args[$index]
  if ($index + 1 -ge $args.Count -or $option -notin "-Profile", "--profile", "--instance", "--port-base" -or $seenOptions.ContainsKey($option)) {
    [Console]::Error.WriteLine("up: expected --profile lean|full and paired --instance name --port-base integer")
    exit 2
  }
  $seenOptions[$option] = $true
  switch ($option) {
    "--instance" { $Instance = $args[$index + 1] }
    "--port-base" { $PortBase = $args[$index + 1] }
    default { $Profile = $args[$index + 1] }
  }
}
if ($seenOptions.ContainsKey('--instance') -ne $seenOptions.ContainsKey('--port-base')) { exit 2 }
if ($seenOptions.ContainsKey('--instance') -and ($Instance -cnotmatch '^[a-z][a-z0-9-]{0,39}$' -or $Instance -in "production", "staging", "main", "default", "nestscout")) { exit 2 }
if ($seenOptions.ContainsKey('--port-base') -and ($PortBase -notmatch '^[0-9]{1,5}$' -or [int]$PortBase -lt 1024 -or [int]$PortBase -gt 65520)) { exit 2 }
if ($Profile -notin "lean", "full") {
  [Console]::Error.WriteLine("up: profile must be lean or full")
  exit 2
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $here "..\..")).Path
$leanExclude = @("studio", "mailpit", "realtime", "imgproxy", "vector", "logflare", "supavisor")

$doctorArgs = @("-Profile", $Profile)
if ($Instance) { $doctorArgs += @("--port-base", $PortBase) }
& (Join-Path $here "doctor.ps1") @doctorArgs
if ($LASTEXITCODE -ne 0) {
  Write-Output "doctor refused the start; nothing was launched"
  exit $LASTEXITCODE
}

Push-Location $repoRoot
try {
  $localWorkdir = ".scratch/local-migrations"
  if ($Instance) { $localWorkdir = ".scratch/local-migrations-qa-$Instance" }
  $nodeRunner = Join-Path $repoRoot "scripts\run-node.ps1"
  $instanceArgs = @()
  if ($Instance) { $instanceArgs = @("--instance", $Instance, "--port-base", $PortBase) }
  & powershell -NoProfile -ExecutionPolicy Bypass -File $nodeRunner `
    "scripts/harness/prepare-migration-workdir.mjs" `
    --empty-reset --inventory "config/harness/migration-inventory.json" `
    --output $localWorkdir --reuse --refresh-stale @instanceArgs
  $prepareCode = $LASTEXITCODE
  if ($prepareCode -ne 0) {
    Write-Output "canonical migration workdir preparation failed with exit code $prepareCode"
    exit $prepareCode
  }

  $supabaseArgs = @("start", "--workdir", $localWorkdir)
  if ($Instance) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $nodeRunner "scripts/harness/local-qa-network.mjs" --instance $Instance
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $supabaseArgs += @("--network-id", "nestscout-qa-fixture-$Instance")
    Get-ChildItem Env: | Where-Object { $_.Name -match '^(ANTHROPIC|DEEPSEEK|PERPLEXITY|OPENAI|SEPAY|VIETMAP|SENTRY|TELEGRAM)_' } | ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" }
  }
  if ($Profile -eq "lean") { $supabaseArgs += @("-x", ($leanExclude -join ",")) }

  Write-Output "starting supabase ($Profile): supabase $($supabaseArgs -join ' ')"
  if ($Instance) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $nodeRunner "scripts/harness/run-local-qa-cli.mjs" --instance $Instance --port-base $PortBase -- @supabaseArgs
  } else {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts\run-supabase.ps1") @supabaseArgs
  }
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    Write-Output "supabase start failed with exit code $code; no automatic retry will run"
    exit $code
  }
  if ($Instance) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $nodeRunner "scripts/harness/local-qa-network.mjs" --verify-instance $Instance
    if ($LASTEXITCODE -ne 0) {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts\run-supabase.ps1") stop --workdir $localWorkdir
      Write-Output "QA binding verification failed; named stop exit=$LASTEXITCODE"
      exit 1
    }
  }

  $downCommand = if ($Instance) { "pnpm db:local:down --instance $Instance" } else { "pnpm db:local:down" }
  Write-Output "stack is up - run '$downCommand' when finished"
  exit 0
} finally {
  Pop-Location
}
