#!/bin/bash
# Rebuilds the disposable local database from the canonical migration list, runs the repository SQL suite, the committed-data
# concurrency scripts and the mutation checks, and writes every log into the evidence folder.
# usage: bash run-t1.sh   (needs Docker; uses the container name ns-b4-pg and never touches another container)
set -u
export MSYS_NO_PATHCONV=1
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -W)"
EVIDENCE="$(cd "$HERE/../.." && pwd -W)"
REPO="$(cd "$EVIDENCE/../../.." && pwd -W)"
LOGS="$EVIDENCE/logs/t1"
mkdir -p "$LOGS"
C=ns-b4-pg

echo "== node" > "$LOGS/environment.txt"; node --version >> "$LOGS/environment.txt"
docker version --format 'docker {{.Server.Version}}' >> "$LOGS/environment.txt" 2>&1
docker image inspect public.ecr.aws/supabase/postgres:17.6.1.121 --format 'image {{.Id}} {{index .RepoTags 0}}' >> "$LOGS/environment.txt" 2>&1

bash "$HERE/up.sh" > "$LOGS/rebuild.txt" 2>&1
tail -3 "$LOGS/rebuild.txt"
docker exec $C psql -U postgres -d postgres -h 127.0.0.1 -Atc "select version()" >> "$LOGS/environment.txt"

(cd "$REPO" && bash docker/scripts/run-sql-tests.sh --container $C --db-user postgres --dblink-db-user supabase_admin) > "$LOGS/sql-suite.txt" 2>&1
grep -E "^sql verification" "$LOGS/sql-suite.txt"

docker cp "$HERE/status-writers.sql" $C:/tmp/status-writers.sql
docker exec $C psql -U postgres -d postgres -h 127.0.0.1 -At -f /tmp/status-writers.sql > "$LOGS/status-writers.txt" 2>&1
cat "$LOGS/status-writers.txt"

docker cp "$HERE/payment-concurrency.sql" $C:/tmp/payment-concurrency.sql
docker exec $C psql -U supabase_admin -d postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -f /tmp/payment-concurrency.sql > "$LOGS/payment-concurrency.txt" 2>&1
tail -3 "$LOGS/payment-concurrency.txt"

docker cp "$HERE/confirm-accept-concurrency.sql" $C:/tmp/confirm-accept-concurrency.sql
docker exec $C psql -U supabase_admin -d postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -f /tmp/confirm-accept-concurrency.sql > "$LOGS/confirm-accept-concurrency.txt" 2>&1
tail -3 "$LOGS/confirm-accept-concurrency.txt"
