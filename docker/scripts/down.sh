#!/usr/bin/env bash
# POSIX mirror of down.ps1. The agent-facing stop path preserves the database volume.
set -uo pipefail

instance=""
if [ $# -gt 0 ] && { [ $# -ne 2 ] || [ "$1" != "--instance" ]; }; then
  echo "down: expected no arguments or --instance name" >&2
  exit 2
fi
if [ $# -eq 2 ]; then
  instance="$2"
  [[ "$instance" =~ ^[a-z][a-z0-9-]{0,39}$ ]] || exit 2
  case "$instance" in production|staging|main|default|nestscout) exit 2 ;; esac
fi

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_root"
target_args=()
if [ -n "$instance" ]; then
  local_workdir=".scratch/local-migrations-qa-$instance"
  config_path="$local_workdir/supabase/config.toml"
  [ -f "$config_path" ] && grep -Eq "^project_id[[:space:]]*=[[:space:]]*\"nestscout-qa-$instance\"[[:space:]]*$" "$config_path" || exit 2
  target_args=(--workdir "$local_workdir")
fi
bash "$repo_root/scripts/run-supabase.sh" stop "${target_args[@]}"
