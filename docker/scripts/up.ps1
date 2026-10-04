# Start the Supabase CLI-owned local stack after bounded non-RAM preflight checks.

$ErrorActionPreference = "Stop"
$Profile = "lean"

if ($args.Count -gt 0) {
  if ($args.Count -ne 2 -or $args[0] -notin "-Profile", "--profile") {
    [Console]::Error.WriteLine("up: expected only -Profile lean|full")
    exit 2
  }
  $Profile = $args[1]
}
if ($Profile -notin "lean", "full") {
  [Console]::Error.WriteLine("up: profile must be lean or full")
  exit 2
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $here "..\..")).Path
$leanExclude = @("studio", "mailpit", "realtime", "imgproxy", "vector", "logflare", "supavisor")

& (Join-Path $here "doctor.ps1") -Profile $Profile
if ($LASTEXITCODE -ne 0) {
  Write-Output "doctor refused the start; nothing was launched"
  exit $LASTEXITCODE
}

Push-Location $repoRoot
try {
  $localWorkdir = ".scratch/local-migrations"
  $nodeRunner = Join-Path $repoRoot "scripts\run-node.ps1"
  & powershell -NoProfile -ExecutionPolicy Bypass -File $nodeRunner `
    "scripts/harness/prepare-migration-workdir.mjs" `
    --empty-reset --inventory "config/harness/migration-inventory.json" `
    --output $localWorkdir --reuse
  $prepareCode = $LASTEXITCODE
  if ($prepareCode -ne 0) {
    Write-Output "canonical migration workdir preparation failed with exit code $prepareCode"
    exit $prepareCode
  }

  $supabaseArgs = @("start", "--workdir", $localWorkdir)
  if ($Profile -eq "lean") { $supabaseArgs += @("-x", ($leanExclude -join ",")) }

  Write-Output "starting supabase ($Profile): supabase $($supabaseArgs -join ' ')"
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts\run-supabase.ps1") @supabaseArgs
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    Write-Output "supabase start failed with exit code $code; no automatic retry will run"
    exit $code
  }

  Write-Output "stack is up - remember 'pnpm db:local:down' when finished"
  exit 0
} finally {
  Pop-Location
}
