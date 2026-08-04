# Stop the local Supabase stack.
# Every 'up' in the docs has a matching 'down'. Leaving containers running
# overnight on a 16 GB machine is a real cost, not a cosmetic one.

[CmdletBinding()]
param(
  # The CLI keeps the database volume by default so a restart is fast.
  # Pass -Purge to drop it and reclaim the disk.
  [switch]$Purge
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $here "..\..")).Path

Push-Location $repoRoot
try {
  $supabaseArgs = @("stop")
  if ($Purge) { $supabaseArgs += "--no-backup" }

  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts\run-supabase.ps1") @supabaseArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
