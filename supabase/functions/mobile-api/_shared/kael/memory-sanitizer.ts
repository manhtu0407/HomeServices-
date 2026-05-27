export function sanitizeMemoryText(input: string, maxLength = 1000): string {
  return input
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/g, "[phone]")
    .replace(/\b\d{11,12}\b/g, "[id-number]")
    .replace(/\b(?:cccd|cmnd|id)\s*[:#-]?\s*\d{6,20}\b/gi, "[id-number]")
    .replace(/\b(?:căn|can|unit|phòng|phong|apt)\s*[A-Z0-9.-]+\b/gi, "[unit]")
    .replace(/\b(?:tầng|tang|lầu|lau|floor)\s*\d+\b/gi, "[floor]")
    .replace(/\b(?:số nhà|so nha|nhà số|nha so)\s*[A-Z0-9./-]+\b/gi, "[house-no]")
    .replace(/\b(?:stk|số tài khoản|so tai khoan|bank)\s*[:#-]?\s*\d{6,20}\b/gi, "[bank-account]")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeMemoryObject<T>(value: T): T {
  if (typeof value === "string") return sanitizeMemoryText(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeMemoryObject(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !isSensitiveKey(key))
        .map(([key, item]) => [key, sanitizeMemoryObject(item)]),
    ) as T;
  }
  return value;
}

function isSensitiveKey(key: string) {
  return /home_context|address_building|address_unit|address_floor|^unit$|^floor$|^building$/i
    .test(key);
}
