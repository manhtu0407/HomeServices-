import type { WorkerJobListResponse } from '../api-types'
import { workerJobToSnapshot } from '../frontend-workflow/snapshots'

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
    completion_notes: null,
    completion_photo_urls: [],
    created_at: '2026-07-11T00:00:00.000Z',
    matched_at: null,
    completed_at: null,
    ...overrides,
  }
}

describe('frontend workflow payment truth', () => {
  it('preserves estimate_ready instead of turning it into a customer-confirm action', () => {
    const snapshot = workerJobToSnapshot(buildWorkerJob({ status: 'estimate_ready' }))

    expect(snapshot.status).toBe('estimate_ready')
  })

  it('does not fabricate payment or provider from final price and estimated earnings', () => {
    const snapshot = workerJobToSnapshot(buildWorkerJob())

    expect(snapshot.finalPrice).toBe(420_000)
    expect(snapshot.payment).toBeNull()
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
