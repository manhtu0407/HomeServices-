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
  $versionOutput = @(& $PnpmPath --version)
  if ($LASTEXITCODE -ne 0 -or $versionOutput.Count -eq 0) {
    throw "Could not determine the pnpm version at '$PnpmPath'."
  }

  $actualVersion = [string]$versionOutput[-1]
  $actualVersion = $actualVersion.Trim()
  $prefix = if ($actualVersion -eq $expectedVersion) {
    @()
  } else {
    # Bootstrap the repo-pinned CLI without letting a mismatched global pnpm
    # reinterpret or purge this workspace's node_modules graph.
    @("dlx", "pnpm@$expectedVersion")
  }

  return [pscustomobject]@{
    Command = $PnpmPath
    Prefix = @($prefix)
    ExpectedVersion = $expectedVersion
    ActualVersion = $actualVersion
  }
}
