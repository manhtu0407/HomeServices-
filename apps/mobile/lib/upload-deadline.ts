// A fixed 60 s deadline fails a 3 MB photo on a weak 3G uplink that is still making progress.
// The deadline grows with the bytes at a slow-3G rate and stays bounded (RULES.md #10).
const UPLOAD_MIN_DEADLINE_MS = 60_000
const UPLOAD_MAX_DEADLINE_MS = 240_000
const SLOW_UPLINK_BYTES_PER_SECOND = 48_000
const UPLOAD_HANDSHAKE_MS = 15_000

export function uploadDeadlineMs(bytes: number | null | undefined) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return UPLOAD_MIN_DEADLINE_MS
  const transferMs = Math.ceil((bytes / SLOW_UPLINK_BYTES_PER_SECOND) * 1000) + UPLOAD_HANDSHAKE_MS
  return Math.min(UPLOAD_MAX_DEADLINE_MS, Math.max(UPLOAD_MIN_DEADLINE_MS, transferMs))
}

export function requestBodyBytes(body: unknown): number | null {
  if (body instanceof ArrayBuffer) return body.byteLength
  if (ArrayBuffer.isView(body)) return body.byteLength
  if (typeof body === 'string') return body.length
  return null
}
