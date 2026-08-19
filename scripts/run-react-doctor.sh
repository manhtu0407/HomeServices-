#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/resolve-workspace-pnpm.sh
. "$root/scripts/resolve-workspace-pnpm.sh"

version="0.5.8"
doctor_args=(. --yes --verbose --blocking none --no-score)

case "${1:-}" in
  changed) doctor_args+=(--scope changed); shift ;;
  lines)   doctor_args+=(--scope lines);   shift ;;
esac
doctor_args+=("$@")

cd "$root"

local_bin="$root/node_modules/.bin/react-doctor"
if [ -x "$local_bin" ]; then
  exec "$local_bin" "${doctor_args[@]}"
fi

pnpm_bin="$(find_pnpm)"
exec "$pnpm_bin" dlx "react-doctor@$version" "${doctor_args[@]}"
