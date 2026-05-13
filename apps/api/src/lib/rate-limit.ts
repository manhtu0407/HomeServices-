type RateLimitEntry = {
  tokens: number
  lastRefill: number
}

const store = new Map<string, RateLimitEntry>()

const CLEANUP_INTERVAL = 60_000
let lastCleanup = Date.now()

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  const stale = now - 300_000
  for (const [key, entry] of store) {
    if (entry.lastRefill < stale) store.delete(key)
  }
}

export type RateLimitConfig = {
  maxTokens: number
  refillRate: number
  refillIntervalMs: number
}

export const AI_SESSION_LIMIT: RateLimitConfig = {
  maxTokens: 10,
  refillRate: 1,
  refillIntervalMs: 60_000,
}

export const AI_GLOBAL_LIMIT: RateLimitConfig = {
  maxTokens: 100,
  refillRate: 10,
  refillIntervalMs: 60_000,
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
  cost: number = 1,
): { allowed: boolean; retryAfterMs: number } {
  cleanup()

  const now = Date.now()
  let entry = store.get(key)

  if (!entry) {
    entry = { tokens: config.maxTokens, lastRefill: now }
    store.set(key, entry)
  }

  const elapsed = now - entry.lastRefill
  const refills = Math.floor(elapsed / config.refillIntervalMs)
  if (refills > 0) {
    entry.tokens = Math.min(config.maxTokens, entry.tokens + refills * config.refillRate)
    entry.lastRefill = now
  }

  if (entry.tokens >= cost) {
    entry.tokens -= cost
    return { allowed: true, retryAfterMs: 0 }
  }

  const deficit = cost - entry.tokens
  const refillsNeeded = Math.ceil(deficit / config.refillRate)
  const retryAfterMs = refillsNeeded * config.refillIntervalMs

  return { allowed: false, retryAfterMs }
}

export function resetRateLimit(key: string): void {
  store.delete(key)
}
