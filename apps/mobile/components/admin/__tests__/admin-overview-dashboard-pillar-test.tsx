import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import * as ReactNative from 'react-native'
import { StyleSheet } from 'react-native'
import type { AdminFinanceComparableMetric, AdminFinanceOverviewResponse } from '@nestscout/shared'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { customerTheme } from '@/design/theme'
import type {
  AdminViewOperationsResponse,
  AdminViewOverviewDetailKey,
  AdminViewOverviewDetailsResponse,
} from '@/lib/api-types/admin'
import { adminControlService } from '@/lib/services'

export const PILLAR = {
  id: 'P45-admin-overview-dashboard',
  invariant:
    'Admin Overview reads only Production finance and operations snapshots, keeps prior content during refresh, and never lets an older period response replace the selected period',
  authority: [
    'user-approved Admin Overview dashboard plan (read-only Production data, month default, stale-safe refresh)',
    'governance/RULES.md #8 (no fake data or silent degradation)',
    'governance/structures/admin-workflow.md (Admin monitoring visibility)',
  ],
  target: 'apps/mobile/components/admin/admin-overview-dashboard.tsx',
  layer: 'ui-visual',
  siblings: ['P34-admin-finance-bank-reference', 'P44-admin-production-sections'],
  mutation:
    'remove the finance request-id equality guard before applying a response — the stale day response replaces the newer week value',
} as const satisfies PillarManifest

let focusEffectCallback: (() => void | (() => void)) | undefined

function setWindowWidth(width: number, height: number) {
  ReactNative.Dimensions.set({
    screen: { fontScale: 1, height, scale: 1, width },
    window: { fontScale: 1, height, scale: 1, width },
  })
}

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    focusEffectCallback = callback
  },
}))

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context')
  return { ...actual, useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }
})

jest.mock('@/lib/services', () => ({
  adminControlService: {
    getFinanceOverview: jest.fn(),
    getOperations: jest.fn(),
    getOverviewDetails: jest.fn(),
  },
}))

import { AdminOverviewDashboard } from '../admin-overview-dashboard'

function comparable(
  value: number | null,
  previousValue: number | null,
  dataQuality: AdminFinanceComparableMetric['data_quality'] = 'available',
): AdminFinanceComparableMetric {
  const changeValue = value === null || previousValue === null ? null : value - previousValue
  return {
    change_percent: changeValue === null || previousValue === null || previousValue === 0 ? null : (changeValue / previousValue) * 100,
    change_value: changeValue,
    data_quality: dataQuality,
    direction: changeValue === null ? 'unavailable' : changeValue > 0 ? 'up' : changeValue < 0 ? 'down' : 'flat',
    previous_value: previousValue,
    unavailable_reason: value === null ? 'not_recorded' : null,
    value,
  }
}

