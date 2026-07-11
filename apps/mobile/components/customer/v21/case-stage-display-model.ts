import type { ImageSourcePropType } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { LocalDeal, LocalDealEstimate, LocalDealStatus } from '@nestscout/shared'

import { customerV21Assets, customerV21ServiceAssets } from './assets'
import { customerV21CommonCopy, customerV21ServiceCopy, customerV21StatusCopy } from './copy'
import {
  agenticDealProblemLabel,
  caseDisplayCode,
  formatDurationShort,
  formatEvidenceFileCount,
  formatNumber,
  formatVnd,
  paymentProviderLabel,
  paymentStatusLabel,
  timeChoiceLabel,
} from './case-work-display-model'
import type { CustomerV21ScreenId } from './types'

export function formatKnownCount(value: number | null | undefined, language: AppLanguage) {
  if (typeof value === 'number') return formatNumber(value, language)
  return '0'
}
export function stepForStatus(status: LocalDealStatus) {
  if (status === 'draft' || status === 'analyzing' || status === 'estimate_ready' || status === 'awaiting_customer_confirm') return 1
  if (status === 'broadcasting' || status === 'worker_matched' || status === 'worker_on_way') return 2
  if (status === 'arrived' || status === 'inspecting' || status === 'repairing' || status === 'scope_change_pending') return 3
  return 4
}

export function complexitySafetyLabel(value: LocalDealEstimate['complexity'], language: AppLanguage) {
  const vi: Record<LocalDealEstimate['complexity'], string> = {
    large: 'Cần kiểm tra kỹ',
    medium: 'Cần xác nhận phạm vi',
    small: 'Rủi ro thấp',
    unknown: 'Chưa rõ rủi ro',
  }
  const en: Record<LocalDealEstimate['complexity'], string> = {
    large: 'Needs careful check',
    medium: 'Scope needs confirmation',
    small: 'Low risk',
    unknown: 'Risk pending',
  }
  return language === 'vi' ? vi[value] : en[value]
}

export function activityStatusPrimary(
  screenId: CustomerV21ScreenId,
  values: { address: string; eta: string; language: AppLanguage; status: string },
) {
  if (screenId === '2.10-location-eta') {
    return {
      body: values.language === 'vi' ? 'Địa chỉ chi tiết chỉ hiện khi cổng nhận việc thật cho phép.' : 'Full address appears only when the real accept gate allows it.',
      label: values.language === 'vi' ? 'Vị trí được phép' : 'Allowed location',
      value: values.address,
    }
  }
  if (screenId === '2.11-live-alert') {
    return {
      body: values.language === 'vi' ? 'Đếm giờ chỉ dùng tín hiệu thời gian đến thật từ hệ thống.' : 'Countdown uses only a real system ETA signal.',
      label: values.language === 'vi' ? 'Thời gian đến' : 'ETA',
      value: values.eta,
    }
  }
  if (screenId === '2.12-job-accepted') {
    return {
      body: values.language === 'vi' ? 'Xác nhận nhận việc bám theo trạng thái quy trình hiện có.' : 'Acceptance follows the current workflow state.',
      label: values.language === 'vi' ? 'Trạng thái công việc' : 'Job status',
      value: values.status,
    }
  }
  return {
    body: values.language === 'vi' ? 'Tiến độ công việc chỉ phản ánh trạng thái công việc thật.' : 'Work progress reflects only the real job state.',
    label: values.language === 'vi' ? 'Tiến độ' : 'Progress',
    value: values.status,
  }
}

