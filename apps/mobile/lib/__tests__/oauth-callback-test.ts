import { inspectOAuthCallbackUrl, isTrustedOAuthAuthorizationUrl } from '../oauth-callback'

describe('inspectOAuthCallbackUrl', () => {
  const expectedRedirectUrl = 'nestscout:///'

  it('accepts one bounded PKCE code on the exact redirect target', () => {
    expect(inspectOAuthCallbackUrl(
      'nestscout:///?code=12345678-1234-1234-1234-123456789abc',
      expectedRedirectUrl,
    )).toEqual({
      code: '12345678-1234-1234-1234-123456789abc',
      kind: 'code',
    })
  })

  it.each([
    'nestscout://attacker.example/?code=valid-looking-code',
    'nestscout:///oauth?code=valid-looking-code',
    'nestscout:///oauth/../?code=valid-looking-code',
    'nestscout:///%2e%2e/?code=valid-looking-code',
    'nestscout:/?code=valid-looking-code',
    ' nestscout:///?code=valid-looking-code ',
    'nestscout-evil:///?code=valid-looking-code',
    'https://nestscout.example/?code=valid-looking-code',
    'not a url',
  ])('ignores a callback outside the exact redirect target: %s', (url) => {
    expect(inspectOAuthCallbackUrl(url, expectedRedirectUrl)).toEqual({ kind: 'ignored' })
  })

  it.each([
    'nestscout:///?code=first&code=second',
    'nestscout:///?code=first#code=second',
    'nestscout:///#access_token=attacker&refresh_token=attacker',
    `nestscout:///?code=${'a'.repeat(2_049)}`,
    'nestscout:///?code=contains%20space',
    'nestscout:///?code=unicode-%C4%91',
    'nestscout:///?code=safe%E2%80%AEevil',
    'nestscout:///?code=valid&error=access_denied',
  ])('rejects ambiguous or unsafe OAuth parameters: %s', (url) => {
    expect(inspectOAuthCallbackUrl(url, expectedRedirectUrl)).toEqual({ kind: 'error' })
  })

  it('maps a provider error on the exact callback target to a safe error result', () => {
    expect(inspectOAuthCallbackUrl(
      'nestscout:///?error=access_denied&error_code=provider_error',
      expectedRedirectUrl,
    )).toEqual({ kind: 'error' })
  })

  it('supports an Expo development redirect without accepting a sibling path', () => {
    const expected = 'exp://127.0.0.1:8081/--/'
    expect(inspectOAuthCallbackUrl(
      'exp://127.0.0.1:8081/--/?code=development-code',
      expected,
    )).toEqual({ code: 'development-code', kind: 'code' })
    expect(inspectOAuthCallbackUrl(
      'exp://127.0.0.1:8081/--/evil?code=development-code',
      expected,
    )).toEqual({ kind: 'ignored' })
  })
})

describe('isTrustedOAuthAuthorizationUrl', () => {
  const supabaseUrl = 'https://project.supabase.co'
  const redirectUrl = 'nestscout:///'
  const codeChallenge = 'a'.repeat(43)
  const trustedAuthorizationUrl = [
    `${supabaseUrl}/auth/v1/authorize?provider=google`,
    `redirect_to=${encodeURIComponent(redirectUrl)}`,
    `code_challenge=${codeChallenge}`,
    'code_challenge_method=s256',
  ].join('&')

  it('accepts the Google authorization endpoint on the configured Supabase origin', () => {
    expect(isTrustedOAuthAuthorizationUrl(
      trustedAuthorizationUrl,
      supabaseUrl,
      redirectUrl,
    )).toBe(true)
  })

  it('accepts the bounded plain PKCE fallback used when native WebCrypto is unavailable', () => {
    expect(isTrustedOAuthAuthorizationUrl(
      trustedAuthorizationUrl
        .replace(`code_challenge=${codeChallenge}`, `code_challenge=${'b'.repeat(112)}`)
        .replace('code_challenge_method=s256', 'code_challenge_method=plain'),
      supabaseUrl,
      redirectUrl,
    )).toBe(true)
  })

  it.each([
    trustedAuthorizationUrl.replace(supabaseUrl, 'https://attacker.example'),
    trustedAuthorizationUrl.replace(supabaseUrl, 'https://project.supabase.co.evil.example'),
    trustedAuthorizationUrl.replace('provider=google', 'provider=github'),
    `${trustedAuthorizationUrl}&provider=github`,
    trustedAuthorizationUrl.replace('https://', 'https://user:password@'),
    `${trustedAuthorizationUrl}#token=secret`,
    trustedAuthorizationUrl.replace('/auth/v1/authorize?', '/auth/v1/ignored/../authorize?'),
    trustedAuthorizationUrl.replace(
      `redirect_to=${encodeURIComponent(redirectUrl)}`,
      `redirect_to=${encodeURIComponent('https://attacker.example/callback')}`,
    ),
    `${trustedAuthorizationUrl}&redirect_to=${encodeURIComponent(redirectUrl)}`,
    trustedAuthorizationUrl.replace(`&redirect_to=${encodeURIComponent(redirectUrl)}`, ''),
    `${trustedAuthorizationUrl}&code_challenge=${codeChallenge}`,
    trustedAuthorizationUrl.replace(`&code_challenge=${codeChallenge}`, ''),
    trustedAuthorizationUrl.replace('code_challenge_method=s256', 'code_challenge_method=unknown'),
    'javascript:alert(1)',
  ])('rejects an untrusted authorization URL: %s', (url) => {
    expect(isTrustedOAuthAuthorizationUrl(url, supabaseUrl, redirectUrl)).toBe(false)
  })

  it('allows HTTP only for a configured loopback Supabase development origin', () => {
    expect(isTrustedOAuthAuthorizationUrl(
      trustedAuthorizationUrl.replace(supabaseUrl, 'http://127.0.0.1:54321'),
      'http://127.0.0.1:54321',
      redirectUrl,
    )).toBe(true)
    expect(isTrustedOAuthAuthorizationUrl(
      trustedAuthorizationUrl.replace(supabaseUrl, 'http://supabase.internal'),
      'http://supabase.internal',
      redirectUrl,
    )).toBe(false)
  })

  it.each([
    'https://user:password@project.supabase.co',
    'https://project.supabase.co?tenant=other',
    'https://project.supabase.co#other',
    ' https://project.supabase.co ',
  ])('rejects an ambiguous configured Supabase URL: %s', (configuredUrl) => {
    expect(isTrustedOAuthAuthorizationUrl(
      trustedAuthorizationUrl,
      configuredUrl,
      redirectUrl,
    )).toBe(false)
  })
})
