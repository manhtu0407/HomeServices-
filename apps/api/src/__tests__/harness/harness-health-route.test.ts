import { describe, expect, it } from 'vitest'
import { createMobileApiHandler, type MobileApiServices } from '../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../supabase/functions/mobile-api/_shared/domains'
import { resolveHarnessEnvironment } from '../../../../../supabase/functions/_shared/harness/environment'

describe('Harness health route', () => {
  it('exposes public-safe environment and immutable release identity', async () => {
    const services = createEdgeServices({
      harnessEnvironment: resolveHarnessEnvironment({
        url: 'https://iwevizmsedyqozxlawwl.supabase.co',
        environment: 'production',
      }),
      harnessRelease: {
        releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
        deploymentId: 'iwevizmsedyqozxlawwl_10000000-0000-4000-8000-000000000053_7',
        gitSha: 'a'.repeat(40),
        manifestSha256: 'b'.repeat(64),
        bundleSha256: 'c'.repeat(64),
        sourceBundleSha256: 'd'.repeat(64),
        mobileBuildFingerprintSha256: 'e'.repeat(64),
        productionUiSourceSha256: '5'.repeat(64),
        edgeBundleSha256: 'f'.repeat(64),
        migrationInventorySha256: '1'.repeat(64),
        serviceIntakePolicyBundleSha256: '2'.repeat(64),
        priceEvidenceBundleSha256: '3'.repeat(64),
        providerReadinessFingerprintSha256: '4'.repeat(64),
        providerReadiness: {
          android_fcm_v1: true,
          ios_apns: true,
          push_receipt_reconciler: true,
          anthropic: true,
          deepseek: false,
          durable_guards: true,
          global_ai_enabled: true,
          perplexity: true,
          vietmap: true,
        },
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
        name: 'production',
        project_ref: 'iwevizmsedyqozxlawwl',
        provider_configuration_class: 'production-locked',
        webhook_configuration_class: 'production-signed',
      },
      release: {
        release_id: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
        deployment_id: 'iwevizmsedyqozxlawwl_10000000-0000-4000-8000-000000000053_7',
        source_bundle_sha256: 'd'.repeat(64),
        production_ui_source_sha256: '5'.repeat(64),
        migration_inventory_sha256: '1'.repeat(64),
       provider_readiness: {
          android_fcm_v1: true,
          ios_apns: true,
          push_receipt_reconciler: true,
         anthropic: true,
          deepseek: false,
          durable_guards: true,
          global_ai_enabled: true,
          perplexity: true,
          vietmap: true,
        },
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
