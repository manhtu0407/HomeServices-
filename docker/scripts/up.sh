#!/usr/bin/env bash
# POSIX mirror of up.ps1. A wrapper around the Supabase CLI, not a second
# implementation: the CLI owns its containers, and hand-rolling a compose file for
# them would drift from whatever version the workspace CLI pins.
set -uo pipefail

profile="lean"
min_ram_gb=4
skip_doctor=0
while [ $# -gt 0 ]; do
  case "$1" in
    --profile) profile="$2"; shift 2 ;;
    --min-ram-gb) min_ram_gb="$2"; shift 2 ;;
    --skip-doctor) skip_doctor=1; shift ;;
    *) echo "up: unknown argument '$1'" >&2; exit 2 ;;
  esac
done
case "$profile" in lean|full) ;; *) echo "up: profile must be lean or full" >&2; exit 2 ;; esac

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$here/../.." && pwd)

# Excluded on the lean profile. Kept as one list so the profile docs and this
# script cannot drift; the CLI rejects unknown names loudly rather than silently
# ignoring them, which is the behavior we want if a name is stale.
lean_exclude="studio,mailpit,realtime,imgproxy,vector,logflare,supavisor"

if [ "$skip_doctor" -eq 0 ]; then
  if ! bash "$here/doctor.sh" --min-ram-gb "$min_ram_gb"; then
    echo "doctor refused the start; nothing was launched"
    exit 1
  fi
fi

cd "$repo_root"
args=(start)
[ "$profile" = "lean" ] && args+=(-x "$lean_exclude")
echo "starting supabase ($profile): supabase ${args[*]}"
bash "$repo_root/scripts/run-supabase.sh" "${args[@]}"
code=$?
if [ "$code" -ne 0 ]; then
  echo "supabase start failed with exit code $code"
  exit "$code"
fi
echo "stack is up - remember 'pnpm db:local:down' when finished"
