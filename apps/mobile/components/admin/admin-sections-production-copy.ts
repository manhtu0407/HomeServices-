import type { AppLanguage } from '@/lib/app-language'

import type { AdminProductionSectionId } from './admin-sections-production-registry'

export type AdminProductionCapabilityStatus = 'connected' | 'partial' | 'missing'

export type AdminProductionCapabilityId =
  | 'operations-job-monitor'
  | 'operations-service-transactions'
  | 'operations-scope-change'
  | 'operations-disputes'
  | 'workers-applications'
  | 'workers-profile-review'
  | 'workers-access'
  | 'workers-finance'
  | 'finance-overview'
  | 'finance-reconciliation'
  | 'finance-payouts'
  | 'finance-tax'
  | 'team-directory'
  | 'team-provisioning'
  | 'team-capabilities'
  | 'team-access-audit'
  | 'system-price-baseline'
  | 'system-taxonomy'
  | 'system-learning-rules'
  | 'system-model-health'

export type AdminProductionCapability = {
  id: AdminProductionCapabilityId
  ownerOnly?: boolean
  status: AdminProductionCapabilityStatus
  title: string
  useWhen: string
}

export type AdminProductionWorkstream = {
  capabilityIds: readonly AdminProductionCapabilityId[]
  id: string
  title: string
}

export type AdminProductionSectionPresentation = {
  capabilities: readonly AdminProductionCapability[]
  id: AdminProductionSectionId
  label: string
  shortLabel: string
  startHere: string
  workstreams: readonly AdminProductionWorkstream[]
}

type AdminProductionPresentationCopy = {
  audience: string
  close: string
  columns: {
    capability: string
    description: string
    status: string
  }
  detailTitle: string
  navigationLabel: string
  ownerOnly: string
  searchLabel: string
  searchPlaceholder: string
  sections: readonly AdminProductionSectionPresentation[]
  startHere: string
  status: Record<AdminProductionCapabilityStatus, string>
  unavailable: string
}

