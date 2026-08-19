#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/resolve-workspace-pnpm.sh
. "$root/scripts/resolve-workspace-pnpm.sh"

cd "$root"

for candidate in "$root/node_modules/.bin/supabase" "$root/apps/api/node_modules/.bin/supabase"; do
  if [ -x "$candidate" ]; then
    exec "$candidate" "$@"
  fi
done

pnpm_bin="$(find_pnpm)"
mapfile -t prefix < <(resolve_workspace_pnpm_prefix "$root" "$pnpm_bin")
exec "$pnpm_bin" "${prefix[@]}" --filter @nestscout/api exec supabase "$@"
