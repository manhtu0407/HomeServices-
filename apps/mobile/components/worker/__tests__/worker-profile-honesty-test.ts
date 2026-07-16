import { render, screen } from '@testing-library/react-native'
import { createElement } from 'react'
import type { EarningsResponse, WorkerPerformanceInsightsResponse, WorkerProfileResponse } from '@/lib/api-types'

import { workerV5PayoutRuleRows } from '../profile/bank-tax-model'
import { WorkerV5RecentFeedbackList } from '../profile/reviews-surfaces'
import { workerV5VerificationChecks } from '../profile/verification-model'

const approvedProfile: WorkerProfileResponse = {
  active_minutes: 0,
  avatar_url: null,
  id: 'worker-1',
  verification_status: 'approved',
  is_available: true,
  is_approved: true,
  is_suspended: false,
  service_types: ['electrical'],
  districts: ['q7'],
  home_lat: null,
  home_lng: null,
  service_radius_km: null,
  problem_specializations: [],
  years_experience: 4,
  rating: 0,
  total_jobs: 0,
  legal_name: 'Nguyen Van A',
  last_active_at: null,
  date_of_birth: null,
  gender: null,
  bank_account_masked: '****6789',
  bank_name: 'Vietcombank',
  has_cccd: true,
  has_selfie: true,
}

const earnings: EarningsResponse = {
  worker_id: 'worker-1',
  total_jobs_paid: 2,
  gross_earnings: 500_000,
  platform_fee_total: 50_000,
  net_earnings: 450_000,
  pending_payment_count: 0,
  pending_payment_amount: 0,
  daily_earnings: [],
  from_date: '2026-07-01',
  to_date: '2026-07-14',
}

describe('worker profile data honesty', () => {
  it('does not infer certificates, insurance, or identity matching from unrelated profile fields', () => {
    const checks = workerV5VerificationChecks(approvedProfile, 'vi')
    const visible = checks.map((check) => `${check.title} ${check.meta}`).join(' ')

    expect(visible).not.toMatch(/Chứng chỉ nghề|Bảo hiểm trách nhiệm|khớp tên pháp lý/i)
    expect(visible).toMatch(/Dịch vụ đăng ký|Trạng thái xét duyệt/i)
  })

  it('labels recorded earnings and unavailable payout/document rails honestly', () => {
    const rows = workerV5PayoutRuleRows(earnings, 'vi')
    const visible = rows.map((row) => `${row.title} ${row.status} ${row.meta}`).join(' ')

    expect(visible).toMatch(/Thu nhập ròng đã ghi nhận/i)
    expect(visible).toMatch(/Chuyển tiền chưa khả dụng/i)
    expect(visible).toMatch(/Chứng từ chưa khả dụng/i)
    expect(visible).not.toMatch(/Số dư có thể rút|Có thể rút/i)
  })

  it('renders the synced-review fallback in correct accented Vietnamese', () => {
    const insights: WorkerPerformanceInsightsResponse = {
      worker_id: 'worker-1',
      completed_job_count: 0,
      review_count: 2,
      average_rating: null,
      response_rate_percent: null,
      average_response_minutes: null,
      on_time_rate_percent: null,
      total_broadcast_count: 0,
      responded_broadcast_count: 0,
      accepted_broadcast_count: 0,
      scheduled_arrival_job_count: 0,
      on_time_job_count: 0,
      paid_job_count: 0,
      reconciled_earnings_vnd: null,
      work_response_review_count: 0,
      resolved_incident_case_count: 0,
      incident_rank_bonus: 0,
      performance_score: null,
      badges: [],
      performance_axes: [],
    }

    render(createElement(WorkerV5RecentFeedbackList, {
      chatIcon: { uri: 'worker-review-test-icon' },
      insights,
      language: 'vi',
      reduceTransparency: true,
    }))

    expect(screen.getByTestId('worker-v5-feedback-meta-0')).toHaveTextContent(
      'Có số lượt đánh giá nhưng chưa đồng bộ nội dung chi tiết',
    )
  })
})
