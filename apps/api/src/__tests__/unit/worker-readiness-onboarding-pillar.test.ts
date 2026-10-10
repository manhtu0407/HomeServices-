import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { workerApplicationSubmitSchema, WORKER_APPLICATION_STATUSES, WORKER_READINESS_NEXT_ACTIONS } from '@nestscout/shared'
import type { WorkerApplicationStatus, WorkerKycStatus, WorkerReadiness, WorkerReadinessNextAction } from '@nestscout/shared'
import * as edgeWorkerContract from '../../../../../supabase/functions/_shared/contracts/worker'
import { deriveWorkerReadiness } from '../../../../../supabase/functions/mobile-api/_shared/domains/worker/readiness'
import { matchWorkerRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes/worker'
import { createEdgeServices } from '../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../supabase/functions/mobile-api/_shared/http'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../kael-edge-runtime/harness'
import type { QueryResult } from '../kael-edge-runtime/harness/sequence-client'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P71-worker-readiness-onboarding',
  invariant:
    'worker access and KYC survive relaunch, one pending application cannot duplicate, and only an approved, available, reachable, unreserved real worker without unconfirmed active work is dispatchable',
  authority: [
    'governance/RULES.md #0 (workflow-sensitive writes belong to the server)',
    'governance/RULES.md #7 (human authority remains explicit)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/worker/readiness.ts',
  layer: 'integration',
  siblings: ['P67-public-coverage-reservation', 'P10-per-actor-rls'],
  mutation:
    'count confirmed_by_customer as active worker capacity — the HTTP readiness query includes the terminal work status and the matching-capacity SQL pillar rejects that worker',
} as const satisfies PillarManifest

const OBSERVED_AT = '2026-09-04T12:00:00.000Z'
const APPLICANT = 'd7100000-0000-4000-8000-000000000001'
const APPLICATION = 'd7100000-0000-4000-8000-000000000010'
const REQUEST_ID = 'd7100000-0000-4000-8000-000000000101'

function applicationHttp(input: {
  provider?: string
  role?: 'customer' | 'worker' | 'admin'
  rpcResults?: QueryResult[]
  applicationResults?: QueryResult[]
  tableResults?: Record<string, QueryResult[]>
} = {}) {
  const client = makeSequenceClient([], {
    get_current_worker_application: input.applicationResults ?? [],
    submit_worker_application_atomic: input.rpcResults ?? [{ data: [{
      ok: true, error_code: null, application_id: APPLICATION, status_out: 'pending_review',
      decided_at: null, reason_out: null,
      submitted_at: OBSERVED_AT, can_submit: false, can_resume: false, idempotent_out: false,
    }], error: null }],
  }, input.tableResults)
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true,
      user: { id: APPLICANT, email: 'worker@example.test', authProvider: input.provider ?? 'email' },
      role: input.role ?? 'customer', supabase: client, privilegedSupabase: client, userSupabase: client,
    }),
    services: createEdgeServices({}),
  })
  return {
    client,
    submit: (body: Record<string, unknown> = {}) => handler(new Request('https://edge.test/worker-applications', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contact: 'worker@example.test', language: 'vi', source: 'auth_worker_create', client_request_id: REQUEST_ID, ...body }),
    })),
    read: () => handler(new Request('https://edge.test/worker-applications/me?actor_id=another-account')),
  }
}

function completeWorker(overrides: Record<string, unknown> = {}) {
  return {
    bank_account: '0123456789',
    bank_name: 'Test Bank',
    cccd_back_url: 'supabase://worker-verification/worker/cccd-back/back.jpg',
    cccd_front_url: 'supabase://worker-verification/worker/cccd-front/front.jpg',
    date_of_birth: '1990-01-01',
    districts: ['q7'],
    is_approved: true,
    is_available: true,
    is_suspended: false,
    legal_name: 'Worker Test',
    matching_foreground_active_until: null,
    matching_push_proven_at: '2026-09-04T11:30:00.000Z',
    problem_specializations: ['pipe_leak'],
    selected_service_types: ['plumbing'],
    selfie_url: 'supabase://worker-verification/worker/selfie/selfie.jpg',
    service_radius_km: 8,
    service_types: ['plumbing'],
    synthetic_cohort_id: null,
    verification_status: 'approved',
    ...overrides,
  }
}

