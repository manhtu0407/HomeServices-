import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import * as ReactNative from 'react-native'
import { color } from '@/design/theme'
import type { AdminViewScopeChangeDetailResponse, AdminViewSupportCaseDetailResponse } from '@/lib/api-types/admin'
import { adminControlService } from '@/lib/services'
import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P50-admin-operations-support-workspaces',
  invariant: 'Admin scope monitoring stays read-only while support preparation is capability-gated, stale-safe, manually refreshed, and isolated from source mutations; shared controls remain reachable at 200% text scale',
  authority: [
    'user-approved Admin scope-change and support-center implementation plan',
    'governance/RULES.md #8 (Production data honesty)',
    'governance/STRUCTURES.md (source workflow mutations remain behind their owner routes)',
    'governance/design/accessible-content.md (large text reflows instead of clipping)',
    'governance/design/visual-qa.md section 1 (text scale is a pillar-test axis)',
  ],
  target: 'apps/mobile/components/admin/admin-scope-change-monitor.tsx; apps/mobile/components/admin/admin-support-case-center.tsx',
  layer: 'ui-visual',
  siblings: ['P44-admin-production-sections', 'P45-admin-overview-dashboard', 'P49-admin-operations-support'],
  mutation: 'remove the operations.triage UI gate — a read-only Manager can submit internal case-preparation mutations',
} as const satisfies PillarManifest

jest.mock('@/lib/services', () => ({
  adminControlService: {
    createScopeChangeEvidenceAccess: jest.fn(),
    createSupportCaseEvidenceAccess: jest.fn(),
    getScopeChange: jest.fn(),
    getSupportCase: jest.fn(),
    listScopeChanges: jest.fn(),
    listSupportCases: jest.fn(),
    updateSupportCasePreparation: jest.fn(),
  },
}))

import { AdminScopeChangeMonitor } from '../admin-scope-change-monitor'
import { AdminSupportCaseCenter } from '../admin-support-case-center'

const scopeDetail: AdminViewScopeChangeDetailResponse = {
  evidence: [{ captured_at: '2026-08-24T08:00:00.000+07:00', evidence_id: 'evidence-1', kind: 'photo', label: 'Ảnh hiện trường' }],
  generated_at: '2026-08-25T08:00:00.000+07:00',
  original_scope: { description: 'Kiểm tra ổ cắm', price_max_vnd: 200_000, price_min_vnd: 150_000 },
  price_receipt: { schema_version: 'analysis_receipt.v1' },
  pricing: { kael_max_vnd: 320_000, kael_min_vnd: 280_000, total_max_vnd: 520_000, total_min_vnd: 430_000 },
  proposed_scope: { customer_decision_at: null, description: 'Thay ổ cắm cháy', reason: 'Phát hiện hư hỏng mới', request_timing: 'on_site', requested_at: '2026-08-24T07:30:00.000+07:00' },
  related_dispute: null,
  summary: { delta_max_vnd: 320_000, delta_min_vnd: 280_000, display_code: 'NS-SCOPE-1', job_id: 'job-1', scope_change_id: 'scope-1', service_type: 'electrical', status: 'waiting_customer_decision', updated_at: '2026-08-24T08:00:00.000+07:00' },
  timeline: [{ key: 'requested', label: 'Thợ yêu cầu đổi phạm vi', occurred_at: '2026-08-24T07:30:00.000+07:00' }],
}

const supportDetail: AdminViewSupportCaseDetailResponse = {
  abuse_signals: ['Tín hiệu tần suất liên hệ cao'],
  counterparty_statement: null,
  evidence: [],
  generated_at: '2026-08-25T09:00:00.000+07:00',
  neutral_summary: 'Khách hàng yêu cầu rà soát chất lượng công việc.',
  notes: [],
  opening_statement: 'Cần kiểm tra lại kết quả.',
  parties: [{ contact_masked: '***123', name: 'Khách hàng A', role: 'customer' }],
  preparation: {
    assigned_to: null,
    assigned_to_me: false,
    assigned_to_name: null,
    can_edit: false,
    checklist: {
      counterparty_response_reviewed_or_missing: false,
      job_timeline_reviewed: false,
      locked_evidence_reviewed: false,
      opening_request_reviewed: false,
      ready_for_next_step: false,
      scope_and_payment_reviewed: false,
    },
    status: 'new',
    updated_at: null,
    version: 0,
  },
  recorded_decision: null,
  summary: { case_id: 'dispute-1', display_code: 'NS-JOB-1', job_id: 'job-1', priority: 'high', reason_code: 'work_quality', service_type: 'electrical', source: 'dispute', source_status: 'open', type: 'dispute', updated_at: '2026-08-24T08:00:00.000+07:00' },
  timeline: [{ key: 'opened', label: 'Tranh chấp được mở', occurred_at: '2026-08-24T08:00:00.000+07:00' }],
}

