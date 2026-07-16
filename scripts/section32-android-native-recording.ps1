[CmdletBinding()]
param(
  [string]$EnvFile = 'apps/mobile/.env.staging',
  [string]$OutputDir = 'tmp/section32-native-recordings',
  [ValidateRange(1, 65535)]
  [int]$Port = 8092,
  [ValidateRange(1, 180)]
  [int]$DurationSeconds = 180,
  [string]$AndroidSdk = 'C:\Android\Sdk',
  [string]$DeviceSerial = '',
  [switch]$NoExpoStart
)

$ErrorActionPreference = 'Stop'

$stagingRef = 'xyylanuyflrjzbjzhqfl'
$scriptRoot = if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) { Split-Path -Parent $MyInvocation.MyCommand.Path } else { $PSScriptRoot }
$repoRoot = Resolve-Path -LiteralPath (Join-Path $scriptRoot '..')
. (Join-Path $scriptRoot 'lib\staging-target-safety.ps1')

if (-not [System.IO.Path]::IsPathRooted($EnvFile)) {
  $EnvFile = Join-Path $repoRoot $EnvFile
}
if (-not [System.IO.Path]::IsPathRooted($OutputDir)) {
  $OutputDir = Join-Path $repoRoot $OutputDir
}
$allowedEnvNames = @(
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_API_BASE_URL',
  'SECTION32_SUPABASE_URL',
  'SECTION32_SUPABASE_ANON_KEY',
  'P15_SUPABASE_URL',
  'P15_SUPABASE_ANON_KEY',
  'SECTION32_NATIVE_RUN',
  'SECTION32_NATIVE_CUSTOMER_EMAIL',
  'SECTION32_NATIVE_CUSTOMER_PASSWORD',
  'SECTION32_NATIVE_WORKER_EMAIL',
  'SECTION32_NATIVE_WORKER_PASSWORD',
  'SECTION32_NODE_PATH'
)
$credentialEnvNames = @(
  'SECTION32_NATIVE_CUSTOMER_EMAIL',
  'SECTION32_NATIVE_CUSTOMER_PASSWORD',
  'SECTION32_NATIVE_WORKER_EMAIL',
  'SECTION32_NATIVE_WORKER_PASSWORD'
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

function Resolve-FirstExistingPath {
  param([string[]]$Candidates)

  foreach ($candidate in $Candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  return ''
}

function Join-PathIfPresent {
  param(
    [string]$BasePath,
    [string]$ChildPath
  )

  if ([string]::IsNullOrWhiteSpace($BasePath)) {
    return ''
  }

  return Join-Path $BasePath $ChildPath
}

function Invoke-Adb {
  param(
    [string]$AdbPath,
    [string[]]$Arguments
  )

  $actualArgs = @()
  if (-not [string]::IsNullOrWhiteSpace($DeviceSerial)) {
    $actualArgs += @('-s', $DeviceSerial)
  }
  $actualArgs += $Arguments
  & $AdbPath @actualArgs
  $adbExitCode = $LASTEXITCODE
  if ($adbExitCode -ne 0) {
    $operation = if ($Arguments.Count -gt 0) { $Arguments[0] } else { '<none>' }
    throw "adb command failed with exit code $adbExitCode while running '$operation'."
  }
}

function Quote-NativeArgument {
  param([string]$Value)

  if ($Value.Contains('"')) {
    throw 'Native process arguments must not contain quote characters.'
  }
  if ($Value -notmatch '\s') {
    return $Value
  }

  return '"' + $Value + '"'
}

function Assert-ExpoProcessHealthy {
  param([System.Diagnostics.Process]$Process)

  if (-not $Process) {
    return
  }
  $Process.Refresh()
  if ($Process.HasExited) {
    throw "Expo process exited early with code $($Process.ExitCode)."
  }
}

function Assert-NonEmptyFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Expected recording artifact was not created: $Path"
  }
  $artifact = Get-Item -LiteralPath $Path
  if ($artifact.Length -le 0) {
    throw "Expected recording artifact is empty: $Path"
  }
}

Import-EnvFile -Path $EnvFile -AllowedNames $allowedEnvNames

if ([Environment]::GetEnvironmentVariable('SECTION32_NATIVE_RUN') -ne '1') {
  throw 'Set SECTION32_NATIVE_RUN=1 to run the mutable/manual Section 32 native recording harness.'
}

