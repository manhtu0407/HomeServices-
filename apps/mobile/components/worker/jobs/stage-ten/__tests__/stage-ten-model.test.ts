import * as React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'

import { StageTenContent } from '../stage-ten-content'
import { buildStageTenModel, date10, money10 } from '../stage-ten-model'
import { buildWorkerStageTenRuntime } from '../stage-ten-runtime'

jest.mock('expo-image', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { Image: (props: Record<string, unknown>) => React.createElement(View, props) }
})

const settledLedger = (overrides: Record<string, unknown> = {}) => ({
  entry_type: 'worker_credit',
  job_id: 'job-1',
  payment_state: 'available',
  recorded_at: '2026-09-14T08:00:00.000Z',
  worker_net: 180000,
  ...overrides,
})

describe('Stage 10 Concept B model', () => {
  it('shows the same-job available worker credit only after a closed server state', () => {
    const model = buildStageTenModel({
      jobId: 'job-1',
      ledger: [settledLedger()],
      status: 'reviewed',
    })

    expect(model.state).toBe('closed')
    expect(model.income).toMatchObject({ amount: 180000, state: 'available' })
  })

  it.each([
    ['pending', 'pending'],
    ['on_hold', 'held'],
    ['reversed', 'reversed'],
  ] as const)('does not show a %s credit as ready income', (paymentState, expectedState) => {
    const model = buildStageTenModel({
      jobId: 'job-1',
      ledger: [settledLedger({ payment_state: paymentState })],
      status: 'paid',
    })

    expect(model.income).toMatchObject({ amount: null, state: expectedState })
  })

  it('keeps an admin-rejected credit reversed and does not treat completion submission as closure', () => {
    const rejected = buildStageTenModel({
      jobId: 'job-1',
      ledger: [settledLedger({ settlement_state: 'admin_rejected' })],
      status: 'paid',
    })
    const awaiting = buildStageTenModel({
      jobId: 'job-1',
      ledger: [settledLedger()],
      status: 'completed_by_worker',
    })

    expect(rejected.income).toMatchObject({ amount: null, state: 'reversed' })
    expect(awaiting).toMatchObject({ state: 'awaiting-confirmation', income: { amount: null } })
  })

  it('uses server-owned aggregate rating data and preserves a real performance score', () => {
    const model = buildStageTenModel({
      averageRating: 4.5,
      jobId: 'job-1',
      performanceScore: 0,
      reviewCount: 7,
      status: 'reviewed',
    })

    expect(model.rating).toMatchObject({ kind: 'average', reviewCount: 7, value: 4.5 })
    expect(model.ranking).toMatchObject({ performanceScore: 0 })
  })

  it('selects the latest closed job from the real worker job list when no active deal is hydrated', () => {
    const projection = buildWorkerStageTenRuntime({
      state: { deal: null },
      workerEarnings: { recent_transactions: [settledLedger({ job_id: 'closed-job' })] },
      workerJobs: [{
        id: 'closed-job',
        status: 'reviewed',
        service_type: 'cleaning',
        district: 'Quận 1',
        completed_at: '2026-09-14T08:32:00.000Z',
        created_at: '2026-09-14T07:00:00.000Z',
        completion_photo_urls: ['private://completion-photo'],
      }],
      workerPerformanceInsights: { average_rating: 4.5, review_count: 2, performance_score: 88 },
      workerProfile: null,
    } as never, 'vi')

    expect(projection.model).toMatchObject({
      jobId: 'closed-job',
      job: { district: 'Quận 1', title: 'Vệ sinh căn hộ' },
      income: { amount: 180000, state: 'available' },
      rating: { reviewCount: 2, value: 4.5 },
      ranking: { performanceScore: 88 },
      state: 'closed',
    })
    expect(projection.photoRef).toBe('private://completion-photo')
  })

  it('formats VND and HCMC completion time like the supplied Concept B', () => {
    expect(money10(180000, 'vi')).toBe('180.000đ')
    expect(money10(null, 'vi')).toBe('Chưa ghi nhận')
    expect(date10('2026-09-14T08:32:00.000Z', 'vi')).toEqual({
      date: 'Thứ 2, 14 Tháng 9, 2026',
      time: '15:32',
    })
  })
})

describe('StageTenContent secondary actions', () => {
  it('renders the approved summary and wires its visible actions without mutating workflow state', () => {
    const onEarnings = jest.fn()
    const onRanking = jest.fn()
    const model = buildStageTenModel({
      completedAt: '2026-09-14T08:32:00.000Z',
      district: 'Quận 1, TP.HCM',
      jobId: 'job-1',
      ledger: [settledLedger()],
      performanceScore: 88,
      serviceType: 'cleaning',
      status: 'reviewed',
    })

    render(
      React.createElement(StageTenContent, {
        actions: { onEarnings, onRanking },
        language: 'vi',
        model,
        photoSource: null,
      }),
    )

    expect(screen.queryByTestId('stage10-progress')).toBeNull()
    expect(screen.getByTestId('stage10-job-card')).toBeOnTheScreen()
    expect(screen.getByTestId('stage10-income')).toHaveTextContent('180.000đ')
    expect(screen.getByTestId('stage10-job-photo-placeholder')).toHaveTextContent('Chưa có ảnh')
    expect(screen.queryByText('Khách hàng rất hài lòng!')).toBeNull()
    expect(screen.queryByText('Tăng 3 bậc')).toBeNull()

    fireEvent.press(screen.getByTestId('worker-v5-case-closed-ranking-action'))
    fireEvent.press(screen.getByTestId('worker-v5-case-closed-earnings-action'))

    expect(onRanking).toHaveBeenCalledTimes(1)
    expect(onEarnings).toHaveBeenCalledTimes(1)
  })

  it('keeps missing runtime data honest and disables unavailable progress callbacks', () => {
    render(
      React.createElement(StageTenContent, {
        actions: {},
        language: 'vi',
        model: buildStageTenModel({ ledger: [] }),
        photoSource: null,
      }),
    )

    expect(screen.getByText('Chưa có công việc hoàn tất')).toBeOnTheScreen()
    expect(screen.getByTestId('stage10-income')).toHaveTextContent('Chưa ghi nhận')
    expect(screen.queryByTestId('stage10-progress')).toBeNull()
  })
})
