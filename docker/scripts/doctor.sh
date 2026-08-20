#!/usr/bin/env bash
# POSIX mirror of doctor.ps1. It measures the same verdicts, not the same numbers:
# there is no C: drive here, so disk is measured on the filesystem holding the repo,
# and ports are checked for an active listener rather than a Windows reservation
# (only Windows can reserve a port with nothing listening on it).
set -uo pipefail

min_ram_gb=4
min_disk_gb=20
quiet=0
while [ $# -gt 0 ]; do
  case "$1" in
    --min-ram-gb) min_ram_gb="$2"; shift 2 ;;
    --min-disk-gb) min_disk_gb="$2"; shift 2 ;;
    --quiet) quiet=1; shift ;;
    *) echo "doctor: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

failures=()
report=()
add_line() { report+=("$(printf '%-22s %-28s %s' "$1" "$2" "$3")"); }
ge() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a >= b) }'; }

# 1. Docker daemon. A down daemon is reported alongside the resource numbers rather
#    than short-circuiting — the caller usually wants to know whether the machine
#    could host the stack at all, not just that Docker happens to be off right now.
if docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; then
  add_line "docker daemon" "reachable" "OK"
else
  add_line "docker daemon" "unreachable" "FAIL"
  failures+=("Docker daemon is not running. Start Docker, then re-run.")
fi

# 2. Available RAM. MemAvailable is the kernel's own estimate of what a new workload
#    can claim without swapping, which is what the Windows "Available" counter meant.
avail_kb=$(awk '/^MemAvailable:/ { print $2; exit }' /proc/meminfo 2>/dev/null || echo 0)
avail_gb=$(awk -v k="$avail_kb" 'BEGIN { printf "%.2f", k / 1048576 }')
if ge "$avail_gb" "$min_ram_gb"; then
  add_line "available RAM" "$avail_gb GB (min $min_ram_gb)" "OK"
else
  add_line "available RAM" "$avail_gb GB (min $min_ram_gb)" "FAIL"
  failures+=("Available RAM $avail_gb GB is below the $min_ram_gb GB floor. Starting the stack here would push the machine into heavy swap.")
fi

# 3. Disk, on the filesystem that actually holds the repo.
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
free_kb=$(df -Pk "$repo_root" | awk 'NR == 2 { print $4 }')
free_gb=$(awk -v k="$free_kb" 'BEGIN { printf "%.2f", k / 1048576 }')
if ge "$free_gb" "$min_disk_gb"; then
  add_line "repo fs free disk" "$free_gb GB (min $min_disk_gb)" "OK"
else
  add_line "repo fs free disk" "$free_gb GB (min $min_disk_gb)" "FAIL"
  failures+=("The repo filesystem has $free_gb GB free, below the $min_disk_gb GB floor. Run 'docker system prune' and re-measure.")
fi

# 4. Ports the CLI binds. Only the two lean-profile ports are hard failures; studio
#    and mailpit are excluded from the lean profile, so a busy port there does not
#    block a start.
port_listening() {
  if command -v ss >/dev/null 2>&1; then
    ss -Hltn "sport = :$1" 2>/dev/null | grep -q . && return 0
    return 1
  fi
  (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1 && { exec 3<&-; return 0; }
  return 1
}
for spec in "55321 supabase api gateway" "55322 supabase db" "55323 supabase studio" "55324 supabase mailpit"; do
  port="${spec%% *}"; name="${spec#* }"
  if port_listening "$port"; then
    case "$port" in
      55321|55322)
        add_line "port $port" "unavailable ($name)" "FAIL"
        failures+=("Port $port is unavailable. Stop the process holding it, or run 'pnpm db:local:down'.")
        ;;
      *) add_line "port $port" "unavailable ($name)" "WARN" ;;
    esac
  else
    add_line "port $port" "free" "OK"
  fi
done

if [ "$quiet" -eq 0 ]; then
  echo
  echo "local stack preflight"
  printf '%-22s %-28s %s\n' "Check" "Measured" "Verdict"
  for line in "${report[@]}"; do echo "$line"; done
  echo
fi

if [ "${#failures[@]}" -gt 0 ]; then
  echo "REFUSED to start the local stack:"
  for f in "${failures[@]}"; do echo "  - $f"; done
  echo
  exit 1
fi

echo "preflight passed - safe to start the local stack"
exit 0
