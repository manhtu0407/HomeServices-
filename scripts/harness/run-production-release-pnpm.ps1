param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PnpmArgs
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\resolve-workspace-pnpm.ps1')

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$command = Get-Command 'pnpm.cmd' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $command) { $command = Get-Command 'pnpm' -ErrorAction SilentlyContinue | Select-Object -First 1 }
if (-not $command) { throw 'PINNED_PNPM_UNAVAILABLE' }

$invocation = Get-WorkspacePnpmInvocation -RepoRoot $root -PnpmPath $command.Source
$allArgs = @($invocation.Prefix) + @($PnpmArgs)
& $invocation.Command @allArgs
exit $LASTEXITCODE
