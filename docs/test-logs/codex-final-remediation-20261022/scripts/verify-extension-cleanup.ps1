$ErrorActionPreference = 'Stop'
$target = 'ns-codex-final-verify-pg'
$root = 'C:/ns-fix/b4'
$scratch = Join-Path $root '.scratch/codex-final/postcommit'
$source = Get-Content (Join-Path $root 'supabase/tests/manual_bank_reference_concurrency_verification.sql') -Raw
$rows = @()
foreach ($case in @(
  @{name='absent'; prefix='d69d'; codeBase=9100; preexisting=$false},
  @{name='preexisting'; prefix='d69e'; codeBase=9200; preexisting=$true}
)) {
  # Only synthetic fixture identities differ, because immutable receipts from the first final run remain.
  $sql = $source.Replace('d698', $case.prefix).Replace('bank-reference-final-', "bank-reference-cleanup-$($case.prefix)-")
  $firstCode = 'NS' + ($case.codeBase + 1).ToString().PadLeft(24, '0')
  $sql = $sql.Replace('NS000000000000000000000101', $firstCode).Replace('(100 + i)', "($($case.codeBase) + i)")
  foreach ($letter in @('d','e','f')) {
    $hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes("p428-cleanup-$($case.prefix)-$letter"))).ToLowerInvariant()
    $sql = $sql.Replace("repeat('$letter', 64)", "'$hash'")
  }
  $path = Join-Path $scratch "p428-$($case.name)-namespaced.sql"
  [IO.File]::WriteAllText($path, $sql, [Text.UTF8Encoding]::new($false))
  $setup = if ($case.preexisting) { 'create extension if not exists dblink' } else { 'drop extension if exists dblink' }
  & docker exec $target psql -U supabase_admin -d postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -c $setup
  if ($LASTEXITCODE -ne 0) { throw 'Could not prepare local extension state' }
  & docker cp $path "${target}:/tmp/p428-cleanup.sql"
  & docker exec $target psql -U supabase_admin -d postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -q -f /tmp/p428-cleanup.sql
  if ($LASTEXITCODE -ne 0) { throw "P428 $($case.name) failed" }
  $count = & docker exec $target psql -U supabase_admin -d postgres -h 127.0.0.1 -Atc "select count(*) from pg_extension where extname='dblink'"
  $expected = if ($case.preexisting) { '1' } else { '0' }
  if ($count.Trim() -ne $expected) { throw "Extension state mismatch: $count versus $expected" }
  $rows += @{case=$case.name; p428Exit=0; expectedExtensionCount=$expected; actualExtensionCount=$count.Trim()}
}
$rows | ConvertTo-Json
