# Type-check the canonical Edge functions in the pinned Deno container.

$ErrorActionPreference = "Stop"
$Only = @()
for ($index = 0; $index -lt $args.Count; $index++) {
  if ($args[$index] -notin "-Only", "--only" -or $index + 1 -ge $args.Count) {
    [Console]::Error.WriteLine("edge-check: expected only repeated --only <function> arguments")
    exit 2
  }
  $index += 1
  $Only += $args[$index]
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$canonicalFunctions = @(
  "kael-learning-monitor",
  "kael-matching-maintainer",
  "kael-media-retention",
  "mobile-api",
  "payment-maintainer",
  "sepay-webhook"
)

$unknown = @($Only | Where-Object { $_ -notin $canonicalFunctions } | Sort-Object -Unique)
if ($unknown.Count -gt 0) {
  [Console]::Error.WriteLine("edge-check: unknown function(s): $($unknown -join ', ')")
  exit 2
}

$functions = if ($Only.Count -gt 0) {
  @($canonicalFunctions | Where-Object { $_ -in $Only })
} else {
  @($canonicalFunctions)
}
if ($functions.Count -eq 0) {
  [Console]::Error.WriteLine("edge-check: no Edge functions selected")
  exit 2
}

$missing = @()
foreach ($fn in $functions) {
  $config = Join-Path $repoRoot "supabase\functions\$fn\deno.json"
  $entry = Join-Path $repoRoot "supabase\functions\$fn\index.ts"
  if (-not (Test-Path -LiteralPath $config) -or -not (Test-Path -LiteralPath $entry)) {
    $missing += $fn
  }
}
if ($missing.Count -gt 0) {
  Write-Output "edge-check: missing deno.json or index.ts for $($missing -join ', ')"
  Write-Output "edge check: discovered=$($canonicalFunctions.Count) selected=$($functions.Count) checked=0 failed=$($missing.Count)"
  exit 2
}

Push-Location $repoRoot
try {
  & docker compose pull --policy missing deno
  if ($LASTEXITCODE -ne 0) {
    Write-Output "Deno image pull failed; no automatic retry will run."
    Write-Output "edge check: discovered=$($canonicalFunctions.Count) selected=$($functions.Count) checked=0 failed=0"
    exit 1
  }

  $failed = @()
  $checked = 0
  foreach ($fn in $functions) {
    $config = "supabase/functions/$fn/deno.json"
    $entry = "supabase/functions/$fn/index.ts"
    Write-Output "check $fn"
    & docker compose run --rm --pull never deno check --config $config $entry
    $checked += 1
    if ($LASTEXITCODE -ne 0) { $failed += $fn }
  }

  Write-Output ""
  Write-Output "edge check: discovered=$($canonicalFunctions.Count) selected=$($functions.Count) checked=$checked failed=$($failed.Count)"
  if ($failed.Count -gt 0) {
    Write-Output "failed functions: $($failed -join ', ')"
    exit 1
  }
  exit 0
} finally {
  Pop-Location
}
