$ErrorActionPreference = "Stop"

$CommandTimeoutSeconds = 15
$UpdateTimeoutSeconds = 300

if ($args.Count -ne 0) {
  [Console]::Error.WriteLine("ensure-version: no arguments are accepted")
  exit 2
}

function Invoke-DockerCommand {
  param(
    [string[]]$Arguments,
    [int]$TimeoutSeconds
  )

  $docker = @(Get-Command docker -CommandType Application -All -ErrorAction SilentlyContinue)[0]
  if (-not $docker) {
    return [pscustomobject]@{
      ExitCode = 127
      TimedOut = $false
      Stdout = ""
      Stderr = "docker command unavailable"
    }
  }

  $process = [System.Diagnostics.Process]::new()
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  if ([System.IO.Path]::GetExtension($docker.Source) -in ".cmd", ".bat") {
    $startInfo.FileName = $env:ComSpec
    $startInfo.Arguments = "/D /S /C `"`"$($docker.Source)`" $($Arguments -join ' ')`""
  } else {
    $startInfo.FileName = $docker.Source
    $startInfo.Arguments = $Arguments -join " "
  }
  $process.StartInfo = $startInfo
  $started = $false

  try {
    if (-not $process.Start()) {
      throw "Docker process did not start"
    }
    $started = $true
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()

    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
      & taskkill.exe /PID $process.Id /T /F *> $null
      if (-not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      }
      $null = $process.WaitForExit(2000)
      return [pscustomobject]@{
        ExitCode = 124
        TimedOut = $true
        Stdout = ""
        Stderr = "timeout after $TimeoutSeconds seconds"
      }
    }

    $process.WaitForExit()
    $stdout = $stdoutTask.GetAwaiter().GetResult().Trim()
    $stderr = $stderrTask.GetAwaiter().GetResult().Trim()
    return [pscustomobject]@{
      ExitCode = $process.ExitCode
      TimedOut = $false
      Stdout = $stdout
      Stderr = $stderr
    }
  } catch {
    return [pscustomobject]@{
      ExitCode = 1
      TimedOut = $false
      Stdout = ""
      Stderr = "line $($_.InvocationInfo.ScriptLineNumber): $($_.Exception.Message)"
    }
  } finally {
    if ($started -and -not $process.HasExited) {
      & taskkill.exe /PID $process.Id /T /F *> $null
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
    $process.Dispose()
  }
}

function Write-VersionSummary {
  param(
    [string]$DockerVersion,
    [string]$ComposeVersion,
    [string]$Strategy,
    [string]$Result,
    [int]$UpdateAttempts
  )

  Write-Output "docker_version=$DockerVersion"
  Write-Output "compose_version=$ComposeVersion"
  Write-Output "strategy=$Strategy result=$Result update_attempts=$UpdateAttempts"
}

$dockerVersion = Invoke-DockerCommand -Arguments @("--version") -TimeoutSeconds $CommandTimeoutSeconds
if ($dockerVersion.ExitCode -ne 0) {
  [Console]::Error.WriteLine("ensure-version: cannot read Docker version (exit $($dockerVersion.ExitCode)): $($dockerVersion.Stderr)")
  Write-VersionSummary -DockerVersion "unknown" -ComposeVersion "unknown" -Strategy "unavailable" -Result "failed" -UpdateAttempts 0
  exit 1
}

$composeVersion = Invoke-DockerCommand -Arguments @("compose", "version") -TimeoutSeconds $CommandTimeoutSeconds
if ($composeVersion.ExitCode -ne 0) {
  [Console]::Error.WriteLine("ensure-version: cannot read Docker Compose version: $($composeVersion.Stderr)")
  Write-VersionSummary -DockerVersion $dockerVersion.Stdout -ComposeVersion "unknown" -Strategy "unavailable" -Result "failed" -UpdateAttempts 0
  exit 1
}

$strategy = "compatible"
$updateAttempts = 0
$desktopHelp = Invoke-DockerCommand -Arguments @("desktop", "update", "--help") -TimeoutSeconds $CommandTimeoutSeconds
if ($desktopHelp.TimedOut) {
  [Console]::Error.WriteLine("ensure-version: Docker Desktop updater probe timed out; no automatic retry")
  Write-VersionSummary -DockerVersion $dockerVersion.Stdout -ComposeVersion $composeVersion.Stdout -Strategy "latest-stable" -Result "failed" -UpdateAttempts 0
  exit 1
}

if ($desktopHelp.ExitCode -eq 0) {
  $strategy = "latest-stable"
  $updateAttempts = 1
  $update = Invoke-DockerCommand -Arguments @("desktop", "update", "--quiet") -TimeoutSeconds $UpdateTimeoutSeconds
  if ($update.ExitCode -ne 0) {
    $detail = if ($update.Stderr) { $update.Stderr } else { "exit $($update.ExitCode)" }
    [Console]::Error.WriteLine("ensure-version: stable Docker Desktop update failed ($detail); no automatic retry")
    Write-VersionSummary -DockerVersion $dockerVersion.Stdout -ComposeVersion $composeVersion.Stdout -Strategy $strategy -Result "failed" -UpdateAttempts $updateAttempts
    exit 1
  }

  $dockerVersion = Invoke-DockerCommand -Arguments @("--version") -TimeoutSeconds $CommandTimeoutSeconds
  $composeVersion = Invoke-DockerCommand -Arguments @("compose", "version") -TimeoutSeconds $CommandTimeoutSeconds
  if ($dockerVersion.ExitCode -ne 0 -or $composeVersion.ExitCode -ne 0) {
    [Console]::Error.WriteLine("ensure-version: updated Docker installation could not be verified; no automatic retry")
    Write-VersionSummary -DockerVersion "unknown" -ComposeVersion "unknown" -Strategy $strategy -Result "verification-failed" -UpdateAttempts $updateAttempts
    exit 1
  }
}

$pullHelp = Invoke-DockerCommand -Arguments @("compose", "pull", "--help") -TimeoutSeconds $CommandTimeoutSeconds
$runHelp = Invoke-DockerCommand -Arguments @("compose", "run", "--help") -TimeoutSeconds $CommandTimeoutSeconds
$pullText = "$($pullHelp.Stdout)`n$($pullHelp.Stderr)"
$runText = "$($runHelp.Stdout)`n$($runHelp.Stderr)"
if ($pullHelp.ExitCode -ne 0 -or $pullText -notmatch "--policy" -or $runHelp.ExitCode -ne 0 -or $runText -notmatch "--pull") {
  [Console]::Error.WriteLine("ensure-version: Docker Compose lacks required pull policy capabilities; no automatic retry")
  Write-VersionSummary -DockerVersion $dockerVersion.Stdout -ComposeVersion $composeVersion.Stdout -Strategy $strategy -Result "incompatible" -UpdateAttempts $updateAttempts
  exit 1
}

$result = if ($strategy -eq "latest-stable") { "updated-or-current" } else { "suitable" }
Write-VersionSummary -DockerVersion $dockerVersion.Stdout -ComposeVersion $composeVersion.Stdout -Strategy $strategy -Result $result -UpdateAttempts $updateAttempts
exit 0
