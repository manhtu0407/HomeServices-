#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/resolve-workspace-pnpm.sh
. "$root/scripts/resolve-workspace-pnpm.sh"

if [ "$#" -lt 2 ]; then
  echo "Usage: run-package-script.sh <package-name> <script-name> [script args...]" >&2
  exit 1
fi

package="$1"
script="$2"
shift 2
# pnpm run already separates its own flags from the script's; a leading `--` here is the caller
# echoing the npm convention and would otherwise reach the script as a literal argument.
if [ "${1:-}" = "--" ]; then shift; fi

pnpm_bin="$(find_pnpm)"
mapfile -t prefix < <(resolve_workspace_pnpm_prefix "$root" "$pnpm_bin")

cd "$root"
exec "$pnpm_bin" "${prefix[@]}" --filter "$package" run "$script" "$@"
