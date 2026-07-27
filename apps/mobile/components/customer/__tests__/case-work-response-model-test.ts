import { WORKFLOW_PHASES, type LocalDeal, type WorkflowPhase } from '@nestscout/shared'

import {
  buildCaseWorkResponseModel,
  buildCompletedCaseWorkResponseModels,
  type CaseWorkResponseActionKind,
} from '../v21/case-work-response-model'

const actionByPhase: Readonly<Partial<Record<WorkflowPhase, CaseWorkResponseActionKind>>> = {
  completed_by_worker: 'completion',
  customer_confirmed_completion: 'payment',
  paid: 'review',
  payment_pending: 'payment',
  scope_change_pending: 'scope_change',
  ticket_review: 'offer',
  worker_candidate_review: 'worker_candidate',
}

describe('case-work response model', () => {
  it.each(WORKFLOW_PHASES)('provides production copy for %s in both languages', (phase) => {
    for (const language of ['vi', 'en'] as const) {
      const model = buildCaseWorkResponseModel({ language, phase })

      expect(model).toEqual(expect.objectContaining({
        actionKind: actionByPhase[phase] ?? 'none',
        phase,
      }))
      expect(model.title.trim()).not.toBe('')
      expect(model.status.trim()).not.toBe('')
      expect(model.noteTitle.trim()).not.toBe('')
      expect(model.noteCopy.trim()).not.toBe('')
      expect(`${model.title} ${model.status} ${model.noteTitle} ${model.noteCopy}`)
        .not.toMatch(/phòng thử nghiệm|mô phỏng|simulated|test payment/i)
    }
  })

  it('uses only real worker, scope, evidence, and payment data when available', () => {
    const candidate = buildCaseWorkResponseModel({
      deal: dealFixture('worker_candidate_pending', {
        workerProfile: { avatarUrl: null, fullName: 'Nguyễn Minh', id: 'worker-1', rating: 4.8, totalJobs: 12 },
      }),
      language: 'vi',
      phase: 'worker_candidate_review',
    })
    const scope = buildCaseWorkResponseModel({
      deal: dealFixture('scope_change_pending', {
        scopeChange: {
          createdAt: null,
          evidencePhotoUrls: ['private-photo'],
          id: 'scope-1',
          kaelProgress: null,
          kaelReview: null,
          priceMax: null,
          priceMin: null,
          reason: 'Phát hiện đường điện âm tường tại vị trí cũ',
          requestedDescription: 'Dời điểm khoan sang trái 20 cm',
          status: 'waiting_customer_decision',
        },
      }),
      language: 'vi',
      phase: 'scope_change_pending',
    })
    const completion = buildCaseWorkResponseModel({
      deal: dealFixture('completed_by_worker', {
        completionNotes: 'Đã lắp xong và kiểm tra tải',
        completionPhotoUrls: ['one', 'two'],
      }),
      language: 'vi',
      phase: 'completed_by_worker',
    })
    const payment = buildCaseWorkResponseModel({
      deal: dealFixture('payment_pending', {
        payment: {
          amountReceived: null,
          grossAmount: 450_000,
          platformFee: 45_000,
          provider: 'sepay_vietqr',
          status: 'pending',
          workerNet: 405_000,
        },
      }),
      language: 'vi',
      phase: 'payment_pending',
    })

    expect(candidate.noteCopy).toContain('Nguyễn Minh')
    expect(scope.noteCopy).toContain('Phát hiện đường điện âm tường tại vị trí cũ')
    expect(completion.noteCopy).toContain('2 ảnh')
    expect(payment.noteCopy).toContain('450.000')
  })

  it('does not invent worker identity, evidence, price, or payment rail when data is absent', () => {
    const candidate = buildCaseWorkResponseModel({ language: 'vi', phase: 'worker_candidate_review' })
    const completion = buildCaseWorkResponseModel({ language: 'vi', phase: 'completed_by_worker' })
    const payment = buildCaseWorkResponseModel({ language: 'vi', phase: 'payment_pending' })

    expect(candidate.noteCopy).not.toMatch(/Nguyễn|4\.\d|\d+ công việc/)
    expect(completion.noteCopy).not.toMatch(/\d+ ảnh/)
    expect(payment.noteCopy).not.toMatch(/VietQR|SePay|₫|\d{3}[.,]\d{3}/)
  })
  it('names required lobby-photo check-in as the next arrived step', () => {
    const deal = dealFixture('arrived', {
      broadcast: {
        addressAccess: {
          access_profile: {},
          check_in_required: true,
          customer_handoff_required: true,
          evidence_mode: 'none',
          exact_unit_released: false,
          identity_check_required: true,
          release_stage: 'building_released',
          worker_checked_in: false,
        },
        fullAddressLabel: 'Tòa A, Quận 1',
        fullAddressVisible: false,
        generalArea: 'Quận 1',
        prebrief: [],
        problemSummary: 'Đèn trần chập chờn',
        secondsRemaining: null,
        serviceType: 'electrical',
        status: 'accepted',
      },
    })

    const vi = buildCaseWorkResponseModel({ deal, language: 'vi', phase: 'arrived' })
    const en = buildCaseWorkResponseModel({ deal, language: 'en', phase: 'arrived' })

    expect(vi.noteTitle).toBe('Bước tiếp theo')
    expect(vi.noteCopy).toContain('xác nhận có mặt bằng ảnh tại sảnh')
    expect(vi.noteCopy).toContain('Thanh toán chưa mở')
    expect(en.noteTitle).toBe('Next step')
    expect(en.noteCopy).toContain('lobby-photo check-in')
    expect(en.noteCopy).toContain('Payment is not available')
  })

  it('keeps a legacy test payment unavailable without exposing test terminology', () => {
    const model = buildCaseWorkResponseModel({
      deal: dealFixture('paid', {
        payment: {
          amountReceived: 450_000,
          grossAmount: 450_000,
          platformFee: 45_000,
          provider: 'staging_simulator',
          status: 'received',
          workerNet: 405_000,
        },
      }),
      language: 'vi',
      phase: 'paid',
    })

    expect(`${model.title} ${model.status} ${model.noteTitle} ${model.noteCopy}`)
      .not.toMatch(/\bStaging\b|mô phỏng|simulation|simulated/i)
    expect(model.title).toBe('Thanh toán chưa sẵn sàng')
    expect(model.actionKind).toBe('none')
  })

  it('keeps an amount mismatch out of the normal transfer path', () => {
    const model = buildCaseWorkResponseModel({
      deal: dealFixture('payment_pending', {
        payment: {
          amountReceived: 400_000,
          grossAmount: 450_000,
          platformFee: 67_500,
          provider: 'sepay_vietqr',
          status: 'amount_mismatch',
          workerNet: 382_500,
        },
      }),
      language: 'vi',
      phase: 'payment_pending',
    })

    expect(model.title).toBe('Thanh toán cần được kiểm tra')
    expect(model.status).toBe('Cần đối chiếu')
    expect(model.noteCopy).toContain('Không chuyển thêm tiền')
  })

  it('retains only provable completed phases as non-interactive history', () => {
    const models = buildCompletedCaseWorkResponseModels({
      deal: dealFixture('paid'),
      language: 'vi',
      phase: 'paid',
    })

    expect(models.map((model) => model.phase)).toContain('ticket_review')
    expect(models.map((model) => model.phase)).toContain('payment_pending')
    expect(models.map((model) => model.phase)).not.toContain('paid')
    expect(models.map((model) => model.phase)).not.toContain('scope_change_pending')
    expect(models.every((model) => model.actionKind === 'none')).toBe(true)
  })

  it.each(WORKFLOW_PHASES.filter((phase) => phase !== 'cancelled').slice(1))(
    'shows the accumulated completed history as %s begins',
    (phase) => {
      const expectedHistory = WORKFLOW_PHASES
        .slice(0, WORKFLOW_PHASES.indexOf(phase))
        .filter((previousPhase) => previousPhase !== 'scope_change_pending')

      const models = buildCompletedCaseWorkResponseModels({ language: 'vi', phase })

      expect(models.map((model) => model.phase)).toEqual(expectedHistory)
      expect(models.every((model) => model.actionKind === 'none')).toBe(true)
    },
  )
})

function dealFixture(status: LocalDeal['status'], overrides: Partial<LocalDeal> = {}): LocalDeal {
  return {
    broadcast: null,
    createdAt: '2026-07-19T08:00:00.000Z',
    draft: {
      addressLabel: 'Vinhomes Grand Park',
      description: 'Lắp xà đơn trên tường bê tông',
      districtLabel: 'Thành phố Thủ Đức',
      inferredProblemLabel: null,
      mediaCount: 0,
      needsServiceChoice: false,
      problemChips: [],
      serviceType: 'handyman',
      source: 'kael',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    estimate: null,
    id: 'job-1',
    scopeChange: null,
    status,
    ...overrides,
  }
}
