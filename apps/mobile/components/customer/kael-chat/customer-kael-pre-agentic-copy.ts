import type { LocalDealDraft } from '@nestscout/shared'
import { extractKnownDistrictLabel } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'

export function isPreAgenticConfirmation(message: string) {
  const normalized = message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
  return /^(xac nhan|confirm|dung|dung roi|dong y|ok|okay|yes)$/.test(normalized)
}

export function preAgenticMissingDetails(draft: LocalDealDraft | null) {
  const missing: string[] = []
  if (!draft?.serviceType) missing.push('hạng mục cần hỗ trợ')
  if (!draft?.inferredProblemLabel) missing.push('hiện tượng hoặc thiết bị gặp vấn đề')
  if (!extractKnownDistrictLabel(draft?.districtLabel ?? '')) missing.push('quận tại TP.HCM')
  return missing
}

export function preAgenticClarification(language: AppLanguage, missingDetails: string[]) {
  if (language === 'vi') {
    const details = missingDetails.length > 0
      ? missingDetails.join(', ')
      : 'thông tin còn thiếu'
    const supportedServices = missingDetails.includes('hạng mục cần hỗ trợ')
      ? ' Hạng mục hỗ trợ gồm: sửa điện, sửa nước, vệ sinh nhà, điều hòa, chăm sóc nội thất hoặc sửa vặt/lắp đặt.'
      : ''
    return `Mình đã ghi nhận mô tả. Trước khi Kael bắt đầu, bạn cho biết ${details} trong một tin nhắn nhé.${supportedServices}`
  }
  return 'I have noted your description. Before Kael begins, please provide the service, the affected item or symptom, and the district in Ho Chi Minh City in one message. Supported services are electrical, plumbing, home cleaning, air conditioning, upholstery care, and handyman work.'
}

export function preAgenticUnsupportedService(language: AppLanguage) {
  if (language === 'vi') {
    return 'Yêu cầu này hiện chưa thuộc phạm vi NestScout. NestScout đang hỗ trợ sửa điện, sửa nước, vệ sinh nhà cửa, điều hòa và không khí, sofa/nệm/rèm/thảm, cùng sửa vặt và lắp đặt nhỏ.'
  }
  return 'This request is outside NestScout’s current service scope. NestScout supports electrical repair, plumbing repair, home cleaning, air conditioning and indoor air, sofa/mattress/curtain/carpet care, and minor repair or installation.'
}

export function preAgenticConfirmation(language: AppLanguage, draft: LocalDealDraft | null) {
  const detail = [draft?.inferredProblemLabel, draft?.districtLabel].filter(Boolean).join(' tại ')
  if (language === 'vi') {
    return `Kael hiểu yêu cầu là ${detail || 'hạng mục bạn vừa mô tả'}. Đúng không? Nhắn “Xác nhận” để Kael bắt đầu phân tích.`
  }
  return `Kael understands the request as ${detail || 'the work you described'}. Is that correct? Reply “Confirm” for Kael to begin analysis.`
}
