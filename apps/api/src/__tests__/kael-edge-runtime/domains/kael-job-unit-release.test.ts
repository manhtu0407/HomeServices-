import { describe, expect, it, vi } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('job-unit-release', () => {
  installEdgeRuntimeTestHooks()

  it('notifies the customer when a worker arrives', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_on_way',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'customer-1', push_token: 'ExponentPushToken[customer]' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'arrived',
    })).resolves.toMatchObject({
      job_id: 'job-1',
      from_status: 'worker_on_way',
      to_status: 'arrived',
    })

    const notificationCall = client.calls.find((call) => call.table === 'rpc:insert_notification_atomic')
    expect(notificationCall?.operations).toContainEqual([
      'rpc',
      'insert_notification_atomic',
      expect.objectContaining({
        p_user_id: 'customer-1',
        p_job_id: 'job-1',
        p_event_type: 'worker_arrived',
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('/(customer)/history?job_id=job-1'),
      }),
    )
  })

  it('releases the exact unit only after the customer authorizes a worker check-in', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'arrived',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          apartment_access_state: {
            release_stage: 'building_released',
            exact_unit_released: false,
            worker_checked_in: true,
            check_in: { mode: 'manual_photo', worker_id: 'worker-1' },
          },
        },
        error: null,
      },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: [{ notification_id: 'n-1' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }
    await expect(createEdgeServices({}).authorizeApartmentAccess(ctx, 'job-1')).resolves.toMatchObject({
      job_id: 'job-1',
      release_stage: 'unit_released',
      already_authorized: false,
    })
    const updateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(updateCall?.operations).toContainEqual([
      'update',
      expect.objectContaining({
        apartment_access_state: expect.objectContaining({
          release_stage: 'unit_released',
          exact_unit_released: true,
          customer_authorized: true,
        }),
      }),
    ])
    const notifyCall = client.calls.find((call) =>
      call.table === 'rpc:insert_notification_atomic'
    )
    expect(notifyCall?.operations).toContainEqual([
      'rpc',
      'insert_notification_atomic',
      expect.objectContaining({
        p_user_id: 'worker-1',
        p_event_type: 'apartment_access_authorized',
      }),
    ])
  })

  it('rejects customer apartment authorization before the worker has checked in', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_on_way',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          apartment_access_state: { release_stage: 'building_released', exact_unit_released: false },
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }
    await expect(createEdgeServices({}).authorizeApartmentAccess(ctx, 'job-1'))
      .rejects.toMatchObject({ code: 'ACCESS_NOT_READY', status: 409 })
  })

  it('rejects apartment authorization once the job is no longer active (§32.7, Codex P1)', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'cancelled',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          apartment_access_state: {
            release_stage: 'building_released',
            exact_unit_released: false,
            worker_checked_in: true,
            check_in: { mode: 'manual_photo', worker_id: 'worker-1' },
          },
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }
    await expect(createEdgeServices({}).authorizeApartmentAccess(ctx, 'job-1'))
      .rejects.toMatchObject({ code: 'ACCESS_NOT_READY', status: 409 })
    expect(client.calls.some((call) =>
      call.operations.some((op) => op[0] === 'update')
    )).toBe(false)
  })

  it('rejects apartment authorization when the check-in belongs to a replaced worker (§32.7, Codex P1)', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'arrived',
          customer_id: 'customer-1',
          worker_id: 'worker-replacement',
          apartment_access_state: {
            release_stage: 'building_released',
            exact_unit_released: false,
            worker_checked_in: true,
            check_in: { mode: 'manual_photo', worker_id: 'worker-cancelled' },
          },
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }
    await expect(createEdgeServices({}).authorizeApartmentAccess(ctx, 'job-1'))
      .rejects.toMatchObject({ code: 'ACCESS_NOT_READY', status: 409 })
    expect(client.calls.some((call) =>
      call.operations.some((op) => op[0] === 'update')
    )).toBe(false)
  })

  it('accepts a same-status arrived check-in retry after the skip path (§32.7, Codex P2)', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'arrived',
          // Dedicated ids: the in-memory push rate limiter persists across tests in
          // this file (see the access_check_in stage test above).
          customer_id: 'customer-checkin-retry',
          worker_id: 'worker-checkin-retry',
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
      user: { id: 'worker-checkin-retry' },
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
      from_status: 'arrived',
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
          check_in: expect.objectContaining({ worker_id: 'worker-checkin-retry' }),
        }),
      }),
    ])
  })

  it('does not revoke an authorized unit release when the same worker retries check-in', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'arrived',
          customer_id: 'customer-authorized-retry',
          worker_id: 'worker-authorized-retry',
          apartment_access_state: {
            release_stage: 'unit_released',
            exact_unit_released: true,
            worker_checked_in: true,
            customer_authorized: true,
            customer_authorization_required: false,
            check_in: { mode: 'manual_photo', worker_id: 'worker-authorized-retry' },
          },
        },
        error: null,
      },
      { data: [{ object_path: 'job-1/access_check_in/lobby-retry.jpg' }], error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-authorized-retry' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'arrived',
      access_check_in: {
        mode: 'manual_photo',
        photo_urls: ['supabase://job-media/job-1/access_check_in/lobby-retry.jpg'],
      },
    })).resolves.toMatchObject({
      job_id: 'job-1',
      from_status: 'arrived',
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
          release_stage: 'unit_released',
          exact_unit_released: true,
          customer_authorized: true,
          customer_authorization_required: false,
          check_in: expect.objectContaining({ worker_id: 'worker-authorized-retry' }),
        }),
      }),
    ])
  })

  it('does not let a replacement worker inherit a stale authorized unit release', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'arrived',
          customer_id: 'customer-replacement-checkin',
          worker_id: 'worker-replacement-checkin',
          apartment_access_state: {
            release_stage: 'unit_released',
            exact_unit_released: true,
            worker_checked_in: true,
            customer_authorized: true,
            customer_authorized_at: '2026-07-14T06:00:00.000Z',
            customer_authorization_required: false,
            unit_released_at: '2026-07-14T06:00:00.000Z',
            check_in: { mode: 'manual_photo', worker_id: 'worker-cancelled' },
          },
        },
        error: null,
      },
      { data: [{ object_path: 'job-1/access_check_in/replacement-lobby.jpg' }], error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-replacement-checkin' },
      role: 'worker',
      supabase: client,
    }

    await createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'arrived',
      access_check_in: {
        mode: 'manual_photo',
        photo_urls: ['supabase://job-media/job-1/access_check_in/replacement-lobby.jpg'],
      },
    })

    const updateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(updateCall?.operations).toContainEqual([
      'update',
      expect.objectContaining({
        apartment_access_state: expect.objectContaining({
          release_stage: 'building_released',
          exact_unit_released: false,
          customer_authorized: false,
          customer_authorization_required: true,
          check_in: expect.objectContaining({ worker_id: 'worker-replacement-checkin' }),
        }),
      }),
    ])
    const updateOperation = updateCall?.operations.find((op) => op[0] === 'update') as
      | ['update', { apartment_access_state?: Record<string, unknown> }]
      | undefined
    const apartmentAccessState = updateOperation?.[1].apartment_access_state
    expect(apartmentAccessState).not.toHaveProperty('customer_authorized_at')
    expect(apartmentAccessState).not.toHaveProperty('unit_released_at')
  })

  it('keeps worker job list exact unit locked before check-in release', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          id: 'job-1',
          display_code: 'NS-2026-000321',
          status: 'worker_matched',
          service_type: 'plumbing',
          kael_problem_identified: 'Pipe leak',
          address_building: 'River Gate',
          address_unit: '1201',
          address_floor: '12',
          address_district: 'q7',
          apartment_access_profile: { entry_method: 'Đăng ký ở quầy lễ tân' },
          apartment_access_state: { release_stage: 'building_released', exact_unit_released: false },
          scheduled_at: '2026-07-15T01:00:00.000Z',
          kael_price_min: 150000,
          kael_price_max: 250000,
          kael_worker_brief_guidance: null,
          final_price: null,
          payment_status: 'vietqr_ready',
          payment_provider: 'sepay_vietqr',
          payment_code: 'PAY-321',
          payment_transfer_content: 'NESTSCOUT PAY-321',
          payment_qr_image_url: 'https://qr.example.test/PAY-321.png',
          payment_expires_at: '2026-07-15T02:00:00.000Z',
          payment_received_at: null,
          payment_amount_received: null,
          gross_amount: 250000,
          platform_fee: 25000,
          worker_net: 225000,
          photo_urls: ['supabase://job-media/job-1/before/onsite.jpg'],
          completion_notes: null,
          completion_photo_urls: [],
          created_at: '2026-06-04T00:00:00.000Z',
          matched_at: '2026-06-04T00:01:00.000Z',
          completed_at: null,
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).listWorkerJobs(ctx)).resolves.toMatchObject({
      jobs: [{
        id: 'job-1',
        display_code: 'NS-2026-000321',
        address_building: 'River Gate',
        address_unit: null,
        address_floor: null,
        photo_urls: ['supabase://job-media/job-1/before/onsite.jpg'],
        payment_status: 'vietqr_ready',
        payment_provider: 'sepay_vietqr',
        payment_code: null,
        payment_transfer_content: null,
        payment_qr_image_url: null,
        payment_expires_at: null,
        payment_received_at: null,
        payment_amount_received: null,
        gross_amount: 250000,
        platform_fee: 25000,
        worker_net: 225000,
        scheduled_at: '2026-07-15T01:00:00.000Z',
        district: 'q7',
        address_access: {
          release_stage: 'building_released',
          exact_unit_released: false,
          access_profile: { entry_method: 'Đăng ký ở quầy lễ tân' },
        },
      }],
    })
    const assignedJobsCall = client.calls.find((call) => call.table === 'jobs')
    expect(assignedJobsCall?.operations[0]).toEqual([
      'select',
      expect.stringContaining('display_code'),
    ])
    expect(assignedJobsCall?.operations[0]?.[1]).not.toContain('payment_qr_image_url')
  })
})
