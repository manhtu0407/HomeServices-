#!/usr/bin/env bash
# POSIX mirror of up.ps1. Supabase CLI owns the stack; this wrapper owns the
# bounded preflight and exactly one start attempt.
set -uo pipefail

profile="lean"
instance=""
port_base=""
seen_options=" "
while [ $# -gt 0 ]; do
  [[ "$seen_options" != *" $1 "* ]] || exit 2
  seen_options+="$1 "
  case "$1" in
    --profile)
      [ $# -ge 2 ] || { echo "up: --profile requires lean or full" >&2; exit 2; }
      profile="$2"
      shift 2
      ;;
    --instance)
      [ $# -ge 2 ] || exit 2
      instance="$2"
      shift 2
      ;;
    --port-base)
      [ $# -ge 2 ] || exit 2
      port_base="$2"
      shift 2
      ;;
    *) echo "up: expected only --profile lean|full" >&2; exit 2 ;;
  esac
done
if [[ "$seen_options" == *" --instance "* ]] || [[ "$seen_options" == *" --port-base "* ]]; then
  [[ "$instance" =~ ^[a-z][a-z0-9-]{0,39}$ ]] && [[ "$port_base" =~ ^[0-9]{1,5}$ ]] || exit 2
  case "$instance" in production|staging|main|default|nestscout) exit 2 ;; esac
  port_base=$((10#$port_base))
  [ "$port_base" -ge 1024 ] && [ "$port_base" -le 65520 ] || exit 2
fi
case "$profile" in lean|full) ;; *) echo "up: profile must be lean or full" >&2; exit 2 ;; esac

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$here/../.." && pwd)
lean_exclude="studio,mailpit,realtime,imgproxy,vector,logflare,supavisor"

doctor_args=(--profile "$profile")
[ -z "$instance" ] || doctor_args+=(--port-base "$port_base")
bash "$here/doctor.sh" "${doctor_args[@]}"
doctor_code=$?
if [ "$doctor_code" -ne 0 ]; then
  echo "doctor refused the start; nothing was launched"
  exit "$doctor_code"
fi

cd "$repo_root"
local_workdir=".scratch/local-migrations"
[ -z "$instance" ] || local_workdir=".scratch/local-migrations-qa-$instance"
instance_args=()
[ -z "$instance" ] || instance_args=(--instance "$instance" --port-base "$port_base")
bash "$repo_root/scripts/run-node.sh" \
  scripts/harness/prepare-migration-workdir.mjs \
  --empty-reset \
  --inventory config/harness/migration-inventory.json \
  --output "$local_workdir" \
  --reuse \
  --refresh-stale "${instance_args[@]}"
prepare_code=$?
if [ "$prepare_code" -ne 0 ]; then
  echo "canonical migration workdir preparation failed with exit code $prepare_code"
  exit "$prepare_code"
fi

args=(start --workdir "$local_workdir")
if [ -n "$instance" ]; then
  bash "$repo_root/scripts/run-node.sh" scripts/harness/local-qa-network.mjs --instance "$instance"
  network_code=$?
  [ "$network_code" -eq 0 ] || exit "$network_code"
  args+=(--network-id "nestscout-qa-fixture-$instance")
  while IFS='=' read -r key _value; do
    case "$key" in ANTHROPIC_*|DEEPSEEK_*|PERPLEXITY_*|OPENAI_*|SEPAY_*|VIETMAP_*|SENTRY_*|TELEGRAM_*) unset "$key" ;; esac
  done < <(env)
fi
[ "$profile" = "lean" ] && args+=(-x "$lean_exclude")
echo "starting supabase ($profile): supabase ${args[*]}"
if [ -n "$instance" ]; then
  bash "$repo_root/scripts/run-node.sh" scripts/harness/run-local-qa-cli.mjs --instance "$instance" --port-base "$port_base" -- "${args[@]}"
else
  bash "$repo_root/scripts/run-supabase.sh" "${args[@]}"
fi
code=$?
if [ "$code" -ne 0 ]; then
  echo "supabase start failed with exit code $code; no automatic retry will run"
  exit "$code"
fi
if [ -n "$instance" ]; then
  bash "$repo_root/scripts/run-node.sh" scripts/harness/local-qa-network.mjs --verify-instance "$instance"
  if [ "$?" -ne 0 ]; then
    bash "$repo_root/scripts/run-supabase.sh" stop --workdir "$local_workdir"
    echo "QA binding verification failed; named stop exit=$?"
    exit 1
  fi
fi

down_command="pnpm db:local:down"
[ -z "$instance" ] || down_command+=" --instance $instance"
echo "stack is up - run '$down_command' when finished"
exit 0