$supabaseUrl = Require-Env @('EXPO_PUBLIC_SUPABASE_URL', 'SECTION32_SUPABASE_URL', 'P15_SUPABASE_URL')
$publishableKey = Require-Env @('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SECTION32_SUPABASE_ANON_KEY', 'P15_SUPABASE_ANON_KEY')
$apiBase = [Environment]::GetEnvironmentVariable('EXPO_PUBLIC_API_BASE_URL')
if ([string]::IsNullOrWhiteSpace($apiBase)) {
  $apiBase = "$($supabaseUrl.TrimEnd('/'))/functions/v1/mobile-api"
  [Environment]::SetEnvironmentVariable('EXPO_PUBLIC_API_BASE_URL', $apiBase, 'Process')
}

Assert-StagingSupabaseTargets -SupabaseUrl $supabaseUrl -MobileApiUrl $apiBase
Assert-SupabasePublishableKey -Value $publishableKey

# These values are never printed. Their presence prevents a pre-auth-only capture from being mistaken for G3 proof.
[void](Require-Env @('SECTION32_NATIVE_CUSTOMER_EMAIL'))
[void](Require-Env @('SECTION32_NATIVE_CUSTOMER_PASSWORD'))
[void](Require-Env @('SECTION32_NATIVE_WORKER_EMAIL'))
[void](Require-Env @('SECTION32_NATIVE_WORKER_PASSWORD'))

foreach ($name in $credentialEnvNames) {
  [Environment]::SetEnvironmentVariable($name, $null, 'Process')
}

# Expo automatically loads .env files unless disabled. Keep this harness pinned
# to the staging values already imported/validated above, so an app-level
# .env.local pointing at production cannot override the native recording bundle.
$env:EXPO_NO_DOTENV = '1'
$env:EXPO_PUBLIC_SUPABASE_URL = $supabaseUrl
$env:EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = $publishableKey
$env:EXPO_PUBLIC_API_BASE_URL = $apiBase

$androidHomeEnv = [Environment]::GetEnvironmentVariable('ANDROID_HOME')
if ([string]::IsNullOrWhiteSpace($androidHomeEnv)) {
  $androidHomeEnv = ''
}
$androidSdkRootEnv = [Environment]::GetEnvironmentVariable('ANDROID_SDK_ROOT')
if ([string]::IsNullOrWhiteSpace($androidSdkRootEnv)) {
  $androidSdkRootEnv = ''
}
$section32NodePath = [Environment]::GetEnvironmentVariable('SECTION32_NODE_PATH')
if ([string]::IsNullOrWhiteSpace($section32NodePath)) {
  $section32NodePath = ''
}

$adbPath = Resolve-FirstExistingPath @(
  (Join-PathIfPresent $AndroidSdk 'platform-tools\adb.exe'),
  (Join-PathIfPresent $androidHomeEnv 'platform-tools\adb.exe'),
  (Join-PathIfPresent $androidSdkRootEnv 'platform-tools\adb.exe')
)
if ([string]::IsNullOrWhiteSpace($adbPath)) {
  throw "adb.exe not found. Set -AndroidSdk or ANDROID_HOME/ANDROID_SDK_ROOT."
}
$resolvedAndroidSdk = Split-Path -Parent (Split-Path -Parent $adbPath)

$nodePath = Resolve-FirstExistingPath @(
  $section32NodePath,
  'C:\Users\Phan Manh Tu\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe',
  'C:\Users\Phan Manh Tu\AppData\Local\Temp\node-portable\node-v22.18.0-win-x64\node.exe'
)
if (-not $NoExpoStart -and [string]::IsNullOrWhiteSpace($nodePath)) {
  throw "node.exe not found. Set SECTION32_NODE_PATH or pass -NoExpoStart after starting Expo manually."
}

$expoCli = Join-Path $repoRoot 'apps\mobile\node_modules\expo\bin\cli'
if (-not $NoExpoStart -and -not (Test-Path -LiteralPath $expoCli)) {
  throw "Expo CLI not found at $expoCli."
}

$env:ANDROID_HOME = $resolvedAndroidSdk
$env:ANDROID_SDK_ROOT = $resolvedAndroidSdk

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
$runId = "section32-native-$((Get-Date).ToString('yyyyMMdd-HHmmss'))"
$runDir = Join-Path $OutputDir $runId
New-Item -ItemType Directory -Path $runDir -Force | Out-Null

