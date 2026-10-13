import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P75-transaction-critical-route-coverage',
  invariant:
    'transaction catalog integrity never substitutes for behavioral proof; external release evidence stays visible outside the collected-test map, and unresolved local route/state gaps remain explicit',
  authority: [
    'governance/RULES.md #0 (workflow-sensitive writes stay behind mobile-api)',
    'governance/critical.md #3 (an unexecuted verification cannot support completion)',
  ],
  target: 'config/harness/transaction-critical-coverage.json',
  layer: 'static-type',
  siblings: ['P12-workflow-transition-composition', 'P18-capability-registry-parity', 'P71-worker-readiness-onboarding'],
  mutation:
    'treat a hosted/native release gap as missing local test mapping or suppress its report — the split-scope assertion turns red',
} as const satisfies PillarManifest

const root = join(process.cwd(), '../..')
const manifest = JSON.parse(
  readFileSync(join(root, 'config/harness/transaction-critical-coverage.json'), 'utf8'),
) as {
  minimum_public_workers: number
  actors: string[]
  states: string[]
  entries: Array<{
    id: string
    route_kind?: string
    system_surface?: string
    actor: string
    from: string[]
    to: string[]
    pillars: string[]
  }>
  behavioral_contract: {
    bindings: Record<string, {
      status: string
      gaps: string[]
      release_gaps?: string[]
      cases?: Array<{
        id: string
        pillar: string
        owner: string
        invocation: string
        seam: string
        actor: string
        from: string[]
        to: string[]
        success_tests: string[]
        denial_tests: string[]
        recovery_tests: string[]
      }>
    }>
  }
}

