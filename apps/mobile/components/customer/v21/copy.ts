import { type ServiceType, type LocalDealStatus } from '@nestscout/shared'
import { type AppLanguage } from '@/lib/app-language'
import { type CustomerPrimaryTab, type CustomerV21ScreenId } from './types'

type Localized<T> = Record<AppLanguage, T>

export const customerV21TabCopy: Localized<Record<CustomerPrimaryTab, string> & { kael: string }> = {
  en: {
    activity: 'Activity',
    home: 'Home',
    kael: 'Kael',
    profile: 'Profile',
    services: 'Services',
  },
  vi: {
    activity: 'Hoạt động',
    home: 'Trang chủ',
    kael: 'Kael',
    profile: 'Hồ sơ',
    services: 'Dịch vụ',
  },
}

export const customerV21ServiceCopy: Localized<Record<ServiceType, { label: string; note: string }>> = {
  en: {
    cleaning: { label: 'Home cleaning', note: 'Rooms, kitchen, bathroom' },
    electrical: { label: 'Electrical repair', note: 'Outlets, breakers, lights' },
    plumbing: { label: 'Plumbing repair', note: 'Leaks, drains, faucets' },
  },
  vi: {
    cleaning: { label: 'Vệ sinh nhà', note: 'Dọn nhà · bếp · phòng tắm' },
    electrical: { label: 'Sửa điện', note: 'Ổ cắm · cầu dao · đèn' },
    plumbing: { label: 'Sửa nước', note: 'Rò rỉ · đường ống' },
  },
}

export const customerV21StatusCopy: Localized<Record<LocalDealStatus | 'none', string>> = {
  en: {
    analyzing: 'Kael is analyzing',
    arrived: 'Worker arrived',
    awaiting_customer_confirm: 'Kael is coordinating',
    broadcasting: 'Finding worker',
    cancelled: 'Cancelled',
    completed_by_worker: 'Worker submitted completion',
    confirmed_by_customer: 'Completion confirmed',
    draft: 'Draft',
    inspecting: 'Inspecting',
    none: 'No active job',
    repairing: 'In progress',
    reviewed: 'Reviewed',
    scope_change_pending: 'Scope review',
    worker_matched: 'Worker accepted',
    worker_on_way: 'Worker en route',
  },
  vi: {
    analyzing: 'Kael đang phân tích',
    arrived: 'Thợ đã đến',
    awaiting_customer_confirm: 'Kael đang điều phối',
    broadcasting: 'Đang tìm thợ',
    cancelled: 'Đã hủy',
    completed_by_worker: 'Thợ báo hoàn tất',
    confirmed_by_customer: 'Đã xác nhận hoàn tất',
    draft: 'Nháp',
    inspecting: 'Đang kiểm tra',
    none: 'Chưa có công việc đang xử lý',
    repairing: 'Đang thực hiện',
    reviewed: 'Đã đánh giá',
    scope_change_pending: 'Đang xét đổi phạm vi',
    worker_matched: 'Thợ đã nhận',
    worker_on_way: 'Thợ đang đến',
  },
}

