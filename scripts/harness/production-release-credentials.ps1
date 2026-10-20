param(
  [Parameter(Mandatory = $true)][ValidateSet('Read', 'Set')][string]$Action,
  [string]$Names,
  [string]$Name
)

$ErrorActionPreference = 'Stop'
$allowedNames = @(
  'ANTHROPIC_API_KEY', 'CLOUDFLARE_API_TOKEN', 'DEEPSEEK_API_KEY', 'EXPO_TOKEN',
  'PERPLEXITY_API_KEY', 'PRODUCTION_SUPABASE_ANON_KEY', 'PRODUCTION_SUPABASE_SERVICE_ROLE_KEY',
  'PRODUCTION_SYNTHETIC_CUSTOMER_EMAIL', 'PRODUCTION_SYNTHETIC_CUSTOMER_PASSWORD',
  'PRODUCTION_SYNTHETIC_WORKER_EMAIL', 'PRODUCTION_SYNTHETIC_WORKER_PASSWORD',
  'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD', 'SYSTEM_HEALTH_MONITOR_SECRET',
  'SYSTEM_HEALTH_OBSERVER_SECRET', 'VIETMAP_API_KEY'
)

if (-not ('NestScoutReleaseCredentialNative' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct NestScoutCredential {
    public UInt32 Flags;
    public UInt32 Type;
    [MarshalAs(UnmanagedType.LPWStr)] public string TargetName;
    [MarshalAs(UnmanagedType.LPWStr)] public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    [MarshalAs(UnmanagedType.LPWStr)] public string TargetAlias;
    [MarshalAs(UnmanagedType.LPWStr)] public string UserName;
}

public static class NestScoutReleaseCredentialNative {
    [DllImport("Advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);
    [DllImport("Advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredWrite(ref NestScoutCredential credential, UInt32 flags);
    [DllImport("Advapi32.dll", EntryPoint = "CredFree", SetLastError = false)]
    public static extern void CredFree(IntPtr credential);
}
'@
}

function Assert-AllowedName([string]$Candidate) {
  if ($Candidate -notin $allowedNames) { throw 'CREDENTIAL_NAME_NOT_ALLOWED' }
}

function Read-Credential([string]$Candidate) {
  $pointer = [IntPtr]::Zero
  $target = "NestScoutProductionRelease/$Candidate"
  if (-not [NestScoutReleaseCredentialNative]::CredRead($target, 1, 0, [ref]$pointer)) { return $null }
  try {
    $credential = [Runtime.InteropServices.Marshal]::PtrToStructure($pointer, [type][NestScoutCredential])
    $secretBytes = [byte[]]::new([int]$credential.CredentialBlobSize)
    if ($secretBytes.Length -gt 0) {
      [Runtime.InteropServices.Marshal]::Copy($credential.CredentialBlob, $secretBytes, 0, $secretBytes.Length)
      try { return [Text.Encoding]::UTF8.GetString($secretBytes) }
      finally { for ($index = 0; $index -lt $secretBytes.Length; $index++) { $secretBytes[$index] = 0 } }
    }
    return $null
  } finally {
    [NestScoutReleaseCredentialNative]::CredFree($pointer)
  }
}

if ($Action -eq 'Read') {
  $records = [ordered]@{}
  foreach ($candidate in ($Names -split ',')) {
    Assert-AllowedName $candidate
    $records[$candidate] = Read-Credential $candidate
  }
  $records | ConvertTo-Json -Compress
  exit 0
}

Assert-AllowedName $Name
$secure = Read-Host "Enter the secret value for $Name" -AsSecureString
$bstr = [IntPtr]::Zero
$blob = [IntPtr]::Zero
$secretBytes = $null
try {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $secretBytes = [Text.Encoding]::UTF8.GetBytes($plain)
  if ($secretBytes.Length -eq 0 -or $secretBytes.Length -gt 5120) { throw 'CREDENTIAL_VALUE_SIZE_INVALID' }
  $blob = [Runtime.InteropServices.Marshal]::AllocHGlobal($secretBytes.Length)
  [Runtime.InteropServices.Marshal]::Copy($secretBytes, 0, $blob, $secretBytes.Length)
  $credential = [NestScoutCredential]::new()
  $credential.Type = 1
  $credential.TargetName = "NestScoutProductionRelease/$Name"
  $credential.CredentialBlobSize = [UInt32]$secretBytes.Length
  $credential.CredentialBlob = $blob
  $credential.Persist = 2
  $credential.UserName = $Name
  if (-not [NestScoutReleaseCredentialNative]::CredWrite([ref]$credential, 0)) { throw 'CREDENTIAL_STORE_WRITE_FAILED' }
  Write-Output "Stored credential: $Name"
} finally {
  if ($secretBytes) { for ($index = 0; $index -lt $secretBytes.Length; $index++) { $secretBytes[$index] = 0 } }
  if ($blob -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($blob) }
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  if ($secure) { $secure.Dispose() }
  Remove-Variable plain -ErrorAction SilentlyContinue
}
