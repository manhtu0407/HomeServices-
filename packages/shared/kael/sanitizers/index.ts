const PHONE_PATTERN = /\b(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/g
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const ID_NUMBER_PATTERN = /\b\d{9,12}\b/g
const BANK_ACCOUNT_PATTERN = /\b(?:stk|số tài khoản|so tai khoan|bank)\s*[:#-]?\s*\d{6,20}\b/gi
const UNIT_PATTERN = /\b(?:căn|can|unit|phòng|phong|apt)\s*[A-Z0-9.-]+\b/gi
const FLOOR_PATTERN = /\b(?:tầng|tang|lầu|lau|floor)\s*\d+\b/gi
const HOUSE_NUMBER_PATTERN = /\b(?:số nhà|so nha|nhà số|nha so)\s*[A-Z0-9./-]+\b/gi
const VND_PATTERN =
  /\b\d{1,3}(?:[.,]\d{3})+\s*(?:vnd|vnđ|đ|₫|dong|đồng)|\b\d{4,}\s*(?:vnd|vnđ|đ|₫|dong|đồng)/gi

export function stripVndPatterns(input: string): string {
  return input.replace(VND_PATTERN, '[price-removed]')
}

export function scrubPiiText(input: string): string {
  return input
    .replace(EMAIL_PATTERN, '[email]')
    .replace(BANK_ACCOUNT_PATTERN, '[bank-account]')
    .replace(PHONE_PATTERN, '[phone]')
    .replace(ID_NUMBER_PATTERN, '[id-number]')
    .replace(UNIT_PATTERN, '[unit]')
    .replace(FLOOR_PATTERN, '[floor]')
    .replace(HOUSE_NUMBER_PATTERN, '[house-no]')
}

export function sanitizeKaelText(input: string, maxLength = 500): string {
  return stripVndPatterns(scrubPiiText(input))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

export function sanitizeKaelTextArray(input: readonly string[], maxLength = 180): string[] {
  return input
    .map((item) => sanitizeKaelText(item, maxLength))
    .filter((item) => item.length > 0)
}

export function sanitizeKaelOutputObject<T>(value: T): T {
  if (typeof value === 'string') return sanitizeKaelText(value) as T
  if (Array.isArray(value)) return value.map((item) => sanitizeKaelOutputObject(item)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeKaelOutputObject(item)]),
    ) as T
  }
  return value
}
