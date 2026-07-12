export type AuthIdentifier =
  | { kind: 'email'; value: string }
  | { kind: 'phone'; value: string }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VIETNAMESE_MOBILE_PATTERN = /^0(?:3[2-9]|5[2689]|7[06789]|8[1-689]|9[0-46-9])\d{7}$/

export function parseAuthIdentifier(value: string): AuthIdentifier | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase()
    return EMAIL_PATTERN.test(email) ? { kind: 'email', value: email } : null
  }

  const phone = normalizeVietnameseMobilePhone(trimmed)
  return phone ? { kind: 'phone', value: phone } : null
}

export function validateAuthIdentifier(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return 'Nhập Email hoặc SDT để tiếp tục.'
  if (trimmed.includes('@')) return EMAIL_PATTERN.test(trimmed.toLowerCase()) ? null : 'Email chưa đúng định dạng.'
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