function financeOverview(gmv = 12_000_000): AdminFinanceOverviewResponse {
  return {
    generated_at: '2026-08-08T07:00:00.000Z',
    preset: 'month',
    from: '2026-08-01T00:00:00.000+07:00',
    to: '2026-09-01T00:00:00.000+07:00',
    previous_from: '2026-07-01T00:00:00.000+07:00',
    previous_to: '2026-08-01T00:00:00.000+07:00',
    data_quality: 'available',
    metrics: {
      gmv_vnd: comparable(gmv, 10_000_000),
      paid_jobs: comparable(24, 20),
      average_order_value_vnd: comparable(500_000, 500_000),
      commission_accrued_vnd: comparable(1_800_000, 1_500_000),
      commission_collected_vnd: comparable(1_350_000, 1_200_000),
      commission_receivable_vnd: comparable(450_000, 300_000),
      business_kept_vnd: comparable(1_800_000, 1_500_000),
      platform_incoming_vnd: comparable(8_000_000, 7_000_000),
      payout_outflow_vnd: comparable(7_100_000, 6_400_000),
      net_cash_flow_vnd: comparable(900_000, 600_000),
      refund_completed_vnd: comparable(0, 0),
      kael_ai_cost_usd: comparable(18, 16),
      tax_estimate_vnd: comparable(180_000, 150_000),
    },
    current_balances: {
      payout_pending_vnd: { value: 0, data_quality: 'available', unavailable_reason: null },
      worker_available_vnd: { value: 0, data_quality: 'available', unavailable_reason: null },
      worker_hold_vnd: { value: 0, data_quality: 'available', unavailable_reason: null },
    },
    bank_reconciliation: {
      opening_balance_vnd: { value: null, data_quality: 'unavailable', unavailable_reason: 'not_recorded' },
      closing_balance_vnd: { value: null, data_quality: 'unavailable', unavailable_reason: 'not_recorded' },
      expected_change_vnd: { value: null, data_quality: 'unavailable', unavailable_reason: 'not_recorded' },
      actual_change_vnd: { value: null, data_quality: 'unavailable', unavailable_reason: 'not_recorded' },
      unexplained_variance_vnd: { value: null, data_quality: 'unavailable', unavailable_reason: 'not_recorded' },
    },
    trend: [
      { bucket_start: '2026-08-01T00:00:00.000+07:00', bucket_end: '2026-08-08T00:00:00.000+07:00', gmv_vnd: 4_000_000, commission_collected_vnd: 450_000, paid_jobs: 8, data_quality: 'available', unavailable_reason: null },
      { bucket_start: '2026-08-08T00:00:00.000+07:00', bucket_end: '2026-08-15T00:00:00.000+07:00', gmv_vnd: 8_000_000, commission_collected_vnd: 900_000, paid_jobs: 16, data_quality: 'available', unavailable_reason: null },
    ],
    payment_methods: [],
    services: [
      { service_type: 'electrical', gmv_vnd: 3_000_000, commission_accrued_vnd: 450_000, paid_jobs: 6, data_quality: 'available', unavailable_reason: null },
      { service_type: 'plumbing', gmv_vnd: 2_500_000, commission_accrued_vnd: 375_000, paid_jobs: 5, data_quality: 'available', unavailable_reason: null },
      { service_type: 'cleaning', gmv_vnd: 2_000_000, commission_accrued_vnd: 300_000, paid_jobs: 4, data_quality: 'available', unavailable_reason: null },
      { service_type: 'hvac', gmv_vnd: 1_800_000, commission_accrued_vnd: 270_000, paid_jobs: 4, data_quality: 'available', unavailable_reason: null },
      { service_type: 'upholstery', gmv_vnd: 1_500_000, commission_accrued_vnd: 225_000, paid_jobs: 3, data_quality: 'available', unavailable_reason: null },
      { service_type: 'handyman', gmv_vnd: 1_200_000, commission_accrued_vnd: 180_000, paid_jobs: 2, data_quality: 'available', unavailable_reason: null },
    ],
    tax_policy_ids: [],
  }
}

const operations: AdminViewOperationsResponse = {
  actor: { access_level: 'owner', capabilities: ['operations.read', 'finance.read'] },
  generated_at: '2026-08-24T09:00:00.000+07:00',
  attention: [
    { key: 'worker_applications', target_section: 'workers', count: 3 },
    { key: 'payment_attention', target_section: 'transactions', count: 2 },
    { key: 'open_disputes', target_section: 'operations', count: 1 },
  ],
  flow: [
    { status: 'broadcasting', count: 4 },
    { status: 'worker_on_way', count: 2 },
    { status: 'repairing', count: 5 },
    { status: 'payment_pending', count: 3 },
  ],
  quality: [
    { key: 'workers_in_verification', count: 6 },
    { key: 'workers_suspended', count: 2 },
  ],
  audit_events: [],
}

function successfulFinance(data = financeOverview()) {
  return { success: true, data, status: 200 } as const
}

function successfulOperations() {
  return { success: true, data: operations, status: 200 } as const
}

