import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { createEdgeServices } from '../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../supabase/functions/mobile-api/_shared/http'
import { resolveHarnessEnvironment } from '../../../../../supabase/functions/_shared/harness/environment'
import {
  assertProductionReleaseRegistered,
  readEdgeEnv,
} from '../../../../../supabase/functions/_shared/platform/env'

export const PILLAR = {
  id: 'P53-stage1-release-integrity',
  invariant:
    'the hosted health surface binds the immutable release to a provider-owned deployment identity and every response carries release, trace, run, operation, and support correlation headers',
  authority: [
    'governance/RULES.md #8 (never represent unavailable evidence as success)',
    'governance/RULES.md #9 (diagnostics must not expose secrets or PII)',
    'approved Stage 1 implementation plan (release identity and support trace)',
  ],
  target: 'supabase/functions/_shared/harness/release.ts',
  layer: 'security-negative',
  siblings: ['P04-remote-snapshot-validation', 'P29-harness-metadata-allowlist', 'P44-stage1-reliability-contract'],
  mutation:
    'remove the provider deployment identity, one release digest, or one response correlation header — this pillar turns red before anonymous bytes can be promoted',
} as const satisfies PillarManifest

const releaseId = 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb'
const providerDeploymentId = 'iwevizmsedyqozxlawwl_10000000-0000-4000-8000-000000000053_7'
const digest = (seed: string) => seed.repeat(64)

