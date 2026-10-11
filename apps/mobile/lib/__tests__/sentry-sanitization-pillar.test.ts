import type { Breadcrumb, ErrorEvent } from '@sentry/react-native'

import { sanitizeSentryBreadcrumb, sanitizeSentryEvent } from '../sentry-sanitization'
import { pillarWhy, type PillarManifest } from '../../../../packages/shared/src/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P355-system-health-mobile-sentry-redaction',
  invariant: 'Sentry events and breadcrumbs expose only approved release, stack, and route metadata and redact nested user content and request data',
  authority: [
    'user-approved System Health Monitoring implementation plan',
    'governance/RULES.md #8 (privacy and allowlisted diagnostics)',
  ],
  target: 'apps/mobile/lib/sentry-runtime.ts; apps/mobile/lib/sentry-sanitization.ts',
  layer: 'security-negative',
  siblings: ['P351-system-health-monitor-contract', 'P353-system-health-monitor-runtime', 'P354-system-health-cloudflare-observer-d1'],
  mutation: 'restore event spreading or include raw breadcrumb data and the nested sentinel assertions fail',
} as const satisfies PillarManifest

const SENTINEL = 'privacy-sentinel-7e2f'

describe('Mobile Sentry privacy boundary', () => {
  it('removes PII and secrets from nested event fields while keeping symbolication identity', () => {
    const event = {
      event_id: '0123456789abcdef0123456789abcdef',
      timestamp: 1_791_715_200,
      type: undefined,
      platform: 'javascript',
      release: 'nestscout@abc123',
      dist: '42',
      message: SENTINEL,
      transaction: SENTINEL,
      request: { url: `https://example.invalid?token=${SENTINEL}`, headers: { authorization: SENTINEL } },
      user: { email: `${SENTINEL}@example.invalid`, id: SENTINEL, ip_address: SENTINEL },
      extra: { otp: SENTINEL, address: SENTINEL, chat: SENTINEL },
      contexts: { customer: { phone: SENTINEL, secret: SENTINEL } },
      tags: { release_id: 'release-2026.10.11', build_id: 'build-42', email: SENTINEL, platform: 'ios' },
      exception: {
        values: [{
          type: 'Error',
          value: `Request for ${SENTINEL}`,
          mechanism: { type: 'onerror', handled: false, data: { authorization: SENTINEL } },
          stacktrace: {
            frames: [{
              filename: `C:\\Users\\${SENTINEL}\\index.android.bundle`,
              function: 'safeFunction',
              lineno: 42,
              colno: 7,
              in_app: true,
              context_line: SENTINEL,
              vars: { address: SENTINEL },
            }],
          },
        }],
      },
      debug_meta: { images: [{ type: 'sourcemap', debug_id: 'abc123-def456', code_file: `/private/${SENTINEL}/index.android.bundle` }] },
      breadcrumbs: [
        { category: 'navigation', message: SENTINEL, data: { to: SENTINEL } },
        { category: 'mobile-api', type: 'http', message: SENTINEL, data: { method: 'POST', route: '/jobs/:id/:operation', status_code: 503, duration_ms: 80, url: SENTINEL, request_body: SENTINEL } },
      ],
    } as unknown as ErrorEvent

    const sanitized = sanitizeSentryEvent(event)
    const serialized = JSON.stringify(sanitized)

    expect(serialized).not.toContain(SENTINEL)
    expect(serialized).not.toContain('example.invalid')
    expect(serialized).not.toContain('authorization')
    expect(sanitized).toMatchObject({
      release: 'nestscout@abc123',
      dist: '42',
      tags: { release_id: 'release-2026.10.11', build_id: 'build-42', platform: 'ios' },
      exception: { values: [{ value: '[redacted]', stacktrace: { frames: [{ filename: 'index.android.bundle', function: 'safeFunction' }] } }] },
      debug_meta: { images: [{ type: 'sourcemap', debug_id: 'abc123-def456', code_file: 'app:///index.android.bundle' }] },
      breadcrumbs: [{ category: 'mobile-api', data: { method: 'POST', route: '/jobs/:id/:operation', status_code: 503, duration_ms: 80 } }],
    })
  })

  it('rejects non-API breadcrumbs and replaces unsafe routes before serialization', () => {
    const navigation = { category: 'navigation', message: SENTINEL, data: { to: SENTINEL } } as Breadcrumb
    const api = { category: 'mobile-api', data: { method: 'GET', route: `/jobs/${SENTINEL}`, status_code: 200 } } as Breadcrumb

    expect(sanitizeSentryBreadcrumb(navigation)).toBeNull()
    expect(sanitizeSentryBreadcrumb(api)).toMatchObject({ data: { method: 'GET', route: '/other', status_code: 200, duration_ms: 0 } })
    expect(JSON.stringify(sanitizeSentryBreadcrumb(api))).not.toContain(SENTINEL)
  })

  it('keeps the redaction pillar registered', () => {
    expect(pillarWhy(PILLAR)).toContain('P355-system-health-mobile-sentry-redaction')
  })
})
