# Type-check the Edge functions in the pinned Deno container.
#
# Each function carries its own deno.json with the import map. Running
# `deno check` without --config resolves the bare specifiers as plain npm names
# and produces a flood of phantom errors, so --config is embedded here rather
# than left to the caller to remember.
#
# map-proxy-spike is intentionally absent: it has no deno.json to check against.

[CmdletBinding()]
param(
  [string[]]$Only
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $here "..\..")).Path

$functions = @(
  "kael-learning-monitor",
  "kael-media-retention",
  "mobile-api",
  "sepay-webhook"
)

if ($Only) { $functions = $functions | Where-Object { $_ -in $Only } }

Push-Location $repoRoot
try {
  $failed = @()
  foreach ($fn in $functions) {
    $config = "supabase/functions/$fn/deno.json"
    $entry = "supabase/functions/$fn/index.ts"

    if (-not (Test-Path (Join-Path $repoRoot $config))) {
      Write-Output "SKIP  $fn (no deno.json)"
      continue
    }

    Write-Output "check $fn"
    & docker compose run --rm deno check --config $config $entry
    if ($LASTEXITCODE -ne 0) { $failed += $fn }
  }

  Write-Output ""
  if ($failed.Count -gt 0) {
    Write-Output "edge check failed: $($failed -join ', ')"
    exit 1
  }
  Write-Output "edge check passed: $($functions.Count) function(s)"
  exit 0
} finally {
  Pop-Location
}