function overviewDetails(
  key: Extract<AdminViewOverviewDetailKey, 'coordination' | 'assigned' | 'inService' | 'finishing' | 'other'> = 'coordination',
): AdminViewOverviewDetailsResponse {
  return {
    generated_at: '2026-08-24T09:15:00.000+07:00',
    has_more: true,
    key,
    next_cursor: '5',
    oldest_updated_at: '2026-08-23T07:00:00.000+07:00',
    records: [1, 2, 3, 4, 5].map((index) => ({
      display_code: `NS-WORK-${index}`,
      job_id: `job-${index}`,
      kind: 'job' as const,
      service_type: index % 2 === 0 ? 'plumbing' as const : 'electrical' as const,
      status: index === 1 ? 'broadcasting' : 'analyzing',
      updated_at: `2026-08-23T0${index + 6}:00:00.000+07:00`,
    })),
    service_breakdown: [
      { count: 3, key: 'electrical' },
      { count: 2, key: 'plumbing' },
    ],
    status_breakdown: [
      { count: 4, key: 'broadcasting' },
      { count: 1, key: 'analyzing' },
    ],
    total_count: 5,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe('Admin Overview dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    focusEffectCallback = undefined
    setWindowWidth(390, 844)
    jest.mocked(adminControlService.getFinanceOverview).mockResolvedValue(successfulFinance())
    jest.mocked(adminControlService.getOperations).mockResolvedValue(successfulOperations())
    jest.mocked(adminControlService.getOverviewDetails).mockImplementation(async ({ key }) => ({
      data: overviewDetails(key as Parameters<typeof overviewDetails>[0]),
      status: 200,
      success: true,
    }))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders six honest Production KPIs and current operational snapshots without shortcut controls', async () => {
    render(<AdminOverviewDashboard language="vi" onSessionMissing={jest.fn()} />)

    expect(await screen.findByText('12.000.000 ₫')).toBeTruthy()
    expect([
      'gmv', 'paid-jobs', 'business-kept', 'average-order', 'net-cash-flow', 'commission-receivable',
    ].map((id) => screen.getByTestId(`admin-overview-kpi-${id}`))).toHaveLength(6)
    expect(screen.getByText('14 công việc đang hoạt động')).toBeTruthy()
    expect(within(screen.getByTestId('admin-overview-worker-workers_in_verification')).getByText('6')).toBeTruthy()
    expect(screen.queryByText('Cần chú ý')).toBeNull()
    expect(screen.getByText('Hồ sơ thợ')).toBeTruthy()
    expect(screen.getByText('Thanh toán')).toBeTruthy()
    expect(screen.getByText('Tranh chấp đang mở')).toBeTruthy()
    expect(screen.queryByTestId('admin-production-section-search')).toBeNull()
    expect(screen.queryByText('Sẵn sàng')).toBeNull()
    expect(screen.queryByText('Hạn chế')).toBeNull()
    expect(screen.getByTestId('admin-overview-range-month').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByTestId('admin-overview-kpi-gmv').props.onPress).toBeUndefined()
    expect(screen.getByTestId('admin-overview-trend').props.onPress).toBeUndefined()
    expect(screen.getByTestId('admin-overview-services').props.onPress).toBeUndefined()
    expect(adminControlService.getFinanceOverview).toHaveBeenCalledWith({ range: 'month' })
    expect(adminControlService.getOperations).toHaveBeenCalledTimes(1)
  })

  it('loads a structured five-row Production worklist only after opening a snapshot row', async () => {
    const onOpenTarget = jest.fn()
    render(<AdminOverviewDashboard language="vi" onOpenTarget={onOpenTarget} onSessionMissing={jest.fn()} />)

    await screen.findByText('12.000.000 ₫')
    expect(adminControlService.getOverviewDetails).not.toHaveBeenCalled()
    fireEvent.press(screen.getByTestId('admin-overview-operation-coordination'))

    expect(screen.getByTestId('admin-overview-detail-sheet')).toBeTruthy()
    expect(await screen.findByText('NS-WORK-1')).toBeTruthy()
    expect(screen.getByText('NS-WORK-5')).toBeTruthy()
    expect(screen.queryByText('NS-WORK-6')).toBeNull()
    expect(within(screen.getByTestId('admin-overview-detail-count')).getByText('5')).toBeTruthy()
    expect(screen.getByTestId('admin-overview-detail-status-broadcasting')).toBeTruthy()
    expect(screen.getByTestId('admin-overview-detail-service-electrical')).toBeTruthy()
    expect(adminControlService.getOverviewDetails).toHaveBeenCalledWith({ key: 'coordination', limit: 5 })

    fireEvent.press(screen.getByTestId('admin-overview-detail-view-all'))
    expect(onOpenTarget).toHaveBeenCalledWith({
      capabilityId: 'operations-job-monitor',
      detailKey: 'coordination',
      section: 'operations',
    })
    expect(screen.queryByTestId('admin-overview-detail-sheet')).toBeNull()
  })

  it('keeps a zero workflow group visible and opens its honest empty state', async () => {
    jest.mocked(adminControlService.getOperations).mockResolvedValue({
      data: { ...operations, flow: operations.flow.filter((item) => item.status !== 'repairing') },
      status: 200,
      success: true,
    })
    jest.mocked(adminControlService.getOverviewDetails).mockResolvedValue({
      data: {
        ...overviewDetails('inService'),
        oldest_updated_at: null,
        records: [],
        service_breakdown: [],
        status_breakdown: [],
        total_count: 0,
      },
      status: 200,
      success: true,
    })
    render(<AdminOverviewDashboard language="vi" onSessionMissing={jest.fn()} />)

    const row = await screen.findByTestId('admin-overview-operation-inService')
    expect(within(row).getByText('0')).toBeTruthy()
    fireEvent.press(row)

    expect(await screen.findByTestId('admin-overview-detail-empty')).toBeTruthy()
    expect(adminControlService.getOverviewDetails).toHaveBeenCalledWith({ key: 'inService', limit: 5 })
  })

  it('caches a successful detail response for the Overview session and never polls it', async () => {
    render(<AdminOverviewDashboard language="vi" onOpenTarget={jest.fn()} onSessionMissing={jest.fn()} />)
    await screen.findByText('12.000.000 ₫')

    fireEvent.press(screen.getByTestId('admin-overview-operation-coordination'))
    await screen.findByText('NS-WORK-1')
    fireEvent.press(screen.getByTestId('admin-overview-detail-close'))
    fireEvent.press(screen.getByTestId('admin-overview-operation-coordination'))
    expect(screen.getByText('NS-WORK-1')).toBeTruthy()

    jest.useFakeTimers()
    act(() => jest.advanceTimersByTime(5 * 60_000))
    expect(adminControlService.getOverviewDetails).toHaveBeenCalledTimes(1)
    jest.useRealTimers()
  })

  it('shows a permission-safe summary without requesting restricted detail data or View all', async () => {
    render(<AdminOverviewDashboard language="vi" onOpenTarget={jest.fn()} onSessionMissing={jest.fn()} />)
    await screen.findByText('12.000.000 ₫')

    fireEvent.press(screen.getByTestId('admin-overview-operation-worker_applications'))

    expect(screen.getByTestId('admin-overview-detail-permission')).toBeTruthy()
    expect(screen.queryByTestId('admin-overview-detail-view-all')).toBeNull()
    expect(adminControlService.getOverviewDetails).not.toHaveBeenCalled()
  })

  it('keeps a detail error inside the sheet and retries only after an explicit press', async () => {
    jest.mocked(adminControlService.getOverviewDetails)
      .mockResolvedValueOnce({ code: 'INTERNAL', error: 'unavailable', status: 500, success: false })
      .mockResolvedValueOnce({ data: overviewDetails('coordination'), status: 200, success: true })
    render(<AdminOverviewDashboard language="vi" onOpenTarget={jest.fn()} onSessionMissing={jest.fn()} />)
    await screen.findByText('12.000.000 ₫')

    fireEvent.press(screen.getByTestId('admin-overview-operation-coordination'))
    expect(await screen.findByTestId('admin-overview-detail-error')).toBeTruthy()
    expect(adminControlService.getOverviewDetails).toHaveBeenCalledTimes(1)

    fireEvent.press(screen.getByTestId('admin-overview-detail-retry'))
    expect(await screen.findByText('NS-WORK-1')).toBeTruthy()
    expect(adminControlService.getOverviewDetails).toHaveBeenCalledTimes(2)
  })

  it('renders a genuine zero-record detail response as an empty state', async () => {
    jest.mocked(adminControlService.getOverviewDetails).mockResolvedValue({
      data: {
        ...overviewDetails('coordination'),
        has_more: false,
        next_cursor: null,
        oldest_updated_at: null,
        records: [],
        service_breakdown: [],
        status_breakdown: [],
        total_count: 0,
      },
      status: 200,
      success: true,
    })
    render(<AdminOverviewDashboard language="vi" onOpenTarget={jest.fn()} onSessionMissing={jest.fn()} />)
    await screen.findByText('12.000.000 ₫')

    fireEvent.press(screen.getByTestId('admin-overview-operation-coordination'))

    expect(await screen.findByTestId('admin-overview-detail-empty')).toBeTruthy()
    expect(within(screen.getByTestId('admin-overview-detail-count')).getByText('0')).toBeTruthy()
  })

  it('keeps the newest panel selected when an older detail request resolves later', async () => {
    const coordination = deferred<Awaited<ReturnType<typeof adminControlService.getOverviewDetails>>>()
    const assigned = deferred<Awaited<ReturnType<typeof adminControlService.getOverviewDetails>>>()
    jest.mocked(adminControlService.getOverviewDetails)
      .mockReturnValueOnce(coordination.promise)
      .mockReturnValueOnce(assigned.promise)
    render(<AdminOverviewDashboard language="vi" onOpenTarget={jest.fn()} onSessionMissing={jest.fn()} />)
    await screen.findByText('12.000.000 ₫')

    fireEvent.press(screen.getByTestId('admin-overview-operation-coordination'))
    fireEvent.press(screen.getByTestId('admin-overview-operation-assigned'))
    assigned.resolve({ data: overviewDetails('assigned'), status: 200, success: true })
    const detailSheet = await screen.findByTestId('admin-overview-detail-sheet')
    expect(within(detailSheet).getByText('Đã nhận / đang di chuyển')).toBeTruthy()

    coordination.resolve({ data: overviewDetails('coordination'), status: 200, success: true })
    await act(async () => { await Promise.resolve() })
    expect(within(detailSheet).getByText('Đã nhận / đang di chuyển')).toBeTruthy()
    expect(within(detailSheet).queryByText('Đang điều phối')).toBeNull()
  })

  it('labels partial and unavailable Production metrics without inventing zero values', async () => {
    const data = financeOverview()
    data.metrics.business_kept_vnd = comparable(1_800_000, 1_500_000, 'partial')
    data.metrics.commission_receivable_vnd = comparable(null, null, 'unavailable')
    jest.mocked(adminControlService.getFinanceOverview).mockResolvedValue(successfulFinance(data))

    render(<AdminOverviewDashboard language="vi" onSessionMissing={jest.fn()} />)

    const businessKept = await screen.findByTestId('admin-overview-kpi-business-kept')
    const commissionReceivable = screen.getByTestId('admin-overview-kpi-commission-receivable')
    expect(within(businessKept).getByText('Dữ liệu một phần')).toBeTruthy()
    expect(within(commissionReceivable).getAllByText('Chưa ghi nhận')).toHaveLength(2)
    expect(within(commissionReceivable).queryByText('0 ₫')).toBeNull()
  })

  it('shows five newest trend buckets per page and keeps older buckets accessible', async () => {
    const data = financeOverview()
    data.trend = Array.from({ length: 12 }, (_, index) => ({
      bucket_start: `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000+07:00`,
      bucket_end: `2026-08-${String(index + 2).padStart(2, '0')}T00:00:00.000+07:00`,
      commission_collected_vnd: (index + 1) * 100,
      data_quality: 'available' as const,
      gmv_vnd: (index + 1) * 1_000,
      paid_jobs: index + 1,
      unavailable_reason: null,
    })).reverse()
    jest.mocked(adminControlService.getFinanceOverview).mockResolvedValue(successfulFinance(data))

    render(<AdminOverviewDashboard language="vi" onSessionMissing={jest.fn()} />)

    const initialRows = await screen.findAllByTestId('admin-overview-trend-row')
    expect(initialRows).toHaveLength(5)
    expect(initialRows[0].props.accessibilityLabel).toContain('8.000')
    expect(screen.getByTestId('admin-overview-trend-page-1').props.accessibilityState).toMatchObject({ selected: true })

    fireEvent.press(screen.getByTestId('admin-overview-trend-page-2'))

    const olderRows = screen.getAllByTestId('admin-overview-trend-row')
    expect(olderRows).toHaveLength(5)
    expect(olderRows[0].props.accessibilityLabel).toContain('3.000')
  })

  it('keeps snapshot rows vertical, spacious, and content-sized at every supported width', async () => {
    const onSessionMissing = jest.fn()
    const { rerender } = render(<AdminOverviewDashboard language="vi" onSessionMissing={onSessionMissing} />)
    await screen.findByText('12.000.000 ₫')

    expect(StyleSheet.flatten(screen.getByTestId('admin-overview-kpi-gmv').props.style)).toMatchObject({
      flexBasis: '46%',
      minWidth: 140,
    })
    const compactGrid = screen.getByTestId('admin-overview-current-grid')
    expect(StyleSheet.flatten(compactGrid.props.style).flexDirection).not.toBe('row')
    expect(StyleSheet.flatten(compactGrid.props.children[0].props.style).flex).toBeUndefined()
    expect(StyleSheet.flatten(compactGrid.props.children[1].props.style).flex).toBeUndefined()
    expect(StyleSheet.flatten(screen.getByTestId('admin-overview-analysis-grid').props.style).flexDirection).not.toBe('row')
    expect(StyleSheet.flatten(screen.getByTestId('admin-overview-trend').props.style).flex).toBeUndefined()
    expect(StyleSheet.flatten(screen.getByTestId('admin-overview-services').props.style).flex).toBeUndefined()
    expect(StyleSheet.flatten(screen.getByTestId('admin-overview-operations-metrics').props.style).flexDirection).not.toBe('row')
    const compactOperationsPanel = StyleSheet.flatten(screen.getByTestId('admin-overview-operations').props.style)
    const compactWorkerPanel = StyleSheet.flatten(screen.getByTestId('admin-overview-workers').props.style)
    expect(compactOperationsPanel.minHeight).toBeUndefined()
    expect(compactWorkerPanel.minHeight).toBeUndefined()
    expect(StyleSheet.flatten(screen.getByTestId('admin-overview-operation-coordination').props.style)).toMatchObject({
      minHeight: 56,
      paddingVertical: 12,
    })
    expect(StyleSheet.flatten(screen.getByTestId('admin-overview-flow-heading').props.style)).toMatchObject({
      marginBottom: 12,
    })

    act(() => setWindowWidth(768, 1024))
    rerender(<AdminOverviewDashboard language="vi" onSessionMissing={onSessionMissing} />)
    expect(StyleSheet.flatten(screen.getByTestId('admin-overview-kpi-gmv').props.style)).toMatchObject({
      flexBasis: '30%',
      minWidth: 190,
    })
    const mediumGrid = screen.getByTestId('admin-overview-current-grid')
    expect(StyleSheet.flatten(mediumGrid.props.style)).toMatchObject({ flexDirection: 'row' })
    expect(StyleSheet.flatten(mediumGrid.props.children[0].props.style)).toMatchObject({ flex: 1 })
    expect(StyleSheet.flatten(mediumGrid.props.children[1].props.style)).toMatchObject({ flex: 1 })
    expect(StyleSheet.flatten(screen.getByTestId('admin-overview-operations-metrics').props.style).flexDirection).not.toBe('row')
    expect(StyleSheet.flatten(screen.getByTestId('admin-overview-analysis-grid').props.style).flexDirection).not.toBe('row')
    expect(StyleSheet.flatten(screen.getByTestId('admin-overview-trend').props.style).flex).toBeUndefined()
    expect(StyleSheet.flatten(screen.getByTestId('admin-overview-services').props.style).flex).toBeUndefined()

    act(() => setWindowWidth(1024, 768))
    rerender(<AdminOverviewDashboard language="vi" onSessionMissing={onSessionMissing} />)
    expect(StyleSheet.flatten(screen.getByTestId('admin-overview-analysis-grid').props.style)).toMatchObject({ flexDirection: 'row' })
    expect(StyleSheet.flatten(screen.getByTestId('admin-overview-trend').props.style)).toMatchObject({ flex: 1 })
    expect(StyleSheet.flatten(screen.getByTestId('admin-overview-services').props.style)).toMatchObject({ flex: 1 })
  })

  it('uses compact worker rows with only one internal divider', async () => {
    render(<AdminOverviewDashboard language="vi" onSessionMissing={jest.fn()} />)
    await screen.findByText('12.000.000 ₫')

    const verification = StyleSheet.flatten(screen.getByTestId('admin-overview-worker-workers_in_verification').props.style)
    const suspended = StyleSheet.flatten(screen.getByTestId('admin-overview-worker-workers_suspended').props.style)
    expect(verification).toMatchObject({ alignItems: 'center', minHeight: 48 })
    expect(verification.borderBottomWidth).toBeUndefined()
    expect(suspended).toMatchObject({
      alignItems: 'center',
      borderTopWidth: StyleSheet.hairlineWidth,
      minHeight: 48,
    })
    expect(suspended.borderBottomWidth).toBeUndefined()
  })

  it('changes only Finance, keeps prior content visible, and ignores an older period response', async () => {
    render(<AdminOverviewDashboard language="vi" onSessionMissing={jest.fn()} />)
    await screen.findByText('12.000.000 ₫')

    const day = deferred<Awaited<ReturnType<typeof adminControlService.getFinanceOverview>>>()
    const week = deferred<Awaited<ReturnType<typeof adminControlService.getFinanceOverview>>>()
    jest.mocked(adminControlService.getFinanceOverview)
      .mockReturnValueOnce(day.promise)
      .mockReturnValueOnce(week.promise)

    fireEvent.press(screen.getByTestId('admin-overview-range-day'))
    expect(screen.getByText('12.000.000 ₫')).toBeTruthy()
    fireEvent.press(screen.getByTestId('admin-overview-range-week'))

    week.resolve(successfulFinance(financeOverview(20_000_000)))
    await screen.findByText('20.000.000 ₫')

    day.resolve(successfulFinance(financeOverview(5_000_000)))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    withPillarContext(PILLAR, () => {
      expect(screen.getByText('20.000.000 ₫')).toBeTruthy()
      expect(screen.queryByText('5.000.000 ₫')).toBeNull()
      expect(jest.mocked(adminControlService.getFinanceOverview).mock.calls).toEqual([
        [{ range: 'month' }],
        [{ range: 'day' }],
        [{ range: 'week' }],
      ])
      expect(adminControlService.getOperations).toHaveBeenCalledTimes(1)
    }, 'the selected week result must remain after the older day request resolves')
  })

  it('keeps Operations visible when Finance fails and marks unavailable metrics without fake zeroes', async () => {
    jest.mocked(adminControlService.getFinanceOverview).mockResolvedValue({
      success: false,
      code: 'UNAVAILABLE',
      error: 'finance unavailable',
      status: 503,
    })

    render(<AdminOverviewDashboard language="vi" onSessionMissing={jest.fn()} />)

    expect(await screen.findByText('14 công việc đang hoạt động')).toBeTruthy()
    expect(screen.getByTestId('admin-overview-finance-error')).toBeTruthy()
    expect(screen.queryByTestId('admin-overview-operations-error')).toBeNull()
    expect(screen.queryByText('0 ₫')).toBeNull()
  })

  it('uses one accessible period control and a compact retry status surface', async () => {
    jest.mocked(adminControlService.getFinanceOverview).mockResolvedValue({
      success: false,
      code: 'UNAVAILABLE',
      error: 'finance unavailable',
      status: 503,
    })

    render(<AdminOverviewDashboard language="vi" onSessionMissing={jest.fn()} />)

    const error = await screen.findByTestId('admin-overview-finance-error')
    const rangeControl = screen.getByTestId('admin-overview-range-control')
    expect(rangeControl.props.accessibilityRole).toBe('tablist')
    expect(StyleSheet.flatten(rangeControl.props.style)).toMatchObject({
      flexDirection: 'row',
      overflow: 'hidden',
    })

    const unselectedRange = screen.getByTestId('admin-overview-range-day')
    const selectedRange = screen.getByTestId('admin-overview-range-month')
    expect(selectedRange.props.accessibilityRole).toBe('tab')
    expect(selectedRange.props.accessibilityState).toMatchObject({ selected: true })
    expect(StyleSheet.flatten(selectedRange.props.style)).toMatchObject({ flex: 1, minHeight: 44 })
    expect(StyleSheet.flatten(selectedRange.props.style).backgroundColor).toBe(
      StyleSheet.flatten(unselectedRange.props.style).backgroundColor,
    )
    expect(StyleSheet.flatten(error.props.style)).toMatchObject({
      backgroundColor: customerTheme.lightLayer.base,
      flexWrap: 'wrap',
    })
    expect(StyleSheet.flatten(screen.getByTestId('admin-overview-finance-error-indicator').props.style)).toMatchObject({
      backgroundColor: customerTheme.lightLayer.danger,
    })

    fireEvent.press(screen.getByTestId('admin-overview-range-week'))
    await waitFor(() => expect(adminControlService.getFinanceOverview).toHaveBeenCalledTimes(2))
    const retry = await screen.findByTestId('admin-overview-finance-error-retry')
    expect(retry.props.accessibilityRole).toBe('button')
    expect(StyleSheet.flatten(retry.props.style).minHeight).toBeGreaterThanOrEqual(44)
    fireEvent.press(retry)
    await waitFor(() => expect(adminControlService.getFinanceOverview).toHaveBeenCalledTimes(3))
    expect(jest.mocked(adminControlService.getFinanceOverview).mock.calls).toEqual([
      [{ range: 'month' }],
      [{ range: 'week' }],
      [{ range: 'week' }],
    ])
    expect(adminControlService.getOperations).toHaveBeenCalledTimes(1)
  })

  it('keeps Finance visible when Operations fails', async () => {
    jest.mocked(adminControlService.getOperations).mockResolvedValue({
      success: false,
      code: 'UNAVAILABLE',
      error: 'operations unavailable',
      status: 503,
    })

    render(<AdminOverviewDashboard language="vi" onSessionMissing={jest.fn()} />)

    expect(await screen.findByText('12.000.000 ₫')).toBeTruthy()
    expect(screen.getByTestId('admin-overview-operations-error')).toBeTruthy()
    expect(screen.queryByTestId('admin-overview-finance-error')).toBeNull()
  })

  it('does not automatically reload Overview as time passes', async () => {
    render(<AdminOverviewDashboard language="vi" onSessionMissing={jest.fn()} />)
    await screen.findByText('12.000.000 ₫')

    const financeCalls = jest.mocked(adminControlService.getFinanceOverview).mock.calls.length
    const operationsCalls = jest.mocked(adminControlService.getOperations).mock.calls.length
    jest.useFakeTimers()
    const cleanup = focusEffectCallback?.()
    act(() => {
      jest.advanceTimersByTime(5 * 60_000)
    })

    expect(focusEffectCallback).toBeUndefined()
    expect(adminControlService.getFinanceOverview).toHaveBeenCalledTimes(financeCalls)
    expect(adminControlService.getOperations).toHaveBeenCalledTimes(operationsCalls)
    cleanup?.()
    jest.useRealTimers()
  })
})
