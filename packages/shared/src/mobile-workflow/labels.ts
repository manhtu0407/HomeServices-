import type { ServiceType } from '../constants'
import type { LocalDealStatus } from './status'

export function serviceLabel(serviceType: ServiceType | null): string {
  if (serviceType === 'electrical') return 'Sửa điện'
  if (serviceType === 'plumbing') return 'Sửa nước'
  if (serviceType === 'cleaning') return 'Vệ sinh'
  if (serviceType === 'hvac') return 'Điều hòa & Không khí'
  if (serviceType === 'upholstery') return 'Sofa, nệm, rèm, thảm'
  if (serviceType === 'handyman') return 'Sửa vặt & Lắp đặt nhỏ'
  return 'Chưa chọn'
}

export function statusLabel(status: LocalDealStatus | null): string {
  if (!status) return 'Chưa có phiếu'
  const labels: Record<LocalDealStatus, string> = {
    draft: 'Nháp',
    analyzing: 'Kael đang phân tích',
    estimate_ready: 'Kael đang giải thích ước tính',
    awaiting_customer_confirm: 'Kael đang điều phối',
    broadcasting: 'Đang gửi thợ',
    worker_candidate_pending: 'Chờ bạn xác nhận thợ',
    worker_matched: 'Thợ đã nhận',
    worker_on_way: 'Thợ đang đến',
    arrived: 'Thợ đã đến',
    inspecting: 'Đang kiểm tra',
    repairing: 'Đang sửa',
    scope_change_pending: 'Kael đang xét đổi phạm vi',
    completed_by_worker: 'Thợ báo hoàn tất',
    confirmed_by_customer: 'Kael đã xác nhận hoàn tất',
    payment_pending: 'Đang chờ thanh toán',
    paid: 'Đã nhận thanh toán',
    reviewed: 'Đã đánh giá',
    cancelled: 'Đã hủy',
  }
  return Object.prototype.hasOwnProperty.call(labels, status)
    ? labels[status]
    : 'Trạng thái không hợp lệ'
}
