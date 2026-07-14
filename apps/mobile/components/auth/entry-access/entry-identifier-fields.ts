import { isPhoneIdentifierCandidate, parseAuthIdentifier, validateAuthIdentifier } from '@/lib/auth-identifier'
import type { EntryRole } from './types'

export function validateIdentifierForRole(value: string, role: EntryRole) {
  if (role === 'customer') return validateAuthIdentifier(value)
  return parseAuthIdentifier(value)?.kind === 'email' ? null : 'Email chưa đúng định dạng.'
}

export function validateRegistrationIdentifier(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return 'Nhập email để tiếp tục.'

  const identifier = parseAuthIdentifier(trimmed)
  if (identifier?.kind === 'phone') {
    return 'Đăng ký bằng SDT chưa sẵn sàng. Vui lòng dùng email.'
  }
  return identifier?.kind === 'email' ? null : 'Email chưa đúng định dạng.'
}

export function identifierFieldProps(value: string, role: EntryRole) {
  const usesPhone = role === 'customer' && isPhoneIdentifierCandidate(value)
  const isCustomer = role === 'customer'
  return {
    icon: usesPhone ? 'phone' as const : 'mail' as const,
    keyboardType: isCustomer ? 'default' as const : 'email-address' as const,
    label: isCustomer ? 'Email/SDT' : 'Email',
    placeholder: isCustomer ? 'email@example.com hoặc 090 123 4567' : 'email@example.com',
    textContentType: isCustomer ? 'username' as const : 'emailAddress' as const,
  }
}

export function registrationIdentifierFieldProps() {
  return {
    icon: 'mail' as const,
    keyboardType: 'email-address' as const,
    label: 'Email',
    placeholder: 'email@example.com',
    textContentType: 'emailAddress' as const,
  }
}
