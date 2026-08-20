#!/usr/bin/env bash
# POSIX mirror of down.ps1. Every 'up' in the docs has a matching 'down'; leaving
# containers running overnight is a real cost, not a cosmetic one.
set -uo pipefail

purge=0
while [ $# -gt 0 ]; do
  case "$1" in
    # The CLI keeps the database volume by default so a restart is fast.
    --purge) purge=1; shift ;;
    *) echo "down: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_root"
args=(stop)
[ "$purge" -eq 1 ] && args+=(--no-backup)
bash "$repo_root/scripts/run-supabase.sh" "${args[@]}"
