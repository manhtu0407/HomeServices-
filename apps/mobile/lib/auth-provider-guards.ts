export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export const EMAIL_CONFIRMATION_REQUIRED_MESSAGE = 'Thư điện tử chưa được xác nhận. Hãy kiểm tra email rồi đăng nhập lại.'

// These values intentionally match the shared Auth copy keys, so each selected language
// can render a safe server failure without exposing Supabase's raw response.
const SIGNUP_RATE_LIMIT_MESSAGE = 'Yêu cầu đang bị giới hạn. Vui lòng thử lại sau.'
const INVALID_SIGNUP_EMAIL_MESSAGE = 'Địa chỉ thư điện tử chưa đúng định dạng.'
const INVALID_CONFIRMATION_LINK_MESSAGE = 'Dịch vụ đăng nhập chưa sẵn sàng. Vui lòng thử lại sau.'
const GENERIC_SIGNUP_MESSAGE = 'Không thể tạo tài khoản. Vui lòng thử lại sau.'

function readAuthError(error: unknown) {
  if (typeof error === 'string') return { message: error, status: null }
  if (typeof error !== 'object' || error === null) return { message: '', status: null }

  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  const status = 'status' in error && typeof error.status === 'number' ? error.status : null
  return { message, status }
}

export function getSafeSignupErrorMessage(error: unknown) {
  const { message, status } = readAuthError(error)
  if (status === 429 || /rate limit|too many requests|security purposes/i.test(message)) {
    return SIGNUP_RATE_LIMIT_MESSAGE
  }
  if (/email address .* is invalid|invalid email/i.test(message)) {
    return INVALID_SIGNUP_EMAIL_MESSAGE
  }
  if (/redirect.*not allowed|email link is invalid/i.test(message)) {
    return INVALID_CONFIRMATION_LINK_MESSAGE
  }
  return GENERIC_SIGNUP_MESSAGE
}

export function isEmailConfirmationRequired(error: unknown) {
  const { message } = readAuthError(error)
  return /email not confirmed/i.test(message)
}

export function staleAccountMutation() {
  return {
    success: false as const,
    error: 'Phiên tài khoản đã thay đổi. Vui lòng thử lại.',
  }
}
