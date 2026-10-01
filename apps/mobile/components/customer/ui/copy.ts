import { type CustomerServiceId, type ServiceType, type LocalDealStatus } from '@nestscout/shared'
import { type AppLanguage } from '@/lib/app-language'
import { type CustomerPrimaryTab } from './types'

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
    hvac: { label: 'Air conditioning & air care', note: 'Cleaning, diagnosis and repair' },
    upholstery: { label: 'Sofa, mattress, curtain & carpet care', note: 'Material, stain, odor and drying scope' },
    handyman: { label: 'Minor repairs & installation', note: 'Small task bundles, tools and materials' },
    cleaning: { label: 'Home cleaning', note: 'Rooms, kitchen, bathroom' },
    electrical: { label: 'Electrical repair', note: 'Outlets, breakers, lights' },
    plumbing: { label: 'Plumbing repair', note: 'Leaks, drains, faucets' },
  },
  vi: {
    hvac: { label: 'Điều hòa', note: 'Vệ sinh · chẩn đoán · sửa chữa' },
    upholstery: { label: 'Sofa, nệm, rèm', note: 'Chất liệu · vết bẩn · mùi · thời gian khô' },
    handyman: { label: 'Sửa vặt & Lắp đặt', note: 'Gom việc · vật tư · dụng cụ · ranh giới' },
    cleaning: { label: 'Vệ sinh nhà', note: 'Dọn nhà · bếp · phòng tắm' },
    electrical: { label: 'Sửa điện', note: 'Ổ cắm · cầu dao · đèn' },
    plumbing: { label: 'Sửa nước', note: 'Rò rỉ · đường ống' },
  },
}

type CustomerV21BookingServiceCardCopy = {
  details: readonly [string, string]
  label: string
  note: string
}

export const customerV21BookingServiceCopy: Localized<Record<CustomerServiceId, CustomerV21BookingServiceCardCopy>> = {
  en: {
    electrical: { ...customerV21ServiceCopy.en.electrical, details: ['Outlets & breakers', 'Lighting'] },
    plumbing: { ...customerV21ServiceCopy.en.plumbing, details: ['Leaks', 'Pipes'] },
    home_cleaning: { details: ['Size', 'Condition & priority'], label: 'Home cleaning', note: 'Scope by size, condition and priority areas' },
    hvac_basic_maintenance: { details: ['Cleaning & checks', 'Safety'], label: 'Air conditioning & air care', note: 'Cleaning, basic checks and safety review' },
    upholstery_care: { details: ['Material & stains', 'Odor & drying'], label: 'Sofa, mattress, curtain & carpet care', note: 'Material, stain, odor and drying scope' },
    handyman_minor_installation: { details: ['Materials & tools', 'Task boundaries'], label: 'Minor repairs & installation', note: 'Small task bundles, tools and materials' },
  },
  vi: {
    electrical: { ...customerV21ServiceCopy.vi.electrical, details: ['Ổ cắm · cầu dao', 'Đèn'] },
    plumbing: { ...customerV21ServiceCopy.vi.plumbing, details: ['Rò rỉ', 'Đường ống'] },
    home_cleaning: { details: ['Diện tích', 'Hiện trạng · ưu tiên'], label: 'Vệ sinh nhà cửa', note: 'Phạm vi theo diện tích · hiện trạng · ưu tiên' },
    hvac_basic_maintenance: { details: ['Vệ sinh · kiểm tra', 'An toàn'], label: 'Điều hòa', note: 'Vệ sinh · kiểm tra cơ bản · duyệt an toàn' },
    upholstery_care: { details: ['Chất liệu · vết bẩn', 'Mùi · khô'], label: 'Sofa, nệm, rèm', note: 'Chất liệu · vết bẩn · mùi · thời gian khô' },
    handyman_minor_installation: { details: ['Vật tư · dụng cụ', 'Ranh giới việc'], label: 'Sửa vặt & Lắp đặt', note: 'Gom việc · vật tư · dụng cụ · ranh giới' },
  },
}

export const customerV21StatusCopy: Localized<Record<LocalDealStatus | 'none', string>> = {
  en: {
    analyzing: 'Kael is analyzing',
    arrived: 'Worker arrived',
    estimate_ready: 'Kael is explaining the estimate',
    awaiting_customer_confirm: 'Kael is coordinating',
    broadcasting: 'Finding worker',
    worker_candidate_pending: 'Review worker option',
    cancelled: 'Cancelled',
    completed_by_worker: 'Worker submitted completion',
    confirmed_by_customer: 'Completion confirmed',
    payment_pending: 'Payment pending',
    paid: 'Payment received',
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
    estimate_ready: 'Kael đang giải thích ước tính',
    awaiting_customer_confirm: 'Kael đang điều phối',
    broadcasting: 'Đang tìm thợ',
    worker_candidate_pending: 'Chờ xác nhận thợ phù hợp',
    cancelled: 'Đã hủy',
    completed_by_worker: 'Thợ báo hoàn tất',
    confirmed_by_customer: 'Đã xác nhận hoàn tất',
    payment_pending: 'Đang chờ thanh toán',
    paid: 'Đã nhận thanh toán',
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
  homeActivitySection: string
  homeGuidanceSection: string
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
    caseWork: 'Work',
    chatPlaceholder: 'Briefly describe what needs handling',
    chatTitle: 'Kael Chat',
    createDraft: 'Send draft to Kael',
    dataPending: 'Pending',
    emptyActivity: 'No active service yet',
    emptyActivityBody: 'Create a real request to start.',
    emptyProfileMetric: 'Pending',
    guestBody: 'Sign in to continue.',
    guestTitle: 'Customer sign-in required',
    homeActivitySection: 'Service activity',
    homeGuidanceSection: 'How NestScout works',
    homeSubtitle: 'Kael helps you create a safe service request.',
    homeTitle: 'What needs attention today?',
    intakeTitle: 'Find and book service',
    mediaTitle: 'Media and voice intake',
    normalChat: 'Chat',
    paymentLocked: 'Waiting for payment.',
    profileTitle: 'Customer profile',
    startService: 'Start service',
    supportedOnly: 'Six home-service paths are available.',
  },
  vi: {
    activeCase: 'Công việc đang xử lý',
    // The Kael mode names stay English in Vietnamese by product decision.
    caseWork: 'Work',
    chatPlaceholder: 'Mô tả ngắn việc bạn cần xử lý',
    chatTitle: 'Trò chuyện với Kael',
    createDraft: 'Gửi nháp cho Kael',
    dataPending: 'Chưa có',
    emptyActivity: 'Chưa có hoạt động dịch vụ',
    emptyActivityBody: 'Tạo yêu cầu thật để bắt đầu.',
    emptyProfileMetric: 'Chưa có',
    guestBody: 'Đăng nhập để tiếp tục.',
    guestTitle: 'Cần đăng nhập khách hàng',
    homeActivitySection: 'Hoạt động dịch vụ',
    homeGuidanceSection: 'Quy trình dịch vụ',
    homeSubtitle: 'Kael giúp tạo yêu cầu dịch vụ an toàn.',
    homeTitle: 'Hôm nay nhà bạn cần xử lý gì?',
    intakeTitle: 'Tìm & đặt dịch vụ',
    mediaTitle: 'Ảnh, video và ghi chú giọng nói',
    normalChat: 'Chat',
    paymentLocked: 'Chờ thanh toán.',
    profileTitle: 'Hồ sơ khách hàng',
    startService: 'Bắt đầu dịch vụ',
    supportedOnly: 'Đang hỗ trợ đầy đủ 6 nhóm dịch vụ gia đình.',
  },
}

