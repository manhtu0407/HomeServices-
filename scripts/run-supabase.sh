#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
production_project_ref="iwevizmsedyqozxlawwl"
if [[ "${1:-}" == -- ]]; then shift; fi
# shellcheck source=scripts/resolve-workspace-pnpm.sh
. "$root/scripts/resolve-workspace-pnpm.sh"

reject_locked_target() {
  printf '%s\n' "$1" >&2
  exit 1
}

assert_production_target() {
  local candidate linked_ref linked_ref_file argument next index linked_workdir candidate_workdir
  local -a args=("$@")
  linked_workdir="$root"
  for ((index = 0; index < ${#args[@]}; index += 1)); do
    argument="${args[index]}"
    if [[ "$argument" == --workdir && $((index + 1)) -lt ${#args[@]} ]]; then
      candidate_workdir="${args[index + 1]}"
      if [[ -n "$candidate_workdir" && "$candidate_workdir" != --* ]]; then
        if [[ "$candidate_workdir" = /* ]]; then
          if [[ -d "$candidate_workdir" ]]; then linked_workdir="$candidate_workdir"; fi
        else
          if [[ -d "$root/$candidate_workdir" ]]; then linked_workdir="$root/$candidate_workdir"; fi
        fi
      fi
    elif [[ "$argument" == --workdir=* ]]; then
      candidate_workdir="${argument#*=}"
      if [[ "$candidate_workdir" = /* ]]; then
        if [[ -d "$candidate_workdir" ]]; then linked_workdir="$candidate_workdir"; fi
      else
        if [[ -d "$root/$candidate_workdir" ]]; then linked_workdir="$root/$candidate_workdir"; fi
      fi
    fi
  done

  for candidate in "${SUPABASE_PROJECT_REF:-}" "${SUPABASE_PROJECT_ID:-}" \
    "${STAGE1_SUPABASE_PROJECT_REF:-}" "${STAGING_SUPABASE_PROJECT_REF:-}"; do
    if [[ -n "$candidate" && "${candidate,,}" != "$production_project_ref" ]]; then
      reject_locked_target 'Supabase CLI access is locked to the registered Production project.'
    fi
  done

  for ((index = 0; index < ${#args[@]}; index += 1)); do
    argument="${args[index]}"
    case "$argument" in
      --project-ref|--project-id)
        if ((index + 1 >= ${#args[@]})); then
          reject_locked_target "$argument requires the registered Production project ref."
        fi
        next="${args[index + 1]}"
        if [[ -z "$next" || "$next" == --* || "${next,,}" != "$production_project_ref" ]]; then
          reject_locked_target 'Supabase CLI access is locked to the registered Production project.'
        fi
        ;;
      --project-ref=*|--project-id=*)
        candidate="${argument#*=}"
        if [[ -z "$candidate" || "${candidate,,}" != "$production_project_ref" ]]; then
          reject_locked_target 'Supabase CLI access is locked to the registered Production project.'
        fi
        ;;
      --db-url|--db-url=*)
        reject_locked_target 'Supabase CLI database URL overrides are locked; use the registered Production project or --local.'
        ;;
      --linked)
        linked_ref_file="$linked_workdir/supabase/.temp/project-ref"
        if [[ ! -f "$linked_ref_file" ]]; then
          reject_locked_target 'Supabase linked target is locked until the exact Production project ref is recorded.'
        fi
        linked_ref="$(<"$linked_ref_file")"
        if [[ "${linked_ref,,}" != "$production_project_ref" ]]; then
          reject_locked_target 'Supabase linked target is locked to the registered Production project.'
        fi
        ;;
    esac
  done
}

assert_production_target "$@"

cd "$root"

for candidate in "$root/node_modules/.bin/supabase" "$root/apps/api/node_modules/.bin/supabase"; do
  if [ -x "$candidate" ]; then
    exec "$candidate" "$@"
  fi
done

pnpm_bin="$(find_pnpm)"
mapfile -t prefix < <(resolve_workspace_pnpm_prefix "$root" "$pnpm_bin")
exec "$pnpm_bin" "${prefix[@]}" --filter @nestscout/api exec supabase "$@"
