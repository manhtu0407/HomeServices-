$ErrorActionPreference = "Stop"
$SupabaseArgs = $args

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

$supabaseBin = Existing-Path @(
  (Join-Path $repoRoot "node_modules\.bin\supabase.CMD"),
  (Join-Path $repoRoot "node_modules\.bin\supabase.ps1"),
  (Join-Path $repoRoot "node_modules\.bin\supabase"),
  (Join-Path $repoRoot "apps\api\node_modules\.bin\supabase.CMD"),
  (Join-Path $repoRoot "apps\api\node_modules\.bin\supabase.ps1"),
  (Join-Path $repoRoot "apps\api\node_modules\.bin\supabase")
)

Push-Location $repoRoot
try {
  if ($supabaseBin) {
    & $supabaseBin @SupabaseArgs
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
    throw "Supabase CLI could not run: no workspace supabase binary and no pnpm executable found."
  }

  & $pnpm --filter "@nestscout/api" exec supabase @SupabaseArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
