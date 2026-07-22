import { WORKFLOW_PHASES, type LocalDeal, type WorkflowPhase } from '@nestscout/shared'

import {
  buildCaseWorkResponseModel,
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
