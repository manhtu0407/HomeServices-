import { isPhoneIdentifierCandidate, parseAuthIdentifier, validateAuthIdentifier } from '@/lib/auth-identifier'
import type { AppLanguage } from '@/lib/app-language'
import { entryAccessCopy, localizeEntryAuthError } from './copy'
import type { EntryRole } from './types'

type IdentifierAvailabilityError = 'phoneRecovery'

const identifierAvailabilityErrors: Record<AppLanguage, Record<IdentifierAvailabilityError, string>> = {
  vi: {
    phoneRecovery: 'Khôi phục bằng SĐT chưa sẵn sàng. Vui lòng dùng thư điện tử.',
  },
  en: {
    phoneRecovery: 'Phone recovery is not available yet. Please use email.',
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

export function validateIdentifierForRole(value: string, _role: EntryRole, language: AppLanguage) {
  const error = validateAuthIdentifier(value)
  return error ? localizeEntryAuthError(error, language, 'invalidIdentifier') : null
}

export function validateRegistrationIdentifier(value: string, _role: EntryRole, language: AppLanguage) {
  const trimmed = value.trim()
  if (!trimmed) return entryAccessCopy[language].errors.registrationDetails

  const identifier = parseAuthIdentifier(trimmed)
  return identifier?.kind === 'email' || identifier?.kind === 'phone'
    ? null
    : entryAccessCopy[language].errors.invalidEmail
}

export function identifierFieldProps(value: string, _role: EntryRole, language: AppLanguage) {
  const usesPhone = isPhoneIdentifierCandidate(value)
  const copy = entryAccessCopy[language].fields
  return {
    icon: usesPhone ? 'phone' as const : 'mail' as const,
    keyboardType: 'default' as const,
    label: copy.customerIdentifierLabel,
    placeholder: copy.customerIdentifierPlaceholder,
    textContentType: 'username' as const,
  }
}

export function registrationIdentifierFieldProps(value: string, _role: EntryRole, language: AppLanguage) {
  const usesPhone = isPhoneIdentifierCandidate(value)
  const copy = entryAccessCopy[language].fields
  return {
    icon: usesPhone ? 'phone' as const : 'mail' as const,
    keyboardType: 'default' as const,
    label: copy.customerIdentifierLabel,
    placeholder: copy.customerIdentifierPlaceholder,
    textContentType: 'username' as const,
  }
}
