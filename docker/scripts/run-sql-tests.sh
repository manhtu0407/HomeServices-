#!/usr/bin/env bash
# POSIX mirror of run-sql-tests.ps1. The scripts self-assert with `raise exception`
# and most wrap themselves in begin/rollback, so they run directly under psql — no
# pgTAP harness needed, and psql already lives inside the postgres container.
#
# A red file here is a result, not a crash. The runner reports honest pass/fail
# counts and never swallows an error message.
set -uo pipefail

container="supabase_db_nestscout"
filter="*.sql"
stop_on_first_failure=0
db_user="postgres"
dblink_db_user="supabase_admin"

while [ $# -gt 0 ]; do
  case "$1" in
    --container) [ $# -ge 2 ] || { echo "run-sql-tests: --container requires a value" >&2; exit 2; }; container="$2"; shift 2 ;;
    --filter) [ $# -ge 2 ] || { echo "run-sql-tests: --filter requires a value" >&2; exit 2; }; filter="$2"; shift 2 ;;
    --stop-on-first-failure) stop_on_first_failure=1; shift ;;
    --db-user) [ $# -ge 2 ] || { echo "run-sql-tests: --db-user requires a value" >&2; exit 2; }; db_user="$2"; shift 2 ;;
    --dblink-db-user) [ $# -ge 2 ] || { echo "run-sql-tests: --dblink-db-user requires a value" >&2; exit 2; }; dblink_db_user="$2"; shift 2 ;;
    *) echo "run-sql-tests: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

# These two are interpolated into the local dblink shell invocation, so restrict
# them to PostgreSQL identifier syntax and they cannot alter that command.
for ident in "$db_user" "$dblink_db_user"; do
  case "$ident" in
    [A-Za-z_]*) [[ "$ident" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { echo "invalid role name: $ident" >&2; exit 2; } ;;
    *) echo "invalid role name: $ident" >&2; exit 2 ;;
  esac
done

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
test_dir="$repo_root/supabase/tests"
if [ ! -d "$test_dir" ]; then
  echo "no supabase/tests directory at $test_dir"
  exit 1
fi

mapfile -t files < <(find "$test_dir" -maxdepth 1 -type f -name "$filter" | sort)
discovered=${#files[@]}
if [ "$discovered" -eq 0 ]; then
  echo "no SQL verification files matched filter '$filter'"
  echo "sql verification: discovered=0 executed=0 passed=0 failed=0 stopped_early=false"
  exit 2
fi

# The container must already be up; starting it here would hide the fact that a
# caller skipped the doctor gate.
if ! docker ps --filter "name=$container" --format '{{.Names}}' 2>/dev/null | grep -qxF "$container"; then
  echo "container '$container' is not running. Run 'pnpm db:local:up' first."
  exit 1
fi

passed=0
failed_files=()
executed=0
stopped_early=false

for file in "${files[@]}"; do
  executed=$((executed + 1))
  name=$(basename "$file")
  if grep -qE '\bdblink_(connect|send_query|disconnect)\b' "$file"; then
    # Local loopback uses trust auth, so dblink must be created by the local
    # superuser. The target remains the same container, never an env-supplied
    # staging or production database.
    cmd="export NESTSCOUT_TEST_DB_URL='host=127.0.0.1 port=5432 dbname=postgres user=$db_user'; export PGPASSWORD=\"\$POSTGRES_PASSWORD\"; exec psql -h 127.0.0.1 -U $dblink_db_user -d postgres -v ON_ERROR_STOP=1"
    output=$(docker exec -i "$container" sh -lc "$cmd" < "$file" 2>&1)
    code=$?
  else
    output=$(docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U "$db_user" -d postgres < "$file" 2>&1)
    code=$?
  fi

  if [ "$code" -eq 0 ]; then
    passed=$((passed + 1))
    echo "PASS  $name"
  else
    failed_files+=("$name")
    echo "FAIL  $name"
    printf '%s\n' "$output" | sed 's/^/      /'
    if [ "$stop_on_first_failure" -eq 1 ]; then
      [ "$executed" -lt "$discovered" ] && stopped_early=true
      break
    fi
  fi
done

echo
echo "sql verification: discovered=$discovered executed=$executed passed=$passed failed=${#failed_files[@]} stopped_early=$stopped_early"

if [ "${#failed_files[@]}" -gt 0 ]; then
  echo
  echo "failed files:"
  for f in "${failed_files[@]}"; do echo "  - $f"; done
  exit 1
fi

exit 0
