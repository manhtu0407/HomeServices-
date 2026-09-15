$ErrorActionPreference = "Stop"
$SupabaseArgs = $args
$ProductionProjectRef = "iwevizmsedyqozxlawwl"
. (Join-Path $PSScriptRoot "resolve-workspace-pnpm.ps1")

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path

function Assert-ProductionSupabaseTarget {
  param([object[]]$Arguments)

  $candidateRefs = @(
    $env:SUPABASE_PROJECT_REF,
    $env:SUPABASE_PROJECT_ID,
    $env:STAGE1_SUPABASE_PROJECT_REF,
    $env:STAGING_SUPABASE_PROJECT_REF
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  foreach ($candidate in $candidateRefs) {
    if ($candidate.Trim().ToLowerInvariant() -ne $ProductionProjectRef) {
      throw "Supabase CLI access is locked to the registered Production project."
    }
  }

  for ($index = 0; $index -lt $Arguments.Count; $index++) {
    $argument = [string]$Arguments[$index]
    if ($argument -in @("--project-ref", "--project-id")) {
      if ($index + 1 -ge $Arguments.Count) {
        throw "$argument requires the registered Production project ref."
      }
      $candidate = [string]$Arguments[$index + 1]
      if ([string]::IsNullOrWhiteSpace($candidate) -or $candidate.StartsWith("--")) {
        throw "$argument requires the registered Production project ref."
      }
      if ($candidate.Trim().ToLowerInvariant() -ne $ProductionProjectRef) {
        throw "Supabase CLI access is locked to the registered Production project."
      }
      continue
    }
    if ($argument -match '^--project-(?:ref|id)=(.+)$' -and $Matches[1].Trim().ToLowerInvariant() -ne $ProductionProjectRef) {
      throw "Supabase CLI access is locked to the registered Production project."
    }
    if ($argument -eq "--db-url" -or $argument.StartsWith("--db-url=")) {
      throw "Supabase CLI database URL overrides are locked; use the registered Production project or --local."
    }
    if ($argument -eq "--linked") {
      $linkedRefPath = Join-Path $repoRoot "supabase\.temp\project-ref"
      if (-not (Test-Path -LiteralPath $linkedRefPath)) {
        throw "Supabase linked target is locked until the exact Production project ref is recorded."
      }
      $linkedRef = (Get-Content -LiteralPath $linkedRefPath -Raw).Trim().ToLowerInvariant()
      if ($linkedRef -ne $ProductionProjectRef) {
        throw "Supabase linked target is locked to the registered Production project."
      }
    }
  }
}

Assert-ProductionSupabaseTarget -Arguments $SupabaseArgs

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

  $pnpmInvocation = Get-WorkspacePnpmInvocation -RepoRoot $repoRoot -PnpmPath $pnpm
  $pnpmArgs = @($pnpmInvocation.Prefix) + @("--filter", "@nestscout/api", "exec", "supabase") + @($SupabaseArgs)
  & $pnpmInvocation.Command @pnpmArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
