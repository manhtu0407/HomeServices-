#!/usr/bin/env bash
# POSIX mirror of down.ps1. The agent-facing stop path preserves the database volume.
set -uo pipefail

if [ $# -gt 0 ]; then
  echo "down: no arguments are accepted" >&2
  exit 2
fi

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_root"
bash "$repo_root/scripts/run-supabase.sh" stop