function scopeList() {
  return {
    data: { counts: { approved: 1, kael_processing: 2, rejected_or_cancelled: 3, waiting_customer: 4 }, generated_at: '2026-08-25T08:00:00.000+07:00', has_more: false, next_cursor: null, records: [scopeDetail.summary] },
    status: 200,
    success: true as const,
  }
}

function supportList() {
  return {
    data: { counts: [{ count: 1, key: 'dispute' }], generated_at: '2026-08-25T09:00:00.000+07:00', has_more: false, next_cursor: null, records: [supportDetail.summary] },
    status: 200,
    success: true as const,
  }
}

function setWindowWidth(width: number, height: number, fontScale = 1) {
  ReactNative.Dimensions.set({
    screen: { fontScale, height, scale: 1, width },
    window: { fontScale, height, scale: 1, width },
  })
}

describe('Admin Operations scope and support workspaces', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(adminControlService.listScopeChanges).mockResolvedValue(scopeList())
    jest.mocked(adminControlService.getScopeChange).mockResolvedValue({ data: scopeDetail, status: 200, success: true })
    jest.mocked(adminControlService.listSupportCases).mockResolvedValue(supportList())
    jest.mocked(adminControlService.getSupportCase).mockResolvedValue({ data: supportDetail, status: 200, success: true })
  })

  afterEach(() => {
    jest.useRealTimers()
    act(() => setWindowWidth(390, 844))
  })

  it('uses the shared neutral control grammar across both Operations filter workspaces', async () => {
    const scope = render(<AdminScopeChangeMonitor language="vi" onSessionMissing={jest.fn()} />)
    await screen.findByLabelText('NS-SCOPE-1. Chờ khách quyết định')

    const scopeSelections = screen.getAllByLabelText('Tất cả')
    expect(scopeSelections).toHaveLength(3)
    expect(screen.getAllByText('✓ Tất cả')).toHaveLength(3)
    scopeSelections.forEach((selection) => {
      expect(selection.props.accessibilityState).toMatchObject({ selected: true })
      expect(selection).toHaveStyle({ backgroundColor: color.surface.base, borderColor: color.text.strong, borderWidth: 1.5, minHeight: 44 })
    })
    expect(screen.getByLabelText('Tải lại')).toHaveStyle({ backgroundColor: color.surface.base, borderColor: color.surface.strokeStrong, minHeight: 44 })
    scope.unmount()

    const support = render(<AdminSupportCaseCenter actor={{ access_level: 'operator', capabilities: ['operations.read'] }} language="vi" onSessionMissing={jest.fn()} />)
    await screen.findByLabelText('Tranh chấp. NS-JOB-1. Đang mở')

    const supportSelections = screen.getAllByLabelText('Tất cả')
    expect(supportSelections).toHaveLength(6)
    expect(screen.getAllByText('✓ Tất cả')).toHaveLength(6)
    supportSelections.forEach((selection) => {
      expect(selection.props.accessibilityState).toMatchObject({ selected: true })
      expect(selection).toHaveStyle({ backgroundColor: color.surface.base, borderColor: color.text.strong, borderWidth: 1.5, minHeight: 44 })
    })
    expect(screen.getByLabelText('Tải lại')).toHaveStyle({ backgroundColor: color.surface.base, borderColor: color.surface.strokeStrong, minHeight: 44 })
    support.unmount()
  })

  it.each([
    ['vi', 'Tất cả', 'Tải lại'],
    ['en', 'All', 'Refresh'],
  ] as const)('keeps every %s filter control reachable at 390 px and 200%% text scale', async (language, allLabel, refreshLabel) => {
    act(() => setWindowWidth(390, 844, 2))
    expect(ReactNative.Dimensions.get('window').fontScale).toBe(2)

    const scope = render(<AdminScopeChangeMonitor language={language} onSessionMissing={jest.fn()} />)
    await waitFor(() => expect(adminControlService.listScopeChanges).toHaveBeenCalled())
    expect(screen.getAllByLabelText(allLabel)).toHaveLength(3)
    expect(screen.getAllByText(`✓ ${allLabel}`)).toHaveLength(3)
    expect(screen.getByLabelText(refreshLabel)).toHaveStyle({ minHeight: 44 })
    scope.unmount()

    jest.mocked(adminControlService.listSupportCases).mockClear()
    const support = render(<AdminSupportCaseCenter actor={{ access_level: 'operator', capabilities: ['operations.read'] }} language={language} onSessionMissing={jest.fn()} />)
    await waitFor(() => expect(adminControlService.listSupportCases).toHaveBeenCalled())
    expect(screen.getAllByLabelText(allLabel)).toHaveLength(6)
    expect(screen.getAllByText(`✓ ${allLabel}`)).toHaveLength(6)
    expect(screen.getByLabelText(refreshLabel)).toHaveStyle({ minHeight: 44 })
    support.unmount()
  })

  it.each([
    [390, 844, false],
    [768, 1024, true],
    [1024, 768, true],
  ] as const)('reflows both workspaces at %i px without hiding the active detail', async (width, height, keepsListVisible) => {
    act(() => setWindowWidth(width, height))
    const scope = render(<AdminScopeChangeMonitor language="vi" onSessionMissing={jest.fn()} />)
    fireEvent.press(await screen.findByLabelText('NS-SCOPE-1. Chờ khách quyết định'))
    expect(await screen.findByText('Phạm vi gốc và đề xuất')).toBeTruthy()
    expect(Boolean(screen.queryByTestId('admin-scope-change-list'))).toBe(keepsListVisible)
    scope.unmount()

    const support = render(<AdminSupportCaseCenter actor={{ access_level: 'operator', capabilities: ['operations.read'] }} language="vi" onSessionMissing={jest.fn()} />)
    fireEvent.press(await screen.findByLabelText('Tranh chấp. NS-JOB-1. Đang mở'))
    expect(await screen.findByText('Tóm tắt ca')).toBeTruthy()
    expect(Boolean(screen.queryByTestId('admin-support-case-list'))).toBe(keepsListVisible)
    support.unmount()
  })

  it('debounces scope search for 300 ms and opens real read-only detail', async () => {
    jest.useFakeTimers()
    render(<AdminScopeChangeMonitor language="vi" onSessionMissing={jest.fn()} />)

    await act(async () => undefined)
    expect(adminControlService.listScopeChanges).toHaveBeenCalledTimes(1)
    fireEvent.changeText(screen.getByLabelText('Tìm theo mã công việc'), 'NS-SCOPE')
    act(() => { jest.advanceTimersByTime(299) })
    expect(adminControlService.listScopeChanges).toHaveBeenCalledTimes(1)
    await act(async () => { jest.advanceTimersByTime(1) })
    await waitFor(() => expect(adminControlService.listScopeChanges).toHaveBeenCalledTimes(2))

    fireEvent.press(screen.getByLabelText('NS-SCOPE-1. Chờ khách quyết định'))
    await screen.findByText('Phạm vi gốc và đề xuất')
    expect(adminControlService.getScopeChange).toHaveBeenCalledWith('scope-1')
    expect(adminControlService.updateSupportCasePreparation).not.toHaveBeenCalled()
  })

  it('keeps a Manager without operations.triage strictly read-only', async () => {
    render(<AdminSupportCaseCenter actor={{ access_level: 'operator', capabilities: ['finance.read', 'operations.read'] }} language="vi" onSessionMissing={jest.fn()} />)

    fireEvent.press(await screen.findByLabelText('Tranh chấp. NS-JOB-1. Đang mở'))
    expect(await screen.findByText('Bạn có quyền xem nhưng chưa được cấp operations.triage để chuẩn bị hồ sơ.')).toBeTruthy()
    expect(screen.queryByText('Nhận xử lý')).toBeNull()
    expect(adminControlService.updateSupportCasePreparation).not.toHaveBeenCalled()
  })

  it('keeps scope detail visible when evidence access fails', async () => {
    jest.mocked(adminControlService.createScopeChangeEvidenceAccess).mockResolvedValue({ code: 'STORAGE_ERROR', error: 'Không thể mở bằng chứng.', status: 503, success: false })
    render(<AdminScopeChangeMonitor language="vi" onSessionMissing={jest.fn()} />)

    fireEvent.press(await screen.findByLabelText('NS-SCOPE-1. Chờ khách quyết định'))
    fireEvent.press(await screen.findByText('Mở'))
    expect(await screen.findByText('Không thể mở bằng chứng.')).toBeTruthy()
    expect(screen.getByText('Phạm vi gốc và đề xuất')).toBeTruthy()
    expect(adminControlService.createScopeChangeEvidenceAccess).toHaveBeenCalledWith('scope-1', { evidence_id: 'evidence-1' })
  })

  it('lets an explicitly triage-capable Manager claim a case without resolving its source', async () => {
    jest.mocked(adminControlService.getSupportCase).mockResolvedValue({ data: { ...supportDetail, preparation: { ...supportDetail.preparation, can_edit: true } }, status: 200, success: true })
    jest.mocked(adminControlService.updateSupportCasePreparation).mockResolvedValue({ data: { ...supportDetail.preparation, assigned_to: 'operator-1', assigned_to_me: true, can_edit: true, status: 'acknowledged', version: 1 }, status: 200, success: true })
    render(<AdminSupportCaseCenter actor={{ access_level: 'operator', capabilities: ['finance.read', 'operations.read', 'operations.triage'] }} language="vi" onSessionMissing={jest.fn()} />)

    fireEvent.press(await screen.findByLabelText('Tranh chấp. NS-JOB-1. Đang mở'))
    fireEvent.press(await screen.findByText('Nhận xử lý'))
    await waitFor(() => expect(adminControlService.updateSupportCasePreparation).toHaveBeenCalledWith(
      'dispute',
      'dispute-1',
      expect.objectContaining({ assignment: 'claim', expected_version: 0, idempotency_key: expect.any(String) }),
    ))
  })

  it('reuses the same idempotency key after an ambiguous preparation retry', async () => {
    jest.mocked(adminControlService.getSupportCase).mockResolvedValue({ data: { ...supportDetail, preparation: { ...supportDetail.preparation, can_edit: true } }, status: 200, success: true })
    jest.mocked(adminControlService.updateSupportCasePreparation)
      .mockResolvedValueOnce({ code: 'NETWORK_ERROR', error: 'Mất kết nối', status: 0, success: false })
      .mockResolvedValueOnce({ data: { ...supportDetail.preparation, assigned_to: 'operator-1', assigned_to_me: true, can_edit: true, status: 'acknowledged', version: 1 }, status: 200, success: true })
    render(<AdminSupportCaseCenter actor={{ access_level: 'operator', capabilities: ['operations.read', 'operations.triage'] }} language="vi" onSessionMissing={jest.fn()} />)

    fireEvent.press(await screen.findByLabelText('Tranh chấp. NS-JOB-1. Đang mở'))
    fireEvent.press(await screen.findByText('Nhận xử lý'))
    await screen.findByText('Mất kết nối')
    expect(screen.getByText('Tóm tắt ca')).toBeTruthy()
    fireEvent.press(screen.getByText('Thử lại'))
    await waitFor(() => expect(adminControlService.updateSupportCasePreparation).toHaveBeenCalledTimes(2))

    const firstKey = jest.mocked(adminControlService.updateSupportCasePreparation).mock.calls[0]?.[2].idempotency_key
    const secondKey = jest.mocked(adminControlService.updateSupportCasePreparation).mock.calls[1]?.[2].idempotency_key
    expect(firstKey).toBeTruthy()
    expect(secondKey).toBe(firstKey)
  })

  it('contains no polling, focus reload, dispute decision, or queue-resolution call site', () => {
    withPillarContext(PILLAR, () => {
      const scopeSource = readFileSync(join(__dirname, '../admin-scope-change-monitor.tsx'), 'utf8')
      const supportSource = readFileSync(join(__dirname, '../admin-support-case-center.tsx'), 'utf8')
      const combined = `${scopeSource}\n${supportSource}`
      expect(combined).not.toMatch(/setInterval|useFocusEffect|decideDispute|resolveKaelQueue|admin\.kaelQueue\.resolve/)
      expect(supportSource).toContain("actor.capabilities.includes('operations.triage')")
      expect(scopeSource).toContain('setTimeout(() => setDebouncedQuery(nextQuery), 300)')
      expect(supportSource).toContain('setTimeout(() => setDebouncedQuery(nextQuery), 300)')
      expect(supportSource).toContain('stableClientRequestId(pendingPreparationRequest, fingerprint)')
    })
  })

  it('wires both capabilities as connected Production workspaces without reusing governance', () => {
    withPillarContext(PILLAR, () => {
      const copySource = readFileSync(join(__dirname, '../admin-sections-production-copy.ts'), 'utf8')
      const governanceSource = readFileSync(join(__dirname, '../admin-governance.tsx'), 'utf8')
      const sectionsSource = readFileSync(join(__dirname, '../admin-sections.tsx'), 'utf8')
      expect(copySource).toMatch(/operations-scope-change[\s\S]*status:\s*'connected'/)
      expect(copySource).toMatch(/operations-disputes[\s\S]*status:\s*'connected'/)
      expect(sectionsSource).toContain('<AdminScopeChangeMonitor')
      expect(sectionsSource).toContain('<AdminSupportCaseCenter')
      expect(governanceSource).not.toMatch(/dispute|listDisputes/i)
    })
  })
})
