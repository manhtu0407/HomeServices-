#!/bin/bash
# Creates the disposable local database: base image, compatibility patch, the 453 canonical migrations as the postgres role, then the seed.
set -u
export MSYS_NO_PATHCONV=1
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -W)"
REPO="$(cd "$HERE/../../../../.." && pwd -W)"
WORK="${KAWA_T1_WORK:-$REPO/../ns-t1-work}"
mkdir -p "$WORK"
node "$HERE/list-migrations.mjs" "$REPO" "$WORK/migrations" | tail -1
docker rm -f ns-b4-pg >/dev/null 2>&1
docker run -d --name ns-b4-pg --memory 1500m --shm-size 256m -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.6.1.121 >/dev/null
for i in $(seq 1 40); do docker exec ns-b4-pg pg_isready -U supabase_admin -h 127.0.0.1 >/dev/null 2>&1 && break; sleep 2; done
sleep 6
docker cp "$HERE/patch.sql" ns-b4-pg:/tmp/patch.sql
docker exec ns-b4-pg psql -U supabase_admin -d postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -q -f /tmp/patch.sql 2>&1 | grep -v NOTICE | tail -5
docker cp "$WORK/migrations" ns-b4-pg:/tmp/mig
docker cp "$HERE/apply.sh" ns-b4-pg:/tmp/apply.sh
docker cp "$REPO/supabase/seed.sql" ns-b4-pg:/tmp/seed.sql
docker exec ns-b4-pg sh /tmp/apply.sh 2>&1 | tail -15
docker exec ns-b4-pg psql -U postgres -d postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -q -f /tmp/seed.sql 2>&1 | grep -v NOTICE | tail -5
echo seeded
