#!/usr/bin/env bash
# POSIX mirror of doctor.ps1. The daemon probe owns a watchdog so a wedged
# Docker API cannot hold the caller open beyond the fixed contract timeout.
set -uo pipefail

profile="lean"
while [ $# -gt 0 ]; do
  case "$1" in
    --profile)
      [ $# -ge 2 ] || { echo "doctor: --profile requires lean or full" >&2; exit 2; }
      profile="$2"
      shift 2
      ;;
    *) echo "doctor: expected only --profile lean|full" >&2; exit 2 ;;
  esac
done

case "$profile" in
  lean) required_ram_gb=4 ;;
  full) required_ram_gb=7 ;;
  *) echo "doctor: profile must be lean or full" >&2; exit 2 ;;
esac

min_disk_gb=20
daemon_timeout_seconds=15
failures=()
report=()
add_line() { report+=("$(printf '%-22s %-52s %s' "$1" "$2" "$3")"); }
ge() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a >= b) }'; }

probe_out=$(mktemp)
probe_err=$(mktemp)
probe_timeout=$(mktemp)
rm -f "$probe_timeout"
probe_pid=""
watchdog_pid=""
kill_probe_tree() {
  local parent="$1"
  local signal="$2"
  local child
  while read -r child; do
    [ -n "$child" ] && kill_probe_tree "$child" "$signal"
  done < <(ps -eo pid=,ppid= 2>/dev/null | awk -v parent="$parent" '$2 == parent { print $1 }')
  kill "-$signal" "$parent" >/dev/null 2>&1 || true
}
cleanup_probe() {
  [ -n "$watchdog_pid" ] && kill "$watchdog_pid" >/dev/null 2>&1 || true
  [ -n "$probe_pid" ] && kill_probe_tree "$probe_pid" KILL
  rm -f "$probe_out" "$probe_err" "$probe_timeout"
}
trap cleanup_probe EXIT

docker info --format '{{.ServerVersion}}' >"$probe_out" 2>"$probe_err" &
probe_pid=$!
(
  sleep "$daemon_timeout_seconds"
  if kill -0 "$probe_pid" >/dev/null 2>&1; then
    : >"$probe_timeout"
    kill_probe_tree "$probe_pid" TERM
    sleep 1
    kill_probe_tree "$probe_pid" KILL
  fi
) &
watchdog_pid=$!

wait "$probe_pid"
daemon_code=$?
probe_pid=""
kill "$watchdog_pid" >/dev/null 2>&1 || true
wait "$watchdog_pid" >/dev/null 2>&1 || true
watchdog_pid=""

if [ -f "$probe_timeout" ]; then
  daemon_detail="timeout after $daemon_timeout_seconds seconds"
  daemon_up=0
elif [ "$daemon_code" -eq 0 ]; then
  server_version=$(tr -d '\r\n' <"$probe_out")
  daemon_detail="reachable${server_version:+ (server $server_version)}"
  daemon_up=1
else
  daemon_error=$(tr '\r\n' '  ' <"$probe_err" | sed 's/[[:space:]]*$//')
  daemon_detail="unreachable${daemon_error:+: $daemon_error}"
  daemon_up=0
fi

if [ "$daemon_up" -eq 1 ]; then
  add_line "docker daemon" "$daemon_detail" "OK"
else
  add_line "docker daemon" "$daemon_detail" "FAIL"
  failures+=("Docker daemon probe failed ($daemon_detail). Lanes A and B are closed for this measured state.")
fi

if [ -r /proc/meminfo ]; then
  avail_kb=$(awk '/^MemAvailable:/ { print $2; exit }' /proc/meminfo)
  avail_gb=$(awk -v k="${avail_kb:-0}" 'BEGIN { printf "%.2f", k / 1048576 }')
elif command -v vm_stat >/dev/null 2>&1 && command -v sysctl >/dev/null 2>&1; then
  page_size=$(sysctl -n hw.pagesize 2>/dev/null || printf '4096')
  available_pages=$(vm_stat | awk '
    /Pages free:|Pages inactive:|Pages speculative:|Pages purgeable:/ {
      gsub(/\./, "", $3); total += $3
    }
    END { print total + 0 }
  ')
  avail_gb=$(awk -v pages="${available_pages:-0}" -v size="${page_size:-4096}" 'BEGIN { printf "%.2f", pages * size / 1073741824 }')
else
  avail_gb=0
fi
if ge "$avail_gb" "$required_ram_gb"; then
  add_line "available RAM" "$avail_gb GB (profile $profile min $required_ram_gb)" "OK"
else
  add_line "available RAM" "$avail_gb GB (profile $profile min $required_ram_gb)" "FAIL"
  failures+=("Available RAM $avail_gb GB is below the $required_ram_gb GB floor for profile $profile. Lanes A and B are closed for this measured state.")
fi

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
free_kb=$(df -Pk "$repo_root" | awk 'NR == 2 { print $4 }')
free_gb=$(awk -v k="$free_kb" 'BEGIN { printf "%.2f", k / 1048576 }')
if ge "$free_gb" "$min_disk_gb"; then
  add_line "repo fs free disk" "$free_gb GB (min $min_disk_gb)" "OK"
else
  add_line "repo fs free disk" "$free_gb GB (min $min_disk_gb)" "FAIL"
  failures+=("The repo filesystem has $free_gb GB free, below the $min_disk_gb GB floor. Cleanup requires a separately verified and user-approved target.")
fi

port_owner() {
  if command -v ss >/dev/null 2>&1; then
    owner=$(ss -Hltnp "sport = :$1" 2>/dev/null | head -1)
    [ -n "$owner" ] && { printf '%s' "$owner"; return; }
  fi
  printf '%s' "owner unknown"
}
port_listening() {
  if command -v ss >/dev/null 2>&1; then
    ss -Hltn "sport = :$1" 2>/dev/null | grep -q .
    return
  fi
  (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1
}

for spec in "55321 supabase api gateway" "55322 supabase db" "55323 supabase studio" "55324 supabase mailpit"; do
  port="${spec%% *}"
  name="${spec#* }"
  if ! port_listening "$port"; then
    add_line "port $port" "free" "OK"
    continue
  fi

  owner=$(port_owner "$port")
  value="unavailable ($name; $owner)"
  if [ "$profile" = "lean" ] && { [ "$port" = 55323 ] || [ "$port" = 55324 ]; }; then
    add_line "port $port" "$value" "WARN"
  else
    add_line "port $port" "$value" "FAIL"
    failures+=("Port $port is unavailable ($owner). Verify ownership before stopping any process or stack.")
  fi
done

echo
echo "local stack preflight (profile $profile)"
printf '%-22s %-52s %s\n' "Check" "Measured" "Verdict"
for line in "${report[@]}"; do echo "$line"; done
echo

if [ "${#failures[@]}" -gt 0 ]; then
  echo "REFUSED to start the local stack:"
  for failure in "${failures[@]}"; do echo "  - $failure"; done
  echo
  exit 1
fi

echo "preflight passed - safe to start the local stack"
exit 0
