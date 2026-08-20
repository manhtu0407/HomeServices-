#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/resolve-workspace-pnpm.sh
. "$root/scripts/resolve-workspace-pnpm.sh"

turbo_args=()
root_turbo_json="$root/config/turbo/turbo.json"
if [ -f "$root_turbo_json" ]; then
  turbo_args+=(--root-turbo-json "$root_turbo_json")
fi
turbo_args+=("$@")

pnpm_bin="$(find_pnpm)"
mapfile -t prefix < <(resolve_workspace_pnpm_prefix "$root" "$pnpm_bin")

cd "$root"
exec "$pnpm_bin" "${prefix[@]}" exec turbo "${turbo_args[@]}"
