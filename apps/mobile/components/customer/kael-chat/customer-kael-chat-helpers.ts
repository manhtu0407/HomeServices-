import type { AppLanguage } from '@/lib/app-language'
import type { KaelAssistantResponse, KaelChatResponse } from '@/lib/api-types'

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
    case 'ALREADY_CONFIRMED':
      return copy.alreadyConfirmed
    case 'IDEMPOTENCY_RECONCILE_REQUIRED':
      return copy.reconcilingConfirmation
    case 'MISSING_ESTIMATE':
      return copy.missingEstimate
    case 'MISSING_SCOPE':
      return copy.missingScope
    case 'MISSING_REASONING_RECEIPT':
      return copy.missingReasoningReceipt
    case 'SESSION_PENDING':
      return copy.sessionPending
    case 'TIMEOUT':
    case 'STREAM_TIMEOUT':
    case 'STREAM_NETWORK':
      return copy.slowResponse
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
    reconcilingConfirmation: 'Kael đang đối soát lịch sử xác nhận để tránh tạo trùng yêu cầu. Vui lòng tải lại trạng thái sau ít phút.',
    fallback: 'Kael chưa thể hoàn tất bước này. Vui lòng thử lại.',
    alreadyConfirmed: 'Xác nhận này đã được xử lý. Hãy tải lại trạng thái công việc để tiếp tục.',
    invalidStatus: 'Kael chưa thể xác nhận báo giá này. Hãy tải lại trạng thái công việc rồi kiểm tra lại.',
    missingEstimate: 'Kael cần hoàn tất ước tính trước khi xác nhận báo giá.',
    missingReasoningReceipt: 'Kael cần hoàn tất biên nhận phân tích giá đã xác thực trước khi xác nhận báo giá.',
    missingScope: 'Kael cần hoàn tất phân tích phạm vi trước khi xác nhận báo giá.',
    notFound: 'Không tìm thấy công việc này hoặc công việc không còn khả dụng.',
    rateLimited: 'Kael đã tạm đạt giới hạn yêu cầu. Vui lòng thử lại sau.',
    sessionPending: 'Kael đang chuẩn bị công việc này. Vui lòng thử lại sau ít phút.',
    slowResponse: 'Phản hồi của Kael đang mất nhiều thời gian hơn bình thường. Vui lòng gửi lại sau ít phút.',
    unavailable: 'Kael tạm thời không khả dụng. Vui lòng thử lại sau ít phút.',
    validation: 'Một số thông tin yêu cầu chưa hợp lệ. Hãy kiểm tra và thử lại.',
  },
  en: {
    reconcilingConfirmation: 'Kael is reconciling a previous confirmation to avoid creating a duplicate request. Refresh the case status shortly.',
    fallback: 'Kael could not complete that step. Please try again.',
    alreadyConfirmed: 'This confirmation was already processed. Refresh the case status to continue.',
    invalidStatus: 'Kael could not confirm this estimate. Refresh the case status and review it again.',
    missingEstimate: 'Kael needs to complete the estimate before it can be confirmed.',
    missingReasoningReceipt: 'Kael needs to complete the validated price reasoning receipt before this estimate can be confirmed.',
    missingScope: 'Kael needs to complete the scope analysis before this estimate can be confirmed.',
    notFound: 'This case could not be found or is no longer available.',
    rateLimited: 'Kael has reached a temporary request limit. Please try again later.',
    sessionPending: 'Kael is still preparing this case. Please try again shortly.',
    slowResponse: 'Kael is taking longer than usual to respond. Please try again shortly.',
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

export function latestKaelReply(response: KaelChatResponse) {
  for (let index = response.turns.length - 1; index >= 0; index -= 1) {
    const turn = response.turns[index]
    if (turn.role !== 'kael' || typeof turn.text_content !== 'string') continue
    const text = turn.text_content.trim()
    if (!text) continue
    return {
      text,
      turnId: turn.id,
    }
  }
  return null
}
