import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { WorkerBroadcastsResponse, WorkerJobListResponse, WorkerProfileResponse } from '@/lib/api-types'
import { fireEvent, render, screen } from '@testing-library/react-native'
import type { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import {
  clearPendingWorkerKaelDraft,
  peekPendingWorkerKaelDraft,
  stagePendingWorkerKaelDraft,
  takePendingWorkerKaelDraft,
} from '@/lib/pending-worker-kael-draft'

import { type PillarManifest, withPillarContext } from '@/__tests__/pillar-manifest'
import { buildWorkerHomeProductionModel } from '../home/worker-home-production-model'
import { WorkerHomeProductionSurface } from '../home/worker-home-production-surface'
import type { WorkerV5Runtime } from '../worker-v5-runtime'

export const PILLAR = {
  id: 'P60-worker-home-opportunity-intake',
  invariant:
    'Worker Home keeps the complete verified broadcast list, selects exact opportunities, and hands an owner-scoped unsent draft to the matching Kael scope',
  authority: [
    'governance/structures/worker-workflow.md B2-B4 (availability, broadcast privacy, and worker choice)',
    'governance/RULES.md #8 (no fake jobs, prices, or private address disclosure)',
    'supabase/functions/mobile-api/_shared/domains/worker/broadcasts.ts (authoritative active broadcast projection)',
  ],
  target: 'apps/mobile/components/worker/home/worker-home-production-surface.tsx',
  layer: 'integration',
  siblings: ['P57-worker-home-production-absorption', 'P58-worker-kael-opportunity-intake-contract', 'P59-worker-kael-opportunity-intake-boundary'],
  mutation:
    'restore broadcasts[0], auto-send the Home draft, or route a card without selecting its broadcast — model, draft, and source guards turn red',
} as const satisfies PillarManifest

type WorkerBroadcast = WorkerBroadcastsResponse['broadcasts'][number]

function profile(): WorkerProfileResponse {
  return {
    active_minutes: 0,
    avatar_url: null,
    bank_account_masked: null,
    bank_name: null,
    date_of_birth: null,
    districts: ['quan_7'],
    gender: null,
    has_cccd: true,
    has_selfie: true,
    home_lat: null,
    home_lng: null,
    id: 'worker-opportunity',
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
  }
}

function broadcast(id: string, expiresAt: string, sentAt: string): WorkerBroadcast {
  return {
    broadcast_id: `broadcast-${id}`,
    district: 'quan_7',
    estimated_earning_max: 320_000,
    estimated_earning_min: 280_000,
    estimated_price_max: 420_000,
    estimated_price_min: 380_000,
    expires_at: expiresAt,
    job_id: `job-${id}`,
    media_count: 1,
    original_scope_price_quote: {
      commission_level: 1,
      commission_rate_bps: 1500,
      customer_confirmation_required: true,
      customer_total: 400_000,
      evidence_summary: {
        baseline_source_count: 2,
        cap_statement: 'verified',
        confidence: 'high',
        high_trust_source_count: 2,
        market_source_count: 1,
        quorum_met: true,
      },
      expires_at: expiresAt,
      platform_fee: 60_000,
      price_source: 'verified_baseline',
      quote_id: `quote-${id}`,
      reference_price_max: 420_000,
      reference_price_min: 380_000,
      schema_version: 'original_scope_price_quote.v1',
      selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
      worker_confirmation_required: true,
      worker_confirmed_at: null,
      worker_net: 340_000,
    },
    problem_summary: `Công việc ${id}`,
    scheduled_at: '2026-08-30T09:00:00.000Z',
    seconds_remaining: 600,
    sent_at: sentAt,
    service_type: 'cleaning',
    status: 'sent',
  }
}

function job(id: string, scheduledAt: string): WorkerJobListResponse['jobs'][number] {
  return {
    address_access: {
      access_profile: {},
      check_in_required: false,
      customer_handoff_required: false,
      evidence_mode: 'none',
      exact_unit_released: false,
      identity_check_required: false,
      release_stage: 'area_only',
      worker_checked_in: false,
    },
    address_building: null,
    address_floor: null,
    address_unit: null,
    completed_at: null,
    completion_notes: null,
    completion_photo_urls: [],
    created_at: '2026-08-30T01:00:00.000Z',
    customer_evidence_photo_urls: [],
    display_code: id,
    district: 'quan_7',
    estimated_earning: 300_000,
    field_evidence_photo_urls: [],
    final_price: 400_000,
    gross_amount: null,
    id,
    matched_at: '2026-08-30T02:00:00.000Z',
    payment_amount_received: null,
    payment_code: null,
    payment_expires_at: null,
    payment_provider: null,
    payment_qr_image_url: null,
    payment_received_at: null,
    payment_status: null,
    payment_transfer_content: null,
    photo_urls: [],
    platform_fee: null,
    problem_summary: 'Vệ sinh căn hộ',
    scheduled_at: scheduledAt,
    scope_summary: null,
    service_type: 'cleaning',
    status: 'worker_matched',
    worker_brief_guidance: null,
    worker_net: null,
  }
}

describe('Worker Home opportunity intake', () => {
  afterEach(() => clearPendingWorkerKaelDraft())

  it('sorts verified opportunities by expiry and exposes no more than two Home cards', () => {
    const referenceDate = new Date('2026-08-30T05:00:00.000Z')
    const model = buildWorkerHomeProductionModel({
      broadcasts: [
        broadcast('late', '2026-08-30T08:00:00.000Z', '2026-08-30T03:00:00.000Z'),
        broadcast('expired', '2026-08-30T04:00:00.000Z', '2026-08-30T03:30:00.000Z'),
        broadcast('first', '2026-08-30T06:00:00.000Z', '2026-08-30T02:00:00.000Z'),
        broadcast('second', '2026-08-30T07:00:00.000Z', '2026-08-30T04:00:00.000Z'),
      ],
      broadcastsError: null,
      broadcastsHydrated: true,
      deal: null,
      earnings: null,
      earningsError: null,
      jobs: [],
      jobsHydrated: true,
      language: 'vi',
      performanceInsights: null,
      profile: profile(),
      referenceDate,
    })

    withPillarContext(PILLAR, () => {
      expect(model.featuredOpportunity?.id).toBe('job-first')
      expect(model.secondaryOpportunities.map((item) => item.id)).toEqual(['job-second'])
      expect(model.stats.opportunities.value).toBe('3')
    }, 'Home derives a bounded view without throwing away the cached list')
  })

  it('keeps tomorrow execution authoritative without labeling it as today', () => {
    const model = buildWorkerHomeProductionModel({
      broadcasts: [],
      broadcastsError: null,
      broadcastsHydrated: true,
      deal: null,
      earnings: null,
      earningsError: null,
      jobs: [job('tomorrow', '2026-08-31T03:00:00.000Z')],
      jobsHydrated: true,
      language: 'vi',
      performanceInsights: null,
      profile: profile(),
      referenceDate: new Date('2026-08-30T05:00:00.000Z'),
    })

    expect(model.mode).toBe('execution')
    expect(model.executionJob?.id).toBe('tomorrow')
    expect(model.todayJob).toBeNull()
  })

  it('isolates unsent drafts by owner, mode, scope, length, and TTL', () => {
    expect(stagePendingWorkerKaelDraft('worker-a', {
      message: 'Tìm việc vệ sinh tại Quận 7',
      mode: 'intake',
      scope: 'opportunity',
    }, 1_000)).toBe(true)
    expect(peekPendingWorkerKaelDraft('worker-b', 'intake', 'opportunity', 1_001)).toBeNull()
    expect(peekPendingWorkerKaelDraft('worker-a', 'normal', 'normal', 1_001)).toBeNull()
    expect(peekPendingWorkerKaelDraft('worker-a', 'intake', 'opportunity', 1_001)?.message).toBe('Tìm việc vệ sinh tại Quận 7')
    expect(takePendingWorkerKaelDraft('worker-a', 'intake', 'opportunity', 1_001)?.message).toBe('Tìm việc vệ sinh tại Quận 7')
    expect(peekPendingWorkerKaelDraft('worker-a', 'intake', 'opportunity', 1_002)).toBeNull()
    expect(stagePendingWorkerKaelDraft('worker-a', {
      message: 'x'.repeat(1_201),
      mode: 'intake',
      scope: 'opportunity',
    }, 2_000)).toBe(false)
    expect(stagePendingWorkerKaelDraft('worker-a', {
      message: 'Tìm việc',
      mode: 'intake',
      scope: 'opportunity',
    }, 3_000)).toBe(true)
    expect(peekPendingWorkerKaelDraft('worker-a', 'intake', 'opportunity', 303_000)).toBeNull()
  })

  it('stages an opportunity draft from Home without creating a session or sending a turn', () => {
    const openScreen = jest.fn()
    const workerRefresh = jest.fn().mockResolvedValue(true)
    const runtime = {
      actions: {
        workerRefresh,
        workerSelectBroadcast: jest.fn(),
        workerUpdateAvailability: jest.fn().mockResolvedValue(true),
      },
      state: { deal: null },
      workerBroadcasts: [],
      workerBroadcastsError: null,
      workerBroadcastsHydrated: true,
      workerEarnings: null,
      workerEarningsError: null,
      workerJobs: [],
      workerJobsHydrated: true,
      workerPerformanceInsights: null,
      workerProfile: profile(),
    } as unknown as WorkerV5Runtime

    render(
      <WorkerHomeProductionSurface
        avatarUploadBusy={false}
        glass={{ reduceMotion: true, reduceTransparency: true } as ReturnType<typeof useGlassAccessibility>}
        language="vi"
        minHeight={620}
        onOpenEarnings={jest.fn()}
        onPickAvatar={jest.fn()}
        openScreen={openScreen}
        runtime={runtime}
        surfaceStyle={{}}
        themeMode="light"
        workerKey="worker-a"
      />,
    )

    fireEvent.changeText(screen.getByTestId('worker-home-production-kael-search-input'), 'Tìm việc vệ sinh tại Quận 7')
    fireEvent.press(screen.getByTestId('worker-home-production-kael-search-submit'))

    expect(peekPendingWorkerKaelDraft('worker-a', 'intake', 'opportunity')).toMatchObject({
      message: 'Tìm việc vệ sinh tại Quận 7',
      mode: 'intake',
      scope: 'opportunity',
    })
    expect(openScreen).toHaveBeenCalledWith(expect.objectContaining({ id: '3.2-kael-job-intake' }))
    expect(workerRefresh).not.toHaveBeenCalled()
  })

  it('keeps Home search, exact selection, and composer handoff free of direct workflow mutations', () => {
    const homeSource = readFileSync(resolve(__dirname, '../home/worker-home-production-surface.tsx'), 'utf8')
    const providerSource = readFileSync(resolve(__dirname, '../../../lib/frontend-workflow/use-worker-board-actions.ts'), 'utf8')
    const inboxSource = readFileSync(resolve(__dirname, '../jobs/worker-jobs-zip-prototype-early-stages.tsx'), 'utf8')
    const composerSource = readFileSync(resolve(__dirname, '../chat/orb-screen-surfaces.tsx'), 'utf8')

    expect(homeSource).toContain('<TextInput')
    expect(homeSource).toContain('stagePendingWorkerKaelDraft')
    expect(homeSource).toContain('workerSelectBroadcast')
    expect(homeSource).not.toContain('workerAcceptBroadcast')
    expect(providerSource).toContain('const nextBroadcasts = broadcasts.success ? broadcasts.data.broadcasts')
    expect(providerSource).toContain('broadcasts: nextBroadcasts')
    expect(providerSource).toContain('workerRefreshRequestIdRef.current === workerRefreshRequestId')
    expect(providerSource).toContain('broadcasts.success ? broadcasts.data.broadcasts : currentBroadcasts')
    expect(homeSource).toContain('worker-home-production-kael-search-submit')
    expect(inboxSource).toContain('inboxBroadcasts.map')
    expect(inboxSource).toContain('workerSelectBroadcast')
    expect(composerSource).toContain('takePendingWorkerKaelDraft')
    expect(composerSource).toContain("mediaEnabled={hasJobIntakeScope || mode === 'normal'}")
    expect(composerSource).toContain('if (!sent) return')
    expect(composerSource).not.toMatch(/autoSend|send\(pending/i)
  })
})
