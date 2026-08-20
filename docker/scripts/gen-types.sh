#!/usr/bin/env bash
# POSIX mirror of gen-types.ps1. Writes through a temp file and compares first: a
# difference against the committed tree is real schema drift and worth reading
# before it is accepted, so --check reports it without overwriting.
set -uo pipefail

check_only=0
while [ $# -gt 0 ]; do
  case "$1" in
    --check) check_only=1; shift ;;
    *) echo "gen-types: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
target="$repo_root/packages/shared/src/types/database"
splitter="$repo_root/scripts/split-database-types.mjs"
temp="${TMPDIR:-/tmp}/nestscout-database.types.ts"

cd "$repo_root"
if ! bash "$repo_root/scripts/run-supabase.sh" gen types typescript --local > "$temp"; then
  code=$?
  echo "supabase gen types failed with exit code $code"
  exit "$code"
fi

# The artifact is stored split across $target. The splitter's --check-against rejoins
# that tree and compares it to the freshly generated file, so this check is
# byte-for-byte on the whole artifact exactly as it was when it was one file.
if [ ! -d "$target" ]; then
  echo "no committed types at $target; splitting generated output"
  exec node "$splitter" --write "$temp"
fi

if node "$splitter" --check-against "$temp"; then
  echo "database types match the local schema - no drift"
  exit 0
fi

echo "DRIFT: generated types differ from the committed split tree"
echo "  committed : $target"
echo "  generated : $temp"

if [ "$check_only" -eq 1 ]; then
  echo "check mode - committed files left untouched"
  exit 1
fi

node "$splitter" --write "$temp"
echo "committed files overwritten. Review the diff before accepting it."