describe('Stage 1 release integrity', () => {
  it('refuses to start Production with an incomplete release identity', () => {
    const productionEnv = readEdgeEnv((name) => ({
      SUPABASE_URL: 'https://iwevizmsedyqozxlawwl.supabase.co',
      NESTSCOUT_ENVIRONMENT: 'production',
      APP_SECRET_KEY: 'sb_secret_project',
    })[name])
    const previewRead = () => readEdgeEnv((name) => ({
      SUPABASE_URL: 'https://preview-project.supabase.co',
      NESTSCOUT_ENVIRONMENT: 'preview',
      APP_SECRET_KEY: 'sb_secret_project',
    })[name])

    expect(productionEnv.releaseId).toBe('unreleased')
    expect(() => assertProductionReleaseRegistered(productionEnv)).toThrow(
      'Production release identity is incomplete',
    )
    expect(previewRead).toThrow('Staging and Preview remote targets are locked')
  })

  it('returns complete safe release identity from the real public route', async () => {
    const services = createEdgeServices({
      harnessEnvironment: resolveHarnessEnvironment({
        url: 'https://iwevizmsedyqozxlawwl.supabase.co',
        environment: 'production',
      }),
      harnessRelease: {
        releaseId,
        deploymentId: providerDeploymentId,
        gitSha: 'a'.repeat(40),
        manifestSha256: digest('b'),
        bundleSha256: digest('c'),
        sourceBundleSha256: digest('d'),
        mobileBuildFingerprintSha256: digest('e'),
        productionUiSourceSha256: digest('5'),
        edgeBundleSha256: digest('f'),
        migrationInventorySha256: digest('1'),
        serviceIntakePolicyBundleSha256: digest('2'),
        priceEvidenceBundleSha256: digest('3'),
        providerReadinessFingerprintSha256: digest('4'),
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
      releaseId,
      environment: 'production',
    })

    const response = await handler(new Request('https://api.example.test/harness/health'))
    const body = await response.json()

    expect(response.status, pillarWhy(PILLAR, 'health must stay callable before promotion')).toBe(200)
    expect(body.release, pillarWhy(PILLAR, 'all release dimensions must be observable')).toMatchObject({
      release_id: releaseId,
      deployment_id: providerDeploymentId,
      source_bundle_sha256: digest('d'),
      mobile_build_fingerprint_sha256: digest('e'),
      production_ui_source_sha256: digest('5'),
      edge_bundle_sha256: digest('f'),
      migration_inventory_sha256: digest('1'),
      service_intake_policy_bundle_sha256: digest('2'),
      price_evidence_bundle_sha256: digest('3'),
      provider_readiness_fingerprint_sha256: digest('4'),
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
    })
    expect(JSON.stringify(body), pillarWhy(PILLAR, 'the public receipt must contain no secret-shaped keys')).not.toMatch(
      /token|password|service_role|authorization/i,
    )

    for (const header of ['x-release-id', 'x-trace-id', 'x-run-id', 'x-operation-id', 'x-support-code']) {
      expect(response.headers.get(header), pillarWhy(PILLAR, `missing response correlation header ${header}`)).toBeTruthy()
    }
    expect(response.headers.get('x-release-id')).toBe(releaseId)
    expect(response.headers.get('x-support-code')).toMatch(/^[A-F0-9]{8}$/)
  })

  it('blocks an incompatible binary before any authenticated mutation', async () => {
    let authenticationCalls = 0
    const handler = createMobileApiHandler({
      authenticate: async () => {
        authenticationCalls += 1
        return { success: false, error: 'must not run', status: 401 }
      },
      services: createEdgeServices({}),
      releaseId,
      environment: 'production',
      minimumClientBuildNumber: 45,
    })

    const response = await handler(new Request('https://api.example.test/kael/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-client-build-number': '44' },
      body: '{}',
    }))

    expect(response.status, pillarWhy(PILLAR, 'a stale binary must be rejected before mutation')).toBe(426)
    expect(await response.json()).toMatchObject({ code: 'CLIENT_UPDATE_REQUIRED' })
    expect(authenticationCalls, pillarWhy(PILLAR, 'compatibility is checked before auth and domain writes')).toBe(0)
    expect(response.headers.get('x-support-code')).toMatch(/^[A-F0-9]{8}$/)
  })

  it('validates the contract epoch against the exact per-platform EAS binary identity', async () => {
    let authenticationCalls = 0
    const clientCompatibility = {
      contractEpoch: 2,
      releaseId,
      gitSha: 'a'.repeat(40),
      ios: {
        applicationId: 'com.phanmanhtu.homeservices', minimumBuildNumber: 45,
        easBuildId: '11111111-1111-4111-8111-111111111111', runtimeVersion: '0.2.0',
      },
      android: {
        applicationId: 'com.phanmanhtu.nestscout', minimumBuildNumber: 4,
        easBuildId: '22222222-2222-4222-8222-222222222222', runtimeVersion: '0.2.0',
      },
    } as const
    const handler = createMobileApiHandler({
      authenticate: async () => {
        authenticationCalls += 1
        return { success: false, error: 'after compatibility', status: 401 }
      },
      services: createEdgeServices({}),
      releaseId,
      environment: 'production',
      clientCompatibility,
    })
    const headers = {
      'content-type': 'application/json',
      'x-client-platform': 'android',
      'x-client-application-id': 'com.phanmanhtu.nestscout',
      'x-client-build-number': '4',
      'x-client-contract-epoch': '2',
      'x-client-eas-build-id': '22222222-2222-4222-8222-222222222222',
      'x-client-runtime-version': '0.2.0',
      'x-client-git-sha': 'a'.repeat(40),
      'x-client-release-id': releaseId,
    }
    const compatible = await handler(new Request('https://api.example.test/kael/chat', {
      method: 'POST', headers, body: '{}',
    }))
    expect(compatible.status).toBe(401)
    expect(authenticationCalls).toBe(1)

    const legacyCompatible = await handler(new Request('https://api.example.test/kael/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-client-platform': 'android',
        'x-client-application-id': 'com.phanmanhtu.nestscout',
        'x-client-build-number': '4',
      },
      body: '{}',
    }))
    expect(legacyCompatible.status).toBe(401)
    expect(authenticationCalls).toBe(2)

    const incompatibleLegacyHeaders: Record<string, string>[] = [
      {},
      {
        'x-client-platform': 'android',
        'x-client-application-id': 'com.phanmanhtu.nestscout',
        'x-client-build-number': '3',
      },
    ]
    for (const legacyHeaders of incompatibleLegacyHeaders) {
      const legacyStale = await handler(new Request('https://api.example.test/kael/chat', {
        method: 'POST', headers: { 'content-type': 'application/json', ...legacyHeaders }, body: '{}',
      }))
      expect(legacyStale.status).toBe(426)
      expect(await legacyStale.json()).toMatchObject({ code: 'CLIENT_UPDATE_REQUIRED' })
    }
    expect(authenticationCalls).toBe(2)

    const stale = await handler(new Request('https://api.example.test/kael/chat', {
      method: 'POST', headers: { ...headers, 'x-client-eas-build-id': '33333333-3333-4333-8333-333333333333' }, body: '{}',
    }))
    expect(stale.status).toBe(426)
    expect(await stale.json()).toMatchObject({ code: 'CLIENT_UPDATE_REQUIRED' })
    expect(authenticationCalls).toBe(2)
  })
})
