function ConvertTo-TrustedSupabaseUri {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value,
    [Parameter(Mandatory = $true)]
    [string]$Label,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedPath,
    [Parameter(Mandatory = $true)]
    [string]$ProjectRef,
    [Parameter(Mandatory = $true)]
    [string]$EnvironmentName
  )

  $expectedHost = "$ProjectRef.supabase.co"
  $expectedOrigin = "https://$expectedHost"
  if ([string]::IsNullOrWhiteSpace($Value) -or $Value -ne $Value.Trim()) {
    throw "$Label must use the exact $EnvironmentName Supabase origin $expectedOrigin."
  }

  $uri = $null
  if (-not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri)) {
    throw "$Label must be an absolute HTTPS URL."
  }

  if (
    $uri.Scheme -cne 'https' -or
    $uri.Host -ine $expectedHost -or
    -not $uri.IsDefaultPort -or
    -not [string]::IsNullOrEmpty($uri.UserInfo) -or
    -not [string]::IsNullOrEmpty($uri.Query) -or
    -not [string]::IsNullOrEmpty($uri.Fragment)
  ) {
    throw "$Label must use the exact $EnvironmentName Supabase origin $expectedOrigin without credentials, query, or fragment."
  }

  $path = $uri.AbsolutePath.TrimEnd('/')
  if ([string]::IsNullOrEmpty($path)) {
    $path = '/'
  }
  if ($path -cne $ExpectedPath) {
    throw "$Label must use path $ExpectedPath."
  }

  return $uri
}

function Assert-SupabaseTargets {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$SupabaseUrl,
    [Parameter(Mandatory = $true)]
    [string]$MobileApiUrl,
    [Parameter(Mandatory = $true)]
    [string]$ProjectRef,
    [Parameter(Mandatory = $true)]
    [string]$EnvironmentName
  )

  $supabase = ConvertTo-TrustedSupabaseUri -Value $SupabaseUrl -Label 'Supabase URL' -ExpectedPath '/' -ProjectRef $ProjectRef -EnvironmentName $EnvironmentName
  $mobileApi = ConvertTo-TrustedSupabaseUri -Value $MobileApiUrl -Label 'mobile-api URL' -ExpectedPath '/functions/v1/mobile-api' -ProjectRef $ProjectRef -EnvironmentName $EnvironmentName
  if ($supabase.GetLeftPart([UriPartial]::Authority) -ine $mobileApi.GetLeftPart([UriPartial]::Authority)) {
    throw "Supabase and mobile-api targets must use the same $EnvironmentName origin."
  }
}

function Assert-StagingSupabaseTargets {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$SupabaseUrl,
    [Parameter(Mandatory = $true)]
    [string]$MobileApiUrl
  )

  Assert-SupabaseTargets -SupabaseUrl $SupabaseUrl -MobileApiUrl $MobileApiUrl -ProjectRef 'xyylanuyflrjzbjzhqfl' -EnvironmentName 'staging'
}

function Assert-ProductionSupabaseTargets {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$SupabaseUrl,
    [Parameter(Mandatory = $true)]
    [string]$MobileApiUrl
  )

  Assert-SupabaseTargets -SupabaseUrl $SupabaseUrl -MobileApiUrl $MobileApiUrl -ProjectRef 'iwevizmsedyqozxlawwl' -EnvironmentName 'production'
}

function Get-LegacySupabaseJwtRole {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  $parts = $Value.Split('.')
  if ($parts.Count -ne 3 -or $Value -notmatch '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$') {
    return $null
  }

  $payload = $parts[1].Replace('-', '+').Replace('_', '/')
  switch ($payload.Length % 4) {
    0 { }
    2 { $payload += '==' }
    3 { $payload += '=' }
    default { return $null }
  }

  try {
    $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json -ErrorAction Stop
    return [string]$json.role
  } catch {
    return $null
  }
}

function Assert-SupabasePublishableKey {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  if (
    [string]::IsNullOrWhiteSpace($Value) -or
    $Value -ne $Value.Trim() -or
    $Value.Length -gt 4096 -or
    $Value -match '[\x00-\x20\x7f]'
  ) {
    throw 'Supabase publishable key is invalid.'
  }
  if ($Value -match '^sb_publishable_[A-Za-z0-9_-]+$') {
    return
  }
  if ((Get-LegacySupabaseJwtRole -Value $Value) -ceq 'anon') {
    return
  }

  throw 'Supabase publishable key must not contain server authority.'
}