export function activityStatusRows(
  screenId: CustomerV21ScreenId,
  values: {
    address: string
    completionEvidence: string
    eta: string
    language: AppLanguage
    prebrief: string
    status: string
    workerName: string
  },
) {
  const row = (image: ImageSourcePropType, label: string, value: string) => ({ image, label, value })
  if (screenId === '2.10-location-eta') {
    return [
      row(customerV21Assets.map, values.language === 'vi' ? 'Địa điểm' : 'Location', values.address),
      row(customerV21Assets.identity, values.language === 'vi' ? 'Thợ thật' : 'Real worker', values.workerName),
      row(customerV21Assets.booking, values.language === 'vi' ? 'Thời gian đến' : 'ETA', values.eta),
    ]
  }
  if (screenId === '2.11-live-alert') {
    return [
      row(customerV21Assets.notification, values.language === 'vi' ? 'Cảnh báo' : 'Alert', values.status),
      row(customerV21Assets.map, values.language === 'vi' ? 'Địa điểm' : 'Location', values.address),
      row(customerV21Assets.booking, values.language === 'vi' ? 'Thời gian đến' : 'ETA', values.eta),
    ]
  }
  if (screenId === '2.12-job-accepted') {
    return [
      row(customerV21Assets.identity, values.language === 'vi' ? 'Thợ thật' : 'Real worker', values.workerName),
      row(customerV21Assets.map, values.language === 'vi' ? 'Địa điểm' : 'Location', values.address),
      row(customerV21Assets.kael, values.language === 'vi' ? 'Tóm tắt Kael' : 'Kael brief', values.prebrief),
    ]
  }
  return [
    row(customerV21Assets.activity, values.language === 'vi' ? 'Trạng thái' : 'Status', values.status),
    row(customerV21Assets.evidence, values.language === 'vi' ? 'Bằng chứng hoàn tất' : 'Completion evidence', values.completionEvidence),
    row(customerV21Assets.shield, values.language === 'vi' ? 'Phê duyệt' : 'Approval', values.language === 'vi' ? 'Chỉ mở khi quy trình yêu cầu' : 'Only opens when workflow requires it'),
  ]
}

export function screenIdsForStatus(status: LocalDealStatus): CustomerV21ScreenId[] {
  if (status === 'broadcasting') return ['2.7-matching']
  if (status === 'worker_matched') return ['2.10-location-eta', '2.12-job-accepted']
  if (status === 'worker_on_way') return ['2.10-location-eta', '2.11-live-alert']
  if (status === 'arrived' || status === 'inspecting') return ['2.12-job-accepted']
  if (status === 'repairing' || status === 'scope_change_pending') return ['2.13-job-progress']
  if (status === 'completed_by_worker') return ['2.13-job-progress']
  if (status === 'payment_pending' || status === 'paid') return ['2.13-job-progress', '3.3-payment-protected']
  if (status === 'confirmed_by_customer' || status === 'reviewed') return ['2.13-job-progress']
  if (status === 'awaiting_customer_confirm') return ['2.8-options', '2.9-quotes']
  return ['2.6-case-overview']
}

export function caseScreenAsset(screenId: CustomerV21ScreenId): ImageSourcePropType {
  if (screenId.startsWith('3.')) return customerV21Assets.payment
  if (screenId === '2.10-location-eta' || screenId === '2.11-live-alert') return customerV21Assets.map
  if (screenId === '2.5-chat-case') return customerV21Assets.kael
  if (screenId === '2.13-job-progress' || screenId === '2.12-job-accepted') return customerV21Assets.activity
  if (screenId === '2.7-matching') return customerV21Assets.identity
  if (screenId === '2.8-options' || screenId === '2.9-quotes') return customerV21Assets.request
  return customerV21Assets.booking
}

export function caseScreenSummary(screenId: CustomerV21ScreenId, deal: LocalDeal, language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  const estimate = deal.estimate
  const payment = deal.payment
  const broadcast = deal.broadcast
  const address = deal.draft.addressLabel || deal.draft.districtLabel || broadcast?.generalArea || copy.dataPending
  const workerName = deal.workerProfile?.fullName || null
  if (screenId === '2.5-chat-case') {
    return language === 'vi'
      ? `Bằng chứng: ${formatKnownCount(deal.draft.mediaCount, language)}`
      : `Evidence: ${formatKnownCount(deal.draft.mediaCount, language)}`
  }
  if (screenId === '2.6-case-overview') return `${caseDisplayCode(deal, language)} · ${customerV21StatusCopy[language][deal.status]}`
  if (screenId === '2.7-matching') {
    if (workerName) return language === 'vi' ? `Thợ thật: ${workerName}` : `Real worker: ${workerName}`
    if (deal.status === 'broadcasting') return customerV21StatusCopy[language].broadcasting
    return copy.dataPending
  }
  if (screenId === '2.8-options') return estimate ? agenticDealProblemLabel(deal, language) || estimate.advisory || copy.dataPending : copy.dataPending
  if (screenId === '2.9-quotes') return estimate?.priceRangeLabel || copy.dataPending
  if (screenId === '3.1-payment-review') {
    if (payment?.grossAmount === 0 || payment?.grossAmount) return formatVnd(payment.grossAmount, language)
    return customerV21CommonCopy[language].paymentLocked
  }
  if (screenId === '3.2-payment-method') return payment?.provider ? paymentProviderLabel(payment.provider, language) : copy.dataPending
  if (screenId === '3.3-payment-protected') return payment?.status ? paymentStatusLabel(payment.status, language) : customerV21CommonCopy[language].paymentLocked
  if (screenId === '2.10-location-eta') return broadcast?.fullAddressVisible ? address : (broadcast?.generalArea || copy.dataPending)
  if (screenId === '2.11-live-alert') {
    if (typeof broadcast?.secondsRemaining === 'number') return formatDurationShort(broadcast.secondsRemaining, language)
    return copy.dataPending
  }
  if (screenId === '2.12-job-accepted') {
    if (!broadcast?.status) return copy.dataPending
    return language === 'vi' ? 'Đã có xác nhận từ hệ thống' : 'System confirmation available'
  }
  if (screenId === '2.13-job-progress') {
    if (deal.status === 'repairing' || deal.status === 'scope_change_pending') return customerV21StatusCopy[language][deal.status]
    if (deal.status === 'completed_by_worker' || deal.status === 'confirmed_by_customer' || deal.status === 'payment_pending' || deal.status === 'paid' || deal.status === 'reviewed') return customerV21StatusCopy[language][deal.status]
    return language === 'vi' ? 'Chưa bắt đầu công việc' : 'Work has not started'
  }
  return copy.dataPending
}

