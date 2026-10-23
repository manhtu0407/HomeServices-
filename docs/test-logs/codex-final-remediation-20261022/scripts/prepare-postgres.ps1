$ErrorActionPreference = 'Stop'
$repoRoot = 'C:/ns-fix/b4'
$containerName = 'ns-codex-final-verify-pg'
$evidenceRoot = Join-Path $repoRoot 'docs/test-logs/codex-final-remediation-20261022'
$stagingRoot = Join-Path $repoRoot '.scratch/codex-final/t1-final'
New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
& docker container inspect $containerName *> $null
if ($LASTEXITCODE -eq 0) { throw "Refuse to overwrite existing container $containerName" }
& node (Join-Path $repoRoot 'docs/test-logs/kawa-four-blocker-20261022/scripts/t1/list-migrations.mjs') $repoRoot (Join-Path $stagingRoot 'migrations')
if ($LASTEXITCODE -ne 0) { throw 'Canonical inventory preparation failed' }
& docker run -d --name $containerName --memory 1500m --shm-size 256m -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.6.1.121
if ($LASTEXITCODE -ne 0) { throw 'Local disposable PostgreSQL creation failed' }
$ready = $false
for ($attempt = 0; $attempt -lt 120; $attempt++) {
  & docker exec $containerName pg_isready -U supabase_admin -h 127.0.0.1 *> $null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 2
}
if (!$ready) { throw 'Disposable PostgreSQL did not become ready within the bounded attempt' }
Start-Sleep -Seconds 6
& docker cp (Join-Path $repoRoot 'docs/test-logs/kawa-four-blocker-20261022/scripts/t1/patch.sql') "${containerName}:/tmp/patch.sql"
if ($LASTEXITCODE -ne 0) { throw 'Local compatibility patch copy failed' }
& docker exec $containerName psql -U supabase_admin -d postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -q -f /tmp/patch.sql
if ($LASTEXITCODE -ne 0) { throw 'Local compatibility patch failed' }
& docker cp (Join-Path $stagingRoot 'migrations') "${containerName}:/tmp/mig"
if ($LASTEXITCODE -ne 0) { throw 'Migration copy failed' }
& docker cp (Join-Path $repoRoot 'docs/test-logs/kawa-four-blocker-20261022/scripts/t1/apply.sh') "${containerName}:/tmp/apply.sh"
if ($LASTEXITCODE -ne 0) { throw 'Migration runner copy failed' }
& docker exec $containerName sh /tmp/apply.sh
if ($LASTEXITCODE -ne 0) { throw 'Empty database migration replay failed' }
& docker cp (Join-Path $repoRoot 'supabase/seed.sql') "${containerName}:/tmp/seed.sql"
if ($LASTEXITCODE -ne 0) { throw 'Seed copy failed' }
& docker exec $containerName psql -U postgres -d postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -q -f /tmp/seed.sql
if ($LASTEXITCODE -ne 0) { throw 'Local seed failed' }
& docker exec $containerName psql -U postgres -d postgres -h 127.0.0.1 -Atc 'select version()'
Write-Output "Local replay and seed PASS: $containerName; no host port published."
