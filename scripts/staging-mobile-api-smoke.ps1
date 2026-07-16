[CmdletBinding()]
param(
  [string]$EnvFile = '.env.local',
  [ValidateLength(1, 200)]
  [string]$AutocompleteInput = 'Quan 1, Thanh pho Ho Chi Minh'
)

$ErrorActionPreference = 'Stop'
$stagingRef = 'xyylanuyflrjzbjzhqfl'
$scriptRoot = if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) { Split-Path -Parent $MyInvocation.MyCommand.Path } else { $PSScriptRoot }
$repoRoot = Resolve-Path -LiteralPath (Join-Path $scriptRoot '..')
. (Join-Path $scriptRoot 'lib\staging-target-safety.ps1')
if (-not [System.IO.Path]::IsPathRooted($EnvFile)) {
  $EnvFile = Join-Path $repoRoot $EnvFile
}
$allowedEnvNames = @(
  'EXPO_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY',
  'STAGING_ACCESS_TOKEN',
  'SUPABASE_STAGING_ACCESS_TOKEN',
  'EXPO_PUBLIC_API_BASE_URL'
)

function Import-EnvFile {
  param(
    [string]$Path,
    [string[]]$AllowedNames
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith('#')) {
      continue
    }

    if ($trimmed -notmatch '^([^=]+)=(.*)$') {
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

    if (-not [string]::IsNullOrWhiteSpace($name) -and [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
      [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
  }
}

function Require-Env {
  param([string[]]$Names)

  foreach ($name in $Names) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value
    }
  }

  throw "Missing required local environment variable: $($Names -join ' or ')"
}

Import-EnvFile -Path $EnvFile -AllowedNames $allowedEnvNames

$supabaseUrl = Require-Env @('EXPO_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')
$publishableKey = Require-Env @('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY')
$accessToken = Require-Env @('STAGING_ACCESS_TOKEN', 'SUPABASE_STAGING_ACCESS_TOKEN')
$apiBase = [Environment]::GetEnvironmentVariable('EXPO_PUBLIC_API_BASE_URL')

if ([string]::IsNullOrWhiteSpace($apiBase)) {
  $apiBase = "$($supabaseUrl.TrimEnd('/'))/functions/v1/mobile-api"
}

Assert-StagingSupabaseTargets -SupabaseUrl $supabaseUrl -MobileApiUrl $apiBase
Assert-SupabasePublishableKey -Value $publishableKey

$headers = @{
  apikey = $publishableKey
  Authorization = "Bearer $accessToken"
  'Content-Type' = 'application/json'
}

Write-Host "Staging mobile-api smoke: $stagingRef"

$servicesUri = "$($apiBase.TrimEnd('/'))/services"
$services = Invoke-RestMethod -Method Get -Uri $servicesUri -Headers $headers -TimeoutSec 20
$expectedServiceTypes = @('electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman')
$actualServiceTypes = @($services.services | ForEach-Object { [string]$_.service_type } | Sort-Object -Unique)
$serviceTypeDiff = @(
  Compare-Object -ReferenceObject $expectedServiceTypes -DifferenceObject $actualServiceTypes
)
if (
  $null -eq $services.services -or
  $services.services.Count -ne $expectedServiceTypes.Count -or
  $actualServiceTypes.Count -ne $expectedServiceTypes.Count -or
  $serviceTypeDiff.Count -gt 0
) {
  throw "Unexpected /services response. Expected the exact six-service launch catalog."
}

$placesUri = "$($apiBase.TrimEnd('/'))/places/autocomplete"
$placesBody = @{
  input = $AutocompleteInput
  session_token = "codex-staging-smoke-$([Guid]::NewGuid().ToString('N'))"
} | ConvertTo-Json -Compress
$places = Invoke-RestMethod -Method Post -Uri $placesUri -Headers $headers -Body $placesBody -TimeoutSec 20

if ($null -eq $places.suggestions -or $null -eq $places.fallback_used) {
  throw "Unexpected /places/autocomplete response shape."
}

if ($places.fallback_used -eq $true) {
  throw "Places autocomplete returned fallback_used=true. Edge route is alive, but Google Maps secret/API/quota still needs verification."
}

Write-Host "PASS: /services count=$($services.services.Count); /places/autocomplete suggestions=$($places.suggestions.Count); fallback_used=false"
