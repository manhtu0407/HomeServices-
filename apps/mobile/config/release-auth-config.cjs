const { resolve } = require('node:path')

function assertReleaseAuthConfig({ isEasBuild, supabasePublishableKey, supabaseUrl }) {
  if (isEasBuild && (!supabaseUrl || !supabasePublishableKey)) {
    throw new Error('EAS build requires EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY for login.')
  }
}

function resolveMobileEnvFiles({ configDir, explicitEnvFiles, isEasBuild, repoRoot }) {
  return [
    ...(isEasBuild ? [] : [resolve(configDir, '.env.staging')]),
    resolve(repoRoot, '.env'),
    resolve(repoRoot, '.env.local'),
    resolve(configDir, '.env'),
    resolve(configDir, '.env.local'),
    ...explicitEnvFiles,
  ]
}

module.exports = { assertReleaseAuthConfig, resolveMobileEnvFiles }
