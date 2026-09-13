import { describe, expect, it } from 'vitest'

import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { validateJobEvidenceRefs } from '../../../../../../supabase/functions/mobile-api/_shared/domains/job/evidence-refs'
import type { DbClient } from '../../../../../../supabase/functions/mobile-api/_shared/platform/db'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P79-worker-completion-media-ownership',
  invariant:
    'Worker completion reaches completed_by_worker only with after-stage media attached to that job by its assigned Worker; forged, cross-job, unowned, and unverifiable refs never mutate the job',
  authority: [
    'governance/RULES.md #7 (Customer completion requires evidence)',
    'governance/RULES.md Security Invariants (private evidence and validated workflow writes)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/job/status.ts',
  layer: 'security-negative',
  siblings: ['P68-completion-payment-authority', 'P19-job-access-ownership', 'P10-per-actor-rls'],
  mutation:
    'remove the completion validateJobEvidenceRefs call — forged, wrong-owner, unattached, and lookup-failure requests mutate the job and the refusal cases turn red',
} as const satisfies PillarManifest

const JOB = 'f7900000-0000-4000-8000-000000000001'
const WORKER = 'f7900000-0000-4000-8000-000000000002'
const CUSTOMER = 'f7900000-0000-4000-8000-000000000003'
const OTHER_JOB = 'f7900000-0000-4000-8000-000000000004'
const OTHER_WORKER = 'f7900000-0000-4000-8000-000000000005'
const ref = (name: string) => `supabase://job-media/${JOB}/after/${name}.jpg`

function asset(reference: string, ownerId = WORKER, stage = 'after') {
  return {
    object_path: reference.replace('supabase://job-media/', ''),
    stage,
    owner_id: ownerId,
  }
}

