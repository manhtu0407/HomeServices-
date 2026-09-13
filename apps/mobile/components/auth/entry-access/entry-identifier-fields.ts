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

export function validateIdentifierForRole(value: string, role: EntryRole, language: AppLanguage) {
  const error = validateAuthIdentifier(value)
  if (!error && role === 'worker' && parseAuthIdentifier(value)?.kind !== 'email') {
    return entryAccessCopy[language].errors.workerEmailRequired
  }
  return error ? localizeEntryAuthError(error, language, 'invalidIdentifier') : null
}

export function validateRegistrationIdentifier(value: string, role: EntryRole, language: AppLanguage) {
  const trimmed = value.trim()
  if (!trimmed) return entryAccessCopy[language].errors.registrationDetails

  const identifier = parseAuthIdentifier(trimmed)
  if (role === 'worker' && identifier?.kind !== 'email') {
    return entryAccessCopy[language].errors.workerEmailRequired
  }
  return identifier?.kind === 'email' || identifier?.kind === 'phone'
    ? null
    : entryAccessCopy[language].errors.invalidEmail
}

export function identifierFieldProps(value: string, role: EntryRole, language: AppLanguage) {
  const usesPhone = isPhoneIdentifierCandidate(value)
  const copy = entryAccessCopy[language].fields
  return {
    icon: role === 'worker' ? 'mail' as const : usesPhone ? 'phone' as const : 'mail' as const,
    keyboardType: 'default' as const,
    label: role === 'worker' ? copy.workerIdentifierLabel : copy.customerIdentifierLabel,
    placeholder: role === 'worker' ? copy.workerIdentifierPlaceholder : copy.customerIdentifierPlaceholder,
    textContentType: role === 'worker' ? 'emailAddress' as const : 'username' as const,
  }
}

export function registrationIdentifierFieldProps(value: string, role: EntryRole, language: AppLanguage) {
  const usesPhone = isPhoneIdentifierCandidate(value)
  const copy = entryAccessCopy[language].fields
  return {
    icon: role === 'worker' ? 'mail' as const : usesPhone ? 'phone' as const : 'mail' as const,
    keyboardType: 'default' as const,
    label: role === 'worker' ? copy.workerIdentifierLabel : copy.customerIdentifierLabel,
    placeholder: role === 'worker' ? copy.workerIdentifierPlaceholder : copy.customerIdentifierPlaceholder,
    textContentType: role === 'worker' ? 'emailAddress' as const : 'username' as const,
  }
}