$checklistPath = Join-Path $runDir 'section32-native-checklist.md'
$reportPath = Join-Path $runDir 'section32-native-report.md'
$videoName = "$runId.mp4"
$remoteVideo = "/sdcard/$videoName"
$localVideo = Join-Path $runDir $videoName
$remoteScreenshot = "/sdcard/$runId-final.png"
$localScreenshot = Join-Path $runDir "$runId-final.png"

$checklist = @"
# Section 32 Native Recording Checklist

Run id: $runId
Device: Android via adb
Staging ref: $stagingRef

Do not mark G3 complete unless the final video shows authenticated Section 32 surfaces, not just pre-auth screens.

Required scenes:

- Customer authenticated flow: Kael customer chat creates a real turn, stage/progress appears, streamed token/caret or JSON fallback is visible, and failure copy stays neutral if streaming degrades.
- Worker authenticated flow: accepted worker job opens worker Kael chat, sends advisory question, receives progress plus answer, and no price/scope/status mutation is offered by the chat.
- Scope-change progress: worker scope-change thinking/progress surface appears when applicable.
- Section 32.6 anti-disintermediation: in-app contact guard/nudge behavior is visible for solicitation text where applicable.
- Section 32.7 apartment access: app-only access/check-in surface is visible where applicable.
- Accessibility modes: capture separate clips or clear toggles for light, dark, Reduce Motion, and Reduce Transparency.
- Language honesty: selected Vietnamese mode must not leak English fallback copy; selected English mode must not leak Vietnamese fallback copy.

Reviewer annotation required after recording:

- Which scenes were captured:
- Which scenes were not captured:
- Device/emulator id:
- Light/dark coverage:
- Reduce Motion coverage:
- Reduce Transparency coverage:
- Known limitations:
"@
Set-Content -LiteralPath $checklistPath -Value $checklist -Encoding UTF8

$expoProcess = $null
try {
  if (-not $NoExpoStart) {
    $expoArgs = @(
      (Quote-NativeArgument -Value $expoCli),
      'start',
      'apps/mobile',
      '--android',
      '--localhost',
      '--port',
      "$Port",
      '--go'
    ) -join ' '
    $expoProcess = Start-Process -FilePath $nodePath -ArgumentList $expoArgs -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 12
    Assert-ExpoProcessHealthy -Process $expoProcess
  }

  Invoke-Adb -AdbPath $adbPath -Arguments @('wait-for-device') | Out-Null

  Write-Host "Section 32 native recording run: $runId"
  Write-Host "Checklist: $checklistPath"
  Write-Host "Recording starts now for $DurationSeconds seconds. Perform the authenticated Section 32 scenes in the Android app."

  Invoke-Adb -AdbPath $adbPath -Arguments @('shell', 'rm', '-f', $remoteVideo, $remoteScreenshot) | Out-Null
  Invoke-Adb -AdbPath $adbPath -Arguments @('shell', 'screenrecord', '--time-limit', "$DurationSeconds", $remoteVideo)
  Invoke-Adb -AdbPath $adbPath -Arguments @('pull', $remoteVideo, $localVideo) | Out-Null
  Assert-NonEmptyFile -Path $localVideo
  Invoke-Adb -AdbPath $adbPath -Arguments @('shell', 'screencap', '-p', $remoteScreenshot) | Out-Null
  Invoke-Adb -AdbPath $adbPath -Arguments @('pull', $remoteScreenshot, $localScreenshot) | Out-Null
  Assert-NonEmptyFile -Path $localScreenshot
  Invoke-Adb -AdbPath $adbPath -Arguments @('shell', 'rm', '-f', $remoteVideo, $remoteScreenshot) | Out-Null
  Assert-ExpoProcessHealthy -Process $expoProcess

  $report = @"
# Section 32 Android Native Recording Report

Run id: $runId
Status: recorded_unreviewed
Date: $(Get-Date -Format o)

Artifacts:

- Video: $localVideo
- Final screenshot: $localScreenshot
- Checklist: $checklistPath

Verification note:

- This script proves only that a staging-guarded native recording was captured.
- G3 is not complete until a reviewer annotates the checklist and confirms the required authenticated customer/worker Section 32 scenes, light/dark, Reduce Motion, and Reduce Transparency coverage.
- The script refused production refs and required staging credentials to be present, but it did not print credential values.
"@
  Set-Content -LiteralPath $reportPath -Value $report -Encoding UTF8
  Write-Host "Report: $reportPath"
} finally {
  if ($expoProcess -and -not $expoProcess.HasExited) {
    Stop-Process -Id $expoProcess.Id -Force
  }
}
