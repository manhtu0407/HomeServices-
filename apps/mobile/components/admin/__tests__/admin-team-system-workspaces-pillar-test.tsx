import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import * as ReactNative from 'react-native'
import { StyleSheet } from 'react-native'

import { type PillarManifest, withPillarContext } from '@/__tests__/pillar-manifest'
import type { AdminViewSubAdminSummary } from '@/lib/api-types/admin'
import { adminControlService } from '@/lib/services'

export const PILLAR = {
  id: 'P54-admin-team-system-workspaces',
  invariant:
    'Team and four dedicated System capabilities render list-detail-review flows in one sheet with semantic controls, honest data quality and capability-gated mutations',
  authority: [
    'user-approved Team and System implementation plan',
    'governance/design/screen-recipes.md (list to detail in one sheet)',
    'governance/design/accessible-content.md (large text reflows without clipping)',
  ],
  target: 'apps/mobile/components/admin/admin-team-workspace.tsx; apps/mobile/components/admin/admin-system-workspace.tsx',
  layer: 'ui-visual',
  siblings: ['P44-admin-production-sections', 'P50-admin-operations-support-workspaces', 'P52-admin-finance-focused-capabilities'],
  mutation:
    'restore the generic System workspace, a nested Modal, or an ungated mutation — the source and interaction assertions turn red',
} as const satisfies PillarManifest

const root = resolve(__dirname, '../../../')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')

function setWindowWidth(width: number, height: number, fontScale = 1) {
  ReactNative.Dimensions.set({
    screen: { fontScale, height, scale: 1, width },
    window: { fontScale, height, scale: 1, width },
  })
}

function pressableStyle(testId: string) {
  const node = screen.getByTestId(testId)
  const style = typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style
  return StyleSheet.flatten(style)
}

jest.mock('@/lib/services', () => ({
  adminControlService: {
    getSystemTaxonomy: jest.fn(),
    getSystemTaxonomyDetail: jest.fn(),
    listSystemLearningRules: jest.fn(),
    listSystemModelHealth: jest.fn(),
    listSystemPriceBaselines: jest.fn(),
    getSystemLearningRule: jest.fn(),
    getSystemModelHealthDetail: jest.fn(),
    getSystemPriceBaseline: jest.fn(),
    listSystemEvidencePackages: jest.fn(),
    validateSystemPriceBaseline: jest.fn(),
    publishSystemPriceBaseline: jest.fn(),
    retireSystemPriceBaseline: jest.fn(),
    validateSystemTaxonomy: jest.fn(),
    updateSystemTaxonomy: jest.fn(),
    previewSystemLearningAction: jest.fn(),
    applySystemLearningAction: jest.fn(),
    nominateManager: jest.fn(),
    provisionOperator: jest.fn(),
    resetPendingOperatorPassword: jest.fn(),
    searchSubAdminAccounts: jest.fn(),
    setSubAdminAccess: jest.fn(),
  },
}))

import { AdminSystemWorkspace } from '../admin-system-workspace'
import { AdminTeamWorkspace } from '../admin-team-workspace'

const member: AdminViewSubAdminSummary = {
  baseline_role: 'customer' as const,
  capabilities: ['finance.read', 'team.read'],
  full_name: 'Quản lý QA',
  granted_at: '2026-08-25T08:00:00.000Z',
  last_activity_at: '2026-08-26T08:00:00.000Z',
  phone_masked: '•••• 4422',
  status: 'active' as const,
  updated_at: '2026-08-26T08:00:00.000Z',
  user_id: 'manager-1',
  version: 4,
}

const revokedMember = {
  ...member,
  full_name: 'Quản lý đã thu hồi',
  status: 'revoked' as const,
  user_id: 'manager-revoked',
}