describe('transaction-critical route coverage', () => {
  it('validates catalog bindings while reporting behavioral verification debt', () => {
    const result = spawnSync(process.execPath, ['scripts/harness/transaction-critical-coverage.mjs'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    })
    expect(
      result.status,
      pillarWhy(PILLAR, `${result.stdout}\n${result.stderr}`.trim()),
    ).toBe(0)
    expect(result.stdout).toContain('53 routes, 8 system surfaces')
    expect(result.stdout).toContain('behavioral verification:')
    expect(result.stdout).toContain('UNVERIFIED')
    expect(result.stdout).not.toContain('transaction-critical coverage ok')
  })

  it('refuses required behavioral proof when only the catalog exists', () => {
    const result = spawnSync(process.execPath, [
      'scripts/harness/transaction-critical-coverage.mjs', '--require-behavioral',
    ], { cwd: root, encoding: 'utf8', windowsHide: true })
    expect(result.status, pillarWhy(PILLAR, 'source bindings are not executed test evidence')).toBe(1)
    expect(result.stderr).toContain('required behavioral proof failed')
  })

  it('keeps external release evidence separate and visible', () => {
    const health = manifest.behavioral_contract.bindings['system.release.health']
    expect(health.status, pillarWhy(PILLAR, 'the local health identity route is mapped from its collected assertions')).toBe('MAPPED')
    expect(health.gaps).toEqual([])
    expect(health.release_gaps?.join(' ')).toContain('System Health monitor')

    const result = spawnSync(process.execPath, ['scripts/harness/transaction-critical-coverage.mjs'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('release evidence outside behavioral mapping:')
    expect(result.stdout).toContain('RELEASE GAP system.release.health:')
  })

  it('maps Customer apartment access across every atomic-RPC job state', () => {
    const routeId = 'customer.apartment-access.authorize'
    const coverage = manifest.behavioral_contract.bindings[routeId]
    const entry = manifest.entries.find(item => item.id === routeId)
    const supportedStates = [
      'arrived', 'completion_proposed', 'inspecting', 'official_match', 'on_way', 'scope_change_pending', 'working',
    ]
    expect(coverage.status, pillarWhy(PILLAR, 'the public command covers every status accepted by the atomic authorization RPC')).toBe('MAPPED')
    expect(coverage.gaps).toEqual([])
    expect([...(entry?.from ?? [])].sort()).toEqual(supportedStates)
    expect([...(entry?.to ?? [])].sort()).toEqual(supportedStates)

    const routeCase = coverage.cases?.find(item => item.id === 'customer-apartment-access-authorize-receipt')
    expect([...(routeCase?.from ?? [])].sort()).toEqual(supportedStates)
    expect([...(routeCase?.to ?? [])].sort()).toEqual(supportedStates)
    expect(routeCase?.success_tests).toContain(
      'Customer apartment authorization intent and receipt routes each RPC-authorized job state through one atomic command',
    )

    const mobileCase = coverage.cases?.find(item => item.id === 'customer-apartment-access-authorize-recovery')
    expect(mobileCase?.from).toEqual(['arrived'])
    expect(mobileCase?.to).toEqual(['arrived'])
    const releaseEvidence = coverage.release_gaps?.join(' ') ?? ''
    expect(releaseEvidence).toContain('Hosted Edge-to-SQL')
    expect(releaseEvidence.toLowerCase()).toContain('concurrent access races')
    expect(releaseEvidence).toContain('physical native relaunch')
    expect(releaseEvidence).toContain('Production proof')
  })

  it('maps every Customer matching-selection receipt state through its collected HTTP case', () => {
    const coverage = manifest.behavioral_contract.bindings['customer.matching-selection.read']
    expect(coverage.status, pillarWhy(PILLAR, 'all declared receipt states have collected HTTP assertions')).toBe('MAPPED')
    expect(coverage.gaps).toEqual([])

    const receiptCase = coverage.cases?.find(item => item.id === 'customer-matching-selection-receipt-http')
    expect(receiptCase?.pillar).toBe('P109-matching-selection-http')
    expect([...(receiptCase?.from ?? [])].sort()).toEqual(['broadcasting', 'matching_queued', 'official_match', 'recovery_required'])
    expect([...(receiptCase?.to ?? [])].sort()).toEqual(['broadcasting', 'matching_queued', 'official_match', 'recovery_required'])
    expect(receiptCase?.success_tests).toEqual([
      'Customer durable matching selection recovers the matching_queued selection receipt through GET after restart without another command',
      'Customer durable matching selection recovers the broadcasting selection receipt through GET after restart without another command',
      'Customer durable matching selection recovers the official_match selection receipt through GET after restart without another command',
      'Customer durable matching selection recovers the recovery_required selection receipt through GET after restart without another command',
    ])
  })

  it('maps Customer candidate reads while keeping hosted and native proof outside local coverage', () => {
    const coverage = manifest.behavioral_contract.bindings['customer.candidate.read']
    expect(coverage.status, pillarWhy(PILLAR, 'the collected HTTP pillar covers candidate-read success, refusal, and recovery')).toBe('MAPPED')
    expect(coverage.gaps).toEqual([])
    expect(coverage.release_gaps?.join(' ')).toContain('Hosted Edge-to-SQL')

    const candidateCase = coverage.cases?.find(item => item.id === 'customer-candidate-read-expiry-authority')
    expect(candidateCase?.pillar).toBe('P97-candidate-expiry-authority-http')
    expect(candidateCase?.from).toEqual(['candidate_ready'])
    expect(candidateCase?.to).toEqual(['candidate_ready'])
    expect(candidateCase?.success_tests).toEqual([
      'candidate read authority under clock skew projects rfq expiry without post-commit workflow writes',
    ])
    expect(candidateCase?.denial_tests).toEqual([
      'candidate read authority under clock skew does not choose or decline a live rfq candidate when Edge thinks it expired',
    ])
    expect(candidateCase?.recovery_tests).toEqual([
      'candidate read authority under clock skew keeps malformed or unreadable outcomes recoverable: {"rpcData":[]}',
    ])
  })

  it('maps matching consent from the public command through persisted mobile recovery', () => {
    const coverage = manifest.behavioral_contract.bindings['customer.matching-selection']
    expect(coverage.status, pillarWhy(PILLAR, 'the HTTP command, persisted consent, and localized choice UI cover the declared states')).toBe('MAPPED')
    expect(coverage.gaps).toEqual([])
    expect(coverage.release_gaps?.join(' ')).toContain('concurrent connections')
    expect(coverage.release_gaps?.join(' ')).toContain('hosted Edge-to-SQL')
    expect(coverage.release_gaps?.join(' ')).toContain('native relaunch')
    expect(coverage.release_gaps?.join(' ')).toContain('Production delivery')
    expect(coverage.cases?.map(({ id, pillar, from, to, success_tests, denial_tests, recovery_tests }) => ({
      id, pillar, from, to, success_tests, denial_tests, recovery_tests,
    }))).toEqual([
      {
        id: 'customer-matching-selection-http',
        pillar: 'P109-matching-selection-http',
        from: ['job_created'],
        to: ['matching_queued', 'recovery_required'],
        success_tests: [
          'Customer durable matching selection accepts an unpriced saved-only choice and queues exactly one atomic command without delivery',
          'Customer durable matching selection does not invent fallback consent when the client omits it',
        ],
        denial_tests: [
          'Customer durable matching selection denies admin before a selection RPC',
          'Customer durable matching selection denies worker before a selection RPC',
        ],
        recovery_tests: ['Customer durable matching selection rejects a invented consent receipt as an unknown outcome'],
      },
      {
        id: 'customer-matching-selection-mobile',
        pillar: 'P111-customer-matching-selection-mobile',
        from: ['job_created'],
        to: ['matching_queued'],
        success_tests: ['Customer durable matching selection mobile boundary persists exact saved-only consent before POST and joins duplicate presses'],
        denial_tests: ['Customer durable matching selection mobile boundary does not send when persistent storage fails'],
        recovery_tests: ['Customer durable matching selection mobile boundary replays only identical persisted consent when a cold-start GET proves absence'],
      },
      {
        id: 'customer-matching-consent-ui',
        pillar: 'P114-customer-matching-consent-ui',
        from: ['job_created'],
        to: ['matching_queued'],
        success_tests: [
          'Customer matching consent UI defaults to saved-only and never invents fallback consent',
          'Customer matching consent UI sends fallback only after explicit opt-in in vi',
          'Customer matching consent UI sends fallback only after explicit opt-in in en',
        ],
        denial_tests: ['Customer matching consent UI locks both choices while restoring storage or reconciling saved consent'],
        recovery_tests: ['Customer matching consent UI shows the persisted choice instead of an editable draft after an unknown outcome'],
      },
    ])
  })

  it('maps Customer candidate rejection while retaining race and release evidence gaps', () => {
    const coverage = manifest.behavioral_contract.bindings['customer.candidate.reject']
    expect(coverage.status, pillarWhy(PILLAR, 'the collected HTTP pillar covers rejection success, refusal, and uncertain recovery')).toBe('MAPPED')
    expect(coverage.gaps).toEqual([])
    expect(coverage.release_gaps?.join(' ')).toContain('concurrent accept/decline races')

    const rejectionCase = coverage.cases?.find(item => item.id === 'customer-candidate-reject-durable')
    expect(rejectionCase?.pillar).toBe('P120-candidate-rejection-durability')
    expect(rejectionCase?.from).toEqual(['candidate_ready'])
    expect(rejectionCase?.to).toEqual(['broadcasting'])
    expect(rejectionCase?.success_tests).toEqual([
      'durable candidate rejection boundary does not perform a second workflow write or provider dispatch after commit',
    ])
    expect(rejectionCase?.denial_tests).toEqual([
      'durable candidate rejection boundary denies worker before mutation',
    ])
    expect(rejectionCase?.recovery_tests).toEqual([
      'durable candidate rejection boundary keeps an uncertain outcome recoverable and does not disclose database errors: {"rpcData":[]}',
    ])
  })

  it('maps provider receipt reconciliation while retaining live delivery proof gaps', () => {
    const coverage = manifest.behavioral_contract.bindings['system.delivery.reconcile']
    expect(coverage.status, pillarWhy(PILLAR, 'the collected provider receipt pillar covers handoff, stale-token refusal, and unresolved recovery')).toBe('MAPPED')
    expect(coverage.gaps).toEqual([])
    expect(coverage.release_gaps?.join(' ')).toContain('concurrent leases')

    const deliveryCase = coverage.cases?.find(item => item.id === 'system-delivery-reconcile-provider-receipt')
    expect(deliveryCase?.pillar).toBe('P57-stage1-provider-push-receipt')
    expect(deliveryCase?.from).toEqual(['broadcasting'])
    expect(deliveryCase?.to).toEqual(['broadcasting', 'recovery_required'])
    expect(deliveryCase?.success_tests).toEqual([
      'Stage 1 provider push receipts records a current-token provider receipt only as provider handoff',
    ])
    expect(deliveryCase?.denial_tests).toEqual([
      'Stage 1 provider push receipts does not convert a stale-token receipt into push proof',
    ])
    expect(deliveryCase?.recovery_tests).toEqual([
      'Stage 1 provider push receipts treats an omitted provider receipt as unresolved recovery, not an error',
    ])
  })

  it('maps Admin payment reconciliation only to receipt outcomes produced from payment_pending', () => {
    const entry = manifest.entries.find(item => item.id === 'admin.payment.reconciliation.decide')
    const coverage = manifest.behavioral_contract.bindings['admin.payment.reconciliation.decide']
    expect(coverage.status, pillarWhy(PILLAR, 'the SQL-backed decision receipt only transitions a payment-pending job to paid or keeps it pending')).toBe('MAPPED')
    expect(coverage.gaps).toEqual([])
    expect(entry?.from).toEqual(['payment_pending'])
    expect(entry?.to).toEqual(['paid', 'payment_pending'])
    expect([...entry?.from ?? [], ...entry?.to ?? []]).not.toContain('refund_required')
    expect(coverage.release_gaps?.join(' ')).toContain('Hosted SQL/RLS')

    const httpCase = coverage.cases?.find(item => item.id === 'admin-payment-reconciliation-decision-http')
    expect(httpCase?.from).toEqual(['payment_pending'])
    expect(httpCase?.to).toEqual(['paid', 'payment_pending'])
    expect(httpCase?.recovery_tests).toContain(
      'Admin payment reconciliation decision at the public HTTP boundary rejects a malformed atomic receipt instead of returning a false paid result',
    )
  })

  it('maps Customer completion to its committed payment_pending result', () => {
    const entry = manifest.entries.find(item => item.id === 'customer.completion.confirm')
    const coverage = manifest.behavioral_contract.bindings['customer.completion.confirm']
    expect(coverage.status, pillarWhy(PILLAR, 'the route returns one atomic pending-payment receipt; customer_confirmed is only an intermediate event and recovery_required is not a job result')).toBe('MAPPED')
    expect(coverage.gaps).toEqual([])
    expect(entry?.from).toEqual(['completion_proposed'])
    expect(entry?.to).toEqual(['payment_pending'])
    expect(entry?.pillars).toEqual(expect.arrayContaining([
      'P68-completion-payment-authority',
      'P86-customer-completion-http',
      'P371-customer-completion-atomic-sql',
    ]))
    expect(coverage.cases?.map(({ id }) => id)).toEqual(['customer-completion-http'])
    const httpCase = coverage.cases?.find(({ id }) => id === 'customer-completion-http')
    expect(httpCase?.from).toEqual(['completion_proposed'])
    expect(httpCase?.to).toEqual(['payment_pending'])
    expect(coverage.release_gaps?.join(' ')).toContain('Hosted SQL/RLS')
  })

  it('maps Customer cancellation by the committed job state and keeps paid review separate', () => {
    const entry = manifest.entries.find(item => item.id === 'customer.cancellation.request')
    const coverage = manifest.behavioral_contract.bindings['customer.cancellation.request']
    expect(coverage.status, pillarWhy(PILLAR, 'local HTTP and SQL-backed route evidence covers cancellation, completion dispute, and paid review outcomes')).toBe('MAPPED')
    expect(coverage.gaps).toEqual([])
    expect(entry?.from).toEqual([
      'confirmation_pending', 'broadcasting', 'official_match', 'scheduled', 'on_way',
      'arrived', 'inspecting', 'working', 'scope_change_pending', 'completion_proposed',
      'paid', 'reviewed',
    ])
    expect(entry?.to).toEqual([
      'cancelled', 'completion_proposed', 'paid', 'reviewed', 'recovery_required',
    ])
    expect(entry?.to).not.toContain('broadcasting')
    expect(entry?.to).not.toContain('refund_required')
    expect(entry?.pillars).toEqual(expect.arrayContaining([
      'P115-customer-job-command-isolation',
      'P116-customer-cancellation-http',
      'P88-refund-obligations-runtime',
      'P118-customer-cancellation-notification-sql',
      'P89-refund-obligation-integrity-sql',
    ]))
    expect(coverage.cases?.map(({ id, pillar, from, to }) => ({ id, pillar, from, to }))).toEqual([
      {
        id: 'customer-cancellation-mobile-isolation',
        pillar: 'P115-customer-job-command-isolation',
        from: ['broadcasting'],
        to: ['cancelled'],
      },
      {
        id: 'customer-cancellation-http-receipt-integrity',
        pillar: 'P116-customer-cancellation-http',
        from: ['confirmation_pending', 'broadcasting', 'official_match', 'scheduled', 'on_way', 'arrived', 'inspecting', 'working', 'scope_change_pending', 'completion_proposed'],
        to: ['cancelled', 'completion_proposed', 'recovery_required'],
      },
      {
        id: 'customer-cancellation-paid-review-http',
        pillar: 'P88-refund-obligations-runtime',
        from: ['paid', 'reviewed'],
        to: ['paid', 'reviewed'],
      },
    ])
    expect(coverage.release_gaps?.join(' ')).toContain('Hosted current-source Edge-to-SQL')
    expect(coverage.release_gaps?.join(' ')).toContain('multi-connection')
    expect(coverage.release_gaps?.join(' ')).toContain('native')
    expect(coverage.release_gaps?.join(' ')).toContain('Production')
  })

  it('maps confirmed Worker scope-change proposals and Customer resume decisions while keeping runtime gaps open', () => {
    const workerEntry = manifest.entries.find(item => item.id === 'worker.scope-change.propose')
    const workerCoverage = manifest.behavioral_contract.bindings['worker.scope-change.propose']
    expect(workerCoverage.status, pillarWhy(PILLAR, 'the public quote-confirmed route and its replay cases are collected')).toBe('MAPPED')
    expect(workerCoverage.gaps).toEqual([])
    expect(workerCoverage.release_gaps?.join(' ')).toContain('Hosted Edge-to-SQL')
    expect(workerEntry?.from).toEqual(['official_match', 'on_way', 'arrived', 'inspecting', 'working', 'scope_change_pending'])
    expect(workerEntry?.to).toEqual(['scope_change_pending'])

    const directCase = workerCoverage.cases?.find(item => item.id === 'worker-scope-change-direct-request')
    expect(directCase).toMatchObject({
      pillar: 'P191-worker-scope-change-request',
      owner: 'supabase/functions/mobile-api/_shared/domains/job/scope-change/request.ts',
      invocation: 'requestScopeChange',
      seam: 'http',
      actor: 'worker',
      from: ['working', 'scope_change_pending'],
      to: ['scope_change_pending'],
      success_tests: ['direct scope-change public HTTP route replays the committed receipt over HTTP without calling a provider'],
      denial_tests: ['direct scope-change public HTTP route refuses a fresh Worker request before provider work or persistence without a confirmed quote'],
      recovery_tests: ['direct scope-change public HTTP route drains missing durable effects over HTTP on replay without rerunning the provider'],
    })

    const quoteCase = workerCoverage.cases?.find(item => item.id === 'worker-scope-change-confirmed-quote-http')
    expect(quoteCase).toMatchObject({
      pillar: 'P87-scope-change-http-authority',
      invocation: 'proposeScopeChangeFromJobIncident',
      seam: 'http',
      actor: 'worker',
      from: ['official_match', 'on_way', 'arrived', 'inspecting', 'working'],
      to: ['scope_change_pending'],
      success_tests: ['Scope change at the public HTTP boundary accepts a saved worker-confirmed quote from every resumable Worker status without new inference'],
    })

    const customerEntry = manifest.entries.find(item => item.id === 'customer.scope-change.decide')
    const customerCoverage = manifest.behavioral_contract.bindings['customer.scope-change.decide']
    expect(customerCoverage.status).toBe('MAPPED')
    expect(customerCoverage.gaps).toEqual([])
    expect(customerEntry?.to).toEqual(['official_match', 'on_way', 'arrived', 'inspecting', 'working'])
    expect(customerCoverage.cases?.[0].success_tests).toContain(
      'Scope change at the public HTTP boundary maps Customer rejection to each saved resume status without cancelling the job',
    )
    expect(customerCoverage.release_gaps?.join(' ')).toContain('Production route identity and behavior')
  })

  it('maps Customer intake clarification and fixture-backed RFQ readiness with external evidence gaps separated', () => {
    const routeId = 'customer.intake.turn'
    const entry = manifest.entries.find(item => item.id === routeId)
    const coverage = manifest.behavioral_contract.bindings[routeId]
    expect(coverage.status, pillarWhy(PILLAR, 'collected route, clarification, and ready-state assertions cover the declared local states')).toBe('MAPPED')
    expect(coverage.gaps).toEqual([])
    expect(coverage.release_gaps?.join(' ')).toContain('hosted Edge-to-SQL')
    expect(coverage.release_gaps?.join(' ')).toContain('Provider interoperability')
    expect(entry?.pillars).toContain('P372-customer-intake-turn-fixtures')

    const routeCase = coverage.cases?.find(item => item.id === 'customer-intake-turn-http-dispatch')
    expect(routeCase?.success_tests).toContain(
      'customer Kael turn HTTP boundary customer Kael turn HTTP route persists a district clarification through the service without provider calls',
    )

    const fixtureCase = coverage.cases?.find(item => item.id === 'customer-intake-turn-fixture-outcomes')
    expect(fixtureCase).toMatchObject({
      pillar: 'P372-customer-intake-turn-fixtures',
      owner: 'supabase/functions/mobile-api/_shared/domains/kael-chat/estimate-support.ts',
      invocation: 'finalizeUnpricedStage1Intake',
      seam: 'service',
      actor: 'customer',
      from: ['intake'],
      to: ['intake', 'coverage_ready'],
      success_tests: [
        'Customer intake turn fixtures keeps the intake active and asks for a missing required address detail',
        'Customer intake turn fixtures marks a complete RFQ intake ready for worker quotes without showing a price',
      ],
      denial_tests: ['Customer intake turn fixtures rejects a priced policy before persisting an unpriced intake result'],
      recovery_tests: [],
    })
  })

  it('maps dispute commands to dispute lifecycle states instead of job or refund outcomes', () => {
    const expected = [
      {
        id: 'customer.dispute.open',
        from: ['scope_change_pending', 'completion_proposed', 'customer_confirmed', 'payment_pending', 'paid', 'reviewed', 'repairing'],
        to: ['dispute_open'],
        status: 'MAPPED',
        caseIds: ['customer-dispute-open-atomic', 'customer-dispute-open-http'],
      },
      {
        id: 'worker.dispute.open',
        from: ['scope_change_pending', 'completion_proposed', 'customer_confirmed', 'payment_pending', 'paid', 'reviewed', 'repairing'],
        to: ['dispute_open'],
        status: 'MAPPED',
        caseIds: ['worker-dispute-open-atomic', 'worker-dispute-open-http'],
      },
      {
        id: 'customer.dispute.counter-statement',
        from: ['dispute_open', 'dispute_awaiting_counter_party'],
        to: ['dispute_admin_review'],
        status: 'MAPPED',
        caseIds: ['customer-dispute-counter-statement-atomic', 'customer-dispute-counter-statement-http'],
      },
      {
        id: 'worker.dispute.counter-statement',
        from: ['dispute_open', 'dispute_awaiting_counter_party'],
        to: ['dispute_admin_review'],
        status: 'MAPPED',
        caseIds: ['worker-dispute-counter-statement-atomic', 'worker-dispute-counter-statement-http'],
      },
      {
        id: 'admin.dispute.decide',
        from: ['dispute_open', 'dispute_awaiting_counter_party', 'dispute_admin_review'],
        to: ['dispute_admin_decided'],
        status: 'MAPPED',
        caseIds: ['admin-dispute-decision-atomic', 'admin-dispute-decision-http'],
      },
    ]

    for (const item of expected) {
      const entry = manifest.entries.find(candidate => candidate.id === item.id)
      const coverage = manifest.behavioral_contract.bindings[item.id]
      expect(entry?.from).toEqual(item.from)
      expect(entry?.to).toEqual(item.to)
      expect(coverage.status, pillarWhy(PILLAR, `${item.id} reports the evidence level for dispute-owned states honestly`)).toBe(item.status)
      if (item.status === 'MAPPED') expect(coverage.gaps).toEqual([])
      else expect(coverage.gaps.join(' ')).toContain('eligible job origin states')
      expect(coverage.cases?.map(({ id }) => id)).toEqual(item.caseIds)
      if (item.id === 'customer.dispute.open') {
        const atomicCase = coverage.cases?.find(({ id }) => id === 'customer-dispute-open-atomic')
        expect([...(atomicCase?.from ?? [])].sort()).toEqual([...item.from].sort())
        expect(entry?.pillars).toContain('P89-refund-obligation-integrity-sql')
      }
      if (item.id === 'worker.dispute.open') {
        const atomicCase = coverage.cases?.find(({ id }) => id === 'worker-dispute-open-atomic')
        expect(atomicCase?.from).toEqual(item.from)
        expect(entry?.pillars).toContain('P89-refund-obligation-integrity-sql')
        expect(coverage.cases?.find(({ id }) => id === 'worker-dispute-open-http')).toMatchObject({
          seam: 'http',
          actor: 'worker',
        })
      }
      expect([...entry?.from ?? [], ...entry?.to ?? []]).not.toContain('recovery_required')
      expect([...entry?.from ?? [], ...entry?.to ?? []]).not.toContain('refund_required')
    }

    expect(manifest.states).toEqual(expect.arrayContaining([
      'dispute_open',
      'dispute_awaiting_counter_party',
      'dispute_admin_review',
      'dispute_admin_decided',
    ]))
    expect(manifest.behavioral_contract.bindings['admin.dispute.decide'].release_gaps?.join(' ')).toContain('Hosted SQL/RLS')
  })

  it('maps RFQ commands and reads to collected HTTP and UI assertions while retaining live proof gaps', () => {
    const expected = [
      {
        id: 'worker.rfq-price.propose',
        releaseGap: 'Hosted Edge-to-SQL',
        cases: [
          { id: 'worker-rfq-price-propose-http', pillar: 'P178-rfq-price-public-contract', from: ['inspecting'], to: ['inspecting'] },
          { id: 'worker-rfq-price-propose-mobile-recovery', pillar: 'P179-rfq-price-mobile-recovery', from: ['inspecting'], to: ['inspecting'] },
        ],
      },
      {
        id: 'customer.rfq-price.decide',
        releaseGap: 'concurrent decision races',
        cases: [
          { id: 'customer-rfq-price-decide-http', pillar: 'P178-rfq-price-public-contract', from: ['inspecting'], to: ['inspecting', 'working'] },
          { id: 'customer-rfq-price-decide-consent-ui', pillar: 'P180-rfq-price-consent-ui', from: ['inspecting'], to: ['inspecting', 'working'] },
        ],
      },
      {
        id: 'customer.rfq-price.reconcile',
        releaseGap: 'concurrent proposal changes',
        cases: [
          { id: 'customer-rfq-price-reconcile-http', pillar: 'P178-rfq-price-public-contract', from: ['inspecting'], to: ['inspecting', 'recovery_required'] },
        ],
      },
      {
        id: 'worker.rfq-price.reconcile',
        releaseGap: 'concurrent proposal changes',
        cases: [
          { id: 'worker-rfq-price-read-reconcile', pillar: 'P178-rfq-price-public-contract', from: ['inspecting'], to: ['inspecting', 'recovery_required'] },
        ],
      },
    ]

    for (const item of expected) {
      const coverage = manifest.behavioral_contract.bindings[item.id]
      expect(coverage.status, pillarWhy(PILLAR, `${item.id} has collected HTTP/UI behavior for every declared state`)).toBe('MAPPED')
      expect(coverage.gaps).toEqual([])
      expect(coverage.release_gaps?.join(' ')).toContain(item.releaseGap)
      expect(coverage.cases?.map(({ id, pillar, from, to }) => ({ id, pillar, from, to }))).toEqual(item.cases)
    }
  })

  it('maps matching outbox and saved-worker fallback behavior while retaining release gaps', () => {
    const coverage = manifest.behavioral_contract.bindings['system.matching.outbox']
    expect(coverage.status, pillarWhy(PILLAR, 'both real system processors cover their declared state transitions')).toBe('MAPPED')
    expect(coverage.gaps).toEqual([])
    expect(coverage.release_gaps?.join(' ')).toContain('Hosted Edge-to-SQL')
    expect(coverage.release_gaps?.join(' ')).toContain('simultaneous DB races')
    expect(coverage.release_gaps?.join(' ')).toContain('notification crash recovery')
    expect(coverage.release_gaps?.join(' ')).toContain('native')
    expect(coverage.release_gaps?.join(' ')).toContain('Production')
    expect(coverage.cases?.map(({ id, pillar, from, to, success_tests, denial_tests, recovery_tests }) => ({
      id, pillar, from, to, success_tests, denial_tests, recovery_tests,
    }))).toEqual([
      {
        id: 'confirmation-outbox-default-processor',
        pillar: 'P58-confirmation-outbox-dispatcher',
        from: ['matching_queued'],
        to: ['broadcasting', 'recovery_required'],
        success_tests: ['confirmation matching outbox dispatcher processes a committed RFQ receipt without a diagnosis or price and notifies only its recipient'],
        denial_tests: [
          'confirmation matching outbox dispatcher never enriches or notifies a foreign_job activation receipt',
          'confirmation matching outbox dispatcher never enriches or notifies a foreign_confirmation activation receipt',
          'confirmation matching outbox dispatcher never enriches or notifies a foreign_matching activation receipt',
          'confirmation matching outbox dispatcher never enriches or notifies a expired activation receipt',
        ],
        recovery_tests: [
          'confirmation matching outbox dispatcher uses the real processor with a lease-bound activation for recovery_required, without legacy matching',
          'confirmation matching outbox dispatcher uses the real processor with a lease-bound activation for lease_lost, without legacy matching',
        ],
      },
      {
        id: 'saved-worker-fallback-command',
        pillar: 'P113-saved-worker-fallback-runtime',
        from: ['broadcasting'],
        to: ['matching_queued'],
        success_tests: ['Saved-worker fallback durable runtime queues only the atomic command with no inline broadcast or fake delivery'],
        denial_tests: ['Saved-worker fallback durable runtime preserves a server refusal without attempting broader matching'],
        recovery_tests: ['Saved-worker fallback durable runtime keeps an ambiguous commit recoverable without falling through to legacy matching'],
      },
    ])
  })

  it('maps Worker application submission receipts while keeping hosted and UI proof gaps visible', () => {
    const coverage = manifest.behavioral_contract.bindings['worker.application.submit']
    expect(coverage.status, pillarWhy(PILLAR, 'the public applicant route covers its pending receipt, refusals, and retry identity')).toBe('MAPPED')
    expect(coverage.gaps).toEqual([])
    expect(coverage.release_gaps?.join(' ')).toContain('Supabase Auth')
    expect(coverage.release_gaps?.join(' ')).toContain('concurrent SQL writes')
    expect(coverage.release_gaps?.join(' ')).toContain('current-source hosted onboarding')
    expect(coverage.release_gaps?.join(' ')).toContain('native relaunch')
    expect(coverage.release_gaps?.join(' ')).toContain('approval/revision UI')
    expect(coverage.release_gaps?.join(' ')).toContain('Production proof')
    expect(coverage.cases?.map(({ id, pillar, from, to, success_tests, denial_tests, recovery_tests }) => ({
      id, pillar, from, to, success_tests, denial_tests, recovery_tests,
    }))).toEqual([{
      id: 'applicant-submission-receipt-http',
      pillar: 'P161-worker-application-receipt',
      from: ['worker_application_draft'],
      to: ['worker_application_pending'],
      success_tests: ['Worker application receipt boundary acknowledges the complete pending receipt for an authenticated applicant'],
      denial_tests: [
        'Worker application receipt boundary refuses missing application id instead of acknowledging a submission',
        'Worker application receipt boundary refuses string resubmit flag instead of acknowledging a submission',
        'Worker application receipt boundary never uses the legacy Worker exception to approve an applicant without an application',
      ],
      recovery_tests: ['Worker application receipt boundary keeps the same actor and request identity when retrying an unknown database outcome'],
    }])
  })

  it('maps Customer intake create after its public HTTP behavior is bound', () => {
    const coverage = manifest.behavioral_contract.bindings['customer.intake.create']
    expect(coverage.status, pillarWhy(PILLAR, 'the public route is mapped while external release proof remains visible')).toBe('MAPPED')
    expect(coverage.gaps).toEqual([])
    expect(coverage.release_gaps?.join(' ')).toContain('real Auth')
    expect(coverage.release_gaps?.join(' ')).toContain('Native process-death/relaunch')
    expect(coverage.cases?.map(({ id, pillar }) => ({ id, pillar }))).toEqual([
      { id: 'customer-kael-intake-create-service', pillar: 'P342-customer-kael-intake-create' },
      { id: 'customer-kael-intake-create-http', pillar: 'P342-customer-kael-intake-create' },
    ])
  })

  it.each([
    {
      id: 'auth.worker.email-password',
      releaseGaps: ['Real Supabase Auth', 'hosted role lookup', 'native relaunch', 'concurrent account changes', 'Production proof'],
      cases: [{
        id: 'auth-worker-email-password-provider-boundary',
        pillar: 'P42-auth-session-shell',
        from: ['signed_out'],
        to: ['authenticated'],
        success_tests: ['auth session shell gate auth worker email password signs in and resolves the authenticated Worker role'],
        denial_tests: ['auth session shell gate auth worker email password denies invalid credentials without retaining a session'],
        recovery_tests: [],
      }],
    },
    {
      id: 'customer.candidate.confirm',
      releaseGaps: ['Hosted Edge-to-SQL', 'concurrent candidate races', 'native relaunch', 'Production proof'],
      cases: [{
        id: 'customer-candidate-confirm-receipt',
        pillar: 'P123-official-match-receipt-http',
        from: ['candidate_ready'],
        to: ['official_match', 'scheduled'],
        success_tests: ['official-match receipt boundary recovers a valid rfq receipt'],
        denial_tests: ['official-match receipt boundary denies worker before the command'],
        recovery_tests: ['official-match receipt boundary does not misreport an uncertain committed outcome: {"receipt":[]}'],
      }],
    },
    {
      id: 'worker.cancellation.request',
      releaseGaps: ['Hosted Edge-to-SQL', 'concurrent cancellation races', 'native relaunch', 'Production proof'],
      cases: [{
        id: 'worker-cancellation-request-recovery',
        pillar: 'P83-worker-cancellation-recovery',
        from: ['official_match', 'scheduled', 'on_way', 'arrived', 'inspecting', 'working', 'scope_change_pending'],
        to: ['broadcasting', 'cancelled', 'recovery_required'],
        success_tests: ['Worker cancellation recovery runtime queues approved cancellation without running matching or claiming delivery in the HTTP request'],
        denial_tests: ['Worker cancellation recovery runtime rejects precommit database failure without inventing an approved cancellation'],
        recovery_tests: ['Worker cancellation recovery runtime recovers the same cancellation after commit succeeded but the response was lost and Worker is detached'],
      }],
    },
    {
      id: 'system.confirmation.atomic',
      releaseGaps: ['Multi-connection SQL atomicity', 'hosted current-source Edge', 'provider delivery recovery', 'native relaunch', 'Production proof'],
      cases: [
        {
          id: 'confirmation-atomic-operation-http',
          pillar: 'P48-durable-confirmation-operation',
          from: ['confirmation_pending'],
          to: ['job_created', 'matching_queued', 'recovery_required'],
          success_tests: ['durable Kael confirmation returns the durable receipt produced by the atomic RPC'],
          denial_tests: ['durable Kael confirmation fails closed when the atomic boundary has no receipt'],
          recovery_tests: ['durable Kael confirmation derives the same non-secret idempotency key for every retry'],
        },
        {
          id: 'confirmation-atomic-coverage-http',
          pillar: 'P67-public-coverage-reservation',
          from: ['confirmation_pending'],
          to: ['matching_queued', 'recovery_required'],
          success_tests: ['public service coverage reservation gate uses the reservation-enforcing activation RPC for every durable batch'],
          denial_tests: ['public service coverage reservation gate rejects missing auth and a Worker role before coverage evaluation'],
          recovery_tests: ['public service coverage reservation gate binds preview, confirmation, and durable fan-out to one reserved eligibility source'],
        },
      ],
    },
    {
      id: 'system.recovery.scan',
      releaseGaps: ['Hosted scanner scheduling', 'multi-connection leases', 'live SQL', 'Production recovery evidence'],
      cases: [{
        id: 'system-recovery-scan-capacity-contract',
        pillar: 'P70-workflow-recovery-capacity',
        from: ['broadcasting', 'arrived', 'customer_confirmed', 'payment_pending'],
        to: ['recovery_required'],
        success_tests: ['workflow recovery and matching capacity reconciliation ships isolated recovery cases and append-only action receipts'],
        denial_tests: ['workflow recovery and matching capacity reconciliation never changes a job while detecting or administering recovery'],
        recovery_tests: ['workflow recovery and matching capacity reconciliation localizes every closed recovery reason and keeps system recovery read-only'],
      }],
    },
  ])('maps locally complete behavior for $id while retaining release gaps', ({ id, releaseGaps, cases }) => {
    const coverage = manifest.behavioral_contract.bindings[id]
    expect(coverage.status, pillarWhy(PILLAR, `${id} covers every declared state in collected behavior tests`)).toBe('MAPPED')
    expect(coverage.gaps).toEqual([])
    const releaseEvidence = coverage.release_gaps?.join(' ') ?? ''
    for (const gap of releaseGaps) expect(releaseEvidence).toContain(gap)
    expect(coverage.cases?.map(({ id: caseId, pillar, from, to, success_tests, denial_tests, recovery_tests }) => ({
      id: caseId, pillar, from, to, success_tests, denial_tests, recovery_tests,
    }))).toEqual(cases)
  })

  it.each([
    {
      id: 'customer.direct-confirm',
      releaseGaps: ['Hosted Edge-to-SQL', 'multi-connection concurrency', 'physical native', 'Production proof'],
      cases: [
        {
          id: 'customer-matching-retry-http',
          pillar: 'P104-customer-matching-retry-http',
          from: ['broadcasting'],
          to: ['matching_queued', 'recovery_required'],
          success_tests: ['durable Customer matching retry HTTP contract accepts one atomic command and does no inline provider, job update or delivery work'],
          denial_tests: [
            'durable Customer matching retry HTTP contract denies worker before even a privileged RPC',
            'durable Customer matching retry HTTP contract denies admin before even a privileged RPC',
          ],
          recovery_tests: ['durable Customer matching retry HTTP contract maps 08006/private database detail without exposing database details or claiming a final failure'],
        },
        {
          id: 'customer-matching-retry-mobile-command',
          pillar: 'P105-customer-matching-retry-mobile',
          from: ['broadcasting', 'recovery_required'],
          to: ['matching_queued'],
          success_tests: ['Customer durable matching retry mobile boundary persists actor, job, expected parent and stable request before the first POST; double tap joins it'],
          denial_tests: ['Customer durable matching retry mobile boundary does not send when durable storage fails'],
          recovery_tests: ['Customer durable matching retry mobile boundary replays an unknown request with identical input when GET proves the receipt is missing'],
        },
      ],
    },
    {
      id: 'customer.matching-retry-recovery',
      releaseGaps: ['Hosted Edge-to-SQL', 'multi-connection concurrency', 'physical native', 'Production proof'],
      cases: [
        {
          id: 'customer-matching-retry-read-http',
          pillar: 'P104-customer-matching-retry-http',
          from: ['matching_queued', 'broadcasting', 'recovery_required'],
          to: ['matching_queued', 'broadcasting', 'official_match', 'recovery_required'],
          success_tests: [
            'durable Customer matching retry HTTP contract returns the persisted queued operation after restart without issuing a new command',
            'durable Customer matching retry HTTP contract returns the persisted broadcasting operation after restart without issuing a new command',
            'durable Customer matching retry HTTP contract returns the persisted recovery_required operation after restart without issuing a new command',
            'durable Customer matching retry HTTP contract recovers the same operation after restart without submitting another command',
          ],
          denial_tests: [
            'durable Customer matching retry HTTP contract denies worker receipt reads as well as commands',
            'durable Customer matching retry HTTP contract denies admin receipt reads as well as commands',
          ],
          recovery_tests: [],
        },
        {
          id: 'customer-matching-retry-mobile-recovery',
          pillar: 'P105-customer-matching-retry-mobile',
          from: ['recovery_required'],
          to: ['official_match'],
          success_tests: ['Customer durable matching retry mobile boundary cold start reads the exact persisted request after an ambiguous POST, without a second POST when receipt exists'],
          denial_tests: ['Customer durable matching retry mobile boundary does not replay POST when a previously acknowledged receipt disappears'],
          recovery_tests: ['Customer durable matching retry mobile boundary does not mutate or hydrate the new account when the old POST finishes after an account switch'],
        },
      ],
    },
    {
      id: 'customer.matching-parent-read',
      releaseGaps: ['Hosted Edge-to-SQL', 'multi-connection concurrency', 'physical native', 'Production proof'],
      cases: [{
        id: 'customer-matching-parent-read-http',
        pillar: 'P104-customer-matching-retry-http',
        from: ['broadcasting', 'recovery_required'],
        to: ['broadcasting', 'recovery_required'],
        success_tests: [
          'durable Customer matching retry HTTP contract returns the owned latest operation for the expected-parent fence, not a Worker list or supply claim',
        ],
        denial_tests: ['durable Customer matching retry HTTP contract cannot use an owned session to read another Customer matching parent'],
        recovery_tests: ['durable Customer matching retry HTTP contract returns an owned recovery operation without changing its state'],
      }],
    },
  ])('maps Customer matching retry state recovery for $id', ({ id, releaseGaps, cases }) => {
    const coverage = manifest.behavioral_contract.bindings[id]
    expect(coverage.status, pillarWhy(PILLAR, `${id} binds every declared command or receipt state`)).toBe('MAPPED')
    expect(coverage.gaps).toEqual([])
    const releaseEvidence = coverage.release_gaps?.join(' ') ?? ''
    for (const gap of releaseGaps) expect(releaseEvidence).toContain(gap)
    expect(coverage.cases?.map(({ id: caseId, pillar, from, to, success_tests, denial_tests, recovery_tests }) => ({
      id: caseId, pillar, from, to, success_tests, denial_tests, recovery_tests,
    }))).toEqual(cases)
  })

  it('pins the launch threshold and all four transaction actors', () => {
    expect(manifest.minimum_public_workers, pillarWhy(PILLAR, 'a public cell needs three real reachable workers')).toBe(3)
    expect([...manifest.actors].sort()).toEqual(['admin', 'customer', 'system', 'worker'])
  })

  it('covers terminal money, recovery, and release states instead of stopping at matching', () => {
    for (const state of ['payment_pending', 'paid', 'reviewed', 'refund_required', 'recovery_required', 'closed']) {
      expect(manifest.states, pillarWhy(PILLAR, `missing terminal state ${state}`)).toContain(state)
    }
    expect(manifest.entries.some((entry) => entry.route_kind === 'jobs.review')).toBe(true)
    for (const route of ['workers.registrationCommand.submit', 'workers.registrationCommand.get',
      'jobs.rfqPrice', 'jobs.rfqPricePropose', 'jobs.rfqPriceDecide']) {
      expect(manifest.entries.some(entry => entry.route_kind === route), pillarWhy(PILLAR, route)).toBe(true)
    }
    expect(manifest.entries.some((entry) => entry.system_surface === 'release.production_promotion')).toBe(true)
  })

  it('maps Worker offers read through the authenticated public route while retaining hosted proof as a release gap', () => {
    const coverage = manifest.behavioral_contract.bindings['worker.offers.read']
    expect(coverage.status, pillarWhy(PILLAR, 'delivery projection and authenticated route behavior are covered locally')).toBe('MAPPED')
    expect(coverage.gaps).toEqual([])
    expect(coverage.release_gaps?.join(' ')).toContain('Hosted Edge-to-SQL read')

    const routeCase = coverage.cases?.find(item => item.id === 'worker-offers-read-authenticated-http')
    expect(routeCase?.pillar).toBe('P361-worker-offers-read-authenticated-http')
    expect(routeCase?.owner).toBe('supabase/functions/mobile-api/_shared/http/routes/worker.ts')
    expect(routeCase?.from).toEqual(['broadcasting'])
    expect(routeCase?.to).toEqual(['broadcasting'])
    expect(routeCase?.success_tests).toEqual([
      'Worker offers authenticated read route dispatches the offers list once with the authenticated Worker context',
    ])
    expect(routeCase?.denial_tests).toEqual([
      'Worker offers authenticated read route refuses a Customer before dispatching the offers service',
    ])
  })

  it('maps Worker offer decline through the authenticated public route while retaining release-only evidence gaps', () => {
    const coverage = manifest.behavioral_contract.bindings['worker.offer.decline']
    expect(coverage.status, pillarWhy(PILLAR, 'service receipt and public route authorization are covered locally')).toBe('MAPPED')
    expect(coverage.gaps).toEqual([])
    const releaseEvidence = coverage.release_gaps?.join(' ') ?? ''
    expect(releaseEvidence).toContain('Hosted SQL')
    expect(releaseEvidence).toContain('concurrent accept/decline races')
    expect(releaseEvidence).toContain('physical native Worker UI')

    const routeCase = coverage.cases?.find(item => item.id === 'worker-offer-decline-authenticated-http')
    expect(routeCase?.pillar).toBe('P362-worker-offer-decline-authenticated-http')
    expect(routeCase?.owner).toBe('supabase/functions/mobile-api/_shared/http/routes/job.ts')
    expect(routeCase?.from).toEqual(['broadcasting'])
    expect(routeCase?.to).toEqual(['broadcasting'])
    expect(routeCase?.success_tests).toEqual([
      'Worker offer decline public route dispatches the exact path job with the authenticated Worker context',
    ])
    expect(routeCase?.denial_tests).toEqual([
      'Worker offer decline public route refuses a Customer before calling the decline service',
    ])
  })

  it('maps Worker matching heartbeat through the authenticated route while retaining device and hosted proof gaps', () => {
    const coverage = manifest.behavioral_contract.bindings['worker.reachability.heartbeat']
    expect(coverage.status, pillarWhy(PILLAR, 'reachability predicate and authenticated heartbeat route are covered locally')).toBe('MAPPED')
    expect(coverage.gaps).toEqual([])
    const releaseEvidence = coverage.release_gaps?.join(' ') ?? ''
    expect(releaseEvidence).toContain('Hosted Edge-to-SQL heartbeat persistence')
    expect(releaseEvidence).toContain('Native foreground lifecycle')
    expect(releaseEvidence).toContain('real device push proof')

    const routeCase = coverage.cases?.find(item => item.id === 'worker-matching-heartbeat-authenticated-http')
    expect(routeCase?.pillar).toBe('P363-worker-matching-heartbeat-authenticated-http')
    expect(routeCase?.owner).toBe('supabase/functions/mobile-api/_shared/http/routes/worker.ts')
    expect(routeCase?.from).toEqual(['worker_ready'])
    expect(routeCase?.to).toEqual(['worker_ready'])
    expect(routeCase?.success_tests).toEqual([
      'Worker matching heartbeat public route records a server receipt for the authenticated Worker',
    ])
    expect(routeCase?.denial_tests).toEqual([
      'Worker matching heartbeat public route refuses a Customer before calling the heartbeat RPC',
    ])
  })

  it('maps Customer media upload intent through the public HTTP handler while retaining hosted and native proof gaps', () => {
    const entry = manifest.entries.find(item => item.id === 'customer.fulfillment.media')
    const coverage = manifest.behavioral_contract.bindings['customer.fulfillment.media']
    expect(coverage.status, pillarWhy(PILLAR, 'Customer upload intent has route-bound evidence for every declared workflow state')).toBe('MAPPED')
    expect(coverage.gaps).toEqual([])
    expect([...(entry?.from ?? [])].sort()).toEqual(['completion_proposed', 'official_match', 'scope_change_pending'])
    expect([...(entry?.to ?? [])].sort()).toEqual(['completion_proposed', 'official_match', 'scope_change_pending'])
    expect(coverage.release_gaps?.join(' ')).toContain('Hosted Storage/RLS')
    expect(coverage.release_gaps?.join(' ')).toContain('native media permission')

    const routeCase = coverage.cases?.find(item => item.id === 'customer-fulfillment-media-http')
    expect(routeCase?.pillar).toBe('P190-customer-media-upload')
    expect(routeCase?.owner).toBe('supabase/functions/mobile-api/_shared/domains/job/media.ts')
    expect(routeCase?.invocation).toBe('createJobMediaUpload')
    expect(routeCase?.seam).toBe('http')
    expect(routeCase?.actor).toBe('customer')
    expect([...(routeCase?.from ?? [])].sort()).toEqual(['completion_proposed', 'official_match', 'scope_change_pending'])
    expect([...(routeCase?.to ?? [])].sort()).toEqual(['completion_proposed', 'official_match', 'scope_change_pending'])
    expect(routeCase?.success_tests).toEqual([
      'job media upload intent Customer public media upload intent reserves the current upload stage without advancing the Customer job',
    ])
    expect(routeCase?.denial_tests).toEqual([
      'job media upload intent Customer public media upload intent refuses a non-owner Customer before quota reservation',
    ])
    expect(routeCase?.recovery_tests).toEqual([
      'job media upload intent Customer public media upload intent revokes the reservation when signed upload preparation fails',
    ])
  })

  it('maps every Worker application read state through collected HTTP behavior while retaining hosted proof gaps', () => {
    const coverage = manifest.behavioral_contract.bindings['worker.application.read']
    expect(coverage.status, pillarWhy(PILLAR, 'the applicant read route covers draft, pending, changes-requested, and approved receipts')).toBe('MAPPED')
    expect(coverage.gaps).toEqual([])
    const releaseEvidence = coverage.release_gaps?.join(' ') ?? ''
    expect(releaseEvidence).toContain('hosted HTTP-to-SQL')
    expect(releaseEvidence).toContain('real Auth')
    expect(releaseEvidence).toContain('Concurrent application/review changes')
    expect(releaseEvidence).toContain('native relaunch')
    expect(releaseEvidence).toContain('Production')
    expect(coverage.cases?.map(({ id, pillar, owner, invocation, seam, actor, from, to, success_tests, denial_tests, recovery_tests }) => ({
      id, pillar, owner, invocation, seam, actor, from, to, success_tests, denial_tests, recovery_tests,
    }))).toEqual([
      {
        id: 'applicant-readiness-not-submitted-http',
        pillar: 'P71-worker-readiness-onboarding',
        owner: 'supabase/functions/mobile-api/_shared/domains/worker/readiness.ts',
        invocation: 'getWorkerReadiness',
        seam: 'http',
        actor: 'customer',
        from: ['authenticated'],
        to: ['worker_application_draft'],
        success_tests: ['worker readiness and onboarding reads a never-submitted applicant as a draft without sending a submission'],
        denial_tests: ['worker readiness and onboarding reports unavailable readiness instead of inventing a not-submitted application on DB failure'],
        recovery_tests: [],
      },
      {
        id: 'applicant-readiness-pending-http',
        pillar: 'P71-worker-readiness-onboarding',
        owner: 'supabase/functions/mobile-api/_shared/domains/worker/readiness.ts',
        invocation: 'getWorkerReadiness',
        seam: 'http',
        actor: 'customer',
        from: ['worker_application_pending'],
        to: ['worker_application_pending'],
        success_tests: ['worker readiness and onboarding rehydrates a pending application through HTTP without submitting it again'],
        denial_tests: ['worker readiness and onboarding reports unavailable readiness instead of inventing a not-submitted application on DB failure'],
        recovery_tests: [],
      },
      {
        id: 'applicant-readiness-recovery-http',
        pillar: 'P71-worker-readiness-onboarding',
        owner: 'supabase/functions/mobile-api/_shared/domains/worker/readiness.ts',
        invocation: 'getWorkerReadiness',
        seam: 'http',
        actor: 'customer',
        from: ['worker_application_pending'],
        to: ['worker_application_draft'],
        success_tests: ['worker readiness and onboarding rehydrates changes-requested state through HTTP without silently resubmitting'],
        denial_tests: ['worker readiness and onboarding reports unavailable readiness instead of inventing a not-submitted application on DB failure'],
        recovery_tests: [],
      },
      {
        id: 'applicant-readiness-approved-http',
        pillar: 'P71-worker-readiness-onboarding',
        owner: 'supabase/functions/mobile-api/_shared/domains/worker/readiness.ts',
        invocation: 'getWorkerReadiness',
        seam: 'http',
        actor: 'customer',
        from: ['worker_application_pending'],
        to: ['worker_access_approved'],
        success_tests: ['worker readiness and onboarding rehydrates the approved access decision through HTTP'],
        denial_tests: ['worker readiness and onboarding reports unavailable readiness instead of inventing a not-submitted application on DB failure'],
        recovery_tests: [],
      },
    ])
  })
})
