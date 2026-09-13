import { describe, expect, it } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('job-completion-payment', () => {
  installEdgeRuntimeTestHooks()

  it('surfaces worker status races as STATUS_CHANGED instead of fake success', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'repairing', worker_id: 'worker-1' }, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'completed_by_worker',
      completion_notes: 'Đã hoàn tất',
      completion_photo_urls: ['https://example.com/after-1.jpg'],
    })).rejects.toMatchObject({
      code: 'STATUS_CHANGED',
      status: 409,
    })

    const updateCall = client.calls.find((call) => call.table === 'jobs' && call.operations.some((op) => op[0] === 'update'))
    expect(updateCall?.operations).toContainEqual(['eq', 'worker_id', 'worker-1'])
    expect(updateCall?.operations).toContainEqual(['eq', 'status', 'repairing'])
    expect(updateCall?.operations).toContainEqual(['select', 'id'])
    expect(updateCall?.operations).toContainEqual(['maybeSingle'])
  })

  it('reuses stored completion photos when a worker retries completion after media attach', async () => {
    const storedAfterPhotos = ['supabase://job-media/job-1/after/photo-1.jpg']
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'repairing',
          customer_id: null,
          worker_id: 'worker-1',
          final_price: null,
          completion_notes: null,
          completion_photo_urls: storedAfterPhotos,
        },
        error: null,
      },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'completed_by_worker',
      completion_notes: 'Đã thay ổ cắm và kiểm tra tải.',
    })).resolves.toMatchObject({
      job_id: 'job-1',
      from_status: 'repairing',
      to_status: 'completed_by_worker',
    })

    const updateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(updateCall?.operations).toContainEqual([
      'update',
      expect.objectContaining({
        status: 'completed_by_worker',
        completion_notes: 'Đã thay ổ cắm và kiểm tra tải.',
        completion_photo_urls: storedAfterPhotos,
      }),
    ])
  })

  it('rejects worker completion when neither payload nor stored after-photos exist', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'repairing',
          customer_id: null,
          worker_id: 'worker-1',
          final_price: null,
          completion_notes: null,
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

    await expect(createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'completed_by_worker',
      completion_notes: 'Đã thay ổ cắm và kiểm tra tải.',
    })).rejects.toMatchObject({
      code: 'VALIDATION',
      status: 400,
    })
    expect(client.calls.some((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )).toBe(false)
  })

  it('blocks customer completion when Kael has not locked final price', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'completed_by_worker', customer_id: 'customer-1', final_price: null }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmCompletion(ctx, 'job-1')).rejects.toMatchObject({
      code: 'INVALID_STATUS',
      status: 409,
    })
  })

  it('keeps the customer ownership guard inside customer completion updates', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'completed_by_worker', customer_id: 'customer-1', final_price: 250000 }, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmCompletion(ctx, 'job-1')).rejects.toMatchObject({
      code: 'STATUS_CHANGED',
      status: 409,
    })

    const updateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(updateCall?.operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
    expect(updateCall?.operations).toContainEqual(['eq', 'status', 'completed_by_worker'])
    expect(updateCall?.operations).toContainEqual(['select', 'id'])
    expect(updateCall?.operations).toContainEqual(['maybeSingle'])
  })

  it('treats duplicate customer completion confirmation as current state without writing again', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'confirmed_by_customer',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          final_price: 250000,
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

    await expect(createEdgeServices({}).confirmCompletion(ctx, 'job-1')).resolves.toEqual({
      job_id: 'job-1',
      status: 'confirmed_by_customer',
      final_price: 250000,
    })

    expect(client.calls.map((call) => call.table)).toEqual(['jobs'])
  })

  it('keeps staging settlement outside public mobile services', () => {
    const services = createEdgeServices({ stagingPaymentRailEnabled: true })

    expect('createPaymentIntent' in services).toBe(false)
    expect('confirmStagingPayment' in services).toBe(false)
  })

  it('keeps provider-specific intents outside public mobile services', () => {
    const services = createEdgeServices({
      sepayVietQr: {
        accountHolder: 'NESTSCOUT COMPANY',
        accountNumber: '1234567890',
        bankCode: 'VCB',
        enabled: true,
        webhookSecret: 'test-only-webhook-secret',
      },
    })

    expect('createPaymentIntent' in services).toBe(false)
    expect('createManualBankPaymentOrder' in services).toBe(true)
  })
})
