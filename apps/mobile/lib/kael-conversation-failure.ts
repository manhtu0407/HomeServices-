import type { AppLanguage } from './app-language'

type KaelConversationFailure = {
  code?: string
  status?: number
  meta?: { supportCode?: string | null }
}

const RELEASE_FAILURE_CODES = new Set([
  'BUILD_BELOW_MINIMUM',
  'CLIENT_RELEASE_MISMATCH',
  'CLIENT_UPDATE_REQUIRED',
  'MOBILE_RELEASE_MISMATCH',
  'RELEASE_ID_MISMATCH',
  'RELEASE_INCOMPATIBLE',
  'RELEASE_MISMATCH',
])

const AUTH_FAILURE_CODES = new Set([
  'AUTH_MISSING',
  'AUTH_REQUIRED',
  'SESSION_EXPIRED',
  'UNAUTHORIZED',
])

const AMBIGUOUS_FAILURE_CODES = new Set([
  'NETWORK_ERROR',
  'STREAM_BODY_UNREADABLE',
  'STREAM_ENDED',
  'STREAM_INVALID_ENCODING',
  'STREAM_NETWORK',
  'STREAM_RESPONSE_TOO_LARGE',
  'STREAM_RESULT_INVALID',
  'STREAM_TIMEOUT',
  'TIMEOUT',
])

export function localizeKaelConversationFailure(
  failure: KaelConversationFailure,
  language: AppLanguage,
  fallback: string,
) {
  let message = fallback
  if (failure.status === 426 || RELEASE_FAILURE_CODES.has(failure.code ?? '')) {
    message = language === 'vi'
      ? 'Phiên bản NestScout hiện tại chưa tương thích với dịch vụ. Hãy cập nhật hoặc mở bản ứng dụng đã phát hành để tiếp tục.'
      : 'This NestScout version is not compatible with the service. Update or open the released app to continue.'
  } else if (failure.status === 401 || AUTH_FAILURE_CODES.has(failure.code ?? '')) {
    message = language === 'vi'
      ? 'Phiên đăng nhập đã hết hạn hoặc không có quyền truy cập. Hãy đăng nhập lại rồi thử lại.'
      : 'Your sign-in has expired or does not have access. Sign in again and retry.'
  }

  const supportCode = failure.meta?.supportCode
  if (supportCode && /^[A-Z0-9]{8}$/.test(supportCode)) {
    message += language === 'vi' ? ` Mã hỗ trợ: ${supportCode}.` : ` Support code: ${supportCode}.`
  }
  return message
}

export function isAmbiguousKaelConversationFailure(failure: KaelConversationFailure) {
  return failure.status !== undefined && failure.status >= 500
    || AMBIGUOUS_FAILURE_CODES.has(failure.code ?? '')
}

export function kaelConversationOutcomeUncertainCopy(language: AppLanguage) {
  return language === 'vi'
    ? 'Chưa xác nhận được Kael đã nhận tin nhắn hay chưa. Hãy mở lại phiên để kiểm tra trước khi gửi lại.'
    : 'We could not confirm whether Kael received the message. Reopen the conversation and check before sending it again.'
}
