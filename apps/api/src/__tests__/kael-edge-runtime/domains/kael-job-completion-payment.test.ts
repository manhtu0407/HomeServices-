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

  it('creates and confirms a staging-only payment through guarded server transitions', async () => {
    const startClient = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'confirmed_by_customer',
          customer_id: 'customer-1',
          final_price: 250000,
          payment_provider: null,
          payment_status: 'not_started',
        },
        error: null,
      },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
    ])
    const startCtx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: startClient,
    }

    await expect(createEdgeServices({ stagingPaymentRailEnabled: true }).createPaymentIntent(startCtx, 'job-1'))
      .resolves.toMatchObject({
        job_id: 'job-1',
        status: 'payment_pending',
        payment: {
          provider: 'staging_simulator',
          status: 'pending',
          gross_amount: 250000,
          platform_fee: 37500,
          worker_net: 212500,
        },
      })

    const startUpdate = startClient.calls.find((call) =>
      call.table === 'jobs' && call.operations.some((operation) => operation[0] === 'update')
    )
    expect(startUpdate?.operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
    expect(startUpdate?.operations).toContainEqual(['eq', 'status', 'confirmed_by_customer'])

    const confirmClient = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'payment_pending',
          customer_id: 'customer-1',
          final_price: 250000,
          payment_provider: 'staging_simulator',
          payment_status: 'pending',
          payment_code: 'STG-job-1',
          payment_transfer_content: 'STAGING ONLY STG-job-1',
          payment_expires_at: '2026-07-22T13:00:00.000Z',
          gross_amount: 250000,
          platform_fee: 37500,
          worker_net: 212500,
        },
        error: null,
      },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
    ])
    const confirmCtx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: confirmClient,
    }

    await expect(createEdgeServices({ stagingPaymentRailEnabled: true }).confirmStagingPayment(confirmCtx, 'job-1'))
      .resolves.toMatchObject({
        job_id: 'job-1',
        status: 'paid',
        payment: {
          provider: 'staging_simulator',
          status: 'received',
          amount_received: 250000,
        },
      })
  })

  it('creates a SePay VietQR intent without letting the customer mark the job paid', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'confirmed_by_customer',
          customer_id: 'customer-1',
          final_price: 250000,
          payment_provider: null,
          payment_status: 'not_started',
        },
        error: null,
      },
    ], {
      create_worker_vietqr_payment_intent: [{
        data: [{
          job_id: 'job-1',
          job_status: 'payment_pending',
          gross_amount: 250000,
          platform_fee: 37500,
          worker_net: 212500,
          commission_level: 1,
          commission_rate_bps: 1500,
          payment_code: 'NS1234567890ABCDEF12345678',
          transfer_content: 'NS1234567890ABCDEF12345678',
          qr_image_url: 'https://vietqr.app/img?bank=VCB&account=1234567890&amount=250000',
          payment_updated_at: '2026-07-27T04:00:00.000Z',
        }],
        error: null,
      }],
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({
      sepayVietQr: {
        accountHolder: 'NESTSCOUT COMPANY',
        accountNumber: '1234567890',
        bankCode: 'VCB',
        enabled: true,
        webhookSecret: 'test-only-webhook-secret',
      },
    }).createPaymentIntent(ctx, 'job-1')).resolves.toMatchObject({
      job_id: 'job-1',
      status: 'payment_pending',
      payment: {
        provider: 'sepay_vietqr',
        status: 'vietqr_ready',
        gross_amount: 250000,
        platform_fee: 37500,
        worker_net: 212500,
        payment_code: expect.stringMatching(/^NS[A-Z0-9]{24}$/),
        qr_image_url: expect.stringContaining('https://vietqr.app/img?'),
      },
    })

    const intentRpc = client.calls.find((call) => call.table === 'rpc:create_worker_vietqr_payment_intent')
    expect(intentRpc?.operations).toContainEqual([
      'rpc',
      'create_worker_vietqr_payment_intent',
      expect.objectContaining({
        p_customer_id: 'customer-1',
        p_expected_gross_amount: 250000,
        p_job_id: 'job-1',
      }),
    ])
    expect(client.calls.some((call) =>
      call.table === 'jobs' && call.operations.some((operation) => operation[0] === 'update')
    )).toBe(false)
  })

  it('keeps the staging payment simulator closed when the server capability is off', async () => {
    const client = makeSequenceClient([])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).createPaymentIntent(ctx, 'job-1')).rejects.toMatchObject({
      code: 'PAYMENT_NOT_ENABLED',
      status: 409,
    })
    expect(client.calls).toHaveLength(0)
  })
})
