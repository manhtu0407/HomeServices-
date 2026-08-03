import { describe, expect, it, vi } from 'vitest'

import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/http'
import { matchCaseWorkResourceRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes/case-work-resource-routes'
import {
  attachJobMedia,
  createJobMediaUpload,
  revokeJobMediaUploads,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/job/media'

const JOB_ID = '11111111-1111-4111-8111-111111111111'

describe('job media upload intent', () => {
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
