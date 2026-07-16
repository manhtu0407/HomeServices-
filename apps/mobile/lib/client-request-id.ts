// Prefer the runtime UUID implementation for idempotency keys, with a
// compatibility fallback for runtimes that do not expose it.

export function generateClientRequestId(): string {
  const cryptoGlobal = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto
  if (cryptoGlobal && typeof cryptoGlobal.randomUUID === 'function') {
    return cryptoGlobal.randomUUID()
  }
  return fallbackUuid()
}

export type PendingClientRequestId = {
  fingerprint: string
  id: string
}

export type PendingClientRequestRef = {
  current: PendingClientRequestId | null
}

export function stableClientRequestId(
  ref: PendingClientRequestRef,
  fingerprint: string,
): string {
  if (!ref.current || ref.current.fingerprint !== fingerprint) {
    ref.current = { fingerprint, id: generateClientRequestId() }
  }
  return ref.current.id
}

export function clearStableClientRequestId(
  ref: PendingClientRequestRef,
  fingerprint: string,
): void {
  if (ref.current?.fingerprint === fingerprint) {
    ref.current = null
  }
}

const AMBIGUOUS_MUTATION_ERROR_CODES = new Set([
  'INVALID_RESPONSE',
  'NETWORK_ERROR',
  'REQUEST_IN_PROGRESS',
  'RESPONSE_TOO_LARGE',
  'SESSION_PENDING',
  'STREAM_TIMEOUT',
  'TIMEOUT',
])

export function shouldRetainClientRequestId(failure: {
  code?: string
  status?: number
}): boolean {
  if (failure.code && AMBIGUOUS_MUTATION_ERROR_CODES.has(failure.code)) return true
  const status = failure.status
  if (status === undefined) return false
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500
}

function fallbackUuid(): string {
  // RFC 4122 v4 layout: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx where y is one
  // of {8, 9, a, b}.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0
    const value = char === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}
