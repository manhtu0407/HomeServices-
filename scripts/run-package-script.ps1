$ErrorActionPreference = "Stop"
$AllArgs = @($args)

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

if ($AllArgs.Count -lt 2) {
  throw "Usage: run-package-script.ps1 <package-name> <script-name> [script args...]"
}

$packageName = $AllArgs[0]
$scriptName = $AllArgs[1]
$forwardArgs = @()
if ($AllArgs.Count -gt 2) {
  $forwardArgs = $AllArgs[2..($AllArgs.Count - 1)]
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
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

$pnpm = Find-CommandPath @("pnpm.cmd", "pnpm")
if (-not $pnpm) {
  $pnpm = Existing-Path @(
    (Join-Path $codexRuntimeRoot "bin\pnpm.cmd"),
    (Join-Path $env:LOCALAPPDATA "pnpm\pnpm.cmd")
  )
}

if (-not $pnpm) {
  throw "Package script could not run: no pnpm executable found."
}

$pnpmArgs = @("--filter", $packageName, "run", $scriptName)
if ($forwardArgs.Count -gt 0) {
  $pnpmArgs += $forwardArgs
}

Push-Location $repoRoot
try {
  & $pnpm @pnpmArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