const viSections: readonly AdminProductionSectionPresentation[] = [
  {
    id: 'overview',
    label: 'Tổng quan',
    shortLabel: 'Tổng quan',
    startHere: 'Đọc sức khỏe doanh nghiệp theo dữ liệu Production.',
    workstreams: [],
    capabilities: [],
  },
  {
    id: 'operations',
    label: 'Vận hành',
    shortLabel: 'Vận hành',
    startHere: 'Kiểm tra công việc trước, rồi xử lý ngoại lệ.',
    workstreams: [
      { id: 'monitoring', title: 'Theo dõi vận hành', capabilityIds: ['operations-job-monitor', 'operations-service-transactions'] },
      { id: 'exceptions', title: 'Ngoại lệ & hỗ trợ', capabilityIds: ['operations-scope-change', 'operations-disputes'] },
    ],
    capabilities: [
      { id: 'operations-job-monitor', title: 'Giám sát công việc', useWhen: 'Theo dõi công việc chậm hoặc kẹt trạng thái.', status: 'partial' },
      { id: 'operations-service-transactions', title: 'Giao dịch dịch vụ', useWhen: 'Tra cứu giao dịch và lịch sử xử lý.', status: 'connected' },
      { id: 'operations-scope-change', title: 'Giám sát đổi phạm vi', useWhen: 'Theo dõi phạm vi gốc, đề xuất, giá và quyết định của khách.', status: 'connected' },
      { id: 'operations-disputes', title: 'Hỗ trợ & tranh chấp', useWhen: 'Rà soát evidence và chuẩn bị hồ sơ nội bộ; không phán quyết.', status: 'connected' },
    ],
  },
  {
    id: 'workers',
    label: 'Đối tác thợ',
    shortLabel: 'Thợ',
    startHere: 'Duyệt hồ sơ trước khi thay đổi quyền truy cập.',
    workstreams: [
      { id: 'onboarding', title: 'Hồ sơ & xác minh', capabilityIds: ['workers-applications', 'workers-profile-review'] },
      { id: 'access', title: 'Quyền & tài chính', capabilityIds: ['workers-access', 'workers-finance'] },
    ],
    capabilities: [
      { id: 'workers-applications', title: 'Hồ sơ đăng ký', useWhen: 'Duyệt, yêu cầu bổ sung hoặc từ chối hồ sơ mới.', status: 'connected' },
      { id: 'workers-profile-review', title: 'Xét duyệt hồ sơ', useWhen: 'Kiểm tra giấy tờ, dịch vụ và lịch sử xét duyệt.', status: 'connected' },
      { id: 'workers-access', title: 'Trạng thái truy cập', useWhen: 'Cho phép, tạm ngưng hoặc khôi phục hoạt động.', status: 'connected' },
      { id: 'workers-finance', title: 'Tài chính liên quan', useWhen: 'Xem tình trạng tài chính để xử lý hỗ trợ.', status: 'connected' },
    ],
  },
  {
    id: 'finance',
    label: 'Tài chính',
    shortLabel: 'Tài chính',
    startHere: 'Ưu tiên đối soát và chi trả trước khi xem báo cáo tổng hợp.',
    workstreams: [
      { id: 'settlement', title: 'Đối soát & chi trả', capabilityIds: ['finance-reconciliation', 'finance-payouts'] },
      { id: 'cashflow', title: 'Tổng hợp & báo cáo', capabilityIds: ['finance-overview', 'finance-tax'] },
    ],
    capabilities: [
      { id: 'finance-reconciliation', title: 'Đối soát thanh toán', useWhen: 'Nhận xử lý, rà soát rồi ghi nhận kết quả đối soát.', status: 'connected' },
      { id: 'finance-payouts', title: 'Chi trả & rút tiền', useWhen: 'Xác minh và ghi nhận kết quả chuyển tiền thủ công bên ngoài.', status: 'connected' },
      { id: 'finance-overview', title: 'Tổng quan dòng tiền', useWhen: 'Đọc kết quả, hoa hồng và sổ giao dịch đã ghi nhận.', status: 'connected' },
      { id: 'finance-tax', title: 'Thuế & báo cáo', useWhen: 'Quản lý chính sách, kỳ báo cáo và dữ liệu xuất.', status: 'connected' },
    ],
  },
  {
    id: 'team',
    label: 'Đội ngũ & quyền',
    shortLabel: 'Đội ngũ',
    startHere: 'Kiểm tra quyền hiện tại trước khi thay đổi tài khoản.',
    workstreams: [
      { id: 'operators', title: 'Nhân sự quản trị', capabilityIds: ['team-directory', 'team-provisioning'] },
      { id: 'permissions', title: 'Phạm vi quyền', capabilityIds: ['team-capabilities', 'team-access-audit'] },
    ],
    capabilities: [
      { id: 'team-directory', title: 'Danh sách quản trị viên', useWhen: 'Xem ai đang vận hành và quyền hiện tại.', status: 'connected' },
      { id: 'team-provisioning', title: 'Tạo & khôi phục tài khoản', useWhen: 'Tạo hoặc khôi phục tài khoản quản trị.', status: 'connected', ownerOnly: true },
      { id: 'team-capabilities', title: 'Điều chỉnh phạm vi quyền', useWhen: 'Cấp, thay đổi hoặc thu hồi quyền quản lý.', status: 'connected', ownerOnly: true },
      { id: 'team-access-audit', title: 'Kiểm tra quyền truy cập', useWhen: 'Kiểm tra một vai trò có thể đọc hoặc thao tác ở đâu.', status: 'connected' },
    ],
  },
  {
    id: 'system',
    label: 'Hệ thống & Kael',
    shortLabel: 'Hệ thống',
    startHere: 'Kiểm tra dữ liệu nền trước các công cụ Kael.',
    workstreams: [
      { id: 'foundations', title: 'Dữ liệu nền tảng', capabilityIds: ['system-price-baseline', 'system-taxonomy'] },
      { id: 'kael', title: 'Kael & giám sát', capabilityIds: ['system-learning-rules', 'system-model-health'] },
    ],
    capabilities: [
      { id: 'system-price-baseline', title: 'Dữ liệu giá tham chiếu', useWhen: 'Kiểm tra mức giá hệ thống đang dùng.', status: 'connected' },
      { id: 'system-taxonomy', title: 'Cấu trúc dịch vụ', useWhen: 'Đọc cấu trúc sáu dịch vụ và nhóm vấn đề Production.', status: 'connected' },
      { id: 'system-learning-rules', title: 'Quy tắc học của Kael', useWhen: 'Kiểm tra nguồn gốc và trạng thái quy tắc Kael.', status: 'connected' },
      { id: 'system-model-health', title: 'Tình trạng mô hình', useWhen: 'Điều tra chi phí, lỗi và dự phòng Kael đã ghi nhận.', status: 'connected' },
    ],
  },
]

