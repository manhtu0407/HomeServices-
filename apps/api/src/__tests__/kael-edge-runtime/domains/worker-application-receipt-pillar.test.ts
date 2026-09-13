import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { QueryResult } from '../harness/sequence-client'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'

export const PILLAR = {
  id: 'P161-worker-application-receipt',
  invariant: 'Application submission acknowledges only a complete atomic receipt, preserving retry identity and refusing malformed or contradictory application state.',
  authority: ['governance/RULES.md #8 (no fake success)', 'governance/RULES.md #0 (server-owned workflow writes)'],
  target: 'supabase/functions/mobile-api/_shared/domains/worker/registration.ts',
  layer: 'integration',
  siblings: ['P71-worker-readiness-onboarding', 'P10-per-actor-rls'],
  mutation: 'omit successful receipt validation; missing application identity and string boolean cases return HTTP 201 instead of failing closed',
} as const satisfies PillarManifest

const ACTOR = 'd7100000-0000-4000-8000-000000000001'
const APPLICATION = 'd7100000-0000-4000-8000-000000000010'
const REQUEST = 'd7100000-0000-4000-8000-000000000101'
const SUBMITTED_AT = '2026-09-09T01:00:00+00:00'

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    ok: true, error_code: null, application_id: APPLICATION, status_out: 'pending_review',
    submitted_at: SUBMITTED_AT, decided_at: null, reason_out: null,
    can_submit: false, can_resume: false, idempotent_out: false, ...overrides,
  }
}

function applicationHttp(results: QueryResult[], role: 'customer' | 'worker' = 'customer') {
  const client = makeSequenceClient([], { submit_worker_application_atomic: results })
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true, user: { id: ACTOR, email: 'applicant@example.test', authProvider: 'email' },
      role, supabase: client, privilegedSupabase: client, userSupabase: client,
    }),
    services: createEdgeServices({}),
  })
  return {
    client,
    submit: () => handler(new Request('https://edge.test/worker-applications', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contact: 'applicant@example.test', language: 'vi', source: 'auth_worker_create', client_request_id: REQUEST }),
    })),
  }
}

describe('Worker application receipt boundary', () => {
  installEdgeRuntimeTestHooks()

  it('acknowledges the complete pending receipt for an authenticated applicant', async () => {
    const { submit } = applicationHttp([{ data: [receipt()], error: null }])
    const response = await submit()
    expect(response.status, pillarWhy(PILLAR)).toBe(201)
    expect(await response.json()).toMatchObject({ application_id: APPLICATION, status: 'pending_review', can_submit: false, can_resume: false })
  })

  it.each([
    ['missing application id', { application_id: null }],
    ['string resubmit flag', { can_submit: 'false' }],
    ['string success flag', { ok: 'true' }],
    ['missing submit time', { submitted_at: null }],
    ['invalid submit time', { submitted_at: 'yesterday' }],
    ['missing replay flag', { idempotent_out: undefined }],
    ['string resume flag', { can_resume: 'false' }],
    ['pending resubmission permission', { can_submit: true }],
    ['pending revision permission', { can_resume: true }],
    ['new application already approved', { status_out: 'approved' }],
    ['success carrying a refusal', { error_code: 'INVALID_ROLE' }],
    ['not submitted success', { status_out: 'not_submitted' }],
  ])('refuses %s instead of acknowledging a submission', async (_label, override) => {
    const { submit } = applicationHttp([{ data: [receipt(override)], error: null }])
    const response = await submit()
    expect(response.status, pillarWhy(PILLAR)).toBe(500)
    expect(await response.json()).toMatchObject({ code: 'DB_ERROR' })
    expect(response.headers.get('x-support-code')).toMatch(/^[A-Z0-9]{8}$/)
  })

  it('refuses multiple atomic receipts instead of choosing an arbitrary application', async () => {
    const { submit } = applicationHttp([{ data: [receipt(), receipt()], error: null }])
    const response = await submit()
    expect(response.status, pillarWhy(PILLAR)).toBe(500)
    expect(await response.json()).toMatchObject({ code: 'DB_ERROR' })
  })

  it.each(['approved', 'rejected', 'changes_requested', 'pending_review'])('preserves the persisted %s decision on replay', async (status) => {
    const revisable = status === 'changes_requested'
    const { submit } = applicationHttp([{ data: [receipt({
      status_out: status, idempotent_out: true, can_submit: revisable, can_resume: revisable,
    })], error: null }])
    const response = await submit()
    expect(response.status, pillarWhy(PILLAR)).toBe(201)
    expect(await response.json()).toMatchObject({
      application_id: APPLICATION, status, idempotent: true, can_submit: revisable, can_resume: revisable,
    })
  })

  it('retains legacy approved Worker compatibility without inventing an application', async () => {
    const { submit } = applicationHttp([{ data: [receipt({
      status_out: 'approved', application_id: null, submitted_at: null, idempotent_out: true,
    })], error: null }], 'worker')
    const response = await submit()
    expect(response.status, pillarWhy(PILLAR)).toBe(201)
    expect(await response.json()).toMatchObject({ application_id: null, status: 'approved', idempotent: true })
  })

  it('never uses the legacy Worker exception to approve an applicant without an application', async () => {
    const { submit } = applicationHttp([{ data: [receipt({
      status_out: 'approved', application_id: null, submitted_at: null, idempotent_out: true,
    })], error: null }])
    const response = await submit()
    expect(response.status, pillarWhy(PILLAR)).toBe(500)
    expect(await response.json()).toMatchObject({ code: 'DB_ERROR' })
  })

  it('keeps the same actor and request identity when retrying an unknown database outcome', async () => {
    const { client, submit } = applicationHttp([
      { data: null, error: { code: '57014', message: 'private database detail' } },
      { data: [receipt({ idempotent_out: true })], error: null },
    ])
    const first = await submit()
    expect(first.status, pillarWhy(PILLAR)).toBe(500)
    expect(await first.text()).not.toContain('private database detail')
    const retry = await submit()
    expect(retry.status, pillarWhy(PILLAR)).toBe(201)
    expect(await retry.json()).toMatchObject({ application_id: APPLICATION, status: 'pending_review', idempotent: true })
    const commands = client.calls.filter((call) => call.table === 'rpc:submit_worker_application_atomic')
    expect(commands).toHaveLength(2)
    for (const command of commands) {
      expect(command.operations).toContainEqual(['rpc', 'submit_worker_application_atomic', {
        p_actor_id: ACTOR, p_contact_suffix: 'nt', p_language: 'vi', p_source: 'auth_worker_create',
        p_client_request_id: REQUEST, p_revision_of_application_id: null,
      }])
    }
  })
})
