import { afterEach, describe, expect, it } from 'vitest'
import { resolveIntegrationTarget } from '../integration/integration-target'
import { HARNESS_PRODUCTION_PROJECT_REF } from '../../../../../supabase/functions/_shared/harness/environment'

const KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NESTSCOUT_ENVIRONMENT',
  'SUPABASE_PROJECT_REF',
  'HARNESS_REMOTE_MUTATION_APPROVAL',
  'HARNESS_RELEASE_ID',
  'HARNESS_APPROVAL_SOURCE',
  'HARNESS_ALLOW_PRODUCTION_MUTATION',
] as const

const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of KEYS) {
    const value = original[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('integration target environment guard', () => {
  it('keeps local as the only implicit mutable target', () => {
    for (const key of KEYS) delete process.env[key]
    const result = resolveIntegrationTarget('local-default')

    expect(result).toMatchObject({
      ok: true,
      target: { isLocal: true, url: 'http://127.0.0.1:55321' },
    })
    if (!result.ok) throw new Error('local target should resolve')

    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(result.target.url)
    expect(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe(result.target.anonKey)
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBe(result.target.serviceRoleKey)
    expect(process.env.NESTSCOUT_ENVIRONMENT).toBe('local')
  })

  it('rejects staging mutation because the backend is permanently locked', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://xyylanuyflrjzbjzhqfl.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_staging'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_staging'
    process.env.NESTSCOUT_ENVIRONMENT = 'staging'
    process.env.SUPABASE_PROJECT_REF = 'xyylanuyflrjzbjzhqfl'

    expect(() => resolveIntegrationTarget('staging-no-approval')).toThrow(
      'Staging and Preview remote targets are locked',
    )
  })

  it('rejects staging even when environment, project, approval, and release match', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://xyylanuyflrjzbjzhqfl.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_staging'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_staging'
    process.env.NESTSCOUT_ENVIRONMENT = 'staging'
    process.env.SUPABASE_PROJECT_REF = 'xyylanuyflrjzbjzhqfl'
    process.env.HARNESS_REMOTE_MUTATION_APPROVAL = 'run-123'
    process.env.HARNESS_RELEASE_ID = 'sha-123'

    expect(() => resolveIntegrationTarget('staging-approved')).toThrow(
      'Staging and Preview remote targets are locked',
    )
  })

  it('rejects CI-originated production mutation even with an approval token', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${HARNESS_PRODUCTION_PROJECT_REF}.supabase.co`
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_production'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_production'
    process.env.NESTSCOUT_ENVIRONMENT = 'production'
    process.env.SUPABASE_PROJECT_REF = HARNESS_PRODUCTION_PROJECT_REF
    process.env.HARNESS_REMOTE_MUTATION_APPROVAL = 'run-123'
    process.env.HARNESS_RELEASE_ID = 'sha-123'
    process.env.HARNESS_APPROVAL_SOURCE = 'ci'
    process.env.HARNESS_ALLOW_PRODUCTION_MUTATION = 'true'

    expect(() => resolveIntegrationTarget('production-ci')).toThrow(
      'Production mutation requires an operator approval',
    )
  })
})
