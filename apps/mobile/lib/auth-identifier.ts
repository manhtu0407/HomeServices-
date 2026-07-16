export type AuthIdentifier =
  | { kind: 'email'; value: string }
  | { kind: 'phone'; value: string }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VIETNAMESE_MOBILE_PATTERN = /^0(?:3[2-9]|5[2689]|7[06789]|8[1-689]|9[0-46-9])\d{7}$/
const MAX_EMAIL_LENGTH = 254
const MAX_EMAIL_LOCAL_PART_LENGTH = 64
const MAX_PHONE_INPUT_LENGTH = 32

export function parseAuthIdentifier(value: string): AuthIdentifier | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase()
    return isValidEmail(email) ? { kind: 'email', value: email } : null
  }

  if (trimmed.length > MAX_PHONE_INPUT_LENGTH) return null
  const phone = normalizeVietnameseMobilePhone(trimmed)
  return phone ? { kind: 'phone', value: phone } : null
}

export function validateAuthIdentifier(value: string) {
  if (typeof value !== 'string') return 'Nhập Email hoặc SDT để tiếp tục.'
  const trimmed = value.trim()
  if (!trimmed) return 'Nhập Email hoặc SDT để tiếp tục.'
  if (trimmed.includes('@')) return isValidEmail(trimmed.toLowerCase()) ? null : 'Email chưa đúng định dạng.'
  if (trimmed.length > MAX_PHONE_INPUT_LENGTH) return 'SDT Việt Nam chưa đúng định dạng.'
  return normalizeVietnameseMobilePhone(trimmed) ? null : 'SDT Việt Nam chưa đúng định dạng.'
}

export function isPhoneIdentifierCandidate(value: string) {
  return value.trim().length > 0 && !value.includes('@')
}

function normalizeVietnameseMobilePhone(value: string) {
  const compact = value.replace(/[\s().-]/g, '')
  const local = compact.startsWith('+84')
    ? `0${compact.slice(3)}`
    : compact

  if (!VIETNAMESE_MOBILE_PATTERN.test(local)) return null
  return `+84${local.slice(1)}`
}

function isValidEmail(value: string) {
  if (value.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(value)) return false
  const separator = value.indexOf('@')
  const local = value.slice(0, separator)
  const domain = value.slice(separator + 1)
  return local.length <= MAX_EMAIL_LOCAL_PART_LENGTH
    && domain.split('.').every((label) => label.length > 0 && label.length <= 63)
}
