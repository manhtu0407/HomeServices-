import { parseAuthIdentifier } from './auth-identifier'

const INVALID_PROFILE_ERROR = 'Thông tin hồ sơ chưa hợp lệ.'
const MAX_NAME_LENGTH = 100
const MAX_NICKNAME_LENGTH = 80
const MAX_SHORT_LABEL_LENGTH = 40
const MAX_ADDRESS_LENGTH = 300
const MAX_SAVED_ADDRESSES = 8

export type CustomerProfileMetadataDraft = {
  birthDate?: string
  defaultAddress?: string
  displayName?: string
  email?: string
  fullName?: string
  gender?: string
  nickname?: string
  phone?: string
  salutation?: string
  savedAddresses?: string[]
}

type CustomerProfileMetadata = Record<string, null | string | string[]>

type CustomerProfileMetadataResult =
  | { success: true; data: CustomerProfileMetadata }
  | { success: false; error: string }

const INVALID_VALUE = Symbol('invalid-profile-value')

export function buildCustomerProfileMetadata(
  profile: CustomerProfileMetadataDraft,
): CustomerProfileMetadataResult {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return invalidProfile()

  const data: CustomerProfileMetadata = {}
  const displayName = normalizedField(profile.displayName, MAX_NAME_LENGTH)
  const fullName = normalizedField(profile.fullName, MAX_NAME_LENGTH)
  const nickname = normalizedField(profile.nickname, MAX_NICKNAME_LENGTH)
  const salutation = normalizedField(profile.salutation, MAX_SHORT_LABEL_LENGTH)
  const gender = normalizedField(profile.gender, MAX_SHORT_LABEL_LENGTH)
  const defaultAddress = normalizedField(profile.defaultAddress, MAX_ADDRESS_LENGTH)
  if (
    isInvalidValue(displayName)
    || isInvalidValue(fullName)
    || isInvalidValue(nickname)
    || isInvalidValue(salutation)
    || isInvalidValue(gender)
    || isInvalidValue(defaultAddress)
  ) {
    return invalidProfile()
  }
  if (displayName && displayName.length < 2) return invalidProfile()
  if (fullName && fullName.length < 2) return invalidProfile()

  if (displayName) Object.assign(data, { full_name: displayName, name: displayName })
  if (fullName) Object.assign(data, { full_name: fullName, name: fullName })
  if (profile.nickname !== undefined) {
    Object.assign(data, { nickname: nickname || null, preferred_name: nickname || null })
  }
  if (profile.salutation !== undefined) data.salutation = salutation || null
  if (profile.gender !== undefined) data.gender = gender || null
  if (profile.defaultAddress !== undefined) data.default_address = defaultAddress || null

  if (profile.birthDate !== undefined) {
    const birthDate = normalizedField(profile.birthDate, 10)
    if (birthDate === INVALID_VALUE || (birthDate && !isValidPastDate(birthDate))) return invalidProfile()
    data.birth_date = birthDate || null
  }

  if (profile.email !== undefined) {
    const email = normalizedField(profile.email, 254)
    if (email === INVALID_VALUE) return invalidProfile()
    const identifier = email ? parseAuthIdentifier(email) : null
    if (email && identifier?.kind !== 'email') return invalidProfile()
    data.contact_email = identifier?.value ?? null
  }

  if (profile.phone !== undefined) {
    const phone = normalizedField(profile.phone, 32)
    if (phone === INVALID_VALUE) return invalidProfile()
    const identifier = phone ? parseAuthIdentifier(phone) : null
    if (phone && identifier?.kind !== 'phone') return invalidProfile()
    data.phone_number = identifier?.value ?? null
  }

  if (profile.savedAddresses !== undefined) {
    if (!Array.isArray(profile.savedAddresses) || profile.savedAddresses.length > MAX_SAVED_ADDRESSES) {
      return invalidProfile()
    }
    const savedAddresses: string[] = []
    const seen = new Set<string>()
    for (const rawAddress of profile.savedAddresses) {
      const address = normalizedField(rawAddress, MAX_ADDRESS_LENGTH)
      if (address === INVALID_VALUE) return invalidProfile()
      if (!address) continue
      const key = address.toLocaleLowerCase('vi')
      if (seen.has(key)) continue
      seen.add(key)
      savedAddresses.push(address)
    }
    data.saved_addresses = savedAddresses
  }

  return { data, success: true }
}

function normalizedField(value: unknown, maxLength: number) {
  if (value === undefined) return undefined
  if (typeof value !== 'string') return INVALID_VALUE
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized.length <= maxLength ? normalized : INVALID_VALUE
}

function isInvalidValue(
  value: ReturnType<typeof normalizedField>,
): value is typeof INVALID_VALUE {
  return value === INVALID_VALUE
}

function isValidPastDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value
    && parsed.getUTCFullYear() >= 1900
    && parsed.getTime() <= Date.now()
}

function invalidProfile(): CustomerProfileMetadataResult {
  return { error: INVALID_PROFILE_ERROR, success: false }
}
