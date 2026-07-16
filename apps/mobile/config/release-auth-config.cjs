const { Buffer } = require('node:buffer')
const { resolve } = require('node:path')

const PRODUCTION_SUPABASE_ORIGIN = 'https://iwevizmsedyqozxlawwl.supabase.co'

function assertReleaseAuthConfig({
  apiBaseUrl,
  buildProfile,
  isEasBuild,
  supabasePublishableKey,
  supabaseUrl,
}) {
  if (isEasBuild && (!supabaseUrl || !supabasePublishableKey)) {
    throw new Error('EAS build requires EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY for login.')
  }
  if (!isEasBuild) return

  if (!isPublishableKey(supabasePublishableKey)) {
    throw new Error('EAS build requires a Supabase publishable or legacy anon key; server authority is forbidden.')
  }

  const supabase = parseSupabaseRoot(supabaseUrl)
  const mobileApi = parseMobileApi(apiBaseUrl)
  if (mobileApi.origin !== supabase.origin) {
    throw new Error('EAS mobile-api URL must use the same Supabase origin as auth.')
  }
  if (buildProfile === 'production' && supabase.origin !== PRODUCTION_SUPABASE_ORIGIN) {
    throw new Error('Production EAS builds must target the production Supabase project.')
  }
}

function parseSupabaseRoot(raw) {
  const url = parseUrl(raw, 'Supabase URL')
  if (
    url.protocol !== 'https:' ||
    !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) ||
    normalizePath(url.pathname) !== '/'
  ) {
    throw new Error('EAS Supabase URL must use an HTTPS Supabase project root.')
  }
  return url
}

function parseMobileApi(raw) {
  const url = parseUrl(raw, 'mobile-api URL')
  if (url.protocol !== 'https:' || normalizePath(url.pathname) !== '/functions/v1/mobile-api') {
    throw new Error('EAS mobile-api URL must use the exact Edge function path.')
  }
  return url
}

function parseUrl(raw, label) {
  let url
  try {
    url = new URL(String(raw ?? '').trim())
  } catch {
    throw new Error(`EAS ${label} is invalid.`)
  }
  if (url.port) {
    throw new Error(`EAS ${label} must use the default HTTPS port.`)
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`EAS ${label} must not contain credentials, query, or fragment.`)
  }
  return url
}

function normalizePath(pathname) {
  return pathname.replace(/\/+$/, '') || '/'
}

function isPublishableKey(raw) {
  const value = String(raw ?? '').trim()
  if (value.startsWith('sb_publishable_')) return value.length > 'sb_publishable_'.length
  const parts = value.split('.')
  if (parts.length !== 3) return false
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return payload?.role === 'anon'
  } catch {
    return false
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
