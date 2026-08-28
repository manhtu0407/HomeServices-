#!/usr/bin/env bash
# POSIX mirror of edge-check.ps1. Selection is validated before Docker is called.
set -uo pipefail

canonical_functions=(kael-learning-monitor kael-matching-maintainer kael-media-retention mobile-api payment-maintainer sepay-webhook)
only=()
while [ $# -gt 0 ]; do
  case "$1" in
    --only)
      [ $# -ge 2 ] || { echo "edge-check: --only requires a function" >&2; exit 2; }
      only+=("$2")
      shift 2
      ;;
    *) echo "edge-check: expected only repeated --only <function> arguments" >&2; exit 2 ;;
  esac
done

unknown=()
for wanted in "${only[@]}"; do
  known=0
  for candidate in "${canonical_functions[@]}"; do
    [ "$wanted" = "$candidate" ] && known=1
  done
  [ "$known" -eq 1 ] || unknown+=("$wanted")
done
if [ "${#unknown[@]}" -gt 0 ]; then
  echo "edge-check: unknown function(s): ${unknown[*]}" >&2
  exit 2
fi

functions=()
if [ "${#only[@]}" -eq 0 ]; then
  functions=("${canonical_functions[@]}")
else
  for candidate in "${canonical_functions[@]}"; do
    for wanted in "${only[@]}"; do
      if [ "$candidate" = "$wanted" ]; then
        functions+=("$candidate")
        break
      fi
    done
  done
fi
if [ "${#functions[@]}" -eq 0 ]; then
  echo "edge-check: no Edge functions selected" >&2
  exit 2
fi

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
missing=()
for fn in "${functions[@]}"; do
  [ -f "$repo_root/supabase/functions/$fn/deno.json" ] && [ -f "$repo_root/supabase/functions/$fn/index.ts" ] || missing+=("$fn")
done
if [ "${#missing[@]}" -gt 0 ]; then
  echo "edge-check: missing deno.json or index.ts for ${missing[*]}"
  echo "edge check: discovered=${#canonical_functions[@]} selected=${#functions[@]} checked=0 failed=${#missing[@]}"
  exit 2
fi

cd "$repo_root"
docker compose pull --policy missing deno
pull_code=$?
if [ "$pull_code" -ne 0 ]; then
  echo "Deno image pull failed; no automatic retry will run."
  echo "edge check: discovered=${#canonical_functions[@]} selected=${#functions[@]} checked=0 failed=0"
  exit 1
fi

failed=()
checked=0
for fn in "${functions[@]}"; do
  config="supabase/functions/$fn/deno.json"
  entry="supabase/functions/$fn/index.ts"
  echo "check $fn"
  docker compose run --rm --pull never deno check --config "$config" "$entry"
  code=$?
  checked=$((checked + 1))
  [ "$code" -eq 0 ] || failed+=("$fn")
done

echo
echo "edge check: discovered=${#canonical_functions[@]} selected=${#functions[@]} checked=$checked failed=${#failed[@]}"
if [ "${#failed[@]}" -gt 0 ]; then
  echo "failed functions: ${failed[*]}"
  exit 1
fi
exit 0
