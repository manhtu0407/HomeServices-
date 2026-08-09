# Regenerate the shared database types from the running local schema.
#
# Writes through a temp file and compares first. A difference against the
# committed file is real schema drift and worth reading before it is accepted,
# so -Check reports it without overwriting.

[CmdletBinding()]
param(
  [switch]$Check
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $here "..\..")).Path
$target = Join-Path $repoRoot "packages\shared\src\types\database.types.ts"
$temp = Join-Path ([System.IO.Path]::GetTempPath()) "nestscout-database.types.ts"

Push-Location $repoRoot
try {
  $generated = & powershell -NoProfile -ExecutionPolicy Bypass `
    -File (Join-Path $repoRoot "scripts\run-supabase.ps1") gen types typescript --local
  if ($LASTEXITCODE -ne 0) {
    Write-Output "supabase gen types failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
  }

  # The CLI writes to stdout; normalize to LF so the comparison is not defeated
  # by PowerShell's CRLF handling on the way through.
  $text = ($generated -join "`n") -replace "`r`n", "`n"
  [System.IO.File]::WriteAllText($temp, $text)

  if (-not (Test-Path $target)) {
    Write-Output "no committed types at $target; writing generated output"
    Copy-Item $temp $target -Force
    exit 0
  }

  $existing = ([System.IO.File]::ReadAllText($target)) -replace "`r`n", "`n"
  if ($existing -eq $text) {
    Write-Output "database.types.ts matches the local schema - no drift"
    exit 0
  }

  Write-Output "DRIFT: generated types differ from the committed database.types.ts"
  Write-Output "  committed : $target"
  Write-Output "  generated : $temp"

  if ($Check) {
    Write-Output "check mode - committed file left untouched"
    exit 1
  }

  Copy-Item $temp $target -Force
  Write-Output "committed file overwritten. Review the diff before accepting it."
  exit 0
} finally {
  Pop-Location
}
