[CmdletBinding()]
param(
  [string]$EnvFile = 'apps/mobile/.env.staging',
  [int]$Port = 8082,
  [switch]$NoClear
)

$ErrorActionPreference = 'Stop'

$stagingRef = 'xyylanuyflrjzbjzhqfl'
$productionRef = 'iwevizmsedyqozxlawwl'
$scriptRoot = if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) { Split-Path -Parent $MyInvocation.MyCommand.Path } else { $PSScriptRoot }
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $scriptRoot '..')).Path

if (-not [System.IO.Path]::IsPathRooted($EnvFile)) {
  $EnvFile = Join-Path $repoRoot $EnvFile
}
$EnvFile = (Resolve-Path -LiteralPath $EnvFile).Path

function Import-EnvFile {
  param([string]$Path)

  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith('#')) {
      continue
    }
    if ($trimmed -notmatch '^\s*(?:export\s+)?([^=]+?)\s*=\s*(.*)$') {
      continue
    }

    $name = $matches[1].Trim()
    $value = $matches[2].Trim()
    if ($value.Length -ge 2) {
      $first = $value.Substring(0, 1)
      $last = $value.Substring($value.Length - 1, 1)
      if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }

    if (-not [string]::IsNullOrWhiteSpace($name)) {
      [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
  }
}

function Require-Env {
  param([string]$Name)

  $value = [Environment]::GetEnvironmentVariable($Name)
  if (-not [string]::IsNullOrWhiteSpace($value)) {
    return $value
  }

  throw "Missing required local environment variable: $Name"
}

function Assert-StagingRef {
  param(
    [string]$Value,
    [string]$Label
  )

  if ([string]::IsNullOrWhiteSpace($Value) -or -not $Value.Contains($stagingRef)) {
    throw "$Label must target staging ref $stagingRef."
  }
  if ($Value.Contains($productionRef)) {
    throw "$Label points at production ref $productionRef."
  }
}

Import-EnvFile -Path $EnvFile

$supabaseUrl = Require-Env 'EXPO_PUBLIC_SUPABASE_URL'
$publishableKey = Require-Env 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
$apiBase = [Environment]::GetEnvironmentVariable('EXPO_PUBLIC_API_BASE_URL')
if ([string]::IsNullOrWhiteSpace($apiBase)) {
  $apiBase = "$($supabaseUrl.TrimEnd('/'))/functions/v1/mobile-api"
  [Environment]::SetEnvironmentVariable('EXPO_PUBLIC_API_BASE_URL', $apiBase, 'Process')
}

Assert-StagingRef -Value $supabaseUrl -Label 'EXPO_PUBLIC_SUPABASE_URL'
Assert-StagingRef -Value $apiBase -Label 'EXPO_PUBLIC_API_BASE_URL'
[void]$publishableKey

$env:EXPO_NO_DOTENV = '1'
$env:NESTSCOUT_MOBILE_ENV_FILE = $EnvFile

Write-Host "Starting NestScout mobile web preview on port $Port with staging public env loaded. Values are hidden."

$args = @('@nestscout/mobile', 'web', '--port', "$Port")
if (-not $NoClear) {
  $args += '--clear'
}

& (Join-Path $scriptRoot 'run-package-script.ps1') @args
exit $LASTEXITCODE
