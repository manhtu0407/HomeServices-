// X2 (Plan.md §27.5 — 2026-05-29): per-submit idempotency key generator
// for /jobs and /kael/chat POSTs. Uses the standard `crypto.randomUUID()`
// when the runtime exposes it (Hermes >= 0.12 / RN >= 0.74 / Expo SDK 51+)
// and falls back to a Math.random-based RFC 4122 v4 implementation when it
// does not. The fallback collision risk is negligible at our throughput; if
// stronger guarantees are ever needed we can swap in expo-crypto.

export function generateClientRequestId(): string {
  const cryptoGlobal = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto
  if (cryptoGlobal && typeof cryptoGlobal.randomUUID === 'function') {
    return cryptoGlobal.randomUUID()
  }
  return fallbackUuid()
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
