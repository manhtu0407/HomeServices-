$ErrorActionPreference = 'Stop'
$repoRoot = 'C:/ns-fix/b4'
$target = 'ns-codex-final-verify-pg'
$evidence = Join-Path $repoRoot 'docs/test-logs/codex-final-remediation-20261022'
$logs = Join-Path $evidence 'logs/final'
$scratch = Join-Path $repoRoot '.scratch/codex-final/t1-final'
$results = [System.Collections.Generic.List[object]]::new()
function Keep-Result($name, $code) {
  $results.Add([pscustomobject]@{ name = $name; exit = $code; target = $target })
  $results | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 (Join-Path $evidence 'results/postgres-final-commands.json')
  Write-Output "${name}: exit=$code"
}
& (Join-Path $repoRoot 'docker/scripts/run-sql-tests.ps1') --container $target --db-user postgres --dblink-db-user supabase_admin *> (Join-Path $logs 'postgres-sql-suite.txt')
Keep-Result 'sql-suite' $LASTEXITCODE
$sqlSummary = Get-Content (Join-Path $logs 'postgres-sql-suite.txt') | Select-String 'sql verification:'
Write-Output $sqlSummary
foreach ($name in @('status-writers', 'confirm-accept-concurrency')) {
  & docker cp (Join-Path $repoRoot "docs/test-logs/kawa-four-blocker-20261022/scripts/t1/$name.sql") "${target}:/tmp/$name.sql"
  if ($LASTEXITCODE -ne 0) { throw "Copy failed: $name" }
  & docker exec $target psql -U supabase_admin -d postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -At -f "/tmp/$name.sql" *> (Join-Path $logs "$name.txt")
  Keep-Result $name $LASTEXITCODE
}
$services = @('electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman')
$originalOrder = "'electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman'"
$bankSource = Get-Content -Raw -Encoding utf8 (Join-Path $repoRoot 'supabase/tests/manual_bank_reconciliation_behavior_verification.sql')
$acceptSource = Get-Content -Raw -Encoding utf8 (Join-Path $repoRoot 'supabase/tests/worker_accept_authority_verification.sql')
for ($i = 0; $i -lt $services.Count; $i++) {
  $rotated = for ($j = 0; $j -lt $services.Count; $j++) { "'" + $services[($i + $j) % $services.Count] + "'" }
  $bank = $bankSource.Replace($originalOrder, ($rotated -join ', '))
  $accept = $acceptSource.Replace("'plumbing'", "'" + $services[$i] + "'")
  foreach ($case in @(@('bank', $bank), @('accept', $accept))) {
    $label = "service-$($services[$i])-$($case[0])"
    $path = Join-Path $scratch "$label.sql"
    [System.IO.File]::WriteAllText($path, $case[1], [System.Text.UTF8Encoding]::new($false))
    & docker cp $path "${target}:/tmp/service-check.sql"
    if ($LASTEXITCODE -ne 0) { throw "Copy failed: $label" }
    & docker exec $target psql -U postgres -d postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -q -f /tmp/service-check.sql *> (Join-Path $logs "$label.txt")
    Keep-Result $label $LASTEXITCODE
  }
}
& node (Join-Path $evidence 'scripts/payment-mutations.mjs') *> (Join-Path $logs 'payment-mutations.txt')
Keep-Result 'payment-mutations' $LASTEXITCODE
$contractSql = & node (Join-Path $repoRoot 'scripts/check-edge-db-contract.mjs') --emit-sql
if ($LASTEXITCODE -ne 0) { throw 'Could not emit the actual Edge RPC contract query' }
[System.IO.File]::WriteAllText((Join-Path $scratch 'edge-functions.sql'), ($contractSql -join "`n"), [System.Text.UTF8Encoding]::new($false))
& docker cp (Join-Path $scratch 'edge-functions.sql') "${target}:/tmp/edge-functions.sql"
$functionNames = & docker exec $target psql -U postgres -d postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -At -f /tmp/edge-functions.sql
Keep-Result 'edge-rpc-catalog-query' $LASTEXITCODE
[System.IO.File]::WriteAllText((Join-Path $scratch 'edge-functions.json'), (ConvertTo-Json -InputObject @($functionNames)), [System.Text.UTF8Encoding]::new($false))
& node (Join-Path $repoRoot 'scripts/check-edge-db-contract.mjs') --functions (Join-Path $scratch 'edge-functions.json') *> (Join-Path $logs 'edge-rpc-catalog-parity.txt')
Keep-Result 'edge-rpc-catalog-parity' $LASTEXITCODE
if (@($results | Where-Object exit -NE 0).Count -gt 0) { exit 1 }
exit 0
