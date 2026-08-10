[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('staging', 'production')]
  [string]$Environment,
  [Parameter(Mandatory = $true)]
  [string]$EnvFile,
  [ValidateRange(1, 65535)]
  [int]$Port,
  [switch]$NoClear
)

$ErrorActionPreference = 'Stop'

$scriptRoot = if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) { Split-Path -Parent $MyInvocation.MyCommand.Path } else { $PSScriptRoot }
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $scriptRoot '..')).Path
. (Join-Path $scriptRoot 'lib\staging-target-safety.ps1')

if (-not [System.IO.Path]::IsPathRooted($EnvFile)) {
  $EnvFile = Join-Path $repoRoot $EnvFile
}
$EnvFile = (Resolve-Path -LiteralPath $EnvFile).Path
$allowedEnvNames = @(
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_API_BASE_URL'
)

function Import-EnvFile {
  param(
    [string]$Path,
    [string[]]$AllowedNames
  )

  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith('#')) {
      continue
    }
    if ($trimmed -notmatch '^\s*(?:export\s+)?([^=]+?)\s*=\s*(.*)$') {
      continue
    }

    $name = $matches[1].Trim()
    if ($AllowedNames -notcontains $name) {
      continue
    }
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

Import-EnvFile -Path $EnvFile -AllowedNames $allowedEnvNames

$supabaseUrl = Require-Env 'EXPO_PUBLIC_SUPABASE_URL'
$publishableKey = Require-Env 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
$apiBase = [Environment]::GetEnvironmentVariable('EXPO_PUBLIC_API_BASE_URL')
if ([string]::IsNullOrWhiteSpace($apiBase)) {
  $apiBase = "$($supabaseUrl.TrimEnd('/'))/functions/v1/mobile-api"
  [Environment]::SetEnvironmentVariable('EXPO_PUBLIC_API_BASE_URL', $apiBase, 'Process')
}

switch ($Environment) {
  'staging' {
    Assert-StagingSupabaseTargets -SupabaseUrl $supabaseUrl -MobileApiUrl $apiBase
  }
  'production' {
    Assert-ProductionSupabaseTargets -SupabaseUrl $supabaseUrl -MobileApiUrl $apiBase
    $stagingPaymentRail = [Environment]::GetEnvironmentVariable('EXPO_PUBLIC_STAGING_PAYMENT_RAIL_ENABLED')
    if (-not [string]::IsNullOrWhiteSpace($stagingPaymentRail) -and $stagingPaymentRail -ine 'false') {
      throw 'Production preview requires EXPO_PUBLIC_STAGING_PAYMENT_RAIL_ENABLED to be false.'
    }
    [Environment]::SetEnvironmentVariable('EXPO_PUBLIC_STAGING_PAYMENT_RAIL_ENABLED', 'false', 'Process')
  }
}
Assert-SupabasePublishableKey -Value $publishableKey

$env:EXPO_NO_DOTENV = '1'
$env:NESTSCOUT_MOBILE_ENV_FILE = $EnvFile

Write-Host "Starting NestScout mobile web preview on port $Port with $Environment public env loaded. Values are hidden."

$args = @('@nestscout/mobile', 'web', '--port', "$Port")
if (-not $NoClear) {
  $args += '--clear'
}

& (Join-Path $scriptRoot 'run-package-script.ps1') @args
exit $LASTEXITCODE
