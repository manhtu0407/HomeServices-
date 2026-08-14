import type { JobDetailResponse, WorkerBroadcastsResponse, WorkerJobListResponse } from '../api-types'
import { sameWorkerJobs } from '../frontend-workflow/comparisons'
import { jobDetailToSnapshot, workerBroadcastToSnapshot, workerJobToSnapshot } from '../frontend-workflow/snapshots'

type WorkerJob = WorkerJobListResponse['jobs'][number]

function buildWorkerJob(overrides: Partial<WorkerJob> = {}): WorkerJob {
  return {
    id: 'job-payment-truth',
    display_code: 'NS-TRUTH',
    status: 'confirmed_by_customer',
    service_type: 'electrical',
    problem_summary: 'Ổ cắm mất điện',
    address_building: 'Tòa A',
    address_unit: null,
    address_floor: null,
    district: 'district_7',
    address_access: {
      release_stage: 'building_released',
      exact_unit_released: false,
      worker_checked_in: false,
      check_in_required: false,
      identity_check_required: false,
      customer_handoff_required: false,
      evidence_mode: 'none',
      access_profile: {},
    },
    final_price: 420_000,
    estimated_earning: 336_000,
    photo_urls: [],
    customer_evidence_photo_urls: [],
    field_evidence_photo_urls: [],
    completion_notes: null,
    completion_photo_urls: [],
    scheduled_at: '2026-07-15T01:00:00.000Z',
    created_at: '2026-07-11T00:00:00.000Z',
    matched_at: null,
    completed_at: null,
    ...overrides,
  }
}

function buildCustomerJobDetail(): JobDetailResponse {
  return {
    job: {
      id: 'job-customer-scheduled',
      status: 'broadcasting',
      service_type: 'electrical',
      description: 'Ổ cắm mất điện cần kiểm tra',
      problem_chips: ['outlet_not_working'],
      photo_urls: [],
      customer_evidence_photo_urls: [],
      field_evidence_photo_urls: [],
      address_building: 'Tòa A',
      address_unit: null,
      address_floor: null,
      address_district: 'district_7',
      address_access: {
        release_stage: 'area_only',
        exact_unit_released: false,
        worker_checked_in: false,
        check_in_required: false,
        identity_check_required: false,
        customer_handoff_required: false,
        evidence_mode: 'none',
        access_profile: {},
      },
      scheduled_at: '2026-07-15T01:00:00.000Z',
      kael_problem_identified: null,
      kael_complexity: null,
      kael_price_min: null,
      kael_price_max: null,
      kael_advisory: null,
      kael_estimate_card_v3: null,
      kael_worker_brief_core: null,
      kael_worker_brief_guidance: null,
      kael_progress: null,
      final_price: null,
      payment_rail_available: true,
      completion_notes: null,
      completion_photo_urls: [],
      created_at: '2026-07-14T00:00:00.000Z',
      matched_at: null,
      arrived_at: null,
      completed_at: null,
      confirmed_at: null,
      paid_at: null,
      reviewed_at: null,
    },
    worker: null,
    broadcast_state: null,
    matching_state: null,
    current_scope_change: null,
  }
}

