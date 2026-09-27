#!/usr/bin/env bash
set -uo pipefail

if [ "$#" -ne 0 ]; then
  echo "ensure-version: no arguments are accepted" >&2
  exit 2
fi

command_timeout_seconds=15
update_timeout_seconds=300
diagnostic_limit=2048
command_dir=$(mktemp -d)
command_pid=""
watchdog_pid=""
command_stdout=""
command_stderr=""
command_code=1
command_timed_out=0

kill_command_tree() {
  local parent="$1"
  local signal="$2"
  local child
  while read -r child; do
    [ -n "$child" ] && kill_command_tree "$child" "$signal"
  done < <(ps -eo pid=,ppid= 2>/dev/null | awk -v parent="$parent" '$2 == parent { print $1 }')
  kill "-$signal" "$parent" >/dev/null 2>&1 || true
}

cleanup_command() {
  [ -n "$watchdog_pid" ] && kill_command_tree "$watchdog_pid" KILL
  [ -n "$command_pid" ] && kill_command_tree "$command_pid" KILL
  rm -rf "$command_dir"
}
trap cleanup_command EXIT

run_docker() {
  local timeout_seconds="$1"
  shift
  local out="$command_dir/stdout"
  local err="$command_dir/stderr"
  local timed_out="$command_dir/timed-out"
  : >"$out"
  : >"$err"
  rm -f "$timed_out"

  docker "$@" >"$out" 2>"$err" &
  command_pid=$!
  (
    trap - EXIT
    sleep "$timeout_seconds"
    if kill -0 "$command_pid" >/dev/null 2>&1; then
      : >"$timed_out"
      kill_command_tree "$command_pid" TERM
      sleep 1
      kill_command_tree "$command_pid" KILL
    fi
  ) </dev/null >/dev/null 2>&1 &
  watchdog_pid=$!

  wait "$command_pid"
  command_code=$?
  command_pid=""
  kill_command_tree "$watchdog_pid" KILL
  wait "$watchdog_pid" >/dev/null 2>&1 || true
  watchdog_pid=""

  command_stdout=$(tr -d '\r' <"$out")
  command_stderr=$(tr -d '\r' <"$err")
  if [ -f "$timed_out" ]; then
    command_timed_out=1
    command_code=124
    command_stderr="timeout after $timeout_seconds seconds"
  else
    command_timed_out=0
  fi
}

limit_diagnostic() {
  local value="$1"
  local limit="$2"
  local tail_limit

  value=$(printf '%s' "$value" | tr '\r\n\t' '   ' | sed 's/[[:space:]][[:space:]]*/ /g; s/^ //; s/ $//')
  if [ -z "$value" ]; then
    printf '(empty)'
    return
  fi

  if [ "${#value}" -gt "$limit" ]; then
    tail_limit=$((limit - 14))
    value="[truncated] ${value: -$tail_limit}"
  fi
  printf '%s' "$value"
}

write_summary() {
  printf 'docker_version=%s\n' "$1"
  printf 'compose_version=%s\n' "$2"
  printf 'strategy=%s result=%s update_attempts=%s\n' "$3" "$4" "$5"
}

run_docker "$command_timeout_seconds" --version
if [ "$command_code" -ne 0 ]; then
  echo "ensure-version: cannot read Docker version: $command_stderr" >&2
  write_summary "unknown" "unknown" "unavailable" "failed" 0
  exit 1
fi
docker_version=$(printf '%s' "$command_stdout" | tr '\n' ' ' | sed 's/[[:space:]]*$//')

run_docker "$command_timeout_seconds" compose version
if [ "$command_code" -ne 0 ]; then
  echo "ensure-version: cannot read Docker Compose version: $command_stderr" >&2
  write_summary "$docker_version" "unknown" "unavailable" "failed" 0
  exit 1
fi
compose_version=$(printf '%s' "$command_stdout" | tr '\n' ' ' | sed 's/[[:space:]]*$//')

strategy="compatible"
update_attempts=0
run_docker "$command_timeout_seconds" desktop update --help
if [ "$command_timed_out" -eq 1 ]; then
  echo "ensure-version: Docker Desktop updater probe timed out; no automatic retry" >&2
  write_summary "$docker_version" "$compose_version" "latest-stable" "failed" 0
  exit 1
fi

if [ "$command_code" -eq 0 ]; then
  strategy="latest-stable"
  update_attempts=1
  run_docker "$update_timeout_seconds" desktop update --quiet
  if [ "$command_code" -ne 0 ]; then
    update_stdout=$(limit_diagnostic "$command_stdout" "$diagnostic_limit")
    update_stderr=$(limit_diagnostic "$command_stderr" "$diagnostic_limit")
    echo "ensure-version: stable Docker Desktop update failed (exit $command_code; stdout=$update_stdout; stderr=$update_stderr); no automatic retry" >&2
    write_summary "$docker_version" "$compose_version" "$strategy" "failed" "$update_attempts"
    exit 1
  fi

  run_docker "$command_timeout_seconds" --version
  if [ "$command_code" -ne 0 ]; then
    echo "ensure-version: updated Docker installation could not be verified; no automatic retry" >&2
    write_summary "unknown" "unknown" "$strategy" "verification-failed" "$update_attempts"
    exit 1
  fi
  docker_version=$(printf '%s' "$command_stdout" | tr '\n' ' ' | sed 's/[[:space:]]*$//')

  run_docker "$command_timeout_seconds" compose version
  if [ "$command_code" -ne 0 ]; then
    echo "ensure-version: updated Docker installation could not be verified; no automatic retry" >&2
    write_summary "$docker_version" "unknown" "$strategy" "verification-failed" "$update_attempts"
    exit 1
  fi
  compose_version=$(printf '%s' "$command_stdout" | tr '\n' ' ' | sed 's/[[:space:]]*$//')
fi

run_docker "$command_timeout_seconds" compose pull --help
pull_code=$command_code
pull_text="$command_stdout $command_stderr"
run_docker "$command_timeout_seconds" compose run --help
run_code=$command_code
run_text="$command_stdout $command_stderr"
if [ "$pull_code" -ne 0 ] || [[ "$pull_text" != *--policy* ]] || [ "$run_code" -ne 0 ] || [[ "$run_text" != *--pull* ]]; then
  echo "ensure-version: Docker Compose lacks required pull policy capabilities; no automatic retry" >&2
  write_summary "$docker_version" "$compose_version" "$strategy" "incompatible" "$update_attempts"
  exit 1
fi

if [ "$strategy" = "latest-stable" ]; then
  result="updated-or-current"
else
  result="suitable"
fi
write_summary "$docker_version" "$compose_version" "$strategy" "$result" "$update_attempts"
exit 0
