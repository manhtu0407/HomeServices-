// Shared boundary guards for short values received from external providers.
// Provider text may be normalized for display; opaque identifiers and codes fail closed.

const UNSAFE_PROVIDER_CHARACTER =
  /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;
const UNSAFE_PROVIDER_CHARACTERS =
  /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;
const CANONICAL_PROVIDER_CODE = /^[A-Za-z][A-Za-z0-9_]*$/u;

export function boundedProviderText(
  value: unknown,
  maxLength: number,
): string {
  if (typeof value !== "string" || !validMaxLength(maxLength)) return "";
  const normalized = value
    .replace(UNSAFE_PROVIDER_CHARACTERS, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return truncateWithoutBrokenSurrogate(normalized, maxLength);
}

export function boundedProviderIdentifier(
  value: unknown,
  maxLength: number,
): string {
  if (typeof value !== "string" || !validMaxLength(maxLength)) return "";
  if (UNSAFE_PROVIDER_CHARACTER.test(value)) return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    return "";
  }
  return trimmed;
}

export function boundedCanonicalProviderCode(
  value: unknown,
  maxLength: number,
): string | null {
  const code = boundedProviderIdentifier(value, maxLength);
  return code && CANONICAL_PROVIDER_CODE.test(code) ? code : null;
}

function validMaxLength(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function truncateWithoutBrokenSurrogate(
  value: string,
  maxLength: number,
): string {
  if (value.length <= maxLength) return value;
  const truncated = value.slice(0, maxLength).trim();
  return /[\uD800-\uDBFF]$/u.test(truncated)
    ? truncated.slice(0, -1).trimEnd()
    : truncated;
}
