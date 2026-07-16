$ErrorActionPreference = "Stop"
$TurboArgs = $args
. (Join-Path $PSScriptRoot "resolve-workspace-pnpm.ps1")

function Find-CommandPath {
  param([string[]]$Candidates)

  foreach ($candidate in $Candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }

    $command = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }

  return $null
}

function Existing-Path {
  param([string[]]$Candidates)

  foreach ($candidate in $Candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }

    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  return $null
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$rootTurboJson = Join-Path $repoRoot "config\turbo\turbo.json"
if (Test-Path -LiteralPath $rootTurboJson) {
  $TurboArgs = @("--root-turbo-json", $rootTurboJson) + @($TurboArgs)
}

$codexRuntimeRoot = Join-Path $HOME ".cache\codex-runtimes\codex-primary-runtime\dependencies"
$nodeExe = Existing-Path @(
  (Join-Path $codexRuntimeRoot "node\bin\node.exe"),
  (Join-Path $codexRuntimeRoot "node\node.exe")
)
$nodeFromPath = Find-CommandPath @("node.exe", "node")

if (-not $nodeExe -and $nodeFromPath) {
  $nodeExe = $nodeFromPath
}

if ($nodeExe) {
  $nodeBin = Split-Path -Parent $nodeExe
  $env:Path = "$nodeBin;$env:Path"
}

Push-Location $repoRoot
try {
  $pnpm = Find-CommandPath @("pnpm.cmd", "pnpm")
  if (-not $pnpm) {
    $pnpm = Existing-Path @(
      (Join-Path $codexRuntimeRoot "bin\pnpm.cmd"),
      (Join-Path $env:LOCALAPPDATA "pnpm\pnpm.cmd")
    )
  }

  if (-not $pnpm) {
    throw "Turbo could not run: no pnpm executable found."
  }

  $pnpmInvocation = Get-WorkspacePnpmInvocation -RepoRoot $repoRoot -PnpmPath $pnpm
  $pnpmArgs = @($pnpmInvocation.Prefix) + @("exec", "turbo") + @($TurboArgs)
  & $pnpmInvocation.Command @pnpmArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
