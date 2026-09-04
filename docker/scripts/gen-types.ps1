# Regenerate the shared database types from the running local schema.
#
# Writes through a temp file and compares first. A difference against the
# committed file is real schema drift and worth reading before it is accepted,
# so -Check reports it without overwriting.

$ErrorActionPreference = "Stop"
$Check = $false
foreach ($argument in $args) {
  if ($argument -in "-Check", "--check") {
    $Check = $true
  } else {
    [Console]::Error.WriteLine("gen-types: unknown argument '$argument'")
    exit 2
  }
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $here "..\..")).Path
$target = Join-Path $repoRoot "packages\shared\src\types\database"
$splitter = Join-Path $repoRoot "scripts\split-database-types.mjs"
$temp = Join-Path ([System.IO.Path]::GetTempPath()) "nestscout-database.types.$([guid]::NewGuid().ToString('N')).ts"

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

  # The artifact is stored split across $target. The splitter's --check-against rejoins that
  # tree and compares it to the freshly generated file, so this check is byte-for-byte on the
  # whole artifact exactly as it was when the artifact was one file.
  if (-not (Test-Path $target)) {
    Write-Output "no committed types at $target; splitting generated output"
    & node $splitter --write $temp
    exit $LASTEXITCODE
  }

  & node $splitter --check-against $temp
  if ($LASTEXITCODE -eq 0) {
    Write-Output "database types match the local schema - no drift"
    exit 0
  }

  Write-Output "DRIFT: generated types differ from the committed split tree"
  Write-Output "  committed : $target"
  Write-Output "  generated : $temp"

  if ($Check) {
    Write-Output "check mode - committed files left untouched"
    exit 1
  }

  & node $splitter --write $temp
  Write-Output "committed files overwritten. Review the diff before accepting it."
  exit $LASTEXITCODE
} finally {
  Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
  Pop-Location
}
