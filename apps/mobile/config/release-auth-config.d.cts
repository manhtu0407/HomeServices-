export function assertReleaseAuthConfig(input: {
  apiBaseUrl: string
  buildProfile: string
  isEasBuild: boolean
  supabasePublishableKey: string
  supabaseUrl: string
}): void

export function resolveMobileEnvFiles(input: {
  configDir: string
  explicitEnvFiles: string[]
  isEasBuild: boolean
  repoRoot: string
}): string[]
