import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { matchRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes'
import { validateWorkflowTransition } from '../../../../../supabase/functions/mobile-api/_shared/workflow-orchestrator'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P68-completion-payment-authority',
  invariant:
    'only the Customer can confirm completion and atomically open the manual-bank order; no direct-payment, Kael-payment, unpaid-review, or partial-commit path remains public',
  authority: [
    'governance/RULES.md #7 (Customer authority gates completion and payment)',
    'approved Production Agentic Transaction Readiness plan (manual-bank-only V1)',
  ],
  target: 'supabase/migrations/20260904231000_canonical_completion_payment_authority.sql',
  layer: 'security-negative',
  siblings: ['P06-payment-unlock-gate', 'P12-workflow-transition-composition', 'P19-job-access-ownership'],
  mutation:
    'restore a direct-payment route or a confirmed_by_customer to paid/reviewed edge; the public-route and state-machine cases turn red',
} as const satisfies PillarManifest

const root = resolve(__dirname, '../../../../../')
const migrationPath = resolve(
  root,
  'supabase/migrations/20260904231000_canonical_completion_payment_authority.sql',
)
const completionDomainPath = resolve(
  root,
  'supabase/functions/mobile-api/_shared/domains/payment/manual-bank.ts',
)
const mobileServicePath = resolve(root, 'apps/mobile/lib/services.ts')
const customerPaymentSurfacePath = resolve(
  root,
  'apps/mobile/components/customer/kael-chat/customer-payment-rail-surface.tsx',
)
const workerSettlementSurfacePath = resolve(
  root,
  'apps/mobile/components/worker/jobs/worker-jobs-zip-prototype-settlement-stages.tsx',
)
const candidateSurfacePath = resolve(
  root,
  'apps/mobile/components/customer/kael-chat/worker-candidate-review-response.tsx',
)
const candidateDomainPath = resolve(
  root,
  'supabase/functions/mobile-api/_shared/domains/matching/candidate.ts',
)

describe('canonical completion and payment authority', () => {
  it('exposes Customer-only completion and no new direct-worker payment mutation', () => {
    const jobId = '11111111-1111-4111-8111-111111111111'

    expect(matchRoute(new Request(`https://example.test/functions/v1/mobile-api/jobs/${jobId}/confirm-completion`, {
      method: 'POST',
    }))).toMatchObject({ kind: 'jobs.confirmCompletion', roles: ['customer'] })
    expect(matchRoute(new Request(`https://example.test/functions/v1/mobile-api/jobs/${jobId}/direct-payment/select`, {
      method: 'POST',
    }))).toBeNull()
    expect(matchRoute(new Request(`https://example.test/functions/v1/mobile-api/jobs/${jobId}/direct-payment/respond`, {
      method: 'POST',
    }))).toBeNull()
    expect(matchRoute(new Request(`https://example.test/functions/v1/mobile-api/jobs/${jobId}/cash-payment-confirmation`, {
      method: 'POST',
    }))).toBeNull()
    expect(matchRoute(new Request(`https://example.test/functions/v1/mobile-api/jobs/${jobId}/payment-intent`, {
      method: 'POST',
    }))).toBeNull()
    expect(matchRoute(new Request(`https://example.test/functions/v1/mobile-api/jobs/${jobId}/staging-payment-confirm`, {
      method: 'POST',
    }))).toBeNull()
  })

  it('admits only human/provider-owned completion, payment, and review edges', () => {
    expect(validateWorkflowTransition({
      event: 'customer_confirmed_completion',
      from: 'completed_by_worker',
      to: 'confirmed_by_customer',
    }).valid).toBe(true)
    expect(validateWorkflowTransition({
      event: 'customer_started_payment',
      from: 'confirmed_by_customer',
      to: 'payment_pending',
    }).valid).toBe(true)
    expect(validateWorkflowTransition({
      event: 'payment_confirmed',
      from: 'payment_pending',
      to: 'paid',
    }).valid).toBe(true)
    expect(validateWorkflowTransition({
      event: 'review_submitted',
      from: 'paid',
      to: 'reviewed',
    }).valid).toBe(true)
    expect(validateWorkflowTransition({
      event: 'review_submitted',
      from: 'confirmed_by_customer',
      to: 'reviewed',
    }).valid).toBe(false)
  })

  it('contains no destructive SQL in the completion migration artifact', () => {
    const migration = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n')
    expect(migration).not.toMatch(/\b(drop|truncate|delete\s+from)\b/iu)
  })

  it.each(['completed_by_worker', 'confirmed_by_customer', 'payment_pending'] as const)(
    'refuses review while the transaction remains %s', (from) => {
      expect(validateWorkflowTransition({ event: 'review_submitted', from, to: 'reviewed' }).valid,
        pillarWhy(PILLAR, 'review requires verified payment, not a completion or payment-pending state')).toBe(false)
    },
  )

  it('wires the public completion action to the atomic operation instead of two writes', () => {
    const source = readFileSync(completionDomainPath, 'utf8').replace(/\r\n/g, '\n')

    expect(source).toContain('confirm_completion_manual_bank_atomic')
    expect(source).toContain('completion-payment:${jobId}:${ctx.user.id}')
    expect(source).not.toContain('.update({ status: "confirmed_by_customer"')
  })

  it('keeps public mobile payment actions manual-bank-only while rendering legacy records read-only', () => {
    const service = readFileSync(mobileServicePath, 'utf8')
    const customerSurface = readFileSync(customerPaymentSurfacePath, 'utf8')
    const workerSurface = readFileSync(workerSettlementSurfacePath, 'utf8')
    const candidateSurface = readFileSync(candidateSurfacePath, 'utf8')
    const candidateDomain = readFileSync(candidateDomainPath, 'utf8')

    expect(service, pillarWhy(PILLAR, 'the public client must not retain a hidden retired mutation')).not.toMatch(
      /direct-payment\/(?:select|respond)|cash-payment-confirmation|staging-payment-confirm|\/payment-intent/u,
    )
    expect(service).toContain('/payment-order')
    expect(service).toContain('/payment-order/claim')
    expect(customerSurface).not.toContain('customer-v21-case-direct-payment-select')
    expect(customerSurface).not.toContain('customer-v21-case-direct-payment-confirm')
    expect(customerSurface).toContain('chỉ được giữ để đối soát')
    expect(candidateSurface).not.toMatch(/paymentEligibility|payment-direct-(?:available|unavailable)/u)
    expect(candidateDomain).toContain('direct_payment_available: directPaymentAvailable')
    expect(workerSurface).not.toContain('worker-v5-completion-direct-payment-action')
    expect(workerSurface).toContain('bộ phận vận hành đối soát')
  })
})
