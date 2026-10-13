import { describe, expect, it, vi } from 'vitest'

import { createEdgeServices } from '../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../supabase/functions/mobile-api/_shared/http'
import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/http'
import { matchCaseWorkResourceRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes/case-work-resource-routes'
import {
  attachJobMedia,
  createJobMediaUpload,
  revokeJobMediaUploads,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/job/media'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../kael-edge-runtime/harness'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P190-customer-media-upload',
  invariant: 'Customer media upload intent and attach operations remain participant-bound and fail closed before unreserved Storage reads',
  authority: ['governance/RULES.md #4', 'governance/RULES.md #7'],
  target: 'supabase/functions/mobile-api/_shared/domains/job/media.ts',
  layer: 'integration',
  siblings: ['P19-job-access-ownership', 'P79-worker-completion-media-ownership'],
  mutation: 'allow an unreserved object to reach Storage download or issue a signed upload token before quota reservation',
} as const satisfies PillarManifest

const JOB_ID = '11111111-1111-4111-8111-111111111111'
const CUSTOMER_ID = 'c1900000-0000-4000-8000-000000000001'
const OTHER_CUSTOMER_ID = 'c1900000-0000-4000-8000-000000000002'
const WORKER_ID = 'c1900000-0000-4000-8000-000000000003'

const CUSTOMER_UPLOAD_STATES = [
  { transactionState: 'official_match', jobStatus: 'worker_matched' },
  { transactionState: 'scope_change_pending', jobStatus: 'scope_change_pending' },
  { transactionState: 'completion_proposed', jobStatus: 'completed_by_worker' },
] as const

function uploadHttp(jobStatus: string, options: {
  actorId?: string
  signingFails?: boolean
} = {}) {
  const client = makeSequenceClient([], {
    reserve_job_media_upload: [{
      data: [{ allowed: true, expires_at: '2099-01-01T00:00:00.000Z' }],
      error: null,
    }],
    fail_job_media_uploads: [{
      data: [{ revoked_paths: [`${JOB_ID}/kael_reference/intent-reference.jpg`] }],
      error: null,
    }],
  }, {
    jobs: [{ data: {
      customer_id: CUSTOMER_ID,
      id: JOB_ID,
      service_type: 'electrical',
      status: jobStatus,
      worker_id: WORKER_ID,
    }, error: null }],
  })
  const storageRequests: string[] = []
  Object.assign(client, {
    storage: {
      from(bucket: string) {
        if (bucket !== 'job-media') throw new Error(`Unexpected bucket ${bucket}`)
        return {
          async createSignedUploadUrl(objectPath: string) {
            storageRequests.push(objectPath)
            if (options.signingFails) throw new Error('storage unavailable')
            return {
              data: { signedUrl: 'https://storage.example.test/upload', token: 'signed-token' },
              error: null,
            }
          },
        }
      },
    },
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true,
      user: { id: options.actorId ?? CUSTOMER_ID },
      role: 'customer',
      supabase: client,
      privilegedSupabase: client,
      userSupabase: client,
    }),
    services: createEdgeServices({}),
  })
  return {
    client,
    storageRequests,
    run: () => handler(new Request(`https://edge.test/jobs/${JOB_ID}/media-upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        file_name: 'intent-reference.jpg',
        file_size_bytes: 1024,
        mime_type: 'image/jpeg',
        stage: 'kael_reference',
      }),
    })),
  }
}

describe('job media upload intent', () => {
  installEdgeRuntimeTestHooks()

  it('exposes a participant-only upload-intent route before the attach route', () => {
    expect(matchCaseWorkResourceRoute(
      `/jobs/${JOB_ID}/media-upload`,
      'POST',
      (value) => value,
    )).toEqual({
      jobId: JOB_ID,
      kind: 'jobs.mediaUpload',
      method: 'POST',
      roles: ['customer', 'worker', 'admin'],
      successStatus: 201,
    })

    expect(matchCaseWorkResourceRoute(
      `/jobs/${JOB_ID}/media-revoke`,
      'POST',
      (value) => value,
    )).toEqual({
      jobId: JOB_ID,
      kind: 'jobs.mediaRevoke',
      method: 'POST',
      roles: ['customer', 'worker', 'admin'],
    })
  })

  it('reserves quota before issuing a signed Storage upload token', async () => {
    const operations: string[] = []
    const client = makeClient(operations)
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createJobMediaUpload(ctx, JOB_ID, {
      file_name: 'before.jpg',
      file_size_bytes: 1024,
      mime_type: 'image/jpeg',
      stage: 'before',
    })

    expect(operations).toEqual(['load-job', 'reserve-upload', 'sign-upload'])
    expect(result).toMatchObject({
      bucket_id: 'job-media',
      expires_in_seconds: 7200,
      token: 'signed-token',
    })
    expect(result.object_path).toMatch(
      new RegExp(`^${JOB_ID}/before/[0-9a-f-]+-before\\.jpg$`),
    )
  })

  it('revokes the reservation when Storage cannot issue a signed token', async () => {
    const operations: string[] = []
    const client = makeClient(operations, true)
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createJobMediaUpload(ctx, JOB_ID, {
      file_name: 'before.jpg',
      file_size_bytes: 1024,
      mime_type: 'image/jpeg',
      stage: 'before',
    })).rejects.toMatchObject({ code: 'STORAGE_ERROR', status: 503 })

    expect(operations).toEqual([
      'load-job',
      'reserve-upload',
      'sign-upload',
      'revoke-upload',
    ])
  })

  it('rejects an unreserved object before downloading its bytes', async () => {
    const objectPath = `${JOB_ID}/before/unreserved.jpg`
    const download = vi.fn()
    const client = makeAttachClient(download)
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(attachJobMedia(ctx, JOB_ID, {
      assets: [{
        file_size_bytes: 6,
        mime_type: 'image/jpeg',
        object_path: objectPath,
        stage: 'before',
      }],
    })).rejects.toMatchObject({
      code: 'MEDIA_INTENT_MISSING_OR_EXPIRED',
      status: 400,
    })

    expect(download).not.toHaveBeenCalled()
  })

  it('revokes only owner-scoped reservations and reports deferred deletion', async () => {
    const objectPath = `${JOB_ID}/before/reserved.jpg`
    const operations: string[] = []
    const client = makeRevokeClient(operations, true)
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(revokeJobMediaUploads(ctx, JOB_ID, {
      object_paths: [objectPath],
    })).resolves.toEqual({
      deletion_pending: true,
      job_id: JOB_ID,
      revoked_count: 1,
    })

    expect(operations).toEqual(['load-job', 'revoke-upload', 'remove-upload'])
  })

  it('Customer public media upload intent reserves the current upload stage without advancing the Customer job', async () => {
    for (const { transactionState, jobStatus } of CUSTOMER_UPLOAD_STATES) {
      const { client, run, storageRequests } = uploadHttp(jobStatus)
      const response = await run()

      expect(response.status, `${transactionState}: ${pillarWhy(PILLAR)}`).toBe(201)
      const body = await response.json()
      expect(body).toMatchObject({
        bucket_id: 'job-media',
        storage_ref: expect.stringMatching(/^supabase:\/\/job-media\//),
        token: 'signed-token',
        expires_in_seconds: 7200,
      })
      expect(body.object_path).toMatch(new RegExp(`^${JOB_ID}/kael_reference/[0-9a-f-]+-intent-reference\\.jpg$`))
      expect(client.calls.filter(call => call.table === 'rpc:reserve_job_media_upload')).toHaveLength(1)
      expect(client.calls.filter(call => call.table === 'jobs' && call.operations.some(operation => operation[0] === 'update'))).toEqual([])
      expect(storageRequests).toHaveLength(1)
    }
  })

  it('Customer public media upload intent refuses a non-owner Customer before quota reservation', async () => {
    const { client, run, storageRequests } = uploadHttp('worker_matched', { actorId: OTHER_CUSTOMER_ID })
    const response = await run()

    expect(response.status, pillarWhy(PILLAR, 'another Customer cannot reserve uploads against the job')).toBe(404)
    expect(client.calls.filter(call => call.table === 'rpc:reserve_job_media_upload')).toEqual([])
    expect(storageRequests).toEqual([])
  })

  it('Customer public media upload intent revokes the reservation when signed upload preparation fails', async () => {
    const { client, run, storageRequests } = uploadHttp('worker_matched', { signingFails: true })
    const response = await run()

    expect(response.status, pillarWhy(PILLAR, 'a failed Storage handshake must not leave quota reserved')).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'STORAGE_ERROR' })
    expect(client.calls.filter(call => call.table === 'rpc:reserve_job_media_upload')).toHaveLength(1)
    expect(client.calls.filter(call => call.table === 'rpc:fail_job_media_uploads')).toHaveLength(1)
    expect(client.calls.find(call => call.table === 'rpc:fail_job_media_uploads')?.operations[0]?.[2]).toMatchObject({
      p_job_id: JOB_ID,
      p_owner_id: CUSTOMER_ID,
      p_object_paths: expect.arrayContaining([expect.stringMatching(new RegExp(`^${JOB_ID}/kael_reference/`))]),
    })
    expect(storageRequests).toHaveLength(1)
  })
})

function makeClient(operations: string[], signingFails = false) {
  return {
    from(table: string) {
      if (table !== 'jobs') throw new Error(`Unexpected table ${table}`)
      operations.push('load-job')
      return queryResult({
        customer_id: 'customer-1',
        id: JOB_ID,
        service_type: 'electrical',
        status: 'awaiting_customer_confirm',
        worker_id: null,
      })
    },
    rpc(name: string) {
      if (name === 'reserve_job_media_upload') {
        operations.push('reserve-upload')
        return Promise.resolve({
          data: [{ allowed: true, expires_at: '2099-01-01T00:00:00.000Z' }],
          error: null,
        })
      }
      if (name === 'fail_job_media_uploads') {
        operations.push('revoke-upload')
        return Promise.resolve({ data: [{ ok: true }], error: null })
      }
      throw new Error(`Unexpected RPC ${name}`)
    },
    storage: {
      from(bucket: string) {
        if (bucket !== 'job-media') throw new Error(`Unexpected bucket ${bucket}`)
        return {
          createSignedUploadUrl() {
            operations.push('sign-upload')
            if (signingFails) return Promise.reject(new Error('storage unavailable'))
            return Promise.resolve({
              data: {
                signedUrl: 'https://storage.example.test/upload',
                token: 'signed-token',
              },
              error: null,
            })
          },
        }
      },
    },
  }
}

function queryResult(data: Record<string, unknown>) {
  const query = {
    select() {
      return query
    },
    eq() {
      return query
    },
    in() {
      return query
    },
    maybeSingle() {
      return query
    },
    single() {
      return query
    },
    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected)
    },
  }
  return query
}

function makeAttachClient(download: ReturnType<typeof vi.fn>) {
  const queryResults = [
    {
      customer_id: 'customer-1',
      id: JOB_ID,
      service_type: 'electrical',
      status: 'awaiting_customer_confirm',
      worker_id: null,
      photo_urls: [],
      completion_photo_urls: [],
    },
    [],
  ]
  return {
    from() {
      return queryResult(queryResults.shift() as Record<string, unknown>)
    },
    rpc(name: string) {
      if (name !== 'consume_job_media_uploads') throw new Error(`Unexpected RPC ${name}`)
      return Promise.resolve({
        data: [{ consumed_count: 0, ok: false, reason: 'MEDIA_INTENT_MISSING_OR_EXPIRED' }],
        error: null,
      })
    },
    storage: {
      from() {
        return {
          download,
          remove: vi.fn(),
        }
      },
    },
  }
}

function makeRevokeClient(operations: string[], removalFails: boolean) {
  return {
    from(table: string) {
      if (table !== 'jobs') throw new Error(`Unexpected table ${table}`)
      operations.push('load-job')
      return queryResult({
        customer_id: 'customer-1',
        id: JOB_ID,
        service_type: 'electrical',
        status: 'awaiting_customer_confirm',
        worker_id: null,
      })
    },
    rpc(name: string) {
      if (name !== 'revoke_job_media_uploads') throw new Error(`Unexpected RPC ${name}`)
      operations.push('revoke-upload')
      return Promise.resolve({
        data: [{ ok: true, reason: null, revoked_paths: [`${JOB_ID}/before/reserved.jpg`] }],
        error: null,
      })
    },
    storage: {
      from(bucket: string) {
        if (bucket !== 'job-media') throw new Error(`Unexpected bucket ${bucket}`)
        return {
          remove() {
            operations.push('remove-upload')
            return Promise.resolve({
              data: null,
              error: removalFails ? { message: 'storage unavailable' } : null,
            })
          },
        }
      },
    },
  }
}
