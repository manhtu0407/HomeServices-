import { describe, expect, it } from 'vitest'
import {
  createMobileApiHandler,
  type MobileApiContext,
  type MobileApiServices,
} from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { readEdgeEnv } from '../../../../../../supabase/functions/_shared/platform/env'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('edge-env', () => {
  installEdgeRuntimeTestHooks()

  it('reads current Supabase secret key JSON without exposing it to mobile code', () => {
    const env = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://iwevizmsedyqozxlawwl.supabase.co',
        NESTSCOUT_ENVIRONMENT: 'production',
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_test' }),
      }
      return values[name]
    })

    expect(env.supabaseUrl).toBe('https://iwevizmsedyqozxlawwl.supabase.co')
    expect(env.supabaseSecretKey).toBe('sb_secret_test')
    expect(env.harnessEnvironment).toMatchObject({ name: 'production', isRemote: true })
    expect(env.releaseId).toBe('unreleased')
  })

  it('rejects a remote project without explicit environment identity', () => {
    expect(() => readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://preview-project.supabase.co',
        APP_SECRET_KEY: 'sb_secret_project',
      }
      return values[name]
    })).toThrow('Remote targets require NESTSCOUT_ENVIRONMENT')
  })

  it.each([
    JSON.stringify('sb_secret_wrong_shape'),
    JSON.stringify(['sb_secret_wrong_shape']),
    JSON.stringify({ default: 123 }),
    'null',
  ])('rejects a non-object SUPABASE_SECRET_KEYS value instead of deriving a partial key', (encoded) => {
    expect(() => readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://iwevizmsedyqozxlawwl.supabase.co',
        NESTSCOUT_ENVIRONMENT: 'production',
        SUPABASE_SECRET_KEYS: encoded,
      }
      return values[name]
    })).toThrow('SUPABASE_SECRET_KEYS must be a JSON object of non-empty strings')
  })

  it('accepts the APP_SECRET_KEY Edge secret name used by the linked Supabase project', () => {
    const env = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://iwevizmsedyqozxlawwl.supabase.co',
        NESTSCOUT_ENVIRONMENT: 'production',
        APP_SECRET_KEY: 'sb_secret_project',
      }
      return values[name]
    })

    expect(env.supabaseSecretKey).toBe('sb_secret_project')
  })

  it('reads the VietMap Maps key only from Edge secrets', () => {
    const env = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://iwevizmsedyqozxlawwl.supabase.co',
        NESTSCOUT_ENVIRONMENT: 'production',
        APP_SECRET_KEY: 'sb_secret_project',
        VIETMAP_API_KEY: 'vietmap-test-key',
      }
      return values[name]
    })

    expect(env.vietmapApiKey).toBe('vietmap-test-key')
  })

  it('accepts the legacy GOOGLE_MAP_KEY Edge secret alias used by production', () => {
    const env = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://iwevizmsedyqozxlawwl.supabase.co',
        NESTSCOUT_ENVIRONMENT: 'production',
        APP_SECRET_KEY: 'sb_secret_project',
        GOOGLE_MAP_KEY: 'maps-project-key',
      }
      return values[name]
    })

    expect(env.googleMapsApiKey).toBe('maps-project-key')
  })

  it('reads the Section 25 R2 Perplexity source trust flag at the Edge boundary', () => {
    const env = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://iwevizmsedyqozxlawwl.supabase.co',
        NESTSCOUT_ENVIRONMENT: 'production',
        APP_SECRET_KEY: 'sb_secret_project',
        KAEL_TRUST_PERPLEXITY_FILTER_ENABLED: '1',
      }
      return values[name]
    })

    expect(env.sourceTrustPerplexityFilterEnabled).toBe(true)
    expect(env.sourceTrustPerplexityFilterExplicit).toBe(true)
  })

  it('keeps the B1 knowledge retrieval flag off by default and explicit at the Edge boundary', () => {
    const defaultEnv = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://iwevizmsedyqozxlawwl.supabase.co',
        NESTSCOUT_ENVIRONMENT: 'production',
        APP_SECRET_KEY: 'sb_secret_project',
      }
      return values[name]
    })
    const enabledEnv = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://iwevizmsedyqozxlawwl.supabase.co',
        NESTSCOUT_ENVIRONMENT: 'production',
        APP_SECRET_KEY: 'sb_secret_project',
        KAEL_OPT_KNOWLEDGE_RETRIEVAL_ENABLED: '1',
      }
      return values[name]
    })

    expect(defaultEnv.knowledgeRetrievalEnabled).toBe(false)
    expect(enabledEnv.knowledgeRetrievalEnabled).toBe(true)
  })

  it('keeps durable guards off by default and enables them only from the Edge flag', () => {
    const read = (enabled?: string) => readEdgeEnv((name) => {
      const values: Record<string, string | undefined> = {
        SUPABASE_URL: 'https://iwevizmsedyqozxlawwl.supabase.co',
        NESTSCOUT_ENVIRONMENT: 'production',
        APP_SECRET_KEY: 'sb_secret_project',
        KAEL_DURABLE_GUARDS_ENABLED: enabled,
      }
      return values[name]
    })

    expect(read().durableGuardsEnabled).toBe(false)
    expect(read('true').durableGuardsEnabled).toBe(true)
    expect(read('false').durableGuardsEnabled).toBe(false)
  })

  it('accepts the Section 25 R2 source trust rollout alias at the Edge boundary', () => {
    const env = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://iwevizmsedyqozxlawwl.supabase.co',
        NESTSCOUT_ENVIRONMENT: 'production',
        APP_SECRET_KEY: 'sb_secret_project',
        KAEL_OPT_SOURCE_TRUST_ENABLED: 'yes',
      }
      return values[name]
    })

    expect(env.sourceTrustPerplexityFilterEnabled).toBe(true)
    expect(env.sourceTrustPerplexityFilterExplicit).toBe(true)
  })

  it('locks staging and keeps the Production source-trust fallback off', () => {
    const stagingRead = () => readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://xyylanuyflrjzbjzhqfl.supabase.co',
        NESTSCOUT_ENVIRONMENT: 'staging',
        APP_SECRET_KEY: 'sb_secret_project',
      }
      return values[name]
    })
    const productionEnv = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://iwevizmsedyqozxlawwl.supabase.co',
        NESTSCOUT_ENVIRONMENT: 'production',
        APP_SECRET_KEY: 'sb_secret_project',
      }
      return values[name]
    })

    expect(stagingRead).toThrow('Staging and Preview remote targets are locked')
    expect(productionEnv.sourceTrustPerplexityFilterEnabled).toBe(false)
    expect(productionEnv.sourceTrustPerplexityFilterExplicit).toBe(false)
  })

  it('keeps the staging payment rail disabled on the Production backend', () => {
    const read = (enabled?: string) => readEdgeEnv((name) => {
      const values: Record<string, string | undefined> = {
        SUPABASE_URL: 'https://iwevizmsedyqozxlawwl.supabase.co',
        NESTSCOUT_ENVIRONMENT: 'production',
        APP_SECRET_KEY: 'sb_secret_project',
        NESTSCOUT_STAGING_PAYMENT_RAIL_ENABLED: enabled,
      }
      return values[name]
    })

    expect(read().stagingPaymentRailEnabled).toBe(false)
    expect(read('true').stagingPaymentRailEnabled).toBe(false)
  })

  it('keeps SePay VietQR unavailable until the complete server-only configuration is present', () => {
    const read = (values: Record<string, string | undefined>) => readEdgeEnv((name) => {
      const base: Record<string, string | undefined> = {
        SUPABASE_URL: 'https://iwevizmsedyqozxlawwl.supabase.co',
        NESTSCOUT_ENVIRONMENT: 'production',
        APP_SECRET_KEY: 'sb_secret_project',
        NESTSCOUT_SEPAY_VIETQR_ENABLED: 'true',
        SEPAY_VIETQR_BANK_CODE: 'VCB',
        SEPAY_VIETQR_ACCOUNT_NUMBER: '1234567890',
        SEPAY_VIETQR_ACCOUNT_HOLDER: 'NESTSCOUT',
        SEPAY_WEBHOOK_SECRET: 'webhook-secret-for-test',
      }
      return { ...base, ...values }[name]
    })

    expect(read({ SEPAY_WEBHOOK_SECRET: undefined }).sepayVietQr.enabled).toBe(false)
    expect(read({ SEPAY_VIETQR_ACCOUNT_NUMBER: undefined }).sepayVietQr.enabled).toBe(false)
    expect(read({}).sepayVietQr.enabled).toBe(true)
  })

  it('enables the manual bank QR only with complete non-staging server configuration', () => {
    const read = (values: Record<string, string | undefined>) => readEdgeEnv((name) => {
      const base: Record<string, string | undefined> = {
        SUPABASE_URL: 'https://iwevizmsedyqozxlawwl.supabase.co',
        NESTSCOUT_ENVIRONMENT: 'production',
        APP_SECRET_KEY: 'sb_secret_project',
        NESTSCOUT_PLATFORM_MANUAL_BANK_ENABLED: 'true',
        PLATFORM_MANUAL_BANK_CODE: 'VCB',
        PLATFORM_MANUAL_BANK_ACCOUNT_NUMBER: '1234567890',
        PLATFORM_MANUAL_BANK_ACCOUNT_HOLDER: 'NESTSCOUT COMPANY',
      }
      return { ...base, ...values }[name]
    })

    expect(read({ PLATFORM_MANUAL_BANK_ACCOUNT_NUMBER: undefined }).manualBank.enabled).toBe(false)
    expect(read({}).manualBank.enabled).toBe(true)

    const stagingRead = () => readEdgeEnv((name) => ({
      SUPABASE_URL: 'https://xyylanuyflrjzbjzhqfl.supabase.co',
      NESTSCOUT_ENVIRONMENT: 'staging',
      APP_SECRET_KEY: 'sb_secret_project',
      NESTSCOUT_PLATFORM_MANUAL_BANK_ENABLED: 'true',
      PLATFORM_MANUAL_BANK_CODE: 'VCB',
      PLATFORM_MANUAL_BANK_ACCOUNT_NUMBER: '1234567890',
      PLATFORM_MANUAL_BANK_ACCOUNT_HOLDER: 'NESTSCOUT COMPANY',
    })[name])
    expect(stagingRead).toThrow('Staging and Preview remote targets are locked')
  })

  it('keeps an explicit Section 25 R2 false flag visible on Production', () => {
    const env = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://iwevizmsedyqozxlawwl.supabase.co',
        NESTSCOUT_ENVIRONMENT: 'production',
        APP_SECRET_KEY: 'sb_secret_project',
        KAEL_TRUST_PERPLEXITY_FILTER_ENABLED: 'false',
      }
      return values[name]
    })

    expect(env.sourceTrustPerplexityFilterEnabled).toBe(false)
    expect(env.sourceTrustPerplexityFilterExplicit).toBe(true)
  })

  it('passes request host and project ref into the Edge service context', async () => {
    let seenContext: MobileApiContext | undefined
    const services = {
      listServices: async (ctx: MobileApiContext) => {
        seenContext = ctx
        return { services: [] }
      },
    } as unknown as MobileApiServices
    const handler = createMobileApiHandler({
      authenticate: async () => ({
        success: true,
        user: { id: 'customer-1' },
        role: 'customer',
        supabase: makeSequenceClient([]),
        userSupabase: makeSequenceClient([]),
      }),
      services,
    })

    const response = await handler(
      new Request('https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/mobile-api/services'),
    )

    expect(response.status).toBe(200)
    expect(seenContext).toMatchObject({
      requestUrl: expect.stringContaining('iwevizmsedyqozxlawwl.supabase.co'),
      requestHost: 'iwevizmsedyqozxlawwl.supabase.co',
      requestProjectRef: 'iwevizmsedyqozxlawwl',
    })
  })
})
