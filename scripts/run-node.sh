#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Node could not run: no node executable found on PATH." >&2
  exit 1
fi

cd "$root"
exec node "$@"