describe('Admin Team and System focused workspaces', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(adminControlService.getSystemTaxonomy).mockResolvedValue({
      data: {
        data_quality: 'partial',
        generated_at: '2026-08-26T09:00:00.000Z',
        has_more: false,
        next_cursor: null,
        next_offset: null,
        records: [{
          active_problem_count: 1,
          data_quality: 'partial',
          id: 'category-1',
          inactive_problem_count: 0,
          label_en: 'Electrical repair',
          label_vi: 'Sửa điện',
          quote_ready_problem_count: 1,
          revision: 1,
          service_type: 'electrical',
          slug: 'electrical',
          updated_at: '2026-08-26T08:00:00.000Z',
        }],
        summary: { active_problem_count: 1, canonical_service_count: 6, inactive_problem_count: 0, missing_baseline_count: 0 },
      },
      status: 200,
      success: true,
    })
    jest.mocked(adminControlService.getSystemTaxonomyDetail).mockResolvedValue({
      data: {
        available_actions: [],
        data_quality: 'partial',
        generated_at: '2026-08-26T09:00:00.000Z',
        history: [],
        permission: 'read',
        record: {
          active_problem_count: 1,
          data_quality: 'partial',
          id: 'category-1',
          inactive_problem_count: 0,
          label_en: 'Electrical repair',
          label_vi: 'Sửa điện',
          problems: [{ default_complexity: 'small', id: 'problem-1', is_active: true, label_en: 'Power loss', label_vi: 'Mất điện', quote_ready: true, reference_count: 0, slug: 'power_loss', sort_order: 1, updated_at: '2026-08-26T08:00:00.000Z' }],
          quote_ready_problem_count: 1,
          revision: 1,
          service_type: 'electrical',
          slug: 'electrical',
          updated_at: '2026-08-26T08:00:00.000Z',
        },
        version: 1,
      },
      status: 200,
      success: true,
    })
    jest.mocked(adminControlService.validateSystemTaxonomy).mockResolvedValue({
      data: {
        after: {
          active_problem_count: 0,
          data_quality: 'partial',
          id: 'category-1',
          inactive_problem_count: 1,
          label_en: 'Electrical repair',
          label_vi: 'Sửa điện',
          quote_ready_problem_count: 1,
          revision: 1,
          service_type: 'electrical',
          slug: 'electrical',
          updated_at: '2026-08-26T08:00:00.000Z',
        },
        before: {
          active_problem_count: 1,
          data_quality: 'partial',
          id: 'category-1',
          inactive_problem_count: 0,
          label_en: 'Electrical repair',
          label_vi: 'Sửa điện',
          quote_ready_problem_count: 1,
          revision: 1,
          service_type: 'electrical',
          slug: 'electrical',
          updated_at: '2026-08-26T08:00:00.000Z',
        },
        generated_at: '2026-08-26T09:00:00.000Z',
        impact: { activated_problem_count: 0, affected_reference_count: 0, deactivated_problem_count: 1 },
        issues: [],
        valid: true,
      },
      status: 200,
      success: true,
    })
    jest.mocked(adminControlService.updateSystemTaxonomy).mockResolvedValue({
      data: { action: 'taxonomy.update', actor_id: 'owner-1', event_id: 'event-1', new_version: 2, recorded_at: '2026-08-26T09:01:00.000Z', replayed: false, resource_id: 'electrical' },
      status: 200,
      success: true,
    })
    jest.mocked(adminControlService.setSubAdminAccess).mockResolvedValue({
      data: { capabilities: ['finance.read', 'team.read'], event_id: 'f6900000-0000-4000-8000-000000000001', generated_at: '2026-08-26T09:00:00.000Z', ok: true, replayed: false, role: 'admin_operator', status: 'active', updated_at: '2026-08-26T09:00:00.000Z', user_id: 'manager-1', version: 5 },
      status: 200,
      success: true,
    })
  })

  it('uses dedicated capability workspaces without a nested Modal', () => {
    const team = read('components/admin/admin-team-workspace.tsx')
    const system = read('components/admin/admin-system-workspace.tsx')
    withPillarContext(PILLAR, () => expect(team).toContain("capability: AdminProductionCapabilityId"))
    expect(system).toContain("capability: AdminProductionCapabilityId")
    expect(team).not.toMatch(/<Modal\b|\bModal,/)
    expect(system).not.toMatch(/<Modal\b|\bModal,/)
  })

  it('keeps System mutations in dedicated review flows and Team confirmation explicit', () => {
    const team = read('components/admin/admin-team-workspace.tsx')
    const system = read('components/admin/admin-system-workspace.tsx')
    const managedSystemWorkspaces = [
      'components/admin/admin-system-price-workspace.tsx',
      'components/admin/admin-system-taxonomy-workspace.tsx',
      'components/admin/admin-system-learning-workspace.tsx',
    ].map(read).join('\n')

    expect(team).toContain('review')
    expect(team).toContain('confirm')
    expect(system).toContain('AdminSystemPriceWorkspace')
    expect(system).toContain('AdminSystemTaxonomyWorkspace')
    expect(system).toContain('AdminSystemLearningWorkspace')
    expect(system).toContain('AdminSystemModelHealthWorkspace')
    expect(system).not.toMatch(/<Modal\b|\bModal,/)
    expect(managedSystemWorkspaces).toContain("actor.capabilities.includes('system.manage')")
  })

  it('uses contextual System search placeholders instead of generic Production copy', () => {
    const controls = read('components/admin/admin-system-controls.tsx')
    const workspaces = [
      'components/admin/admin-system-price-workspace.tsx',
      'components/admin/admin-system-taxonomy-workspace.tsx',
      'components/admin/admin-system-learning-workspace.tsx',
      'components/admin/admin-system-model-health-workspace.tsx',
    ].map(read).join('\n')

    expect(controls).toContain('searchPlaceholder?: string')
    expect(workspaces).toContain('Tìm dịch vụ, vấn đề hoặc mã giá')
    expect(workspaces).toContain('Tìm dịch vụ hoặc nhóm vấn đề')
    expect(workspaces).toContain('Tìm quy tắc, phạm vi hoặc khu vực')
    expect(workspaces).toContain('Tìm nhà cung cấp, mô hình hoặc mục đích')
    expect(workspaces).not.toMatch(/Tìm (rule|provider)/)
  })

  it('keeps the four System capabilities visible to Managers', () => {
    const copy = read('components/admin/admin-sections-production-copy.ts')
    for (const capability of [
      'system-price-baseline',
      'system-taxonomy',
      'system-learning-rules',
      'system-model-health',
    ]) {
      const line = copy.split('\n').find((candidate) => candidate.includes(`id: '${capability}'`))
      expect(line).toBeDefined()
      expect(line).not.toContain('ownerOnly: true')
    }
  })

  it.each([
    ['vi', 'Tìm nhà cung cấp, mô hình hoặc mục đích', 'Mô hình được cấu hình', 'Chuyển phương án dự phòng', 'Ngắt kết nối bảo vệ', 'Sự cố'],
    ['en', 'Search provider, model, or purpose', 'Configured models', 'Fallbacks', 'Circuit', 'Incidents'],
  ] as const)('keeps model-health workflow labels in %s while preserving technical provider names', async (language, search, configured, fallback, circuit, incidents) => {
    jest.mocked(adminControlService.listSystemModelHealth).mockResolvedValue({
      success: true, status: 200, data: {
        generated_at: '2026-09-05T08:00:00Z', data_quality: 'partial',
        data_quality_sources: { inventory: 'partial', calls: 'partial', latency: 'partial', costs: 'partial', circuits: 'partial' },
        summary: { configured_count: 1, call_count: null, failure_count: null, fallback_count: null, open_circuit_count: null, total_cost_usd: null },
        inventory: [{ detail_key: 'model-1', configured: true, provider: 'OpenAI', model: 'test-model', purpose: 'normal_chat' }],
        records: [], has_more: false, next_cursor: null, next_offset: null,
      },
    })
    render(<AdminSystemWorkspace actor={{ access_level: 'operator', capabilities: ['system.read'] }} capability="system-model-health" language={language} />)
    expect(await screen.findByLabelText(search)).toBeTruthy()
    expect(screen.getByText(configured)).toBeTruthy()
    expect(screen.getByText(fallback)).toBeTruthy()
    expect(await screen.findByText('OpenAI · test-model')).toBeTruthy()
    expect(screen.getByText(language === 'vi' ? 'Trò chuyện thường' : 'Normal chat')).toBeTruthy()
    fireEvent.press(screen.getByText(incidents))
    expect(await screen.findByText(circuit)).toBeTruthy()
    if (language === 'vi') {
      expect(screen.queryByText(/\b(Circuit|Fallback|Workspace|scrub|Model|provider)\b/)).toBeNull()
    } else {
      expect(screen.queryByText('Mô hình được cấu hình')).toBeNull()
      expect(screen.queryByText('Ngắt kết nối bảo vệ')).toBeNull()
    }
  })

  it('lets a Manager inspect Production taxonomy detail without exposing a mutation', async () => {
    render(<AdminSystemWorkspace actor={{ access_level: 'operator', capabilities: ['system.read'] }} capability="system-taxonomy" language="vi" />)

    expect(screen.getByLabelText('Tìm dịch vụ hoặc nhóm vấn đề')).toBeTruthy()
    fireEvent.press(await screen.findByLabelText('Sửa điện. 1 Nhóm vấn đề đang áp dụng'))
    expect(await screen.findByTestId('admin-system-detail')).toBeTruthy()
    expect(screen.getByText('Mất điện')).toBeTruthy()
    withPillarContext(PILLAR, () => expect(adminControlService.getSystemTaxonomy).toHaveBeenCalledTimes(1))
    expect(adminControlService.setSubAdminAccess).not.toHaveBeenCalled()
  })

  it('requires review before a system.manage actor can apply a taxonomy change', async () => {
    render(<AdminSystemWorkspace actor={{ access_level: 'owner', capabilities: ['system.read', 'system.manage'] }} capability="system-taxonomy" language="vi" />)

    fireEvent.press(await screen.findByLabelText('Sửa điện. 1 Nhóm vấn đề đang áp dụng'))
    fireEvent.press(await screen.findByText('Ngừng áp dụng'))
    fireEvent.changeText(screen.getByLabelText('Lý do thay đổi'), 'Ngừng nhóm vấn đề không còn dùng')
    fireEvent.press(screen.getByText('Rà soát thay đổi'))

    await waitFor(() => expect(adminControlService.validateSystemTaxonomy).toHaveBeenCalledWith('electrical', expect.objectContaining({
      client_request_id: expect.any(String),
      expected_revision: 1,
      problem_changes: [{ action: 'deactivate', id: 'problem-1' }],
      reason: 'Ngừng nhóm vấn đề không còn dùng',
    })))
    expect(adminControlService.updateSystemTaxonomy).not.toHaveBeenCalled()

    fireEvent.press(await screen.findByText('Xác nhận'))
    await waitFor(() => expect(adminControlService.updateSystemTaxonomy).toHaveBeenCalledWith('electrical', expect.objectContaining({
      client_request_id: expect.any(String),
      expected_revision: 1,
      problem_changes: [{ action: 'deactivate', id: 'problem-1' }],
      reason: 'Ngừng nhóm vấn đề không còn dùng',
    })))
  })

  it('keeps a Manager directory read-only and requires review plus confirmation for Owner access changes', async () => {
    const onRefresh = jest.fn(async () => undefined)
    const managerView = render(<AdminTeamWorkspace actor={{ access_level: 'operator', capabilities: ['finance.read', 'team.read'] }} capability="team-directory" language="vi" members={[member]} nominations={[]} onRefresh={onRefresh} pendingAccounts={[]} />)
    expect(screen.getByText('Bạn có quyền xem. Thay đổi tài khoản và quyền chỉ dành cho Chủ hệ thống.')).toBeTruthy()
    expect(adminControlService.setSubAdminAccess).not.toHaveBeenCalled()
    managerView.unmount()

    render(<AdminTeamWorkspace actor={{ access_level: 'owner', capabilities: ['finance.read', 'team.read'] }} capability="team-capabilities" language="vi" members={[member]} nominations={[]} onRefresh={onRefresh} pendingAccounts={[]} />)
    fireEvent.press(screen.getByText('Quản lý QA'))
    fireEvent.press(screen.getByText('Rà soát'))
    expect(adminControlService.setSubAdminAccess).not.toHaveBeenCalled()
    fireEvent.press(screen.getByText('Xác nhận'))
    await waitFor(() => expect(adminControlService.setSubAdminAccess).toHaveBeenCalledWith('manager-1', expect.objectContaining({ action: 'update', capabilities: ['finance.read', 'team.read'], client_request_id: expect.any(String), expected_version: 4 })))
  })

  it('restores a revoked Manager with grant semantics after confirmation', async () => {
    const onRefresh = jest.fn(async () => undefined)
    render(<AdminTeamWorkspace actor={{ access_level: 'owner', capabilities: ['finance.read', 'team.read'] }} capability="team-capabilities" language="vi" members={[revokedMember]} nominations={[]} onRefresh={onRefresh} pendingAccounts={[]} />)

    fireEvent.press(screen.getByText('Quản lý đã thu hồi'))
    fireEvent.press(screen.getByText('Rà soát'))
    expect(adminControlService.setSubAdminAccess).not.toHaveBeenCalled()
    fireEvent.press(screen.getByText('Xác nhận'))
    await waitFor(() => expect(adminControlService.setSubAdminAccess).toHaveBeenCalledWith('manager-revoked', expect.objectContaining({ action: 'grant', capabilities: ['finance.read', 'team.read'], client_request_id: expect.any(String), expected_version: 4 })))
  })

  it('keeps one sheet heading and reflows provisioning actions at compact width with 200% text', () => {
    act(() => setWindowWidth(390, 844, 2))
    const view = render(<AdminTeamWorkspace actor={{ access_level: 'owner', capabilities: ['team.read'] }} capability="team-provisioning" language="vi" members={[]} nominations={[]} onRefresh={jest.fn(async () => undefined)} pendingAccounts={[]} />)

    expect(screen.queryByText('Tạo & khôi phục tài khoản')).toBeNull()
    expect(StyleSheet.flatten(screen.getByTestId('admin-team-provisioning-actions').props.style)).toEqual(expect.objectContaining({ alignItems: 'stretch', flexDirection: 'column' }))
    expect(pressableStyle('admin-team-provisioning-search')).toEqual(expect.objectContaining({ width: '100%' }))
    expect(pressableStyle('admin-team-provisioning-create')).toEqual(expect.objectContaining({ width: '100%' }))

    view.unmount()
    act(() => setWindowWidth(1024, 768))
  })
})
