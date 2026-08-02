import { isPhoneIdentifierCandidate, parseAuthIdentifier, validateAuthIdentifier } from '@/lib/auth-identifier'
import type { AppLanguage } from '@/lib/app-language'
import { entryAccessCopy, localizeEntryAuthError } from './copy'
import type { EntryRole } from './types'

type IdentifierAvailabilityError = 'phoneRecovery' | 'phoneRegistration'

const identifierAvailabilityErrors: Record<AppLanguage, Record<IdentifierAvailabilityError, string>> = {
  vi: {
    phoneRecovery: 'Khôi phục bằng SĐT chưa sẵn sàng. Vui lòng dùng thư điện tử.',
    phoneRegistration: 'Đăng ký bằng SĐT chưa sẵn sàng. Vui lòng dùng thư điện tử.',
  },
  en: {
    phoneRecovery: 'Phone recovery is not available yet. Please use email.',
    phoneRegistration: 'Phone registration is not available yet. Please use email.',
  },
}

export function identifierAvailabilityError(kind: IdentifierAvailabilityError, language: AppLanguage) {
  return identifierAvailabilityErrors[language][kind]
}

export function localizeIdentifierAvailabilityError(error: string, language: AppLanguage) {
  const kind = (Object.keys(identifierAvailabilityErrors.vi) as IdentifierAvailabilityError[])
    .find((candidate) => (
      error === identifierAvailabilityErrors.vi[candidate]
      || error === identifierAvailabilityErrors.en[candidate]
    ))
  return kind ? identifierAvailabilityError(kind, language) : null
}

export function validateIdentifierForRole(value: string, role: EntryRole, language: AppLanguage) {
  if (role === 'customer') {
    const error = validateAuthIdentifier(value)
    return error ? localizeEntryAuthError(error, language, 'invalidIdentifier') : null
  }
  return parseAuthIdentifier(value)?.kind === 'email'
    ? null
    : entryAccessCopy[language].errors.invalidEmail
}

export function validateRegistrationIdentifier(value: string, language: AppLanguage) {
  const trimmed = value.trim()
  if (!trimmed) return entryAccessCopy[language].errors.registrationDetails

  const identifier = parseAuthIdentifier(trimmed)
  if (identifier?.kind === 'phone') {
    return identifierAvailabilityError('phoneRegistration', language)
  }
  return identifier?.kind === 'email' ? null : entryAccessCopy[language].errors.invalidEmail
}

export function identifierFieldProps(value: string, role: EntryRole, language: AppLanguage) {
  const usesPhone = role === 'customer' && isPhoneIdentifierCandidate(value)
  const isCustomer = role === 'customer'
  const copy = entryAccessCopy[language].fields
  return {
    icon: usesPhone ? 'phone' as const : 'mail' as const,
    keyboardType: isCustomer ? 'default' as const : 'email-address' as const,
    label: isCustomer ? copy.customerIdentifierLabel : copy.workerIdentifierLabel,
    placeholder: isCustomer ? copy.customerIdentifierPlaceholder : copy.workerIdentifierPlaceholder,
    textContentType: isCustomer ? 'username' as const : 'emailAddress' as const,
  }
}

export function registrationIdentifierFieldProps(language: AppLanguage) {
  const copy = entryAccessCopy[language].fields
  return {
    icon: 'mail' as const,
    keyboardType: 'email-address' as const,
    label: copy.workerIdentifierLabel,
    placeholder: copy.workerIdentifierPlaceholder,
    textContentType: 'emailAddress' as const,
  }
}