describe('frontend workflow payment truth', () => {
  it('preserves estimate_ready instead of turning it into a customer-confirm action', () => {
    const snapshot = workerJobToSnapshot(buildWorkerJob({ status: 'estimate_ready' }))

    expect(snapshot.status).toBe('estimate_ready')
  })

  it('preserves the real scheduled instant returned for a worker job', () => {
    const snapshot = workerJobToSnapshot(buildWorkerJob())

    expect(snapshot.scheduledAt).toBe('2026-07-15T01:00:00.000Z')
  })

  it('updates legacy worker brief authority in the rendered snapshot without changing the stored job', () => {
    const legacyGuidance = 'Nếu phát sinh thêm, gửi scope-change kèm lý do và ảnh trước khi làm.'
    const legacySafety = 'Không bắt đầu phần phát sinh khi Kael chưa quyết định hoặc chưa có override hợp lệ.'
    const snapshot = workerJobToSnapshot(buildWorkerJob({
      status: 'arrived',
      worker_brief_guidance: {
        sections: {
          guidance: [legacyGuidance],
          safety: [legacySafety],
        },
      },
    }))

    expect(snapshot.broadcast?.prebrief).toEqual([
      'Nếu phát sinh thêm, gửi đề xuất đổi phạm vi kèm lý do; thêm ảnh nếu có. Chỉ làm khi khách xác nhận trong ứng dụng.',
      'Không bắt đầu phần phát sinh khi khách chưa xác nhận đề xuất đổi phạm vi trong ứng dụng.',
    ])
    expect(legacyGuidance).toBe('Nếu phát sinh thêm, gửi scope-change kèm lý do và ảnh trước khi làm.')
    expect(legacySafety).toBe('Không bắt đầu phần phát sinh khi Kael chưa quyết định hoặc chưa có override hợp lệ.')
  })

  it('preserves the real scheduled instant returned in a worker broadcast', () => {
    const broadcast: WorkerBroadcastsResponse['broadcasts'][number] = {
      broadcast_id: 'broadcast-scheduled',
      job_id: 'job-scheduled',
      status: 'sent',
      service_type: 'electrical',
      problem_summary: 'Ổ cắm mất điện',
      district: 'district_7',
      estimated_price_min: null,
      estimated_price_max: null,
      estimated_earning_min: null,
      estimated_earning_max: null,
      media_count: 2,
      scheduled_at: '2026-07-15T01:00:00.000Z',
      sent_at: '2026-07-14T01:00:00.000Z',
      expires_at: '2026-07-14T01:05:00.000Z',
      seconds_remaining: 300,
    }

    const snapshot = workerBroadcastToSnapshot(broadcast)
    expect(snapshot.scheduledAt).toBe('2026-07-15T01:00:00.000Z')
    expect(snapshot.mediaCount).toBe(2)
  })

  it('preserves the real scheduled instant returned in customer job detail', () => {
    const snapshot = jobDetailToSnapshot(buildCustomerJobDetail())

    expect(snapshot.scheduledAt).toBe('2026-07-15T01:00:00.000Z')
  })

  it('hydrates the active Kael incident as a Customer scope-review artifact', () => {
    const response = buildCustomerJobDetail()
    const snapshot = jobDetailToSnapshot({
      ...response,
      current_job_incident: {
        created_at: '2026-08-13T02:10:00.000Z',
        evidence_count: 1,
        evidence_status: 'ready',
        id: 'incident-1',
        last_next_actor: 'worker',
        last_question: null,
        last_summary: 'Kael đã đủ căn cứ để chuẩn bị đề xuất.',
        reported_description: 'Thay đúng hai bản lề kim loại bị nứt',
        reported_reason: 'Hai bản lề nứt, gỗ và cánh tủ không hư hỏng.',
        status: 'ready_for_scope_proposal',
        updated_at: '2026-08-13T02:12:00.000Z',
      },
      job: { ...response.job, final_price: 350_000, status: 'inspecting' },
    })

    expect(snapshot.scopeReview).toEqual(expect.objectContaining({
      evidenceCount: 1,
      reportedDescription: 'Thay đúng hai bản lề kim loại bị nứt',
      status: 'ready_for_scope_proposal',
    }))
    expect(snapshot.finalPrice).toBe(350_000)
  })

  it('preserves the server-owned payment rail capability for the Customer surface', () => {
    const snapshot = jobDetailToSnapshot(buildCustomerJobDetail())

    expect(snapshot.paymentRailAvailable).toBe(true)
  })

  it('preserves the server-owned manual QR receipt and rail provider', () => {
    const response = buildCustomerJobDetail()
    const snapshot = jobDetailToSnapshot({
      ...response,
      job: {
        ...response.job,
        final_price: 420_000,
        payment_rail_provider: 'platform_bank_manual',
        payment_status: 'manual_qr_ready',
        payment_provider: 'platform_bank_manual',
        gross_amount: 420_000,
        platform_fee: 63_000,
        worker_net: 357_000,
        payment_code: 'NS-MANUAL-420',
        payment_transfer_content: 'NS-MANUAL-420',
        payment_qr_image_url: 'https://qr.example.test/NS-MANUAL-420',
        payment_receipt: {
          method: 'platform_bank_manual',
          status: 'manual_qr_ready',
          gross_amount: 420_000,
          customer_transfer_claimed_at: null,
          customer_transferred_at: null,
          response_deadline: null,
          hold_until: null,
          customer_confirmed_at: null,
          worker_confirmed_at: null,
          collateral_amount: null,
          bank_code: 'VCB',
          account_holder: 'Platform account',
          account_masked: '****6789',
        },
        status: 'payment_pending',
      },
    })

    expect(snapshot.paymentRailProvider).toBe('platform_bank_manual')
    expect(snapshot.payment).toEqual(expect.objectContaining({
      status: 'manual_qr_ready',
      provider: 'platform_bank_manual',
      transferContent: 'NS-MANUAL-420',
    }))
  })

  it('hydrates a legacy job detail without split evidence arrays', () => {
    const response = buildCustomerJobDetail()
    const legacyJob = {
      ...response.job,
      photo_urls: ['supabase://job-media/job-customer-scheduled/before/customer.jpg'],
    } as Record<string, unknown>
    delete legacyJob.customer_evidence_photo_urls
    delete legacyJob.field_evidence_photo_urls
    delete legacyJob.completion_photo_urls

    const snapshot = jobDetailToSnapshot({
      ...response,
      job: legacyJob as JobDetailResponse['job'],
    })

    expect(snapshot.mediaCount).toBe(1)
    expect(snapshot.customerEvidencePhotoUrls).toEqual(legacyJob.photo_urls)
    expect(snapshot.fieldEvidencePhotoUrls).toEqual([])
    expect(snapshot.completionPhotoUrls).toEqual([])
  })

  it('detects a worker schedule-only refresh instead of retaining a stale time', () => {
    const current = buildWorkerJob({ scheduled_at: '2026-07-15T01:00:00.000Z' })
    const rescheduled = buildWorkerJob({ scheduled_at: '2026-07-15T03:00:00.000Z' })

    expect(sameWorkerJobs([current], [rescheduled])).toBe(false)
  })

  it('does not fabricate payment or provider from final price and estimated earnings', () => {
    const snapshot = workerJobToSnapshot(buildWorkerJob())

    expect(snapshot.finalPrice).toBe(420_000)
    expect(snapshot.broadcast?.estimatedEarning).toBe(336_000)
    expect(snapshot.payment).toBeNull()
  })

  it('keeps customer and worker evidence in separate post-confirmation stages', () => {
    const customerRef = 'supabase://job-media/11111111-1111-4111-8111-111111111111/before/customer.jpg'
    const fieldRef = 'supabase://job-media/11111111-1111-4111-8111-111111111111/kael_reference/field.jpg'
    const snapshot = workerJobToSnapshot(buildWorkerJob({
      customer_evidence_photo_urls: [customerRef],
      field_evidence_photo_urls: [fieldRef],
      photo_urls: [customerRef],
    }))

    expect(snapshot.customerEvidencePhotoUrls).toEqual([customerRef])
    expect(snapshot.fieldEvidencePhotoUrls).toEqual([fieldRef])
  })

  it('hydrates only explicit payment amounts and provider returned by the server', () => {
    const snapshot = workerJobToSnapshot(buildWorkerJob({
      payment_status: 'vietqr_ready',
      payment_provider: 'bank_transfer',
      gross_amount: 420_000,
      platform_fee: 84_000,
      worker_net: 336_000,
      payment_amount_received: 420_000,
      payment_code: 'NS-TRUTH-420',
    }))

    expect(snapshot.payment).toEqual(expect.objectContaining({
      status: 'vietqr_ready',
      provider: 'bank_transfer',
      grossAmount: 420_000,
      platformFee: 84_000,
      workerNet: 336_000,
      amountReceived: 420_000,
      paymentCode: 'NS-TRUTH-420',
    }))
  })

  it('uses the safe receipt state to distinguish which direct-payment confirmation is still needed', () => {
    const response = buildCustomerJobDetail()
    const snapshot = jobDetailToSnapshot({
      ...response,
      job: {
        ...response.job,
        gross_amount: 420_000,
        payment_provider: 'direct_worker',
        payment_receipt: {
          method: 'direct_worker',
          status: 'direct_awaiting_worker_confirmation',
          gross_amount: 420_000,
          customer_transfer_claimed_at: null,
          customer_transferred_at: null,
          response_deadline: '2026-08-12T09:00:00.000Z',
          hold_until: null,
          customer_confirmed_at: '2026-08-11T09:00:00.000Z',
          worker_confirmed_at: null,
          collateral_amount: 63_000,
          bank_code: null,
          account_holder: null,
          account_masked: null,
        },
        payment_status: 'direct_awaiting_confirmation',
        status: 'payment_pending',
      },
    })

    expect(snapshot.payment).toEqual(expect.objectContaining({
      status: 'direct_awaiting_worker_confirmation',
      directCustomerConfirmedAt: '2026-08-11T09:00:00.000Z',
      directWorkerConfirmedAt: null,
    }))
  })

  it('keeps an absent provider absent when the server only reports a payment workflow state', () => {
    const snapshot = workerJobToSnapshot(buildWorkerJob({
      status: 'payment_pending',
      final_price: null,
      estimated_earning: null,
    }))

    expect(snapshot.payment).toEqual(expect.objectContaining({
      status: 'pending',
      provider: null,
      grossAmount: null,
      workerNet: null,
    }))
    expect(snapshot.status).toBe('payment_pending')
  })

  it('does not expose the default not-started marker as a payment object by itself', () => {
    const snapshot = workerJobToSnapshot(buildWorkerJob({
      final_price: null,
      estimated_earning: null,
      payment_status: 'not_started',
    }))

    expect(snapshot.payment).toBeNull()
  })
})