const enSections: readonly AdminProductionSectionPresentation[] = [
  {
    id: 'overview', label: 'Overview', shortLabel: 'Overview', startHere: 'Read business health from Production data.',
    workstreams: [],
    capabilities: [],
  },
  {
    id: 'operations', label: 'Operations', shortLabel: 'Operations', startHere: 'Check jobs first, then handle exceptions.',
    workstreams: [
      { id: 'monitoring', title: 'Operational monitoring', capabilityIds: ['operations-job-monitor', 'operations-service-transactions'] },
      { id: 'exceptions', title: 'Exceptions and support', capabilityIds: ['operations-scope-change', 'operations-disputes'] },
    ],
    capabilities: [
      { id: 'operations-job-monitor', title: 'Job monitor', useWhen: 'Track slow jobs or stuck workflow states.', status: 'partial' },
      { id: 'operations-service-transactions', title: 'Service transactions', useWhen: 'Find a transaction and its handling history.', status: 'connected' },
      { id: 'operations-scope-change', title: 'Scope change monitor', useWhen: 'Monitor original scope, proposals, pricing and customer decisions.', status: 'connected' },
      { id: 'operations-disputes', title: 'Support and disputes', useWhen: 'Review evidence and prepare internal case files; no adjudication.', status: 'connected' },
    ],
  },
  {
    id: 'workers', label: 'Worker partners', shortLabel: 'Workers', startHere: 'Review the profile before changing access.',
    workstreams: [
      { id: 'onboarding', title: 'Applications and verification', capabilityIds: ['workers-applications', 'workers-profile-review'] },
      { id: 'access', title: 'Access and finance', capabilityIds: ['workers-access', 'workers-finance'] },
    ],
    capabilities: [
      { id: 'workers-applications', title: 'Worker applications', useWhen: 'Approve, request changes or reject a new application.', status: 'connected' },
      { id: 'workers-profile-review', title: 'Profile review', useWhen: 'Review documents, services and decision history.', status: 'connected' },
      { id: 'workers-access', title: 'Access status', useWhen: 'Activate, suspend or reinstate a worker partner.', status: 'connected' },
      { id: 'workers-finance', title: 'Related finance', useWhen: 'Review financial context for support.', status: 'connected' },
    ],
  },
  {
    id: 'finance', label: 'Finance', shortLabel: 'Finance', startHere: 'Prioritize reconciliation and payouts before aggregate reporting.',
    workstreams: [
      { id: 'settlement', title: 'Reconciliation and payouts', capabilityIds: ['finance-reconciliation', 'finance-payouts'] },
      { id: 'cashflow', title: 'Summary and reporting', capabilityIds: ['finance-overview', 'finance-tax'] },
    ],
    capabilities: [
      { id: 'finance-reconciliation', title: 'Payment reconciliation', useWhen: 'Claim, review and record a reconciliation outcome.', status: 'connected' },
      { id: 'finance-payouts', title: 'Payouts and withdrawals', useWhen: 'Verify and record an external manual transfer outcome.', status: 'connected' },
      { id: 'finance-overview', title: 'Cash overview', useWhen: 'Review recorded results, commission and ledger activity.', status: 'connected' },
      { id: 'finance-tax', title: 'Tax and reports', useWhen: 'Manage policies, reporting periods and exported data.', status: 'connected' },
    ],
  },
  {
    id: 'team', label: 'Team and access', shortLabel: 'Team', startHere: 'Review current access before changing an account.',
    workstreams: [
      { id: 'operators', title: 'Admin operators', capabilityIds: ['team-directory', 'team-provisioning'] },
      { id: 'permissions', title: 'Access scope', capabilityIds: ['team-capabilities', 'team-access-audit'] },
    ],
    capabilities: [
      { id: 'team-directory', title: 'Admin directory', useWhen: 'See who operates the system and their current access.', status: 'connected' },
      { id: 'team-provisioning', title: 'Provision and reset operator', useWhen: 'Create or recover an Admin account.', status: 'connected', ownerOnly: true },
      { id: 'team-capabilities', title: 'Capability editor', useWhen: 'Grant, change or revoke manager access.', status: 'connected', ownerOnly: true },
      { id: 'team-access-audit', title: 'Access review', useWhen: 'Check where a role may read or operate.', status: 'connected' },
    ],
  },
  {
    id: 'system', label: 'System and Kael', shortLabel: 'System', startHere: 'Review foundation data before Kael controls.',
    workstreams: [
      { id: 'foundations', title: 'System foundations', capabilityIds: ['system-price-baseline', 'system-taxonomy'] },
      { id: 'kael', title: 'Kael and monitoring', capabilityIds: ['system-learning-rules', 'system-model-health'] },
    ],
    capabilities: [
      { id: 'system-price-baseline', title: 'Price baselines', useWhen: 'Inspect the reference prices used by the system.', status: 'connected' },
      { id: 'system-taxonomy', title: 'Service taxonomy', useWhen: 'Read the six Production services and their problem groups.', status: 'connected' },
      { id: 'system-learning-rules', title: 'Kael learning rules', useWhen: 'Inspect the source and state of a Kael rule.', status: 'connected' },
      { id: 'system-model-health', title: 'Model health', useWhen: 'Investigate recorded Kael cost, failures and fallback use.', status: 'connected' },
    ],
  },
]

