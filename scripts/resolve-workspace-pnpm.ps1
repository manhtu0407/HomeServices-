function Get-WorkspaceCommandVersion {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$CommandPath,
    [string[]]$Prefix = @()
  )

  try {
    $versionOutput = @(& $CommandPath @Prefix --version 2>$null)
  } catch {
    return $null
  }

  if ($LASTEXITCODE -ne 0 -or $versionOutput.Count -eq 0) {
    return $null
  }

  $version = [string]$versionOutput[-1]
  if ([string]::IsNullOrWhiteSpace($version)) {
    return $null
  }

  return $version.Trim()
}

function Find-WorkspaceCorepackPath {
  foreach ($candidate in @("corepack.cmd", "corepack")) {
    $command = Get-Command $candidate -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) {
      return $command.Source
    }
  }

  return $null
}

function Get-WorkspacePnpmInvocation {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [Parameter(Mandatory = $true)]
    [string]$PnpmPath
  )

  $packageJsonPath = Join-Path $RepoRoot "package.json"
  $packageManager = [string](Get-Content -Raw -LiteralPath $packageJsonPath | ConvertFrom-Json).packageManager
  if ($packageManager -notmatch '^pnpm@(?<version>[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?)$') {
    throw "Workspace packageManager must pin an exact pnpm version. Found: '$packageManager'."
  }

  $expectedVersion = $Matches.version
  $actualVersion = Get-WorkspaceCommandVersion -CommandPath $PnpmPath
  $selectedCommand = $PnpmPath
  $prefix = if ($actualVersion -eq $expectedVersion) {
    @()
  } else {
    $corepackPath = Find-WorkspaceCorepackPath
    $corepackVersion = if ($corepackPath) {
      Get-WorkspaceCommandVersion -CommandPath $corepackPath -Prefix @("pnpm")
    } else {
      $null
    }

    if ($corepackPath -and $corepackVersion -eq $expectedVersion) {
      $selectedCommand = $corepackPath
      $actualVersion = $corepackVersion
      @("pnpm")
    } elseif ($actualVersion) {
      # Bootstrap the repo-pinned CLI without letting a mismatched global pnpm
      # reinterpret or purge this workspace's node_modules graph.
      @("dlx", "pnpm@$expectedVersion")
    } else {
      throw "Could not determine a repo-pinned pnpm command. Candidate '$PnpmPath' and Corepack were unavailable or mismatched."
    }
  }

  return [pscustomobject]@{
    Command = $selectedCommand
    Prefix = @($prefix)
    ExpectedVersion = $expectedVersion
    ActualVersion = $actualVersion
  }
}
