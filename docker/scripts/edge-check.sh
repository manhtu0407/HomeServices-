#!/usr/bin/env bash
# POSIX mirror of edge-check.ps1. Each function carries its own deno.json with the
# import map; `deno check` without --config resolves the bare specifiers as plain
# npm names and produces a flood of phantom errors, so --config is embedded here
# rather than left to the caller to remember.
#
# map-proxy-spike is intentionally absent: it has no deno.json to check against.
set -uo pipefail

functions=(kael-learning-monitor kael-matching-maintainer kael-media-retention mobile-api payment-maintainer sepay-webhook)
only=()
while [ $# -gt 0 ]; do
  case "$1" in
    --only) only+=("$2"); shift 2 ;;
    *) echo "edge-check: unknown argument '$1'" >&2; exit 2 ;;
  esac
done
if [ "${#only[@]}" -gt 0 ]; then
  selected=()
  for fn in "${functions[@]}"; do
    for want in "${only[@]}"; do [ "$fn" = "$want" ] && selected+=("$fn"); done
  done
  functions=("${selected[@]}")
fi

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_root"

for attempt in 1 2 3; do
  if docker compose pull --policy missing deno; then break; fi
  if [ "$attempt" -eq 3 ]; then
    echo "Unable to pull the pinned Deno image after 3 attempts." >&2
    exit 1
  fi
  echo "Deno image pull failed; retrying ($attempt/3)."
  sleep $((5 * attempt))
done

failed=()
for fn in "${functions[@]}"; do
  config="supabase/functions/$fn/deno.json"
  entry="supabase/functions/$fn/index.ts"
  if [ ! -f "$repo_root/$config" ]; then
    echo "SKIP  $fn (no deno.json)"
    continue
  fi
  echo "check $fn"
  docker compose run --rm --pull never deno check --config "$config" "$entry" || failed+=("$fn")
done

echo
if [ "${#failed[@]}" -gt 0 ]; then
  echo "edge check failed: ${failed[*]}"
  exit 1
fi
echo "edge check passed: ${#functions[@]} function(s)"
