const STAGING_REF = 'xyylanuyflrjzbjzhqfl'
const PRODUCTION_REF = 'iwevizmsedyqozxlawwl'
const MOBILE_API_PATH = '/functions/v1/mobile-api'
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export function assertSupabaseCredentials(publishableKey, serviceRoleKey) {
  const publicValue = normalizeCredential(publishableKey, 'Supabase publishable key')
  const serverValue = normalizeCredential(serviceRoleKey, 'Supabase service-role key')
  const publicRole = legacyJwtRole(publicValue)
  const serverRole = legacyJwtRole(serverValue)

  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publicValue) && publicRole !== 'anon') {
    throw new Error('Supabase publishable key must not contain server authority')
  }
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(serverValue) && serverRole !== 'service_role') {
    throw new Error('Supabase service-role key must contain server authority')
  }
  if (publicValue === serverValue) {
    throw new Error('Supabase public and server credentials must be different')
  }

  return { publishableKey: publicValue, serviceRoleKey: serverValue }
}

export function assertStagingOrLocalTargets(runFlag, supabaseUrl, mobileApiUrl) {
  const runApproved = process.env[runFlag] === 'yes'
  if (!runApproved) {
    throw new Error(`Set ${runFlag}=yes to run this state-changing smoke test`)
  }
  const supabase = trustedUrl(supabaseUrl, 'Supabase URL', '/')
  const mobileApi = trustedUrl(mobileApiUrl, 'mobile-api URL', MOBILE_API_PATH)
  const sameOrigin = supabase.origin === mobileApi.origin
  if (!sameOrigin) {
    throw new Error('Supabase and mobile-api targets must share the same trusted origin')
  }
}

export async function fetchWithTimeout(input, init = {}) {
  const timeoutMs = readTimeoutMs()
  const controller = new AbortController()
  const externalSignal = init.signal
  const abortFromCaller = () => controller.abort(externalSignal?.reason)
  if (externalSignal?.aborted) abortFromCaller()
  else externalSignal?.addEventListener('abort', abortFromCaller, { once: true })
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, {
      ...init,
      redirect: 'error',
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new Error(`Smoke request timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', abortFromCaller)
  }
}

function trustedUrl(raw, label, expectedPath) {
  const url = new URL(raw)
  const isLocal = LOCAL_HOSTS.has(url.hostname)
  const isStaging = url.hostname === `${STAGING_REF}.supabase.co`
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must not contain credentials, query, or hash`)
  }
  if (!isLocal && url.protocol !== 'https:') {
    throw new Error(`${label} must use HTTPS outside local development`)
  }
  if (!isLocal && !isStaging) {
    throw new Error(`${label} must target local or staging ref ${STAGING_REF}`)
  }
  if (isStaging && url.port !== '') {
    throw new Error(`${label} must use the default HTTPS port`)
  }
  if (url.hostname === `${PRODUCTION_REF}.supabase.co`) {
    throw new Error(`${label} must not target production ref ${PRODUCTION_REF}`)
  }
  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (path !== expectedPath) throw new Error(`${label} has an unexpected path`)
  return url
}

function normalizeCredential(raw, label) {
  const value = typeof raw === 'string' ? raw : ''
  if (!value || value !== value.trim() || value.length > 4096 || /[\u0000-\u0020\u007f]/.test(value)) {
    throw new Error(`${label} is invalid`)
  }
  return value
}

function legacyJwtRole(value) {
  const parts = value.split('.')
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return typeof payload?.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

function readTimeoutMs() {
  const raw = Number(process.env.KAEL_SMOKE_TIMEOUT_MS ?? 60_000)
  if (!Number.isFinite(raw) || raw < 1_000 || raw > 300_000) {
    throw new Error('KAEL_SMOKE_TIMEOUT_MS must be between 1000 and 300000')
  }
  return raw
}
