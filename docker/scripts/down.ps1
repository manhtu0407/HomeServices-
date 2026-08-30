# Stop the Supabase CLI-owned local stack without deleting its database volume.

$ErrorActionPreference = "Stop"
if ($args.Count -gt 0) {
  [Console]::Error.WriteLine("down: no arguments are accepted")
  exit 2
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $repoRoot
try {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts\run-supabase.ps1") stop
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
