type RateLimitEntry = {
  tokens: number;
  lastRefill: number;
  safeToDeleteAt: number;
};

const store = new Map<string, RateLimitEntry>();
const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

export type RateLimitConfig = {
  maxTokens: number;
  refillRate: number;
  refillIntervalMs: number;
};

export const AI_SESSION_LIMIT: RateLimitConfig = {
  maxTokens: 10,
  refillRate: 1,
  refillIntervalMs: 60_000,
};

// One token bucket cannot express both per-minute and per-hour limits, so both
// buckets must allow the request.
export const KAEL_CHAT_PER_MINUTE_LIMIT: RateLimitConfig = {
  maxTokens: 5,
  refillRate: 5,
  refillIntervalMs: 60_000,
};

export const KAEL_CHAT_PER_HOUR_LIMIT: RateLimitConfig = {
  maxTokens: 20,
  refillRate: 20,
  refillIntervalMs: 3_600_000,
};

export function checkKaelChatRateLimit(
  userId: string,
): { allowed: boolean; retryAfterMs: number; reason: "minute" | "hour" | null } {
  const minute = checkRateLimit(
    `kael_chat_min:${userId}`,
    KAEL_CHAT_PER_MINUTE_LIMIT,
  );
  if (!minute.allowed) {
    return { allowed: false, retryAfterMs: minute.retryAfterMs, reason: "minute" };
  }
  const hour = checkRateLimit(
    `kael_chat_hour:${userId}`,
    KAEL_CHAT_PER_HOUR_LIMIT,
  );
  if (!hour.allowed) {
    return { allowed: false, retryAfterMs: hour.retryAfterMs, reason: "hour" };
  }
  return { allowed: true, retryAfterMs: 0, reason: null };
}

// Test helper — exposed only for unit tests that need to reset bucket state
// between cases. Do not call from production code paths.
export function __resetRateLimitStoreForTests(): void {
  store.clear();
  lastCleanup = Date.now();
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
  cost = 1,
): { allowed: boolean; retryAfterMs: number } {
  cleanup();

  const now = Date.now();
  let entry = store.get(key);
  if (!entry) {
    entry = {
      tokens: config.maxTokens,
      lastRefill: now,
      safeToDeleteAt: now + CLEANUP_INTERVAL,
    };
    store.set(key, entry);
  }

  const elapsed = now - entry.lastRefill;
  const refills = Math.floor(elapsed / config.refillIntervalMs);
  if (refills > 0) {
    entry.tokens = Math.min(
      config.maxTokens,
      entry.tokens + refills * config.refillRate,
    );
    entry.lastRefill = now;
  }

  if (entry.tokens >= cost) {
    entry.tokens -= cost;
    scheduleSafeCleanup(entry, config, now);
    return { allowed: true, retryAfterMs: 0 };
  }

  const deficit = cost - entry.tokens;
  const refillsNeeded = Math.ceil(deficit / config.refillRate);
  scheduleSafeCleanup(entry, config, now);
  return {
    allowed: false,
    retryAfterMs: refillsNeeded * config.refillIntervalMs,
  };
}

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.safeToDeleteAt <= now) store.delete(key);
  }
}

function scheduleSafeCleanup(
  entry: RateLimitEntry,
  config: RateLimitConfig,
  now: number,
) {
  // Forget a bucket only once it would have refilled to capacity. Replacing it
  // with a fresh bucket any earlier silently bypasses long-window limits.
  const missingTokens = Math.max(0, config.maxTokens - entry.tokens);
  const refillIntervals = Math.ceil(missingTokens / config.refillRate);
  entry.safeToDeleteAt = now + Math.max(
    CLEANUP_INTERVAL,
    refillIntervals * config.refillIntervalMs,
  );
}