export const customerV21CommonCopy: Localized<{
  activeCase: string
  agenticCenter: string
  caseWork: string
  chatPlaceholder: string
  chatTitle: string
  createDraft: string
  dataPending: string
  emptyActivity: string
  emptyActivityBody: string
  emptyProfileMetric: string
  guestBody: string
  guestTitle: string
  homeSubtitle: string
  homeTitle: string
  intakeTitle: string
  mediaTitle: string
  normalChat: string
  paymentLocked: string
  profileTitle: string
  startService: string
  supportedOnly: string
}> = {
  en: {
    activeCase: 'Active work',
    agenticCenter: 'Agentic Center',
    caseWork: 'Work handling',
    chatPlaceholder: 'Describe an electrical, plumbing, or cleaning issue',
    chatTitle: 'Kael Chat',
    createDraft: 'Send draft to Kael',
    dataPending: 'Pending',
    emptyActivity: 'No active service yet',
    emptyActivityBody: 'Create a real request to start.',
    emptyProfileMetric: '0',
    guestBody: 'Sign in to continue.',
    guestTitle: 'Customer sign-in required',
    homeSubtitle: 'Kael helps you create a safe service request.',
    homeTitle: 'What needs attention today?',
    intakeTitle: 'Find and book service',
    mediaTitle: 'Media and voice intake',
    normalChat: 'Normal Chat',
    paymentLocked: 'Waiting for payment.',
    profileTitle: 'Customer profile',
    startService: 'Start service',
    supportedOnly: 'Electrical, plumbing, and home cleaning only.',
  },
  vi: {
    activeCase: 'Công việc đang xử lý',
    agenticCenter: 'Trung tâm điều phối Kael',
    caseWork: 'Xử lý công việc',
    chatPlaceholder: 'Mô tả sự cố điện, nước hoặc vệ sinh',
    chatTitle: 'Trò chuyện với Kael',
    createDraft: 'Gửi nháp cho Kael',
    dataPending: 'Chưa có',
    emptyActivity: 'Chưa có hoạt động dịch vụ',
    emptyActivityBody: 'Tạo yêu cầu thật để bắt đầu.',
    emptyProfileMetric: '0',
    guestBody: 'Đăng nhập để tiếp tục.',
    guestTitle: 'Cần đăng nhập khách hàng',
    homeSubtitle: 'Kael giúp tạo yêu cầu dịch vụ an toàn.',
    homeTitle: 'Hôm nay nhà bạn cần xử lý gì?',
    intakeTitle: 'Tìm & đặt dịch vụ',
    mediaTitle: 'Ảnh, video và ghi chú giọng nói',
    normalChat: 'Trò chuyện thường',
    paymentLocked: 'Chờ thanh toán.',
    profileTitle: 'Hồ sơ khách hàng',
    startService: 'Bắt đầu dịch vụ',
    supportedOnly: 'Chỉ hỗ trợ sửa điện, sửa nước và vệ sinh nhà.',
  },
}

export const customerV21ScreenTitles: Localized<Record<CustomerV21ScreenId, string>> = {
  en: {
    '2.1-home': 'Customer home',
    '2.2-search': 'Search and book service',
    '2.3-media': 'Media / Voice intake',
    '2.4-chat-normal': 'Kael normal chat',
    '2.5-chat-case': 'Kael work handling',
    '2.6-case-overview': 'Work overview',
    '2.7-matching': 'Matching',
    '2.8-options': 'Options',
    '2.9-quotes': 'Quote',
    '3.1-payment-review': 'Payment review',
    '3.2-payment-method': 'Payment method',
    '3.3-payment-protected': 'Protected payment',
    '2.10-location-eta': 'Location and ETA',
    '2.11-live-alert': 'Worker on the way',
    '2.12-job-accepted': 'Job accepted',
    '2.13-job-progress': 'Job in progress',
    '5.1-agentic-home': 'Agentic Center',
    '5.2-command-center': 'Active Work Command Center',
    '5.3-approval-queue': 'Approval Queue',
    '5.4-memory': 'Memory and Preferences',
    '6.1-profile-overview': 'Customer profile',
    '6.2-usage-ranking': 'Usage ranking',
    '6.3-protect-money': 'Money protection',
  },
  vi: {
    '2.1-home': 'Trang chủ khách hàng',
    '2.2-search': 'Tìm & đặt dịch vụ',
    '2.3-media': 'Ảnh, video và ghi chú giọng nói',
    '2.4-chat-normal': 'Trò chuyện thường với Kael',
    '2.5-chat-case': 'Kael xử lý công việc',
    '2.6-case-overview': 'Tổng quan công việc',
    '2.7-matching': 'Ghép thợ phù hợp',
    '2.8-options': 'Tùy chọn',
    '2.9-quotes': 'Báo giá',
    '3.1-payment-review': 'Xác nhận thanh toán',
    '3.2-payment-method': 'Phương thức thanh toán',
    '3.3-payment-protected': 'Bảo vệ thanh toán',
    '2.10-location-eta': 'Vị trí và thời gian đến',
    '2.11-live-alert': 'Thợ đang tới',
    '2.12-job-accepted': 'Đơn đã được xác nhận',
    '2.13-job-progress': 'Công việc đang diễn ra',
    '5.1-agentic-home': 'Trung tâm điều phối Kael',
    '5.2-command-center': 'Trung tâm điều phối',
    '5.3-approval-queue': 'Hàng chờ duyệt',
    '5.4-memory': 'Ghi nhớ và tùy chọn',
    '6.1-profile-overview': 'Hồ sơ khách hàng',
    '6.2-usage-ranking': 'Xếp hạng sử dụng',
    '6.3-protect-money': 'Bảo vệ đồng tiền',
  },
}
