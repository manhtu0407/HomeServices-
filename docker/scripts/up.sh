#!/usr/bin/env bash
# POSIX mirror of up.ps1. Supabase CLI owns the stack; this wrapper owns the
# bounded preflight and exactly one start attempt.
set -uo pipefail

profile="lean"
while [ $# -gt 0 ]; do
  case "$1" in
    --profile)
      [ $# -ge 2 ] || { echo "up: --profile requires lean or full" >&2; exit 2; }
      profile="$2"
      shift 2
      ;;
    *) echo "up: expected only --profile lean|full" >&2; exit 2 ;;
  esac
done
case "$profile" in lean|full) ;; *) echo "up: profile must be lean or full" >&2; exit 2 ;; esac

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$here/../.." && pwd)
lean_exclude="studio,mailpit,realtime,imgproxy,vector,logflare,supavisor"

bash "$here/doctor.sh" --profile "$profile"
doctor_code=$?
if [ "$doctor_code" -ne 0 ]; then
  echo "doctor refused the start; nothing was launched"
  exit "$doctor_code"
fi

cd "$repo_root"
local_workdir=".scratch/local-migrations"
bash "$repo_root/scripts/run-node.sh" \
  scripts/harness/prepare-migration-workdir.mjs \
  --empty-reset \
  --inventory config/harness/migration-inventory.json \
  --output "$local_workdir" \
  --reuse
prepare_code=$?
if [ "$prepare_code" -ne 0 ]; then
  echo "canonical migration workdir preparation failed with exit code $prepare_code"
  exit "$prepare_code"
fi

args=(start --workdir "$local_workdir")
[ "$profile" = "lean" ] && args+=(-x "$lean_exclude")
echo "starting supabase ($profile): supabase ${args[*]}"
bash "$repo_root/scripts/run-supabase.sh" "${args[@]}"
code=$?
if [ "$code" -ne 0 ]; then
  echo "supabase start failed with exit code $code; no automatic retry will run"
  exit "$code"
fi

echo "stack is up - remember 'pnpm db:local:down' when finished"
exit 0
