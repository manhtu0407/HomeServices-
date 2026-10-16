# Stop the Supabase CLI-owned local stack without deleting its database volume.

$ErrorActionPreference = "Stop"
$Instance = ""
if ($args.Count -gt 0 -and ($args.Count -ne 2 -or $args[0] -ne "--instance")) {
  [Console]::Error.WriteLine("down: expected no arguments or --instance name")
  exit 2
}
if ($args.Count -eq 2) { $Instance = $args[1] }
if ($args.Count -eq 2 -and ($Instance -cnotmatch '^[a-z][a-z0-9-]{0,39}$' -or $Instance -in "production", "staging", "main", "default", "nestscout")) { exit 2 }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $repoRoot
try {
  $targetArgs = @()
  if ($Instance) {
    $localWorkdir = ".scratch/local-migrations-qa-$Instance"
    $configPath = Join-Path $localWorkdir "supabase/config.toml"
    if (-not (Test-Path -LiteralPath $configPath)) { exit 2 }
    $config = Get-Content -LiteralPath $configPath -Raw
    if ($config -notmatch "(?m)^project_id\s*=\s*`"nestscout-qa-$Instance`"\s*$") { exit 2 }
    $targetArgs = @("--workdir", $localWorkdir)
  }
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts\run-supabase.ps1") stop @targetArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