export const adminProductionPresentationCopy: Record<AppLanguage, AdminProductionPresentationCopy> = {
  vi: {
    audience: 'Chủ hệ thống · Quản lý',
    close: 'Đóng',
    columns: { capability: 'Chức năng', description: 'Mục đích', status: 'Trạng thái' },
    detailTitle: 'Chi tiết chức năng',
    navigationLabel: 'Khu vực quản trị',
    ownerOnly: 'Chỉ chủ hệ thống',
    searchLabel: 'Tìm trong khu vực',
    searchPlaceholder: 'Tìm theo việc cần làm',
    sections: viSections,
    startHere: 'Ưu tiên',
    status: { connected: 'Sẵn sàng', missing: 'Chưa có', partial: 'Hạn chế' },
    unavailable: 'Chức năng này chưa có giao diện Production được kết nối. Không có thao tác hoặc dữ liệu giả được hiển thị.',
  },
  en: {
    audience: 'Owner · Manager',
    close: 'Close',
    columns: { capability: 'Capability', description: 'Purpose', status: 'Status' },
    detailTitle: 'Capability detail',
    navigationLabel: 'Admin areas',
    ownerOnly: 'Owner only',
    searchLabel: 'Search this section',
    searchPlaceholder: 'Search by task',
    sections: enSections,
    startHere: 'Priority',
    status: { connected: 'Ready', missing: 'Unavailable', partial: 'Limited' },
    unavailable: 'No Production interface is connected for this capability. No fabricated action or data is shown.',
  },
}

export function findAdminProductionSection(language: AppLanguage, sectionId: AdminProductionSectionId) {
  return adminProductionPresentationCopy[language].sections.find((section) => section.id === sectionId)
    ?? adminProductionPresentationCopy[language].sections[0]
}

export function findAdminProductionCapability(language: AppLanguage, capabilityId: AdminProductionCapabilityId | null) {
  if (!capabilityId) return null
  for (const section of adminProductionPresentationCopy[language].sections) {
    const capability = section.capabilities.find((item) => item.id === capabilityId)
    if (capability) return capability
  }
  return null
}
