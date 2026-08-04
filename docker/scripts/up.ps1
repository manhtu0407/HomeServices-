# Start the local Supabase stack behind the preflight gate.
# This is a wrapper around the Supabase CLI, not a second implementation:
# the CLI owns its containers, and hand-rolling a compose file for them would
# drift from whatever version the workspace CLI pins.

[CmdletBinding()]
param(
  [ValidateSet("lean", "full")]
  [string]$Profile = "lean",
  [double]$MinRamGb = 4,
  [switch]$SkipDoctor
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $here "..\..")).Path

# Excluded on the lean profile. Kept as one list so the profile docs and this
# script cannot drift; the CLI rejects unknown names loudly rather than
# silently ignoring them, which is the behavior we want if a name is stale.
$leanExclude = @(
  "studio",
  "inbucket",
  "realtime",
  "imgproxy",
  "vector",
  "logflare",
  "supavisor"
)

if (-not $SkipDoctor) {
  & (Join-Path $here "doctor.ps1") -MinRamGb $MinRamGb
  if ($LASTEXITCODE -ne 0) {
    Write-Output "doctor refused the start; nothing was launched"
    exit 1
  }
}

Push-Location $repoRoot
try {
  $supabaseArgs = @("start")
  if ($Profile -eq "lean") {
    $supabaseArgs += @("-x", ($leanExclude -join ","))
  }

  Write-Output "starting supabase ($Profile): supabase $($supabaseArgs -join ' ')"
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts\run-supabase.ps1") @supabaseArgs
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    Write-Output "supabase start failed with exit code $code"
    exit $code
  }
  Write-Output "stack is up - remember 'pnpm db:local:down' when finished"
} finally {
  Pop-Location
}
