[CmdletBinding()]
param(
  [string]$EnvFile = 'apps/mobile/.env.local',
  [ValidateRange(1, 65535)]
  [int]$Port = 8085,
  [switch]$NoClear
)

$scriptRoot = if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) { Split-Path -Parent $MyInvocation.MyCommand.Path } else { $PSScriptRoot }
& (Join-Path $scriptRoot 'run-mobile-web-preview.ps1') -Environment production -EnvFile $EnvFile -Port $Port -NoClear:$NoClear
exit $LASTEXITCODE
