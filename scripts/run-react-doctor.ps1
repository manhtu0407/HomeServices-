param(
  [Parameter(Position = 0)]
  [ValidateSet("", "changed", "lines")]
  [string]$Scope = "",
  [switch]$Changed,
  [switch]$Lines,
  [string]$Base,
  [string]$Project,
  [string]$Version = "0.5.8",
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ExtraArgs
)

$ErrorActionPreference = "Stop"

if ($Scope -eq "changed") {
  $Changed = $true
} elseif ($Scope -eq "lines") {
  $Lines = $true
}

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

$reactDoctorBin = Existing-Path @(
  (Join-Path $repoRoot "node_modules\.bin\react-doctor.CMD"),
  (Join-Path $repoRoot "node_modules\.bin\react-doctor.ps1"),
  (Join-Path $repoRoot "node_modules\.bin\react-doctor")
)

$argsForDoctor = @(".", "--yes", "--verbose", "--blocking", "none", "--no-score")

if ($Changed) {
  $argsForDoctor += @("--scope", "changed")
} elseif ($Lines) {
  $argsForDoctor += @("--scope", "lines")
}

if ($Base) {
  $argsForDoctor += @("--base", $Base)
}

if ($Project) {
  $argsForDoctor += @("--project", $Project)
}

if ($ExtraArgs) {
  $argsForDoctor += $ExtraArgs
}

Push-Location $repoRoot
try {
  if ($reactDoctorBin) {
    & $reactDoctorBin @argsForDoctor
    exit $LASTEXITCODE
  }

  $pnpm = Find-CommandPath @("pnpm.cmd", "pnpm")
  if (-not $pnpm) {
    $pnpm = Existing-Path @(
      (Join-Path $codexRuntimeRoot "bin\pnpm.cmd"),
      (Join-Path $env:LOCALAPPDATA "pnpm\pnpm.cmd")
    )
  }

  if (-not $pnpm) {
    throw "React Doctor could not run: no local react-doctor binary and no pnpm executable found."
  }

  & $pnpm dlx "react-doctor@$Version" @argsForDoctor
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