function setup(input: {
  assets?: ReturnType<typeof asset>[]
  assetError?: { code: string }
  updateError?: { code: string; message: string }
  storedRefs?: string[]
  status?: string
  actorId?: string
  role?: 'customer' | 'worker'
} = {}) {
  const client = makeSequenceClient([], {}, {
    jobs: [
      { data: {
        id: JOB,
        status: input.status ?? 'repairing',
        customer_id: CUSTOMER,
        worker_id: WORKER,
        final_price: 450000,
        completion_notes: null,
        completion_photo_urls: input.storedRefs ?? [],
      }, error: null },
      { data: input.updateError ? null : { id: JOB }, error: input.updateError ?? null },
    ],
    job_media_assets: [{ data: input.assets ?? [], error: input.assetError ?? null }],
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true,
      user: { id: input.actorId ?? WORKER },
      role: input.role ?? 'worker',
      supabase: client,
      privilegedSupabase: client,
      userSupabase: client,
    }),
    services: createEdgeServices({}),
  })
  return {
    client,
    complete: (refs: string[]) => handler(new Request(`https://edge.test/jobs/${JOB}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        status: 'completed_by_worker',
        completion_notes: 'Đã hoàn tất và gửi ảnh kết quả.',
        completion_photo_urls: refs,
      }),
    })),
  }
}

function jobWrites(client: ReturnType<typeof makeSequenceClient>) {
  return client.calls.filter((call) => call.table === 'jobs')
    .flatMap((call) => call.operations.filter((operation) => operation[0] === 'update'))
}

describe('Worker completion media at the public HTTP boundary', () => {
  installEdgeRuntimeTestHooks()

  it.each([
    ['arbitrary remote URL', 'https://example.test/not-an-upload.jpg'],
    ['another job', `supabase://job-media/${OTHER_JOB}/after/photo.jpg`],
    ['unattached same-job ref', ref('unattached')],
  ])('rejects %s before any job mutation', async (_label, reference) => {
    const { client, complete } = setup()
    const response = await complete([reference])
    expect(response.status, pillarWhy(PILLAR, reference)).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_JOB_MEDIA_REF' })
    expect(jobWrites(client), pillarWhy(PILLAR, 'invalid evidence must not advance completion')).toEqual([])
  })

  it.each([
    ['another Worker', OTHER_WORKER, 'after'],
    ['the Customer', CUSTOMER, 'after'],
    ['a different evidence stage', WORKER, 'before'],
  ])('rejects an attachment owned by %s', async (_label, ownerId, stage) => {
    const reference = ref('attached')
    const { client, complete } = setup({ assets: [asset(reference, ownerId, stage)] })
    const response = await complete([reference])
    expect(response.status, pillarWhy(PILLAR, `${ownerId}:${stage}`)).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_JOB_MEDIA_REF' })
    expect(jobWrites(client)).toEqual([])
  })

  it('fails closed when attachment verification is unavailable', async () => {
    const { client, complete } = setup({ assetError: { code: '08006' } })
    const response = await complete([ref('photo')])
    expect(response.status, pillarWhy(PILLAR, 'DB failure is not valid evidence')).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'MEDIA_VALIDATION_UNAVAILABLE' })
    expect(jobWrites(client)).toEqual([])
  })

  it('revalidates persisted refs instead of trusting a legacy completion array', async () => {
    const validRef = ref('new-upload')
    const { client, complete } = setup({
      storedRefs: ['https://example.test/legacy-unverified.jpg'],
      assets: [asset(validRef)],
    })
    const response = await complete([validRef])
    expect(response.status, pillarWhy(PILLAR, 'stored text is not attachment proof')).toBe(400)
    expect(jobWrites(client)).toEqual([])
  })

  it('returns a recoverable evidence error if the DB rejects media after the lookup', async () => {
    const reference = ref('photo')
    const { complete } = setup({
      assets: [asset(reference)],
      updateError: { code: 'P0001', message: 'CUSTOMER_COMPLETION_EVIDENCE_REQUIRED' },
    })
    const response = await complete([reference])
    expect(response.status, pillarWhy(PILLAR, 'attachment removal can race the Edge precheck')).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'INVALID_JOB_MEDIA_REF' })
  })

  it('accepts ten attached after photos and writes exactly those refs once', async () => {
    const refs = Array.from({ length: 10 }, (_, index) => ref(`photo-${index}`))
    const { client, complete } = setup({ assets: refs.map((reference) => asset(reference)) })
    const response = await complete(refs)
    expect(response.status, pillarWhy(PILLAR, 'the completion contract supports ten accumulated photos')).toBe(200)
    expect(await response.json()).toMatchObject({
      job_id: JOB, from_status: 'repairing', to_status: 'completed_by_worker',
    })
    expect(jobWrites(client)).toEqual([['update', expect.objectContaining({
      status: 'completed_by_worker',
      completion_photo_urls: refs,
    })]])
    const reads = client.calls.filter((call) => call.table === 'job_media_assets')
    expect(reads, pillarWhy(PILLAR, 'validate the whole merged set in one bounded query')).toHaveLength(1)
    expect(reads[0].operations).toEqual(expect.arrayContaining([
      ['eq', 'job_id', JOB],
      ['eq', 'owner_id', WORKER],
      ['in', 'object_path', refs.map((reference) => reference.replace('supabase://job-media/', ''))],
    ]))
  })

  it.each([
    ['the Customer', CUSTOMER, 'customer', 403],
    ['an unassigned Worker', OTHER_WORKER, 'worker', 404],
  ] as const)('refuses %s before changing the job', async (_label, actorId, role, status) => {
    const reference = ref('photo')
    const { client, complete } = setup({ actorId, role, assets: [asset(reference)] })
    const response = await complete([reference])
    expect(response.status, pillarWhy(PILLAR, 'only the assigned Worker proposes completion')).toBe(status)
    expect(jobWrites(client)).toEqual([])
    expect(client.calls.filter((call) => call.table === 'job_media_assets')).toEqual([])
  })

  it('refuses completion from an earlier workflow phase', async () => {
    const reference = ref('photo')
    const { client, complete } = setup({ status: 'worker_matched', assets: [asset(reference)] })
    const response = await complete([reference])
    expect(response.status, pillarWhy(PILLAR, 'an attachment does not bypass the work phase')).toBe(409)
    expect(jobWrites(client)).toEqual([])
  })

  it('retains the five-ref limit for other evidence consumers', async () => {
    const client = makeSequenceClient([])
    await expect(validateJobEvidenceRefs(client as unknown as DbClient, {
      jobId: JOB,
      ownerId: WORKER,
      allowedStages: ['after'],
      mediaRefs: Array.from({ length: 6 }, (_, index) => ref(`photo-${index}`)),
    }), pillarWhy(PILLAR, 'completion must not widen scope or dispute input limits'))
      .rejects.toMatchObject({ code: 'INVALID_JOB_MEDIA_REF' })
    expect(client.calls).toEqual([])
  })
})
