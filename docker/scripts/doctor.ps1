# Preflight gate for the local Supabase stack.
# The daemon probe is a child process so a wedged Docker API cannot hold the
# agent open beyond the contract's fixed timeout.

$ErrorActionPreference = "Stop"
$Profile = "lean"

if ($args.Count -gt 0) {
  if ($args.Count -ne 2 -or $args[0] -notin "-Profile", "--profile") {
    [Console]::Error.WriteLine("doctor: expected only -Profile lean|full")
    exit 2
  }
  $Profile = $args[1]
}

$RamFloors = @{ lean = 4; full = 7 }
if (-not $RamFloors.ContainsKey($Profile)) {
  [Console]::Error.WriteLine("doctor: profile must be lean or full")
  exit 2
}

$RequiredRamGb = $RamFloors[$Profile]
$MinDiskGb = 20
$DaemonTimeoutSeconds = 15
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
    if ($listener) { $listener.Stop() }
  }
}

function Get-PortOwner {
  param([int]$Port)

  $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  if ($listeners.Count -eq 0) { return "owner unknown or OS reservation" }

  $owners = foreach ($listener in $listeners) {
    $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    $name = if ($process) { $process.ProcessName } else { "unknown" }
    "pid=$($listener.OwningProcess) process=$name"
  }
  return ($owners -join ", ")
}

function Read-TrimmedTextFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) { return "" }
  $content = Get-Content -LiteralPath $Path -Raw
  if ($null -eq $content) { return "" }
  return $content.Trim()
}

function Resolve-DockerCommandPath {
  $docker = @(Get-Command docker.exe -CommandType Application -All -ErrorAction SilentlyContinue)[0]
  if (-not $docker) {
    $docker = @(Get-Command docker -CommandType Application -All -ErrorAction SilentlyContinue)[0]
  }
  if (-not $docker) { return $null }
  return $docker.Source
}

function Invoke-DockerInfoProbe {
  $dockerPath = Resolve-DockerCommandPath
  if (-not $dockerPath) {
    return [pscustomobject]@{ Reachable = $false; Detail = "docker command unavailable" }
  }

  $probeId = [guid]::NewGuid().ToString("N")
  $stdoutPath = Join-Path ([System.IO.Path]::GetTempPath()) "nestscout-docker-info-$probeId.out"
  $stderrPath = Join-Path ([System.IO.Path]::GetTempPath()) "nestscout-docker-info-$probeId.err"
  $exitCodePath = Join-Path ([System.IO.Path]::GetTempPath()) "nestscout-docker-info-$probeId.exit"
  $escapedDockerPath = $dockerPath.Replace("'", "''")
  $escapedExitCodePath = $exitCodePath.Replace("'", "''")
  $command = @"
& '$escapedDockerPath' info --format '{{.ServerVersion}}'
`$probeExitCode = `$LASTEXITCODE
[System.IO.File]::WriteAllText('$escapedExitCodePath', [string]`$probeExitCode)
exit `$probeExitCode
"@
  $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
  $process = $null

  try {
    $process = Start-Process -FilePath (Join-Path $PSHOME "powershell.exe") `
      -ArgumentList @("-NoProfile", "-NonInteractive", "-EncodedCommand", $encodedCommand) `
      -PassThru -NoNewWindow `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath

    if (-not $process.WaitForExit($DaemonTimeoutSeconds * 1000)) {
      & taskkill.exe /PID $process.Id /T /F *> $null
      if (-not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      }
      $null = $process.WaitForExit(2000)
      return [pscustomobject]@{ Reachable = $false; Detail = "timeout after $DaemonTimeoutSeconds seconds" }
    }

    $process.WaitForExit()
    $exitCode = Read-TrimmedTextFile -Path $exitCodePath
    $exitDetail = if ([string]::IsNullOrWhiteSpace($exitCode)) { "unknown" } else { $exitCode }
    $stdout = Read-TrimmedTextFile -Path $stdoutPath
    $stderr = Read-TrimmedTextFile -Path $stderrPath
    if ($exitCode -eq "0") {
      $detail = if ($stdout) { "reachable (server $stdout)" } else { "reachable" }
      return [pscustomobject]@{ Reachable = $true; Detail = $detail }
    }

    $detail = if ($stderr) { "unreachable: $stderr" } else { "unreachable (exit $exitDetail)" }
    return [pscustomobject]@{ Reachable = $false; Detail = $detail }
  } catch {
    return [pscustomobject]@{ Reachable = $false; Detail = "probe failed: $($_.Exception.Message)" }
  } finally {
    if ($process -and -not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $stdoutPath, $stderrPath, $exitCodePath -Force -ErrorAction SilentlyContinue
  }
}

$daemon = Invoke-DockerInfoProbe
if ($daemon.Reachable) {
  Add-Line "docker daemon" $daemon.Detail "OK"
} else {
  Add-Line "docker daemon" $daemon.Detail "FAIL"
  $failures += "Docker daemon probe failed ($($daemon.Detail)). Lanes A and B are closed for this measured state."
}

$availMb = (Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue
$availGb = [math]::Round($availMb / 1024, 2)
if ($availGb -ge $RequiredRamGb) {
  Add-Line "available RAM" "$availGb GB (profile $Profile min $RequiredRamGb)" "OK"
} else {
  Add-Line "available RAM" "$availGb GB (profile $Profile min $RequiredRamGb)" "FAIL"
  $failures += "Available RAM $availGb GB is below the $RequiredRamGb GB floor for profile $Profile. Lanes A and B are closed for this measured state."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$driveRoot = [System.IO.Path]::GetPathRoot($repoRoot)
$driveName = $driveRoot.TrimEnd("\").TrimEnd(":")
$drive = Get-PSDrive $driveName
$freeGb = [math]::Round($drive.Free / 1GB, 2)
if ($freeGb -ge $MinDiskGb) {
  Add-Line "repo fs free disk" "$freeGb GB (min $MinDiskGb)" "OK"
} else {
  Add-Line "repo fs free disk" "$freeGb GB (min $MinDiskGb)" "FAIL"
  $failures += "The repo filesystem has $freeGb GB free, below the $MinDiskGb GB floor. Cleanup requires a separately verified and user-approved target."
}

$ports = @(
  @{ Port = 55321; Name = "supabase api gateway" },
  @{ Port = 55322; Name = "supabase db" },
  @{ Port = 55323; Name = "supabase studio" },
  @{ Port = 55324; Name = "supabase mailpit" }
)
foreach ($portSpec in $ports) {
  $bindable = Test-PortBindable -Port $portSpec.Port
  if ($bindable) {
    Add-Line "port $($portSpec.Port)" "free" "OK"
    continue
  }

  $owner = Get-PortOwner -Port $portSpec.Port
  $value = "unavailable ($($portSpec.Name); $owner)"
  if ($Profile -eq "lean" -and $portSpec.Port -notin 55321, 55322) {
    Add-Line "port $($portSpec.Port)" $value "WARN"
  } else {
    Add-Line "port $($portSpec.Port)" $value "FAIL"
    $failures += "Port $($portSpec.Port) is unavailable ($owner). Verify ownership before stopping any process or stack."
  }
}

Write-Output ""
Write-Output "local stack preflight (profile $Profile)"
$report | Format-Table -AutoSize | Out-String | Write-Output

if ($failures.Count -gt 0) {
  Write-Output "REFUSED to start the local stack:"
  foreach ($failure in $failures) { Write-Output "  - $failure" }
  Write-Output ""
  exit 1
}

Write-Output "preflight passed - safe to start the local stack"
exit 0
