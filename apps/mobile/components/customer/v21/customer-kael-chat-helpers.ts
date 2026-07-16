import type { AppLanguage } from '@/lib/app-language'
import type { KaelAssistantResponse } from '@/lib/api-types'

import { normalizeKaelRoutingText } from './case-work-display-model'
import type { CustomerAssistantLocalTurn } from './use-customer-kael-conversation-state'

export function localizeKaelRequestFailure(
  failure: { code?: string; error: string },
  language: AppLanguage,
) {
  const copy = kaelRequestFailureCopy[language]
  switch (failure.code) {
    case 'RATE_LIMITED':
    case 'PENDING_MEDIA_QUOTA':
    case 'DAILY_MEDIA_QUOTA':
      return copy.rateLimited
    case 'VALIDATION':
    case 'INVALID_MEDIA_CONTENT':
    case 'INVALID_MEDIA_REF':
      return copy.validation
    case 'INVALID_STATUS':
    case 'ALREADY_DECIDED':
      return copy.invalidStatus
    case 'SESSION_PENDING':
      return copy.sessionPending
    case 'AI_DISABLED':
    case 'NO_PROVIDER_AVAILABLE':
    case 'MEDIA_VALIDATION_UNAVAILABLE':
      return copy.unavailable
    case 'NOT_FOUND':
      return copy.notFound
    default:
      return copy.fallback
  }
}

const kaelRequestFailureCopy = {
  vi: {
    fallback: 'Kael chưa thể hoàn tất bước này. Vui lòng thử lại.',
    invalidStatus: 'Bước này không còn khả dụng vì công việc đã chuyển tiếp.',
    notFound: 'Không tìm thấy công việc này hoặc công việc không còn khả dụng.',
    rateLimited: 'Kael đã tạm đạt giới hạn yêu cầu. Vui lòng thử lại sau.',
    sessionPending: 'Kael đang chuẩn bị công việc này. Vui lòng thử lại sau ít phút.',
    unavailable: 'Kael tạm thời không khả dụng. Vui lòng thử lại sau ít phút.',
    validation: 'Một số thông tin yêu cầu chưa hợp lệ. Hãy kiểm tra và thử lại.',
  },
  en: {
    fallback: 'Kael could not complete that step. Please try again.',
    invalidStatus: 'This step is no longer available because the case has moved forward.',
    notFound: 'This case could not be found or is no longer available.',
    rateLimited: 'Kael has reached a temporary request limit. Please try again later.',
    sessionPending: 'Kael is still preparing this case. Please try again shortly.',
    unavailable: 'Kael is temporarily unavailable. Please try again shortly.',
    validation: 'Some request information is invalid. Please review it and try again.',
  },
} as const

export function shouldUseLegacyKaelEvidenceFallback(
  result: { code?: string; status?: number },
  photoUrls: string[],
) {
  if (photoUrls.length === 0) return false
  return result.status === 404 ||
    result.code === 'NOT_FOUND' ||
    (result.status === 400 && result.code === 'VALIDATION')
}

export function shouldFallbackCaseAssistantToJobChat(result: {
  code?: string
  error?: string
  status?: number
}) {
  const normalizedError = (result.error ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return result.status === 404 && (
    normalizedError.includes('endpoint') ||
    (result.code === 'NOT_FOUND' && normalizedError.includes('khong tim thay endpoint'))
  )
}

export function makeAssistantTurnId(
  surface: CustomerAssistantLocalTurn['surface'],
  role: CustomerAssistantLocalTurn['role'],
) {
  return `${surface}-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function isLikelyKaelIntakeRequest(message: string) {
  const normalized = normalizeKaelRoutingText(message)
  if (!normalized) return false
  const qnaSignal = /\b(gia|bao nhieu|luat|phap ly|quy dinh|quy trinh|dich vu|tho|bao hanh|huy|thanh toan|co duoc|la gi|huong dan|nen|khac gi|yeu cau gi|tu van)\b/.test(normalized)
  if (qnaSignal) return false
  return /\b(dat lich|goi tho|can sua|can don|kiem tra giup|bi hong|hong|ro|ri|tac|mat dien|chap|hien trang|anh\/video|anh|video|duong ong|ve sinh|don dep|thay|lap|sua giup|o cam|cong tac|voi nuoc|ong nuoc|lavabo|toilet)\b/.test(normalized)
}

export function formatAssistantAnswer(
  result: KaelAssistantResponse,
  language: AppLanguage,
) {
  const notes = result.safety_notes.filter((note) => note.trim().length > 0)
  if (notes.length === 0) return result.answer
  const noteLabel = language === 'vi' ? 'Lưu ý' : 'Note'
  return `${result.answer}\n\n${noteLabel}: ${notes.join(' ')}`
}
