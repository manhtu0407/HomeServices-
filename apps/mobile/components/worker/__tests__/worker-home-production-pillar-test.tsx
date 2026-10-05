import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { LocalWorkflowState } from '@nestscout/shared'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { type PillarManifest, withPillarContext } from '@/__tests__/pillar-manifest'
import type { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import type {
  EarningsResponse,
  WorkerBroadcast,
  WorkerJobListResponse,
  WorkerPerformanceInsightsResponse,
  WorkerProfileResponse,
} from '@/lib/api-types'

import { buildWorkerHomeProductionModel } from '../home/worker-home-production-model'
import { WorkerHomeProductionSurface } from '../home/worker-home-production-surface'
import type { WorkerV5Runtime } from '../worker-v5-runtime'

export const PILLAR = {
  id: 'P57-worker-home-production-absorption',
  invariant:
    'Production Worker Home absorbs the approved Elite hierarchy while preserving real availability, job, privacy, earnings, profile, and navigation contracts',
  authority: [
    'governance/structures/worker-workflow.md B2 (availability and daily activity)',
    'governance/structures/worker-workflow.md B3-B4 (coarse area before customer confirmation)',
    'governance/structures/worker-workflow.md B8 (recorded earnings only)',
    'governance/RULES.md #8 (no fake worker statistics or earnings)',
  ],
  target: 'apps/mobile/components/worker/home/worker-home-production-surface.tsx',
  layer: 'ui-visual',
  siblings: ['P55-worker-home-earnings-snapshot', 'P60-worker-home-opportunity-intake'],
  mutation:
    'import the Prototype fixture, expose an exact address for an offer, let an offer outrank active work, or derive header profile status from availability — the model/source assertions turn red',
} as const satisfies PillarManifest

function profile(patch: Partial<WorkerProfileResponse> = {}): WorkerProfileResponse {
  return {
    active_minutes: 0,
    avatar_url: null,
    bank_account_masked: '•••• 6789',
    bank_name: 'Vietcombank',
    date_of_birth: '1990-09-09',
    districts: ['quan_7'],
    gender: null,
    has_cccd: true,
    has_selfie: true,
    home_lat: null,
    home_lng: null,
    id: 'worker-production',
    is_approved: true,
    is_available: true,
    is_suspended: false,
    last_active_at: null,
    legal_name: 'Nguyễn An',
    problem_specializations: [],
    rating: 0,
    service_radius_km: null,
    service_types: ['cleaning'],
    total_jobs: 0,
    verification_status: 'approved',
    years_experience: 3,
    ...patch,
  }
}

function earnings(): EarningsResponse {
  return {
    available_balance: 420_000,
    cash_commission_collected_total: 0,
    cash_commission_due_total: 0,
    collateral_reserved_amount: 0,
    current_commission_level: 1,
    current_commission_rate_bps: 1500,
    daily_earnings: [],
    from_date: null,
    gross_earnings: 0,
    net_earnings: 0,
    on_hold_amount: 0,
    pending_payment_amount: 0,
    pending_payment_count: 0,
    platform_fee_total: 0,
    recent_transactions: [],
    to_date: null,
    total_jobs_paid: 0,
    withdrawal_reserved_amount: 0,
    withdrawn_total: 0,
    worker_id: 'worker-production',
  }
}

function activeJob(): WorkerJobListResponse['jobs'][number] {
  return {
    address_access: {
      access_profile: {},
      check_in_required: false,
      customer_handoff_required: false,
      evidence_mode: 'none',
      exact_unit_released: true,
      identity_check_required: false,
      release_stage: 'unit_released',
      worker_checked_in: true,
    },
    address_building: 'Sunrise City',
    address_floor: '12',
    address_unit: 'A-1208',
    completed_at: null,
    completion_notes: null,
    completion_photo_urls: [],
    created_at: '2026-08-30T01:00:00.000Z',
    customer_evidence_photo_urls: [],
    display_code: 'NS-001',
    district: 'quan_7',
    estimated_earning: 350_000,
    field_evidence_photo_urls: [],
    final_price: 420_000,
    gross_amount: null,
    id: 'active-job',
    matched_at: '2026-08-30T02:00:00.000Z',
    payment_code: null,
    payment_expires_at: null,
    payment_provider: null,
    payment_qr_image_url: null,
    payment_received_at: null,
    payment_status: null,
    payment_transfer_content: null,
    payment_amount_received: null,
    photo_urls: [],
    platform_fee: null,
    problem_summary: 'Vệ sinh căn hộ',
    scheduled_at: '2026-08-30T04:00:00.000Z',
    scope_summary: null,
    service_type: 'cleaning',
    status: 'arrived',
    worker_brief_guidance: null,
    worker_net: null,
  }
}

function incomingDeal(): LocalWorkflowState['deal'] {
  return {
    backendStatus: 'broadcasting',
    broadcast: {
      broadcastId: 'broadcast-1',
      estimatedEarningLabel: '280.000 - 320.000 VND',
      fullAddressLabel: null,
      fullAddressVisible: false,
      generalArea: 'Quận 7',
      jobId: 'offer-job',
      prebrief: ['Vệ sinh căn hộ'],
      problemSummary: 'Vệ sinh căn hộ',
      secondsRemaining: 45,
      serviceType: 'cleaning',
      status: 'sent',
    },
    createdAt: '2026-08-30T00:00:00.000Z',
    draft: {
      addressLabel: 'Căn A-1208, Sunrise City',
      description: 'Vệ sinh căn hộ',
      districtLabel: 'Quận 7',
      mediaCount: 2,
      problemChips: ['Vệ sinh căn hộ'],
      inferredProblemLabel: null,
      needsServiceChoice: false,
      source: 'booking',
      serviceType: 'cleaning',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    estimate: null,
    finalPrice: null,
    id: 'offer-job',
    matchingState: null,
    payment: null,
    scheduledAt: '2026-08-30T08:00:00.000Z',
    scopeChange: null,
    status: 'broadcasting',
  }
}

function incomingBroadcast(): WorkerBroadcast {
  return {
    broadcast_id: 'broadcast-1',
    district: 'quan_7',
    estimated_earning_max: 320_000,
    estimated_earning_min: 280_000,
    estimated_price_max: 400_000,
    estimated_price_min: 360_000,
    expires_at: '2026-08-30T07:00:00.000Z',
    job_id: 'offer-job',
    media_count: 2,
    original_scope_price_quote: {
      commission_level: 1,
      commission_rate_bps: 1500,
      customer_confirmation_required: true,
      customer_total: 380_000,
      evidence_summary: {
        baseline_source_count: 2,
        cap_statement: 'verified',
        confidence: 'high',
        high_trust_source_count: 2,
        market_source_count: 1,
        quorum_met: true,
      },
      expires_at: '2026-08-30T07:00:00.000Z',
      platform_fee: 57_000,
      price_source: 'verified_baseline',
      quote_id: 'quote-1',
      reference_price_max: 400_000,
      reference_price_min: 360_000,
      schema_version: 'original_scope_price_quote.v1',
      selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
      worker_confirmation_required: true,
      worker_confirmed_at: null,
      worker_net: 323_000,
    },
    problem_summary: 'Vệ sinh căn hộ',
    scheduled_at: '2026-08-30T08:00:00.000Z',
    seconds_remaining: 45,
    sent_at: '2026-08-30T03:00:00.000Z',
    service_type: 'cleaning',
    status: 'sent',
  }
}

describe('Production Worker Home absorption', () => {
  it('lets active work outrank an incoming offer and keeps released job data actionable', () => {
    const model = buildWorkerHomeProductionModel({
      broadcasts: [incomingBroadcast()],
      broadcastsError: null,
      broadcastsHydrated: true,
      deal: incomingDeal(),
      earnings: earnings(),
      earningsError: null,
      jobs: [activeJob()],
      jobsHydrated: true,
      language: 'vi',
      performanceInsights: null,
      profile: profile(),
      referenceDate: new Date('2026-08-30T05:00:00.000Z'),
    })

    withPillarContext(PILLAR, () => {
      expect(model.mode).toBe('execution')
      expect(model.featuredOpportunity).toBeNull()
      expect(model.todayJob).toMatchObject({
        id: 'active-job',
        location: expect.stringContaining('Sunrise City'),
      })
      expect(model.stats.activeJobs.value).toBe('1')
    }, 'active assigned work is the single primary operational state')
  })

  it('uses only the coarse broadcast area and verified worker earning before acceptance', () => {
    const model = buildWorkerHomeProductionModel({
      broadcasts: [incomingBroadcast()],
      broadcastsError: null,
      broadcastsHydrated: true,
      deal: incomingDeal(),
      earnings: earnings(),
      earningsError: null,
      jobs: [],
      jobsHydrated: true,
      language: 'vi',
      performanceInsights: null,
      profile: profile(),
      referenceDate: new Date('2026-08-30T05:00:00.000Z'),
    })

    expect(model.mode).toBe('market')
    expect(model.featuredOpportunity).toMatchObject({
      earningLabel: expect.stringContaining('280'),
      location: expect.stringMatching(/7/),
    })
    expect(JSON.stringify(model.featuredOpportunity)).not.toMatch(/A-1208|Sunrise City/)
  })

  it('distinguishes hydrated zero from unavailable performance data', () => {
    const model = buildWorkerHomeProductionModel({
      broadcasts: [],
      broadcastsError: null,
      broadcastsHydrated: true,
      deal: null,
      earnings: earnings(),
      earningsError: null,
      jobs: [],
      jobsHydrated: true,
      language: 'vi',
      performanceInsights: null,
      profile: profile(),
      referenceDate: new Date('2026-08-30T05:00:00.000Z'),
    })

    expect(model.stats.opportunities.value).toBe('0')
    expect(model.stats.activeJobs.value).toBe('0')
    expect(model.stats.completedJobs.value).toBeNull()
    expect(model.stats.rating.value).toBeNull()
    expect(model.profilePrompt).toMatchObject({ kind: 'verified' })
  })

  it('reports profile completeness independently from the availability toggle', () => {
    const complete = buildWorkerHomeProductionModel({
      broadcasts: [],
      broadcastsError: null,
      broadcastsHydrated: true,
      deal: null,
      earnings: earnings(),
      earningsError: null,
      jobs: [],
      jobsHydrated: true,
      language: 'vi',
      performanceInsights: null,
      profile: profile({ is_available: false }),
      referenceDate: new Date('2026-08-30T05:00:00.000Z'),
    })
    const incompleteProfiles = [
      profile({ bank_account_masked: null }),
      profile({ bank_name: null }),
      profile({ date_of_birth: null }),
      profile({ districts: [] }),
      profile({ has_cccd: false }),
      profile({ has_selfie: false }),
      profile({ legal_name: null }),
      profile({ service_types: [] }),
    ]

    withPillarContext(PILLAR, () => {
      expect(complete.statusLabel).toBe('Hồ sơ đầy đủ')
      for (const incompleteProfile of incompleteProfiles) {
        const incomplete = buildWorkerHomeProductionModel({
          broadcasts: [],
          broadcastsError: null,
          broadcastsHydrated: true,
          deal: null,
          earnings: earnings(),
          earningsError: null,
          jobs: [],
          jobsHydrated: true,
          language: 'vi',
          performanceInsights: null,
          profile: incompleteProfile,
          referenceDate: new Date('2026-08-30T05:00:00.000Z'),
        })
        expect(incomplete.statusLabel).toBe('Hồ sơ cần bổ sung')
      }
    }, 'the header reports recorded profile completeness, not whether job intake is toggled on')
  })

  it('uses recorded performance insights without deriving a decorative score', () => {
    const insights: WorkerPerformanceInsightsResponse = {
      accepted_broadcast_count: 4,
      average_rating: 4.8,
      average_response_minutes: null,
      badges: [],
      completed_job_count: 9,
      incident_rank_bonus: 0,
      on_time_job_count: 0,
      on_time_rate_percent: null,
      paid_job_count: 8,
      performance_axes: [],
      performance_score: null,
      reconciled_earnings_vnd: null,
      responded_broadcast_count: 4,
      response_rate_percent: null,
      review_count: 6,
      scheduled_arrival_job_count: 0,
      total_broadcast_count: 4,
      work_response_review_count: 0,
      worker_id: 'worker-production',
      resolved_incident_case_count: 0,
    }
    const model = buildWorkerHomeProductionModel({
      broadcasts: [],
      broadcastsError: null,
      broadcastsHydrated: true,
      deal: null,
      earnings: earnings(),
      earningsError: null,
      jobs: [],
      jobsHydrated: true,
      language: 'vi',
      performanceInsights: insights,
      profile: profile(),
      referenceDate: new Date('2026-08-30T05:00:00.000Z'),
    })

    expect(model.stats.completedJobs.value).toBe('9')
    expect(model.stats.rating.value).toBe('4.8')
    expect(JSON.stringify(model)).not.toMatch(/85%|best match|health score/i)
  })

  it('keeps Production independent from Prototype fixtures and removes the old visual shell', () => {
    const productionSource = readFileSync(resolve(__dirname, '../home/worker-home-production-surface.tsx'), 'utf8')
    const earningsSource = readFileSync(resolve(__dirname, '../home/worker-home-production-earnings-card.tsx'), 'utf8')
    const profileSource = readFileSync(resolve(__dirname, '../profile/production-overview-surfaces.tsx'), 'utf8')
    const workerAssetsSource = readFileSync(resolve(__dirname, '../ui/worker-v5-icon-assets.ts'), 'utf8')
    const flowSource = readFileSync(resolve(__dirname, '../worker-v5-flow.tsx'), 'utf8')

    expect(productionSource).not.toMatch(/prototypes|workerHomeData|Prototype · dữ liệu minh họa/)
    expect(productionSource).toContain('workerV5CapturedIconAssets.homeWorkerHero')
    expect(productionSource).not.toContain('workerV5CapturedIconAssets.homeQuickSkillsArea')
    expect(workerAssetsSource).toContain("homeWorkerHero: require('@/assets/worker-image-icons/home-worker-hero-workart.png')")
    expect(flowSource).toContain("from './home/worker-home-production-surface'")
    expect(flowSource).not.toContain('WorkerHomeRebuildSurface')
    expect(flowSource).toContain('headerState.usesEarningsOverviewHandoff || headerState.usesOpportunityInboxHandoff || headerState.usesTravelHandoff ? null')
    expect(profileSource).not.toContain('styles.screenTitle')
    expect(profileSource).not.toContain('`${testIDPrefix}-title`')
    expect(productionSource).toContain('Math.min(Math.max(width - 34, 0), 394)')
    expect(productionSource).toContain("safeAreaLight: { backgroundColor: '#FFFFFF' }")
    expect(productionSource).not.toMatch(/surface: \{[^}]*backgroundColor/)
    expect(productionSource).not.toMatch(/surface: \{[^}]*borderRadius/)
    expect(productionSource).toMatch(/header: \{[^}]*height: 55[^}]*paddingLeft: 8[^}]*paddingRight: 11/)
    expect(productionSource).toMatch(/heroActions: \{[^}]*height: 29/)
    expect(productionSource).toMatch(/stats: \{[^}]*height: 72[^}]*marginTop: 7/)
    expect(productionSource).toMatch(/quickActions: \{[^}]*height: 62[^}]*marginTop: 7/)
    expect(productionSource).toMatch(/opportunityList: \{[^}]*flexDirection: 'row'[^}]*height: 80[^}]*marginHorizontal: 11/)
    expect(productionSource).toMatch(/scheduleCard: \{[^}]*height: 46[^}]*marginHorizontal: 11/)
    expect(productionSource).toMatch(/sectionHeader: \{[^}]*height: 19[^}]*marginBottom: 4/)
    expect(productionSource).toContain(').slice(0, 2)')
    expect(earningsSource).toMatch(/card: \{[^}]*marginHorizontal: 11[^}]*marginTop: 9/)
    expect(earningsSource).toMatch(/periodHeader: \{[^}]*minHeight: 44/)
  })

  it('does not render the profile-setup availability row before a worker is approved', () => {
    const runtime = {
      actions: {
        workerRefresh: jest.fn().mockResolvedValue(true),
        workerUpdateAvailability: jest.fn().mockResolvedValue(true),
      },
      state: { deal: null },
      workerEarnings: null,
      workerEarningsError: null,
      workerJobs: [],
      workerJobsHydrated: true,
      workerPerformanceInsights: null,
      workerProfile: null,
    } as unknown as WorkerV5Runtime

    render(
      <WorkerHomeProductionSurface
        avatarUploadBusy={false}
        glass={{ reduceMotion: true, reduceTransparency: true } as ReturnType<typeof useGlassAccessibility>}
        language="vi"
        minHeight={620}
        onOpenEarnings={jest.fn()}
        onPickAvatar={jest.fn()}
        openScreen={jest.fn()}
        runtime={runtime}
        surfaceStyle={{}}
        themeMode="light"
        workerKey="worker-production"
      />,
    )

    expect(screen.queryByTestId('worker-v5-availability-card')).toBeNull()
  })

  it('updates the visible header automatically when the hydrated profile becomes complete', () => {
    const surfaceProps = {
      avatarUploadBusy: false,
      glass: { reduceMotion: true, reduceTransparency: true } as ReturnType<typeof useGlassAccessibility>,
      language: 'vi' as const,
      minHeight: 620,
      onOpenEarnings: jest.fn(),
      onPickAvatar: jest.fn(),
      openScreen: jest.fn(),
      surfaceStyle: {},
      themeMode: 'light' as const,
      workerKey: 'worker-production',
    }
    const runtime = (workerProfile: WorkerProfileResponse) => ({
      actions: {
        workerRefresh: jest.fn().mockResolvedValue(true),
        workerUpdateAvailability: jest.fn().mockResolvedValue(true),
      },
      state: { deal: null },
      workerEarnings: earnings(),
      workerEarningsError: null,
      workerJobs: [],
      workerJobsHydrated: true,
      workerPerformanceInsights: null,
      workerProfile,
    } as unknown as WorkerV5Runtime)
    const { rerender } = render(
      <WorkerHomeProductionSurface {...surfaceProps} runtime={runtime(profile({ districts: [] }))} />,
    )

    expect(screen.getByTestId('worker-home-production-profile-status')).toHaveTextContent('Hồ sơ cần bổ sung')
    rerender(<WorkerHomeProductionSurface {...surfaceProps} runtime={runtime(profile())} />)
    expect(screen.getByTestId('worker-home-production-profile-status')).toHaveTextContent('Hồ sơ đầy đủ')
  })

  it('keeps the real availability action and specialist route handoffs wired', async () => {
    const openScreen = jest.fn()
    const onOpenEarnings = jest.fn()
    const workerUpdateAvailability = jest.fn().mockResolvedValue(true)
    const workerRefresh = jest.fn().mockResolvedValue(true)
    const runtime = {
      actions: {
        workerRefresh,
        workerUpdateAvailability,
      },
      state: { deal: null },
      workerEarnings: earnings(),
      workerEarningsError: null,
      workerJobs: [],
      workerJobsHydrated: true,
      workerPerformanceInsights: null,
      workerProfile: profile(),
    } as unknown as WorkerV5Runtime
    const glass = {
      reduceMotion: true,
      reduceTransparency: true,
    } as ReturnType<typeof useGlassAccessibility>

    render(
      <WorkerHomeProductionSurface
        avatarUploadBusy={false}
        glass={glass}
        language="vi"
        minHeight={620}
        onOpenEarnings={onOpenEarnings}
        onPickAvatar={jest.fn()}
        openScreen={openScreen}
        runtime={runtime}
        surfaceStyle={{}}
        themeMode="light"
        workerKey="worker-production"
      />,
    )

    expect(screen.getByTestId('worker-home-production-surface')).toBeOnTheScreen()
    expect(screen.getByText('Hồ sơ đầy đủ')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-home-production-header')).toHaveStyle({ height: 55, paddingLeft: 8, paddingRight: 11 })
    expect(screen.getByText(/^Hello, /)).toBeOnTheScreen()
    expect(screen.queryByText(/^Xin chào/)).toBeNull()
    expect(screen.getByTestId('worker-home-production-hero')).toHaveStyle({ height: 133, marginHorizontal: 11 })
    expect(screen.getByTestId('worker-home-production-availability-slot')).toHaveStyle({ marginHorizontal: 11, marginTop: 10 })
    expect(screen.getByTestId('worker-home-production-income')).toHaveStyle({ marginHorizontal: 11, marginTop: 9 })
    expect(screen.getByTestId('worker-home-production-stats')).toHaveStyle({ height: 72, marginHorizontal: 11, marginTop: 7 })
    expect(screen.getByTestId('worker-home-production-quick-actions')).toHaveStyle({ height: 62, marginHorizontal: 11, marginTop: 7 })
    expect(screen.getByTestId('worker-home-production-opportunities')).toHaveStyle({ marginTop: 10 })
    expect(screen.getByTestId('worker-home-production-schedule')).toHaveStyle({ marginTop: 12 })
    expect(screen.getByTestId('worker-home-production-profile-prompt')).toHaveStyle({ height: 32, marginHorizontal: 11, marginTop: 6 })
    expect(screen.getByTestId('worker-v5-availability-switch')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-availability-switch'))
    await waitFor(() => expect(workerUpdateAvailability).toHaveBeenCalledWith(false))

    fireEvent.press(screen.getByTestId('worker-home-production-action-jobs'))
    expect(openScreen).toHaveBeenLastCalledWith(expect.objectContaining({ id: '2.1-opportunity-inbox' }))

    fireEvent.press(screen.getByTestId('worker-home-production-income-open'))
    expect(onOpenEarnings).toHaveBeenCalledWith('month')

    fireEvent.press(screen.getByTestId('worker-home-production-action-profile'))
    expect(openScreen).toHaveBeenLastCalledWith(expect.objectContaining({ id: '5.1-profile-overview' }))
    expect(workerRefresh).not.toHaveBeenCalled()
  })
})
