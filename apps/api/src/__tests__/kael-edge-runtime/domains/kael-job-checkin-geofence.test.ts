import { describe, expect, it, vi } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { sendPushToUsers } from '../../../../../../supabase/functions/mobile-api/_shared/platform/push'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient, attachDefaultJobMediaStorage } from '../harness'

describe('job-checkin-geofence', () => {
  installEdgeRuntimeTestHooks()

  it('blocks a geofence apartment check-in beyond the building radius (no unit release)', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_on_way',
          customer_id: 'customer-geo',
          worker_id: 'worker-geo',
          apartment_access_profile: null,
          apartment_access_state: { release_stage: 'building_released' },
          address_building: 'Toà A',
          address_unit: '12-08',
          address_floor: '12',
          address_district: 'q1',
          address_lat: 10.7769,
          address_lng: 106.7009,
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-geo' },
      role: 'worker',
      supabase: client,
    }
    // Check-in ~12 km from the building must be rejected: the exact unit is never released.
    await expect(createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'arrived',
      access_check_in: { mode: 'geofence', lat: 10.85, lng: 106.62, accuracy_m: 20 },
    })).rejects.toMatchObject({ code: 'VALIDATION', status: 400 })
    expect(JSON.stringify(client.calls)).not.toContain('unit_released')
  })

  it('rejects a geofence apartment check-in when the building has no geocoded coordinates', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_on_way',
          customer_id: 'customer-geo',
          worker_id: 'worker-geo',
          apartment_access_state: { release_stage: 'building_released' },
          address_lat: null,
          address_lng: null,
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-geo' },
      role: 'worker',
      supabase: client,
    }
    await expect(createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'arrived',
      access_check_in: { mode: 'geofence', lat: 10.7769, lng: 106.7009, accuracy_m: 10 },
    })).rejects.toMatchObject({ code: 'VALIDATION', status: 400 })
  })

  it('rejects a geofence check-in whose GPS uncertainty exceeds the release radius', async () => {
    const client = makeSequenceClient([{
      data: {
        id: 'job-1',
        status: 'worker_on_way',
        customer_id: 'customer-geo-accuracy',
        worker_id: 'worker-geo-accuracy',
        apartment_access_state: { release_stage: 'building_released' },
        address_lat: 10.7769,
        address_lng: 106.7009,
      },
      error: null,
    }])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-geo-accuracy' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'arrived',
      access_check_in: {
        mode: 'geofence',
        lat: 10.7769,
        lng: 106.7009,
        accuracy_m: 500,
      },
    })).rejects.toMatchObject({ code: 'VALIDATION', status: 400 })
    expect(client.calls.some((call) =>
      call.table === 'jobs' && call.operations.some((op) => op[0] === 'update')
    )).toBe(false)
  })

  it.each([
    ['control', 'MessageTooBig\u0000'],
    ['bidi', '\u202eDeviceNotRegistered'],
    ['oversized', 'A'.repeat(65)],
    ['free-form', 'Message too big'],
  ])('maps a non-canonical Expo ticket error to a stable internal code: %s', async (_case, providerError) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [{
        status: 'error',
        message: 'provider-controlled detail is intentionally ignored',
        details: { error: providerError },
      }],
    })))
    vi.stubGlobal('fetch', fetchMock)
    const client = makeSequenceClient([{
      data: [{
        id: 'token-malformed-error',
        user_id: 'worker-malformed-error',
        push_token: 'ExponentPushToken[malformed-error]',
      }],
      error: null,
    }])

    await expect(sendPushToUsers(
      client as unknown as Parameters<typeof sendPushToUsers>[0],
      ['worker-malformed-error'],
      { title: 'New request', body: 'Open NestScout to review it.' },
    )).resolves.toEqual({
      delivered: 0,
      failed: 1,
      errors: ['UNKNOWN_PUSH_ERROR'],
    })
    expect(client.calls).toHaveLength(1)
  })

  it('records a worker check-in without releasing the exact unit (awaits customer authorization)', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_on_way',
          customer_id: null,
          worker_id: 'worker-1',
          apartment_access_state: { release_stage: 'building_released' },
        },
        error: null,
      },
      { data: [{ object_path: 'job-1/access_check_in/lobby.jpg' }], error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'arrived',
      access_check_in: {
        mode: 'manual_photo',
        photo_urls: ['supabase://job-media/job-1/access_check_in/lobby.jpg'],
        note: 'Đã đến sảnh và gặp bảo vệ.',
        checked_in_at: '2000-01-01T00:00:00.000Z',
      },
    })).resolves.toMatchObject({
      job_id: 'job-1',
      from_status: 'worker_on_way',
      to_status: 'arrived',
    })

    const updateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(updateCall?.operations).toContainEqual([
      'update',
      expect.objectContaining({
        status: 'arrived',
        apartment_access_state: expect.objectContaining({
          release_stage: 'building_released',
          exact_unit_released: false,
          worker_checked_in: true,
          check_in_required: false,
          evidence_mode: 'manual_photo',
          check_in: expect.objectContaining({
            mode: 'manual_photo',
            photo_urls: ['supabase://job-media/job-1/access_check_in/lobby.jpg'],
          }),
        }),
      }),
    ])
    const checkInState = (updateCall?.operations.find((op) => op[0] === 'update')?.[1] as {
      apartment_access_state?: { check_in?: { checked_in_at?: string } }
    } | undefined)?.apartment_access_state?.check_in
    expect(checkInState?.checked_in_at).not.toBe('2000-01-01T00:00:00.000Z')
    const eventCall = client.calls.find((call) =>
      call.table === 'job_events' &&
      call.operations.some((op) => op[0] === 'insert')
    )
    expect(eventCall?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        event_type: 'worker_status_update',
        safe_metadata: expect.objectContaining({
          apartment_access_release: false,
          release_stage: 'checked_in_awaiting_customer_authorization',
          evidence_mode: 'manual_photo',
        }),
      }),
    ])
  })

  it('accepts a manual_photo check-in whose refs live in the dedicated access_check_in stage (§32.7)', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_on_way',
          // Dedicated ids: the in-memory push rate limiter persists across tests in
          // this file, so reusing customer-1 here would starve later push assertions.
          customer_id: 'customer-checkin-stage',
          worker_id: 'worker-checkin-stage',
          apartment_access_state: { release_stage: 'building_released' },
        },
        error: null,
      },
      { data: [{ object_path: 'job-1/access_check_in/lobby.jpg' }], error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-checkin-stage' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'arrived',
      access_check_in: {
        mode: 'manual_photo',
        photo_urls: ['supabase://job-media/job-1/access_check_in/lobby.jpg'],
      },
    })).resolves.toMatchObject({
      job_id: 'job-1',
      from_status: 'worker_on_way',
      to_status: 'arrived',
    })

    const updateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(updateCall?.operations).toContainEqual([
      'update',
      expect.objectContaining({
        apartment_access_state: expect.objectContaining({
          worker_checked_in: true,
          exact_unit_released: false,
          check_in: expect.objectContaining({
            photo_urls: ['supabase://job-media/job-1/access_check_in/lobby.jpg'],
          }),
        }),
      }),
    ])
  })

  it('attaches an access_check_in photo while worker_on_way without touching completion evidence (§32.7)', async () => {
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
      { data: [], error: null },
      { data: [{ id: 'asset-1' }], error: null },
      { data: null, error: null },
    ])
    attachDefaultJobMediaStorage(client)
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).attachJobMedia(ctx, jobId, {
      assets: [{
        object_path: `${jobId}/access_check_in/lobby.jpg`,
        stage: 'access_check_in',
        mime_type: 'image/jpeg',
      }],
    })).resolves.toMatchObject({
      job_id: jobId,
      media: [expect.objectContaining({ stage: 'access_check_in' })],
    })

    // A lobby photo must never merge into intake photos or completion evidence.
    expect(client.calls.some((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) =>
        op[0] === 'update' &&
        (JSON.stringify(op[1]).includes('completion_photo_urls') || JSON.stringify(op[1]).includes('"photo_urls"'))
      )
    )).toBe(false)
  })

  it('rejects a manual check-in ref that was never attached by the current worker', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_on_way',
          customer_id: 'customer-unattached-checkin',
          worker_id: 'worker-unattached-checkin',
          apartment_access_state: { release_stage: 'building_released' },
        },
        error: null,
      },
      { data: [], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-unattached-checkin' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'arrived',
      access_check_in: {
        mode: 'manual_photo',
        photo_urls: ['supabase://job-media/job-1/access_check_in/unattached.jpg'],
      },
    })).rejects.toMatchObject({
      code: 'CHECK_IN_MEDIA_NOT_ATTACHED',
      status: 400,
    })
    expect(client.calls.some((call) =>
      call.table === 'jobs' && call.operations.some((op) => op[0] === 'update')
    )).toBe(false)
  })
})
