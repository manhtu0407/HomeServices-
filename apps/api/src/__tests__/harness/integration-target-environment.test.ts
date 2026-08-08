import { afterEach, describe, expect, it } from 'vitest'
import { resolveIntegrationTarget } from '../integration/integration-target'

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

  it('requires explicit approval for staging mutation', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://xyylanuyflrjzbjzhqfl.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_staging'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_staging'
    process.env.NESTSCOUT_ENVIRONMENT = 'staging'
    process.env.SUPABASE_PROJECT_REF = 'xyylanuyflrjzbjzhqfl'

    expect(() => resolveIntegrationTarget('staging-no-approval')).toThrow(
      'Remote mutation is not approved for staging',
    )
  })

  it('accepts staging only when environment, project, approval, and release match', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://xyylanuyflrjzbjzhqfl.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_staging'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_staging'
    process.env.NESTSCOUT_ENVIRONMENT = 'staging'
    process.env.SUPABASE_PROJECT_REF = 'xyylanuyflrjzbjzhqfl'
    process.env.HARNESS_REMOTE_MUTATION_APPROVAL = 'run-123'
    process.env.HARNESS_RELEASE_ID = 'sha-123'

    expect(resolveIntegrationTarget('staging-approved')).toMatchObject({
      ok: true,
      target: { isLocal: false },
    })
  })
})
