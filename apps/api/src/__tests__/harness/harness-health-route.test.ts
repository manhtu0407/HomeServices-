import { describe, expect, it } from 'vitest'
import { createMobileApiHandler, type MobileApiServices } from '../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../supabase/functions/mobile-api/_shared/domains'
import { resolveHarnessEnvironment } from '../../../../../supabase/functions/_shared/harness/environment'

describe('Harness health route', () => {
  it('exposes public-safe environment and immutable release identity', async () => {
    const services = createEdgeServices({
      harnessEnvironment: resolveHarnessEnvironment({
        url: 'https://xyylanuyflrjzbjzhqfl.supabase.co',
        environment: 'staging',
      }),
      harnessRelease: {
        releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
        gitSha: 'a'.repeat(40),
        manifestSha256: 'b'.repeat(64),
        bundleSha256: 'c'.repeat(64),
        registered: true,
      },
    })
    const handler = createMobileApiHandler({
      authenticate: async () => ({ success: false, error: 'unused', status: 401 }),
      services,
      releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
    })

    const response = await handler(new Request('https://api.example.test/harness/health'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      service: 'mobile-api',
      status: 'ok',
      environment: {
        name: 'staging',
        project_ref: 'xyylanuyflrjzbjzhqfl',
        provider_configuration_class: 'staging-isolated',
        webhook_configuration_class: 'staging-sandbox',
      },
      release: {
        release_id: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
        registered: true,
      },
    })
    expect(JSON.stringify(body)).not.toContain('secret')
  })

  it('reports degraded rather than fabricating a registered release', async () => {
    const services = {
      getHarnessHealth: () => ({
        service: 'mobile-api',
        status: 'degraded',
        release: { release_id: 'unreleased', registered: false },
      }),
    } as unknown as MobileApiServices
    const handler = createMobileApiHandler({
      authenticate: async () => ({ success: false, error: 'unused', status: 401 }),
      services,
    })

    const response = await handler(new Request('https://api.example.test/harness/health'))
    expect(await response.json()).toMatchObject({
      status: 'degraded',
      release: { registered: false },
    })
  })
})
