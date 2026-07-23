import type { JobDetailResponse, WorkerBroadcastsResponse, WorkerJobListResponse } from '../api-types'
import { buildWorkerV5SchedulePlan } from '../../components/worker/jobs/schedule'
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

  it('renders and orders a worker schedule from scheduled_at instead of its list position', () => {
    const later = buildWorkerJob({
      id: 'job-later',
      status: 'worker_matched',
      scheduled_at: '2026-07-15T03:00:00.000Z',
    })
    const earlier = buildWorkerJob({
      id: 'job-earlier',
      status: 'worker_matched',
      scheduled_at: '2026-07-15T01:00:00.000Z',
    })

    const schedule = buildWorkerV5SchedulePlan(null, [later, earlier], 'vi')

    expect(schedule.rows.map((row) => row.time)).toEqual(['15/07 · 08:00', '15/07 · 10:00'])
  })

  it('detects a worker schedule-only refresh instead of retaining a stale time', () => {
    const current = buildWorkerJob({ scheduled_at: '2026-07-15T01:00:00.000Z' })
    const rescheduled = buildWorkerJob({ scheduled_at: '2026-07-15T03:00:00.000Z' })

    expect(sameWorkerJobs([current], [rescheduled])).toBe(false)
  })

  it('does not fabricate payment or provider from final price and estimated earnings', () => {
    const snapshot = workerJobToSnapshot(buildWorkerJob())

    expect(snapshot.finalPrice).toBe(420_000)
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
