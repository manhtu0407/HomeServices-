import { render, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { jobDetailToSnapshot } from '@/lib/frontend-workflow/snapshots'
import type { JobDetailResponse } from '@/lib/api-types'
import { getCustomerThemeTokens } from '../customer-theme'
import { WorkerIdentitySummary } from '../kael-chat/worker-identity-summary'

export const PILLAR = {
  id: 'P376-worker-identity-after-match',
  invariant:
    'the worker identity block shows the same name, personal facts and track record when the customer reviews a candidate and after the match, never invents a rating for a worker with no finished jobs, and the job detail the server sends carries those facts through to the matched deal',
  authority: [
    'governance/protocols/frontend-test.md G2 (state coverage)',
  ],
  target: 'apps/mobile/components/customer/kael-chat/worker-identity-summary.tsx',
  layer: 'ui-visual',
  siblings: ['P375-quote-review-send-request'],
  mutation:
    'drop the totalJobs check on the rating — the no-history case shows a star rating and turns red; drop yearsExperience in snapshots.ts — the mapping case turns red',
} as const satisfies PillarManifest

const tokens = getCustomerThemeTokens('light')

describe(`${PILLAR.id}`, () => {
  it('shows the worker the way the candidate review does', () => {
    render(
      <WorkerIdentitySummary
        identity={{ avatarUrl: null, birthYear: 1989, displayName: 'Trần Văn Hùng', gender: 'male', rating: 4.8, totalJobs: 212, yearsExperience: 7 }}
        language="vi"
        testIDPrefix="worker-matched"
        tokens={tokens}
      />,
    )
    expect(screen.getByText('Trần Văn Hùng')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-matched-avatar-fallback')).toHaveTextContent('VH')
    expect(screen.getByTestId('worker-matched-personal-facts')).toHaveTextContent('Sinh năm 1989 · Nam')
    expect(screen.getByTestId('worker-matched-facts')).toHaveTextContent('4.8 ★ · 212 việc đã hoàn tất · 7 năm kinh nghiệm')
  })

  it('does not invent a rating or history for a new worker', () => {
    render(
      <WorkerIdentitySummary
        identity={{ avatarUrl: null, displayName: 'Lê Minh', rating: 5, totalJobs: 0 }}
        language="vi"
        testIDPrefix="worker-new"
        tokens={tokens}
      />,
    )
    withPillarContext(PILLAR, () => {
      expect(screen.queryByText(/★/)).toBeNull()
      expect(screen.queryByTestId('worker-new-personal-facts')).toBeNull()
      expect(screen.getByText('Chưa có lịch sử công việc đủ để hiển thị thêm.')).toBeOnTheScreen()
    }, 'a worker with no finished jobs shows no rating')
  })

  it('carries the personal facts from the job detail into the matched deal', () => {
    const detail = (worker: Record<string, unknown>) => ({
      broadcast_state: null,
      current_scope_change: null,
      job: {
        address_access: { access_profile: {}, check_in_required: true, customer_handoff_required: false, evidence_mode: 'geofence', exact_unit_released: false, identity_check_required: true, release_stage: 'area_only', worker_checked_in: false },
        address_building: 'S1.07', address_district: 'Thủ Đức', address_floor: null, address_unit: null,
        completion_notes: null, completion_photo_urls: [], created_at: '2026-10-12T02:00:00.000Z',
        customer_evidence_photo_urls: [], description: 'Khoan lắp kệ', field_evidence_photo_urls: [], final_price: null,
        id: 'b4750000-0000-4000-8000-000000000102', kael_complexity: null, kael_price_max: null, kael_price_min: null,
        kael_problem_identified: null, photo_urls: [], problem_chips: ['Khoan/lắp kệ'], scheduled_at: null,
        service_type: 'handyman', status: 'worker_matched',
      },
      matching_state: null,
      worker: { avatar_url: null, full_name: 'Trần Văn Hùng', id: 'c5860000-0000-4000-8000-000000000003', rating: 4.8, total_jobs: 212, ...worker },
    }) as unknown as JobDetailResponse

    const full = jobDetailToSnapshot(detail({ birth_year: 1989, gender: 'male', years_experience: 7 }))
    withPillarContext(PILLAR, () => {
      expect(full.workerProfile).toMatchObject({ birthYear: 1989, gender: 'male', yearsExperience: 7 })
    }, 'the matched deal keeps what the server sent')
    expect(jobDetailToSnapshot(detail({})).workerProfile).toMatchObject({ birthYear: null, gender: null, yearsExperience: null })
  })
})
