import { describe, expect, it } from 'vitest'
import {
  HARNESS_PRODUCTION_PROJECT_REF,
  HARNESS_STAGING_PROJECT_REF,
  HarnessEnvironmentError,
  assertHarnessMutationAllowed,
  resolveHarnessEnvironment,
  safeEnvironmentMetadata,
} from '../../../../../supabase/functions/_shared/harness/environment'

const LOCAL_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24ifQ.signature'
const LOCAL_SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSJ9.signature'

function expectCode(run: () => unknown, code: string) {
  try {
    run()
    throw new Error('expected failure')
  } catch (error) {
    expect(error).toBeInstanceOf(HarnessEnvironmentError)
    expect((error as HarnessEnvironmentError).code).toBe(code)
  }
}

describe('Harness environment descriptor', () => {
  it('uses local as the only implicit target', () => {
    const descriptor = resolveHarnessEnvironment({
      mutationIntent: 'mutate',
      publishableKey: LOCAL_ANON,
      secretKey: LOCAL_SERVICE,
    })

    expect(descriptor).toMatchObject({
      name: 'local',
      isLocal: true,
      mutationAllowed: true,
      projectRef: null,
      providerConfigurationClass: 'local-development',
      webhookConfigurationClass: 'local-loopback',
    })
    expect(() => assertHarnessMutationAllowed(descriptor)).not.toThrow()
  })

  it('rejects local demo keys against remote hosts', () => {
    expectCode(() => resolveHarnessEnvironment({
      url: `https://${HARNESS_STAGING_PROJECT_REF}.supabase.co`,
      environment: 'staging',
      publishableKey: LOCAL_ANON,
      secretKey: LOCAL_SERVICE,
    }), 'LOCAL_KEY_REMOTE_HOST')
  })

  it('rejects production references outside production context', () => {
    expectCode(() => resolveHarnessEnvironment({
      url: `https://${HARNESS_PRODUCTION_PROJECT_REF}.supabase.co`,
      environment: 'staging',
    }), 'STAGING_PROJECT_MISMATCH')
  })

  it('locks an explicitly approved staging mutation', () => {
    expectCode(() => resolveHarnessEnvironment({
      url: `https://${HARNESS_STAGING_PROJECT_REF}.supabase.co`,
      environment: 'staging',
      mutationIntent: 'mutate',
      publishableKey: 'sb_publishable_staging',
      secretKey: 'sb_secret_staging',
      approval: {
        approvalId: 'github-run-123',
        environment: 'staging',
        projectRef: HARNESS_STAGING_PROJECT_REF,
        releaseId: 'release-test',
        source: 'ci',
      },
    }), 'NON_PRODUCTION_REMOTE_LOCKED')
  })

  it('rejects an unclassified key on a remote target', () => {
    expectCode(() => resolveHarnessEnvironment({
      url: `https://${HARNESS_STAGING_PROJECT_REF}.supabase.co`,
      environment: 'staging',
      publishableKey: 'unclassified-remote-key',
    }), 'REMOTE_KEY_CLASS_UNKNOWN')
  })

  it('rejects a remote target without explicit environment identity', () => {
    expectCode(() => resolveHarnessEnvironment({
      url: 'https://preview-ref.supabase.co',
    }), 'REMOTE_ENVIRONMENT_REQUIRED')
  })

  it('requires operator approval for production mutation', () => {
    expectCode(() => resolveHarnessEnvironment({
      url: `https://${HARNESS_PRODUCTION_PROJECT_REF}.supabase.co`,
      environment: 'production',
      mutationIntent: 'mutate',
      approval: {
        approvalId: 'github-run-456',
        environment: 'production',
        projectRef: HARNESS_PRODUCTION_PROJECT_REF,
        releaseId: 'release-prod',
        source: 'ci',
      },
    }), 'PRODUCTION_MUTATION_REQUIRES_OPERATOR')
  })

  it('returns safe metadata without secret values', () => {
    const descriptor = resolveHarnessEnvironment({
      url: `https://${HARNESS_PRODUCTION_PROJECT_REF}.supabase.co`,
      environment: 'production',
      publishableKey: 'sb_publishable_do_not_expose',
      secretKey: 'sb_secret_do_not_expose',
    })
    const encoded = JSON.stringify(safeEnvironmentMetadata(descriptor))

    expect(encoded).not.toContain('do_not_expose')
    expect(encoded).toContain('publishable')
    expect(encoded).toContain('secret')
    expect(encoded).toContain('production-locked')
    expect(encoded).toContain('production-signed')
  })
})
