[CmdletBinding()]
param(
  [string]$EnvFile = 'apps/mobile/.env.staging',
  [ValidateRange(1, 65535)]
  [int]$Port = 8082,
  [switch]$NoClear
)

throw 'Staging backend is locked; use the Production mobile web preview runner.'
