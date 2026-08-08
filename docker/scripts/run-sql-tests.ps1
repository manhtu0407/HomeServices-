# Execute the SQL verification scripts against the running local database.
#
# These scripts self-assert with 'raise exception' and most wrap themselves in
# begin/rollback, so they run directly under psql - no pgTAP harness needed.
# psql already lives inside the postgres container, so this costs no extra image.
#
# A red file here is a result, not a crash: several of these have never been
# executed before. The runner reports honest pass/fail counts and never swallows
# an error message.

[CmdletBinding()]
param(
  [string]$Container = "supabase_db_nestscout",
  [string]$Filter = "*.sql",
  [switch]$StopOnFirstFailure,
  [string]$DbUser = "postgres",
  [string]$DblinkDbUser = "supabase_admin",
  [string]$DbPassword = ""
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $here "..\..")).Path
$testDir = Join-Path $repoRoot "supabase\tests"

if (-not (Test-Path $testDir)) {
  Write-Output "no supabase/tests directory at $testDir"
  exit 1
}

# The container must already be up; starting it here would hide the fact that
# a caller skipped the doctor gate.
$running = & docker ps --filter "name=$Container" --format "{{.Names}}" 2>&1
if ($LASTEXITCODE -ne 0 -or -not ($running -match [regex]::Escape($Container))) {
  Write-Output "container '$Container' is not running. Run 'pnpm db:local:up' first."
  exit 1
}

# psql receives the script on stdin; force UTF-8 so Vietnamese literals inside
# the assertions survive the hop into the container.
$prevEncoding = [Console]::OutputEncoding
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$files = Get-ChildItem -LiteralPath $testDir -Filter $Filter -File | Sort-Object Name
$passed = @()
$failed = @()

if ([string]::IsNullOrWhiteSpace($DbPassword)) {
  if ($env:NESTSCOUT_TEST_DB_URL -match '^[^:]+://[^:]+:([^@]*)@') {
    $DbPassword = [System.Uri]::UnescapeDataString($Matches[1])
  } else {
    $DbPassword = "postgres"
  }
}

try {
  foreach ($file in $files) {
    $sql = Get-Content -Raw -Encoding utf8 -LiteralPath $file.FullName
    $dockerArgs = @("exec", "-i")
    if (-not [string]::IsNullOrWhiteSpace($env:NESTSCOUT_TEST_DB_URL)) {
      $dockerArgs += @("-e", "NESTSCOUT_TEST_DB_URL=$($env:NESTSCOUT_TEST_DB_URL)")
    }
    $usesDblink = $sql -match '\bdblink_(connect|send_query|disconnect)\b'
    $effectiveDbUser = if ($usesDblink) { $DblinkDbUser } else { $DbUser }
    if ($usesDblink) {
      $dockerArgs += @("-e", "PGPASSWORD=$DbPassword")
      $dockerArgs += @($Container, "psql", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-U", $effectiveDbUser, "-d", "postgres")
    } else {
      $dockerArgs += @($Container, "psql", "-v", "ON_ERROR_STOP=1", "-U", $effectiveDbUser, "-d", "postgres")
    }
    # Supabase's local postgres role is intentionally non-superuser. The
    # dblink concurrency assertion needs the ephemeral database superuser;
    # keep stderr in the captured result without letting NOTICE records abort
    # the PowerShell runner before it can inspect psql's exit code.
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      $output = $sql | & docker @dockerArgs 2>&1
    } finally {
      $ErrorActionPreference = $previousErrorAction
    }
    $code = $LASTEXITCODE

    if ($code -eq 0) {
      $passed += $file.Name
      Write-Output "PASS  $($file.Name)"
    } else {
      $failed += [pscustomobject]@{ File = $file.Name; Output = ($output | Out-String).Trim() }
      Write-Output "FAIL  $($file.Name)"
      Write-Output "      $(($output | Out-String).Trim() -replace "`r?`n", "`n      ")"
      if ($StopOnFirstFailure) { break }
    }
  }
} finally {
  [Console]::OutputEncoding = $prevEncoding
}

Write-Output ""
Write-Output "sql verification: $($passed.Count) passed / $($failed.Count) failed / $($files.Count) total"

if ($failed.Count -gt 0) {
  Write-Output ""
  Write-Output "failed files:"
  foreach ($f in $failed) { Write-Output "  - $($f.File)" }
  exit 1
}

exit 0