export function caseReferenceRows(screenId: CustomerV21ScreenId, deal: LocalDeal, language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  const estimate = deal.estimate
  const payment = deal.payment
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  const problem = agenticDealProblemLabel(deal, language)
  const workerName = deal.workerProfile?.fullName || copy.dataPending
  const address = deal.broadcast?.fullAddressVisible
    ? deal.broadcast.fullAddressLabel || deal.draft.addressLabel || deal.broadcast.generalArea || copy.dataPending
    : deal.broadcast?.generalArea || deal.draft.districtLabel || deal.draft.addressLabel || copy.dataPending
  const time = timeChoiceLabel(deal.draft.timeChoice, language)
  const evidence = formatEvidenceFileCount(deal.draft.mediaCount, language)
  const price = estimate?.priceRangeLabel || copy.dataPending
  const disclaimer = estimate?.disclaimer || copy.dataPending
  const paymentStatus = payment?.status ? paymentStatusLabel(payment.status, language) : copy.dataPending
  const paymentAmount = payment?.grossAmount === 0 || payment?.grossAmount ? formatVnd(payment.grossAmount, language) : copy.dataPending
  const paymentMethod = payment?.provider ? paymentProviderLabel(payment.provider, language) : copy.dataPending
  const completionEvidence = formatEvidenceFileCount(deal.completionPhotoUrls?.length, language)
  const completionNote = deal.completionNotes?.trim() || copy.dataPending

  const row = (image: ImageSourcePropType, label: string, value: string) => ({ image, label, value })
  const serviceAsset = deal.draft.serviceType ? customerV21ServiceAssets[deal.draft.serviceType] : customerV21Assets.request
  const common = [
    row(serviceAsset, language === 'vi' ? 'Dịch vụ' : 'Service', service),
    row(customerV21Assets.request, language === 'vi' ? 'Vấn đề' : 'Issue', problem),
    row(customerV21Assets.activity, language === 'vi' ? 'Trạng thái' : 'Status', customerV21StatusCopy[language][deal.status]),
  ]

  if (screenId === '2.5-chat-case') {
    return [
      row(customerV21Assets.evidence, language === 'vi' ? 'Bằng chứng công việc' : 'Work evidence', evidence),
      row(customerV21Assets.request, language === 'vi' ? 'Phạm vi' : 'Scope', problem),
      row(customerV21Assets.kael, language === 'vi' ? 'Ranh giới' : 'Boundary', language === 'vi' ? 'Tách khỏi trò chuyện thường' : 'Separate from normal chat'),
    ]
  }
  if (screenId === '2.6-case-overview') {
    return [
      row(customerV21Assets.booking, language === 'vi' ? 'Mã công việc' : 'Job id', caseDisplayCode(deal, language)),
      ...common,
      row(customerV21Assets.evidence, language === 'vi' ? 'Bằng chứng' : 'Evidence', evidence),
    ]
  }
  if (screenId === '2.7-matching') {
    return [
      row(customerV21Assets.identity, language === 'vi' ? 'Thợ thật' : 'Real worker', workerName),
      row(customerV21Assets.map, language === 'vi' ? 'Khu vực' : 'Area', address),
      row(customerV21Assets.booking, language === 'vi' ? 'Khung giờ' : 'Time window', time),
      row(customerV21Assets.shield, language === 'vi' ? 'Quyền riêng tư' : 'Privacy', language === 'vi' ? 'Chỉ mở địa chỉ theo cổng nhận việc thật' : 'Address opens only after real accept gate'),
    ]
  }
  if (screenId === '2.8-options') {
    return [
      row(customerV21Assets.request, language === 'vi' ? 'Phương án' : 'Option', estimate?.advisory || problem),
      row(customerV21Assets.shield, language === 'vi' ? 'Rủi ro' : 'Risk', estimate ? complexitySafetyLabel(estimate.complexity, language) : copy.dataPending),
      row(customerV21Assets.payment, language === 'vi' ? 'Giá' : 'Price', price),
    ]
  }
  if (screenId === '2.9-quotes') {
    return [
      row(customerV21Assets.payment, language === 'vi' ? 'Ước tính Kael' : 'Kael estimate', price),
      row(customerV21Assets.shield, language === 'vi' ? 'Ghi chú giá' : 'Price note', disclaimer),
      row(customerV21Assets.identity, language === 'vi' ? 'Thợ' : 'Worker', workerName),
    ]
  }
  if (screenId === '3.1-payment-review') {
    return [
      row(customerV21Assets.payment, language === 'vi' ? 'Trạng thái thanh toán' : 'Payment status', paymentStatus),
      row(customerV21Assets.shield, language === 'vi' ? 'Số tiền' : 'Amount', paymentAmount),
      row(customerV21Assets.booking, language === 'vi' ? 'Công việc liên kết' : 'Linked job', caseDisplayCode(deal, language)),
    ]
  }
  if (screenId === '3.2-payment-method') {
    return [
      row(customerV21Assets.payment, language === 'vi' ? 'Phương thức' : 'Method', paymentMethod),
      row(customerV21Assets.shield, language === 'vi' ? 'Trạng thái' : 'Status', paymentStatus),
      row(customerV21Assets.request, language === 'vi' ? 'Ghi chú' : 'Note', customerV21CommonCopy[language].paymentLocked),
    ]
  }
  if (screenId === '3.3-payment-protected') {
    return [
      row(customerV21Assets.shield, language === 'vi' ? 'Bảo vệ' : 'Protection', payment?.status ? paymentStatus : customerV21CommonCopy[language].paymentLocked),
      row(customerV21Assets.payment, language === 'vi' ? 'Số tiền thật' : 'Real amount', paymentAmount),
      row(customerV21Assets.activity, language === 'vi' ? 'Bước tiếp theo' : 'Next step', customerV21StatusCopy[language][deal.status]),
    ]
  }
  if (screenId === '2.10-location-eta') {
    return [
      row(customerV21Assets.map, language === 'vi' ? 'Vị trí' : 'Location', address),
      row(customerV21Assets.identity, language === 'vi' ? 'Thợ thật' : 'Real worker', workerName),
      row(customerV21Assets.booking, language === 'vi' ? 'Khung giờ' : 'Time window', time),
    ]
  }
  if (screenId === '2.11-live-alert') {
    return [
      row(customerV21Assets.notification, language === 'vi' ? 'Cảnh báo' : 'Alert', customerV21StatusCopy[language][deal.status]),
      row(customerV21Assets.map, language === 'vi' ? 'Khu vực' : 'Area', address),
      row(customerV21Assets.kael, language === 'vi' ? 'Kael nhắc' : 'Kael note', language === 'vi' ? 'Không chia sẻ số điện thoại hoặc địa chỉ ngoài quy trình.' : 'Do not share phone or address outside the workflow.'),
    ]
  }
  if (screenId === '2.12-job-accepted') {
    return [
      row(customerV21Assets.identity, language === 'vi' ? 'Thợ' : 'Worker', workerName),
      row(customerV21Assets.map, language === 'vi' ? 'Địa điểm' : 'Location', address),
      row(customerV21Assets.kael, language === 'vi' ? 'Tóm tắt Kael' : 'Kael brief', deal.broadcast?.prebrief?.[0] || copy.dataPending),
    ]
  }
  if (screenId === '2.13-job-progress') {
    return [
      row(customerV21Assets.activity, language === 'vi' ? 'Tiến độ' : 'Progress', customerV21StatusCopy[language][deal.status]),
      row(customerV21Assets.evidence, language === 'vi' ? 'Ảnh hoàn tất' : 'Completion photos', completionEvidence),
      row(customerV21Assets.feedback, language === 'vi' ? 'Ghi chú hoàn tất' : 'Completion note', completionNote),
    ]
  }
  return common
}
