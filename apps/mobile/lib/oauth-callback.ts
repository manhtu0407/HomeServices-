const MAX_CALLBACK_URL_LENGTH = 32_768
const MAX_OAUTH_CODE_LENGTH = 2_048
const OAUTH_CODE_PATTERN = /^[\x21-\x7e]+$/
const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/
const OAUTH_PARAM_NAMES = [
  'access_token',
  'code',
  'error',
  'error_code',
  'refresh_token',
] as const

type OAuthCallbackInspection =
  | { kind: 'code'; code: string }
  | { kind: 'error' }
  | { kind: 'ignored' }

export function inspectOAuthCallbackUrl(
  callbackUrl: string,
  expectedRedirectUrl: string,
): OAuthCallbackInspection {
  if (
    callbackUrl.length === 0
    || callbackUrl.length > MAX_CALLBACK_URL_LENGTH
    || callbackUrl.trim() !== callbackUrl
    || expectedRedirectUrl.length === 0
    || expectedRedirectUrl.length > MAX_CALLBACK_URL_LENGTH
    || expectedRedirectUrl.trim() !== expectedRedirectUrl
  ) {
    return { kind: 'ignored' }
  }

  let callback: URL
  let expected: URL
  try {
    callback = new URL(callbackUrl)
    expected = new URL(expectedRedirectUrl)
  } catch {
    return { kind: 'ignored' }
  }

  if (
    !isSafeRedirectTarget(expectedRedirectUrl, expected)
    || !isExactRedirectTarget(callback, expected)
    || rawUrlTarget(callbackUrl) !== rawUrlTarget(expectedRedirectUrl)
  ) return { kind: 'ignored' }

  const query = callback.searchParams
  const fragment = new URLSearchParams(callback.hash.startsWith('#') ? callback.hash.slice(1) : '')
  const values = new Map<string, string[]>()
  for (const name of OAUTH_PARAM_NAMES) {
    values.set(name, [...query.getAll(name), ...fragment.getAll(name)])
  }

  if ([...values.values()].some((entries) => entries.length > 1)) {
    return { kind: 'error' }
  }

  const has = (name: typeof OAUTH_PARAM_NAMES[number]) => (values.get(name)?.length ?? 0) > 0
  if (has('access_token') || has('refresh_token')) return { kind: 'error' }

  const hasProviderError = has('error') || has('error_code')
  const code = values.get('code')?.[0]
  if (hasProviderError) return { kind: 'error' }
  if (code === undefined) return { kind: 'ignored' }
  if (!isSafeOAuthCode(code)) return { kind: 'error' }

  return { code, kind: 'code' }
}

export function isTrustedOAuthAuthorizationUrl(
  authorizationUrl: string,
  configuredSupabaseUrl: string,
  expectedRedirectUrl: string,
) {
  if (
    authorizationUrl.length === 0
    || authorizationUrl.length > MAX_CALLBACK_URL_LENGTH
    || authorizationUrl.trim() !== authorizationUrl
    || configuredSupabaseUrl.length === 0
    || configuredSupabaseUrl.length > MAX_CALLBACK_URL_LENGTH
    || configuredSupabaseUrl.trim() !== configuredSupabaseUrl
    || expectedRedirectUrl.length === 0
    || expectedRedirectUrl.length > MAX_CALLBACK_URL_LENGTH
    || expectedRedirectUrl.trim() !== expectedRedirectUrl
  ) return false

  try {
    const authorization = new URL(authorizationUrl)
    const configured = new URL(configuredSupabaseUrl)
    const expectedRedirect = new URL(expectedRedirectUrl)
    const configuredPath = configured.pathname.replace(/\/+$/, '')
    const authorizationPath = `${configuredPath}/auth/v1/authorize`
    const localDevelopmentHost = configured.hostname === 'localhost'
      || configured.hostname === '127.0.0.1'
      || configured.hostname === '[::1]'
    const provider = authorization.searchParams.getAll('provider')
    const redirectTo = authorization.searchParams.getAll('redirect_to')
    const codeChallenge = authorization.searchParams.getAll('code_challenge')
    const codeChallengeMethod = authorization.searchParams.getAll('code_challenge_method')

    return authorization.origin === configured.origin
      && !authorization.username
      && !authorization.password
      && authorization.hash === ''
      && !configured.username
      && !configured.password
      && configured.search === ''
      && configured.hash === ''
      && hasCanonicalRawPath(authorizationUrl, authorization)
      && hasCanonicalRawPath(configuredSupabaseUrl, configured)
      && authorization.pathname === authorizationPath
      && provider.length === 1
      && provider[0] === 'google'
      && redirectTo.length === 1
      && isSafeRedirectTarget(expectedRedirectUrl, expectedRedirect)
      && redirectTo[0] === expectedRedirectUrl
      && codeChallenge.length === 1
      && PKCE_CHALLENGE_PATTERN.test(codeChallenge[0] ?? '')
      && codeChallengeMethod.length === 1
      && (codeChallengeMethod[0] === 's256' || codeChallengeMethod[0] === 'plain')
      && (configured.protocol === 'https:' || (configured.protocol === 'http:' && localDevelopmentHost))
  } catch {
    return false
  }
}

function isExactRedirectTarget(callback: URL, expected: URL) {
  return callback.protocol === expected.protocol
    && callback.username === expected.username
    && callback.password === expected.password
    && callback.hostname === expected.hostname
    && callback.port === expected.port
    && callback.pathname === expected.pathname
}

function isSafeRedirectTarget(value: string, parsed: URL) {
  return !parsed.username
    && !parsed.password
    && parsed.search === ''
    && parsed.hash === ''
    && hasCanonicalRawPath(value, parsed)
}

function rawUrlTarget(value: string) {
  const separatorIndex = value.search(/[?#]/)
  return separatorIndex === -1 ? value : value.slice(0, separatorIndex)
}

function hasCanonicalRawPath(value: string, parsed: URL) {
  const target = rawUrlTarget(value)
  const schemeIndex = target.indexOf(':')
  if (schemeIndex <= 0) return false

  const remainder = target.slice(schemeIndex + 1)
  if (!remainder.startsWith('//')) return remainder === parsed.pathname

  const pathIndex = remainder.indexOf('/', 2)
  const rawPath = pathIndex === -1 ? '/' : remainder.slice(pathIndex)
  return rawPath === parsed.pathname
}

function isSafeOAuthCode(code: string) {
  return code.length > 0
    && code.length <= MAX_OAUTH_CODE_LENGTH
    && OAUTH_CODE_PATTERN.test(code)
}
