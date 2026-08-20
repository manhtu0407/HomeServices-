#!/usr/bin/env bash

# A globally-installed pnpm on a different major version will reinterpret and can purge this
# workspace's node_modules graph, so a mismatch is bootstrapped through `dlx` at the pinned
# version instead of being run directly. Mirrors Get-WorkspacePnpmInvocation in the .ps1 sibling.
resolve_workspace_pnpm_prefix() {
  local root="$1"
  local pnpm_bin="$2"
  local expected actual

  expected="$(node -e '
    const { readFileSync } = require("node:fs")
    const manager = String(JSON.parse(readFileSync(process.argv[1], "utf8")).packageManager)
    const match = /^pnpm@(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/.exec(manager)
    if (!match) {
      console.error(`Workspace packageManager must pin an exact pnpm version. Found: ${manager}`)
      process.exit(1)
    }
    console.log(match[1])
  ' "$root/package.json")" || return 1

  actual="$("$pnpm_bin" --version | tail -1 | tr -d '[:space:]')"
  if [ -z "$actual" ]; then
    echo "Could not determine the pnpm version at '$pnpm_bin'." >&2
    return 1
  fi

  if [ "$actual" != "$expected" ]; then
    printf 'dlx\npnpm@%s\n' "$expected"
  fi
}

find_pnpm() {
  command -v pnpm 2>/dev/null && return 0
  echo "No pnpm executable found on PATH." >&2
  return 1
}
