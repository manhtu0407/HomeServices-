import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  buildSyntheticActorProvisionReceipt,
  validateSyntheticActorProvisionInput,
  verifySyntheticActorProvisionReceipt,
} from '../../../scripts/lib/stage1-synthetic-actor-core.mjs'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P66-stage1-synthetic-actor-provision',
  invariant:
    'Production smoke actors are dedicated example.test identities, created banned, permanently cohort-classified before activation, and proven authentic without exposing identifiers or credentials',
  authority: [
    'approved Stage 1 implementation plan (synthetic Production cohort)',
    'governance/RULES.md #8 (no fake Worker or fake delivery)',
    'governance/RULES.md #9 (no secrets or PII in evidence)',
  ],
  target: 'apps/api/scripts/stage1-synthetic-actor-provision.mjs',
  layer: 'security-negative',
  siblings: ['P54-synthetic-cohort-nonvisibility', 'P56-stage1-production-release-workflow'],
  mutation:
    'accept a non-dedicated credential, enable the Worker before cohort binding, or emit actor identity in the receipt — this pillar turns red',
} as const satisfies PillarManifest

const input = {
  releaseId: 'harness-123456789abc-def012345678',
  environment: 'production',
  cohortId: 'synthetic-stage1-123456789abc-def012345678-gh77-2',
  runId: 'gh:77:2',
  customer: {
    email: 'nestscout-stage1-production-customer@example.test',
    password: 'NestScout-production-customer-password-123!',
  },
  worker: {
    email: 'nestscout-stage1-production-worker@example.test',
    password: 'NestScout-production-worker-password-456!',
  },
} as const
const provisionSource = readFileSync(
  resolve(import.meta.dirname, '../../../scripts/stage1-synthetic-actor-provision.mjs'),
  'utf8',
)

describe('Stage 1 synthetic actor provision', () => {
  it('builds a checksummed aggregate-only classification receipt', () => {
    const receipt = buildSyntheticActorProvisionReceipt({
      ...input,
      createdActorCount: 2,
      reusedActorCount: 0,
      boundMemberCount: 2,
      workerMarkerCount: 1,
      presentationSafe: true,
      authenticationVerified: true,
      now: '2026-08-24T00:00:00.000Z',
    })
    const serializedReceipt = JSON.stringify(receipt)
    expect(receipt, pillarWhy(PILLAR, 'aggregate receipt')).not.toHaveProperty('actorIds')
    expect(receipt, pillarWhy(PILLAR, 'aggregate receipt')).not.toHaveProperty('email')
    expect(serializedReceipt, pillarWhy(PILLAR, 'receipt omits the Customer identity')).not.toContain(input.customer.email)
    expect(serializedReceipt, pillarWhy(PILLAR, 'receipt omits the Worker identity')).not.toContain(input.worker.email)
    expect(serializedReceipt, pillarWhy(PILLAR, 'receipt omits the Customer credential')).not.toContain(input.customer.password)
    expect(serializedReceipt, pillarWhy(PILLAR, 'receipt omits the Worker credential')).not.toContain(input.worker.password)
    expect(verifySyntheticActorProvisionReceipt(receipt)).toBe(true)
    expect(verifySyntheticActorProvisionReceipt({ ...receipt, workerMarkerCount: 0 })).toBe(false)
  })

  it('rejects non-dedicated, cross-environment, weak, or shared credentials', () => {
    expect(() => validateSyntheticActorProvisionInput({
      ...input,
      customer: { ...input.customer, email: 'customer@example.com' },
    })).toThrow(/credential is invalid/u)
    expect(() => validateSyntheticActorProvisionInput({ ...input, environment: 'staging' })).toThrow(
      /credential is invalid/u,
    )
    expect(() => validateSyntheticActorProvisionInput({
      ...input,
      worker: { ...input.worker, password: 'short' },
    })).toThrow(/credential is invalid/u)
    expect(() => validateSyntheticActorProvisionInput({
      ...input,
      worker: { ...input.worker, password: input.customer.password },
    })).toThrow(/credentials must be distinct/u)
  })

  it('requires exact two-member classification and authenticated actors', () => {
    for (const mutation of [
      { boundMemberCount: 1 },
      { workerMarkerCount: 0 },
      { presentationSafe: false },
      { authenticationVerified: false },
    ]) {
      expect(() => buildSyntheticActorProvisionReceipt({
        ...input,
        createdActorCount: 0,
        reusedActorCount: 2,
        boundMemberCount: 2,
        workerMarkerCount: 1,
        presentationSafe: true,
        authenticationVerified: true,
        ...mutation,
      })).toThrow(/not safely provisioned/u)
    }
  })

  it('keeps actors banned and the Worker disabled until permanent cohort classification succeeds', () => {
    const makeSafe = provisionSource.indexOf('await makeProfilesSafe(admin, actors)')
    const bind = provisionSource.indexOf('await bindCohort(admin, options.cohort, actors)')
    const activate = provisionSource.indexOf('await activateClassifiedWorker(admin, options.cohort, actors.worker.id)')
    const verify = provisionSource.indexOf('await verifyClassification(admin, options.cohort, actors)')
    const unban = provisionSource.indexOf('await unbanActors(admin, actors)')
    expect(makeSafe, pillarWhy(PILLAR, 'a disabled Worker state is established first')).toBeGreaterThan(0)
    expect(bind, pillarWhy(PILLAR, 'permanent classification follows the disabled state')).toBeGreaterThan(makeSafe)
    expect(activate, pillarWhy(PILLAR, 'Worker activation follows cohort binding')).toBeGreaterThan(bind)
    expect(verify, pillarWhy(PILLAR, 'classification is re-read after activation')).toBeGreaterThan(activate)
    expect(unban, pillarWhy(PILLAR, 'login is enabled only after classification proof')).toBeGreaterThan(verify)
    expect(provisionSource, pillarWhy(PILLAR, 'new and reused actors are banned during mutation'))
      .toContain("ban_duration: '876000h'")
    expect(provisionSource, pillarWhy(PILLAR, 'the Worker is initialized unavailable and suspended'))
      .toContain('is_available: false')
    expect(provisionSource, pillarWhy(PILLAR, 'the Worker is initialized unavailable and suspended'))
      .toContain('is_suspended: true')
  })
})
