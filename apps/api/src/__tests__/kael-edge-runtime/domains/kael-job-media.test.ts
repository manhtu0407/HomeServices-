import { describe, expect, it } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient, attachDefaultJobMediaStorage } from '../harness'

describe('job-media', () => {
  installEdgeRuntimeTestHooks()

  it('treats repeated media attach calls for the same object path as idempotent metadata sync', async () => {
    const jobId = '11111111-1111-1111-1111-111111111111'
    const objectPath = `${jobId}/before/photo.jpg`
    const client = makeSequenceClient([
      {
        data: {
          id: jobId,
          status: 'awaiting_customer_confirm',
          service_type: 'plumbing',
          customer_id: 'customer-1',
          worker_id: null,
          photo_urls: [],
          completion_photo_urls: [],
        },
        error: null,
      },
      { data: [{ object_path: objectPath }], error: null },
      { data: { id: jobId }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).attachJobMedia(ctx, jobId, {
      assets: [{
        object_path: objectPath,
        stage: 'before',
        mime_type: 'image/jpeg',
        file_size_bytes: 1234,
      }],
    })).resolves.toMatchObject({
      job_id: jobId,
      media: [expect.objectContaining({
        object_path: objectPath,
        storage_ref: `supabase://job-media/${objectPath}`,
      })],
    })

    expect(client.calls.map((call) => call.table)).toEqual([
      'jobs',
      'job_media_assets',
      'jobs',
    ])
    expect(client.calls.some((call) =>
      call.table === 'job_media_assets' &&
      call.operations.some((op) => op[0] === 'insert')
    )).toBe(false)
    expect(client.calls.some((call) => call.table === 'job_events')).toBe(false)
  })

  it('deduplicates repeated media object paths within one attach request', async () => {
    const jobId = '11111111-1111-1111-1111-111111111111'
    const objectPath = `${jobId}/before/photo.jpg`
    const client = makeSequenceClient([
      {
        data: {
          id: jobId,
          status: 'awaiting_customer_confirm',
          service_type: 'plumbing',
          customer_id: 'customer-1',
          worker_id: null,
          photo_urls: [],
          completion_photo_urls: [],
        },
        error: null,
      },
      { data: [], error: null },
      { data: [{ id: 'media-1' }], error: null },
      { data: { id: jobId }, error: null },
      { data: null, error: null },
    ])
    attachDefaultJobMediaStorage(client)
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({}).attachJobMedia(ctx, jobId, {
      assets: [
        { object_path: objectPath, stage: 'before', mime_type: 'image/jpeg', file_size_bytes: 1234 },
        { object_path: objectPath, stage: 'before', mime_type: 'image/jpeg', file_size_bytes: 1234 },
      ],
    })

    expect(result).toMatchObject({
      job_id: jobId,
      photo_urls: [`supabase://job-media/${objectPath}`],
    })
    expect(result.media).toHaveLength(1)

    const insertCall = client.calls.find((call) =>
      call.table === 'job_media_assets' &&
      call.operations.some((op) => op[0] === 'insert')
    )
    expect(insertCall?.operations).toContainEqual([
      'insert',
      [expect.objectContaining({ object_path: objectPath })],
    ])
    expect(client.calls.find((call) => call.table === 'job_events')?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        event_type: 'job_media_attached',
        safe_metadata: expect.objectContaining({ count: 1 }),
      }),
    ])
  })

  it('rejects completion media before the worker reaches repair/completion phase', async () => {
    const jobId = '11111111-1111-1111-1111-111111111111'
    const client = makeSequenceClient([
      {
        data: {
          id: jobId,
          status: 'worker_on_way',
          service_type: 'plumbing',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          photo_urls: [],
          completion_photo_urls: [],
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).attachJobMedia(ctx, jobId, {
      assets: [{
        object_path: `${jobId}/after/evidence.jpg`,
        stage: 'after',
        mime_type: 'image/jpeg',
        file_size_bytes: 1234,
      }],
    })).rejects.toMatchObject({
      code: 'INVALID_STATUS',
      status: 409,
    })

    expect(client.calls.map((call) => call.table)).toEqual(['jobs'])
  })
})
