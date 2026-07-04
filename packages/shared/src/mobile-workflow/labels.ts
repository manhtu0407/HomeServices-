import type { ServiceType } from '../constants'
import type { LocalDealStatus } from './status'

export function serviceLabel(serviceType: ServiceType | null): string {
  if (serviceType === 'electrical') return 'Sửa điện'
  if (serviceType === 'plumbing') return 'Sửa nước'
  if (serviceType === 'cleaning') return 'Vệ sinh'
  return 'Chưa chọn'
}

export function statusLabel(status: LocalDealStatus | null): string {
  if (!status) return 'Chưa có phiếu'
  const labels: Record<LocalDealStatus, string> = {
    draft: 'Nháp',
    analyzing: 'Kael đang phân tích',
    awaiting_customer_confirm: 'Kael đang điều phối',
    broadcasting: 'Đang gửi thợ',
    worker_matched: 'Thợ đã nhận',
    worker_on_way: 'Thợ đang đến',
    arrived: 'Thợ đã đến',
    inspecting: 'Đang kiểm tra',
    repairing: 'Đang sửa',
    scope_change_pending: 'Kael đang xét đổi phạm vi',
    completed_by_worker: 'Thợ báo hoàn tất',
    confirmed_by_customer: 'Kael đã xác nhận hoàn tất',
    reviewed: 'Đã đánh giá',
    cancelled: 'Đã hủy',
  }
  return labels[status]
}
