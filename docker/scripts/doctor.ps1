# Preflight gate for the local Supabase stack.
# Order is deliberate: RAM is checked before disk because RAM is the binding
# constraint on this class of machine (16 GB total, Supabase wants >= 7 GB for
# the full service set). Disk is a safety net, not a design constraint.
# Exit 0 = safe to start. Exit 1 = refuse, with the measured number printed.

[CmdletBinding()]
param(
  [double]$MinRamGb = 4,
  [double]$MinDiskGb = 20,
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"

$failures = @()
$report = @()

function Add-Line {
  param([string]$Label, [string]$Value, [string]$Verdict)
  $script:report += [pscustomobject]@{ Check = $Label; Measured = $Value; Verdict = $Verdict }
}

function Test-PortBindable {
  param([int]$Port)

  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($listener) {
      $listener.Stop()
    }
  }
}

# 1. Docker daemon. Everything else is pointless without it, but a down daemon
#    is reported alongside the resource numbers rather than short-circuiting —
#    the caller usually wants to know whether the machine could host the stack
#    at all, not just that Docker happens to be off right now.
$daemonUp = $false
try {
  $null = & docker info --format '{{.ServerVersion}}' 2>&1
  $daemonUp = ($LASTEXITCODE -eq 0)
} catch {
  $daemonUp = $false
}
if ($daemonUp) {
  Add-Line "docker daemon" "reachable" "OK"
} else {
  Add-Line "docker daemon" "unreachable" "FAIL"
  $failures += "Docker daemon is not running. Start Docker Desktop, then re-run."
}

# 2. Available RAM. Use the performance counter, not Win32_OperatingSystem's
#    FreePhysicalMemory alone — the counter is what Task Manager calls
#    "Available" and is the number the stop threshold was written against.
$availMb = (Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue
$availGb = [math]::Round($availMb / 1024, 2)
if ($availGb -ge $MinRamGb) {
  Add-Line "available RAM" "$availGb GB (min $MinRamGb)" "OK"
} else {
  Add-Line "available RAM" "$availGb GB (min $MinRamGb)" "FAIL"
  $failures += "Available RAM $availGb GB is below the $MinRamGb GB floor. Starting the stack here would push the machine into heavy swap."
}

# 3. Disk.
$drive = Get-PSDrive C
$freeGb = [math]::Round($drive.Free / 1GB, 2)
if ($freeGb -ge $MinDiskGb) {
  Add-Line "C: free disk" "$freeGb GB (min $MinDiskGb)" "OK"
} else {
  Add-Line "C: free disk" "$freeGb GB (min $MinDiskGb)" "FAIL"
  $failures += "C: has $freeGb GB free, below the $MinDiskGb GB floor. Run 'docker system prune' and re-measure."
}

# 4. Ports the CLI binds. Windows can reserve a port without an active listener,
# which otherwise only appears as an opaque container-start failure.
$ports = @(
  @{ Port = 55321; Name = "supabase api gateway" },
  @{ Port = 55322; Name = "supabase db" },
  @{ Port = 55323; Name = "supabase studio" },
  @{ Port = 55324; Name = "supabase mailpit" }
)
foreach ($p in $ports) {
  $inUse = $null -ne (Get-NetTCPConnection -LocalPort $p.Port -State Listen -ErrorAction SilentlyContinue)
  $bindable = -not $inUse -and (Test-PortBindable -Port $p.Port)
  if (-not $bindable) {
    # Only the two lean-profile ports are hard failures; studio and mailpit are
    # excluded from the lean profile, so an unavailable port there does not block a start.
    if ($p.Port -in 55321, 55322) {
      Add-Line "port $($p.Port)" "unavailable ($($p.Name))" "FAIL"
      $failures += "Port $($p.Port) is unavailable. Stop the process holding it, choose an unreserved port, or run 'pnpm db:local:down'."
    } else {
      Add-Line "port $($p.Port)" "unavailable ($($p.Name))" "WARN"
    }
  } else {
    Add-Line "port $($p.Port)" "free" "OK"
  }
}

if (-not $Quiet) {
  Write-Output ""
  Write-Output "local stack preflight"
  $report | Format-Table -AutoSize | Out-String | Write-Output
}

if ($failures.Count -gt 0) {
  Write-Output "REFUSED to start the local stack:"
  foreach ($f in $failures) { Write-Output "  - $f" }
  Write-Output ""
  exit 1
}

Write-Output "preflight passed - safe to start the local stack"
exit 0
