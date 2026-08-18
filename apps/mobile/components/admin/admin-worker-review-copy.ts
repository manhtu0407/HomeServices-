import type { AppLanguage } from '@/lib/app-language'

type WorkerReviewCopy = {
  actions: {
    approveAccess: string
    approveProfile: string
    close: string
    openDocument: string
    requestChanges: string
    retry: string
    saving: string
  }
  error: string
  field: Record<string, string>
  filter: Record<'all' | 'missing_profile' | 'pending_access' | 'ready_verification' | 'verified', string>
  group: {
    access: string
    bank: string
    checklist: string
    documents: string
    finance: string
    history: string
    login: string
    skills: string
  }
  labels: {
    account: string
    bank: string
    birthDate: string
    contact: string
    districts: string
    experience: string
    legalName: string
    radius: string
    services: string
    updated: string
  }
  missingLabel: string
  noHistory: string
  noFinance: string
  noProfile: string
  progress: (completed: number, total: number) => string
  progressLabel: string
  reasonPlaceholder: string
  stage: Record<'missing_profile' | 'pending_access' | 'ready_verification' | 'verified', string>
  success: string
}

export const workerReviewCopy: Record<AppLanguage, WorkerReviewCopy> = {
  vi: {
    actions: { approveAccess: 'Duyệt vào khu vực thợ', approveProfile: 'Xác minh hồ sơ', close: 'Đóng', openDocument: 'Mở ảnh', requestChanges: 'Yêu cầu bổ sung', retry: 'Thử lại', saving: 'Đang lưu...' },
    error: 'Không thể tải đầy đủ hồ sơ thợ. Vui lòng thử lại.',
    field: {
      bank_account: 'Số tài khoản', bank_account_number: 'Số tài khoản', bank_name: 'Ngân hàng', cccd_back: 'CCCD mặt sau', cccd_front: 'CCCD mặt trước', date_of_birth: 'Ngày sinh', districts: 'Khu vực', legal_name: 'Họ tên pháp lý', selfie: 'Ảnh chân dung', service_radius_km: 'Bán kính phục vụ', service_types: 'Dịch vụ', years_experience: 'Kinh nghiệm',
    },
    filter: { all: 'Tất cả', missing_profile: 'Cần bổ sung', pending_access: 'Chờ duyệt', ready_verification: 'Sẵn sàng xác minh', verified: 'Đã xác minh' },
    group: { access: 'Quyền truy cập', bank: 'Ngân hàng', checklist: 'Tiến độ hồ sơ', documents: 'Giấy tờ xác minh', finance: 'Tài chính của thợ', history: 'Lịch sử xét duyệt', login: 'Thông tin đăng ký', skills: 'Kỹ năng và khu vực' },
    labels: { account: 'Số tài khoản', bank: 'Ngân hàng', birthDate: 'Ngày sinh', contact: 'Liên hệ', districts: 'Khu vực', experience: 'Kinh nghiệm', legalName: 'Họ tên pháp lý', radius: 'Bán kính phục vụ', services: 'Dịch vụ', updated: 'Cập nhật' },
    missingLabel: 'Còn thiếu',
    noHistory: 'Chưa có quyết định xét duyệt.',
    noFinance: 'Chưa có quyền xem thông tin tài chính của thợ.',
    noProfile: 'Thợ chưa cung cấp thông tin hồ sơ.',
    progress: (completed, total) => `${completed}/${total} mục hoàn tất`,
    progressLabel: 'Mức độ hoàn thiện',
    reasonPlaceholder: 'Nêu rõ nội dung thợ cần bổ sung',
    stage: { missing_profile: 'Cần bổ sung', pending_access: 'Chờ duyệt quyền', ready_verification: 'Sẵn sàng xác minh', verified: 'Đã xác minh' },
    success: 'Quyết định hồ sơ đã được lưu.',
  },
  en: {
    actions: { approveAccess: 'Grant Worker access', approveProfile: 'Verify profile', close: 'Close', openDocument: 'Open image', requestChanges: 'Request changes', retry: 'Try again', saving: 'Saving...' },
    error: 'The complete worker profile could not be loaded. Please try again.',
    field: {
      bank_account: 'Account number', bank_account_number: 'Account number', bank_name: 'Bank', cccd_back: 'ID back', cccd_front: 'ID front', date_of_birth: 'Date of birth', districts: 'Service areas', legal_name: 'Legal name', selfie: 'Selfie', service_radius_km: 'Service radius', service_types: 'Services', years_experience: 'Experience',
    },
    filter: { all: 'All', missing_profile: 'Needs updates', pending_access: 'Awaiting access', ready_verification: 'Ready to verify', verified: 'Verified' },
    group: { access: 'Access', bank: 'Bank account', checklist: 'Profile progress', documents: 'Verification documents', finance: 'Worker finance', history: 'Review history', login: 'Registration details', skills: 'Skills and service areas' },
    labels: { account: 'Account number', bank: 'Bank', birthDate: 'Date of birth', contact: 'Contact', districts: 'Service areas', experience: 'Experience', legalName: 'Legal name', radius: 'Service radius', services: 'Services', updated: 'Updated' },
    missingLabel: 'Missing',
    noHistory: 'No review decision has been recorded.',
    noFinance: 'This account does not have access to worker finance data.',
    noProfile: 'The worker has not provided profile information yet.',
    progress: (completed, total) => `${completed}/${total} items complete`,
    progressLabel: 'Completion',
    reasonPlaceholder: 'Describe what the worker needs to update',
    stage: { missing_profile: 'Needs updates', pending_access: 'Awaiting access', ready_verification: 'Ready to verify', verified: 'Verified' },
    success: 'The profile decision was saved.',
  },
}