function readiness(overrides: Partial<Parameters<typeof deriveWorkerReadiness>[0]> = {}) {
  return deriveWorkerReadiness({
    actorId: 'd7100000-0000-4000-8000-000000000001',
    actorRole: 'worker',
    application: {
      id: 'd7100000-0000-4000-8000-000000000010',
      created_at: '2026-09-01T00:00:00.000Z',
      safe_metadata: { decision: 'approve', decided_at: '2026-09-01T01:00:00.000Z' },
    },
    applicationReview: { decision: 'approve', decided_at: '2026-09-01T01:00:00.000Z' },
    worker: completeWorker(),
    activeJob: false,
    activeCandidate: false,
    activeReservation: false,
    pushTokenRegistered: true,
    observedAt: OBSERVED_AT,
    ...overrides,
  })
}

describe('worker readiness and onboarding', () => {
  installEdgeRuntimeTestHooks()

  it.each([true, false])('preserves the submitted KYC receipt through HTTP when exact replay is %s', async (exactReplay) => {
    const client = makeSequenceClient([], {
      submit_worker_registration_atomic: [{ data: [{
        ok: exactReplay, error_code: exactReplay ? null : 'ALREADY_FINALIZED',
        worker_id_out: APPLICANT, verification_status_out: 'submitted',
        submitted_at_ts: OBSERVED_AT, idempotent_out: exactReplay,
      }], error: null }],
    })
    const handler = createMobileApiHandler({
      authenticate: async () => ({
        success: true, user: { id: APPLICANT, authProvider: 'email' }, role: 'worker',
        supabase: client, privilegedSupabase: client, userSupabase: client,
      }),
      services: createEdgeServices({}),
    })
    const response = await handler(new Request('https://edge.test/workers/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        legal_name: 'Nguyen Van A', date_of_birth: '1990-01-15', gender: 'male',
        service_types: ['electrical'], years_experience: 5, districts: ['q1'],
        cccd_front_url: `supabase://worker-verification/${APPLICANT}/cccd-front/front.jpg`,
        cccd_back_url: `supabase://worker-verification/${APPLICANT}/cccd-back/back.jpg`,
        selfie_url: `supabase://worker-verification/${APPLICANT}/selfie/selfie.jpg`,
        bank_account: exactReplay ? '0123456789' : '9988776655', bank_name: 'Vietcombank',
      }),
    }))
    expect(response.status, pillarWhy(PILLAR)).toBe(exactReplay ? 201 : 409)
    const body = await response.json()
    if (exactReplay) {
      expect(body).toMatchObject({ worker_id: APPLICANT, verification_status: 'submitted', submitted_at: OBSERVED_AT })
    } else {
      expect(body).toMatchObject({ code: 'ALREADY_FINALIZED' })
      expect(body).not.toHaveProperty('submitted_at')
      expect(response.headers.get('x-support-code')).toMatch(/^[A-Z0-9]{8}$/)
    }
    const writes = client.calls.filter((call) => call.table === 'rpc:submit_worker_registration_atomic')
    expect(writes).toHaveLength(1)
    expect(writes[0].operations).toContainEqual(['rpc', 'submit_worker_registration_atomic', expect.objectContaining({
      p_actor_id: APPLICANT, p_worker_id: APPLICANT,
    })])
    expect(client.calls.some((call) => call.operations.some((op) => ['insert', 'update', 'upsert', 'delete'].includes(String(op[0]))))).toBe(false)
  })

  it('binds HTTP submission to the authenticated applicant and redacts the contact before the RPC', async () => {
    const { client, submit } = applicationHttp()
    const response = await submit()
    expect(response.status, pillarWhy(PILLAR)).toBe(201)
    expect(await response.json()).toMatchObject({
      application_id: APPLICATION, status: 'pending_review', can_submit: false, can_resume: false,
    })
    const writes = client.calls.filter((call) => call.table === 'rpc:submit_worker_application_atomic')
    expect(writes).toHaveLength(1)
    expect(writes[0].operations).toEqual([['rpc', 'submit_worker_application_atomic', {
      p_actor_id: APPLICANT, p_contact_suffix: 'er', p_language: 'vi', p_source: 'auth_worker_create',
      p_client_request_id: REQUEST_ID, p_revision_of_application_id: null,
    }]])
    expect(JSON.stringify(client.calls)).not.toContain('worker@example.test')
    expect(client.calls.some((call) => call.operations.some((op) => ['insert', 'update', 'upsert', 'delete'].includes(String(op[0]))))).toBe(false)
  })

  it.each(['google', 'apple'])('refuses %s application identity before any application RPC', async (provider) => {
    const { client, submit } = applicationHttp({ provider })
    const response = await submit()
    expect(response.status, pillarWhy(PILLAR)).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'WORKER_EMAIL_PASSWORD_REQUIRED' })
    expect(client.calls.filter((call) => call.table === 'rpc:submit_worker_application_atomic')).toEqual([])
    expect(response.headers.get('x-support-code')).toMatch(/^[A-Z0-9]{8}$/)
  })

  it('rejects another account email before any application RPC', async () => {
    const { client, submit } = applicationHttp()
    const response = await submit({ contact: 'different@example.test' })
    expect(response.status, pillarWhy(PILLAR)).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'WORKER_EMAIL_MISMATCH' })
    expect(client.calls.filter((call) => call.table === 'rpc:submit_worker_application_atomic')).toEqual([])
  })

  it('rejects client-supplied actor and role fields at the HTTP schema before submission', async () => {
    const { client, submit } = applicationHttp()
    const response = await submit({ actor_id: 'another-account', role: 'worker' })
    expect(response.status, pillarWhy(PILLAR)).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'VALIDATION' })
    expect(client.calls.filter((call) => call.table === 'rpc:submit_worker_application_atomic')).toEqual([])
  })

  it.each([
    ['INVALID_INPUT', 400, 'VALIDATION'],
    ['PROFILE_NOT_FOUND', 404, 'NOT_FOUND'],
    ['INVALID_ROLE', 403, 'FORBIDDEN'],
  ] as const)('preserves atomic refusal %s through HTTP without claiming submission', async (error, status, code) => {
    const { submit } = applicationHttp({ rpcResults: [{ data: [{ ok: false, error_code: error }], error: null }] })
    const response = await submit()
    expect(response.status, pillarWhy(PILLAR)).toBe(status)
    expect(await response.json()).toMatchObject({ code })
    expect(response.headers.get('x-support-code')).toMatch(/^[A-Z0-9]{8}$/)
  })

  it('rehydrates changes-requested state through HTTP without silently resubmitting', async () => {
    const application = { id: APPLICATION, created_at: OBSERVED_AT, safe_metadata: {} }
    const { client, read } = applicationHttp({ applicationResults: [{ data: [application], error: null }], tableResults: {
      profiles: [{ data: { role: 'customer' }, error: null }],
      worker_profiles: [{ data: null, error: null }],
      jobs: [{ data: [], error: null }], job_worker_candidates: [{ data: [], error: null }],
      matching_capacity_reservations: [{ data: [], error: null }],
      admin_worker_application_reviews: [{ data: { decision: 'request_changes', reason: 'Bổ sung kinh nghiệm.', decided_at: OBSERVED_AT }, error: null }],
    } })
    const response = await read()
    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    expect(await response.json()).toMatchObject({
      worker_id: APPLICANT,
      application: { application_id: APPLICATION, status: 'changes_requested', can_resume: true, can_submit: true },
      ready_for_matching: false, next_action: 'revise_application',
    })
    for (const [table, column, value] of [
      ['profiles', 'id', APPLICANT], ['worker_profiles', 'id', APPLICANT],
      ['jobs', 'worker_id', APPLICANT],
      ['job_worker_candidates', 'worker_id', APPLICANT], ['matching_capacity_reservations', 'worker_id', APPLICANT],
      ['admin_worker_application_reviews', 'queue_id', APPLICATION],
    ]) {
      expect(client.calls.find((call) => call.table === table)?.operations).toContainEqual(['eq', column, value])
    }
    expect(client.calls.some((call) => call.table.startsWith('rpc:submit_'))).toBe(false)
    expect(client.calls.find((call) => call.table === 'rpc:get_current_worker_application')?.operations)
      .toContainEqual(['rpc', 'get_current_worker_application', { p_actor_id: APPLICANT }])
  })

  it('reports unavailable readiness instead of inventing a not-submitted application on DB failure', async () => {
    const { read } = applicationHttp({ applicationResults: [{ data: null, error: { code: '57014', message: 'private database detail' } }], tableResults: {
      profiles: [{ data: { role: 'customer' }, error: null }],
    } })
    const response = await read()
    expect(response.status, pillarWhy(PILLAR)).toBe(500)
    const body = await response.text()
    expect(JSON.parse(body)).toMatchObject({ code: 'DB_ERROR' })
    expect(body).not.toContain('private database detail')
    expect(response.headers.get('x-support-code')).toMatch(/^[A-Z0-9]{8}$/)
  })

  it('keeps the mobile and independently bundled Edge readiness contracts identical', () => {
    expect(edgeWorkerContract.WORKER_APPLICATION_STATUSES).toEqual(WORKER_APPLICATION_STATUSES)
    expect(edgeWorkerContract.WORKER_READINESS_NEXT_ACTIONS).toEqual(WORKER_READINESS_NEXT_ACTIONS)
    expectTypeOf<edgeWorkerContract.EdgeWorkerApplicationStatus>().toEqualTypeOf<WorkerApplicationStatus>()
    expectTypeOf<edgeWorkerContract.EdgeWorkerKycStatus>().toEqualTypeOf<WorkerKycStatus>()
    expectTypeOf<edgeWorkerContract.EdgeWorkerReadinessNextAction>().toEqualTypeOf<WorkerReadinessNextAction>()
    expectTypeOf<edgeWorkerContract.EdgeWorkerReadiness>().toEqualTypeOf<WorkerReadiness>()
  })

  it('exposes a durable self-readiness route to both applicants and workers', () => {
    expect(matchWorkerRoute('/worker-applications/me', 'GET')).toMatchObject({
      kind: 'workerApplications.me',
      roles: ['customer', 'worker', 'admin'],
    })
  })

  it('requires an email address for every worker application', () => {
    expect(workerApplicationSubmitSchema.safeParse({
      contact: '0901234567',
      language: 'vi',
      source: 'auth_worker_create',
    }).success).toBe(false)
    expect(workerApplicationSubmitSchema.safeParse({
      contact: 'worker@example.test',
      language: 'vi',
      source: 'auth_worker_create',
      revision_of_application_id: 'd7100000-0000-4000-8000-000000000010',
    }).success).toBe(true)
  })

  it('keeps a pending access application outside the worker lane after relaunch', () => {
    const result = readiness({
      actorRole: 'customer',
      application: {
        id: 'd7100000-0000-4000-8000-000000000010',
        created_at: '2026-09-01T00:00:00.000Z',
        safe_metadata: {},
      },
      applicationReview: null,
      worker: null,
      pushTokenRegistered: false,
    })
    expect(result.application.status).toBe('pending_review')
    expect(result.ready_for_matching).toBe(false)
    expect(result.next_action).toBe('await_application_review')
  })

  it('marks only a complete and reachable worker ready', () => {
    const result = readiness()
    expect(result.reason_codes, pillarWhy(PILLAR, 'a complete worker still has an unexplained blocker')).toEqual([])
    expect(result.ready_for_matching).toBe(true)
    expect(result.next_action).toBe('ready')
  })

  it('does not treat customer-confirmed completion as an active worker-capacity blocker', async () => {
    const { client, read } = applicationHttp({
      role: 'worker',
      tableResults: {
        profiles: [{ data: { role: 'worker' }, error: null }],
        worker_profiles: [{ data: completeWorker({
          matching_foreground_active_until: null,
          matching_push_proven_at: '2026-09-04T11:30:00.000Z',
        }), error: null }],
        device_push_tokens: [{ data: [{ id: 'token' }], error: null }],
        jobs: [{ data: [], error: null }],
        job_worker_candidates: [{ data: [], error: null }],
        matching_capacity_reservations: [{ data: [], error: null }],
      },
    })

    const response = await read()
    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    const body = await response.json()
    expect(body.capacity, pillarWhy(PILLAR)).toMatchObject({
      active_job: false, active_candidate: false, active_reservation: false,
    })
    expect(body.reason_codes, pillarWhy(PILLAR)).not.toContain('ACTIVE_JOB')

    const jobQuery = client.calls.find((call) => call.table === 'jobs')
    const statusFilter = jobQuery?.operations.find((operation) => operation[0] === 'in' && operation[1] === 'status')
    expect(statusFilter, pillarWhy(PILLAR, 'worker readiness must use the same physical-capacity lifecycle as dispatch')).toEqual([
      'in', 'status', [
        'worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing', 'scope_change_pending',
        'completed_by_worker',
      ],
    ])
  })

  it.each([
    ['approval disagreement', { is_approved: false }, 'WORKER_NOT_APPROVED'],
    ['synthetic identity', { synthetic_cohort_id: 'synthetic-release-smoke' }, 'SYNTHETIC_NOT_PUBLIC'],
  ] as const)('never recommends ready for a blocked %s', (_label, override, reason) => {
    const result = readiness({ worker: completeWorker(override) })
    expect(result.ready_for_matching, pillarWhy(PILLAR)).toBe(false)
    expect(result.reason_codes).toContain(reason)
    expect(result.next_action, pillarWhy(PILLAR)).toBe('contact_support')
  })

  it('fails closed for active capacity, stale push proof, and synthetic actors', () => {
    const result = readiness({
      activeReservation: true,
      worker: completeWorker({
        matching_push_proven_at: '2026-09-03T11:59:59.000Z',
        synthetic_cohort_id: 'synthetic-release-smoke',
      }),
    })
    expect(result.ready_for_matching).toBe(false)
    expect(result.reason_codes).toEqual(expect.arrayContaining([
      'ACTIVE_RESERVATION',
      'REACHABILITY_UNPROVEN',
      'SYNTHETIC_NOT_PUBLIC',
    ]))
    expect(result.next_action).toBe('finish_active_work')
  })

  it('contains no destructive SQL in the worker application migration artifact', () => {
    const migration = readFileSync(resolve(
      process.cwd(),
      '../../supabase/migrations/20260904234000_worker_application_readiness.sql',
    ), 'utf8')
    expect(migration).not.toMatch(/\b(?:drop|truncate|delete)\b/i)
  })

  it('reports an unresolved submission after RPC timeout without inventing a receipt or a fallback write', async () => {
    const { client, submit } = applicationHttp({ rpcResults: [{
      data: null, error: { code: '57014', message: 'private database diagnostic' },
    }] })
    const response = await submit()
    expect(response.status, pillarWhy(PILLAR)).toBe(500)
    const body = await response.json()
    expect(body).toMatchObject({ code: 'DB_ERROR' })
    expect(body).not.toHaveProperty('application_id')
    expect(JSON.stringify(body)).not.toContain('private database diagnostic')
    expect(response.headers.get('x-support-code')).toMatch(/^[A-Z0-9]{8}$/)
    expect(client.calls.filter((call) => call.table === 'rpc:submit_worker_application_atomic')).toHaveLength(1)
    expect(client.calls.some((call) => call.operations.some((op) => ['insert', 'update', 'upsert', 'delete'].includes(String(op[0]))))).toBe(false)
  })
})
