export type ResourcePolicy = {
  // Younger than this, a cached value is shown without asking the server again.
  staleMs: number
  // Older than this, a cached value is never shown: an old number is worse than an honest empty state (RULES.md #8).
  maxAgeMs: number
  // Only display-grade data may reach the device disk. Money credentials, exact addresses,
  // chat content and signed media URLs stay in memory.
  persist: boolean
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const RESOURCE_POLICIES = {
  'auth.role': { staleMs: 0, maxAgeMs: 30 * DAY, persist: true },
  'auth.admin-activation': { staleMs: 0, maxAgeMs: 30 * DAY, persist: true },
  'customer.service-history': { staleMs: 2 * MINUTE, maxAgeMs: 7 * DAY, persist: true },
  'customer.membership': { staleMs: 5 * MINUTE, maxAgeMs: 7 * DAY, persist: true },
  'customer.compensation': { staleMs: 0, maxAgeMs: 1 * DAY, persist: true },
  'customer.refund-account': { staleMs: 5 * MINUTE, maxAgeMs: 1 * HOUR, persist: false },
  'customer.profile-insights': { staleMs: 5 * MINUTE, maxAgeMs: 7 * DAY, persist: true },
  'customer.kael-memory': { staleMs: 5 * MINUTE, maxAgeMs: 1 * DAY, persist: false },
  'notifications': { staleMs: 1 * MINUTE, maxAgeMs: 3 * DAY, persist: true },
  'worker.profile': { staleMs: 5 * MINUTE, maxAgeMs: 7 * DAY, persist: true },
  'worker.earnings': { staleMs: 5 * MINUTE, maxAgeMs: 1 * DAY, persist: true },
  'worker.performance-insights': { staleMs: 10 * MINUTE, maxAgeMs: 7 * DAY, persist: true },
  'worker.payout-method': { staleMs: 10 * MINUTE, maxAgeMs: 1 * HOUR, persist: false },
  'worker.withdrawal-requests': { staleMs: 5 * MINUTE, maxAgeMs: 1 * DAY, persist: true },
  'worker.compensation': { staleMs: 0, maxAgeMs: 1 * DAY, persist: true },
  'worker.kael-memory': { staleMs: 5 * MINUTE, maxAgeMs: 1 * DAY, persist: false },
  'admin.system': { staleMs: 2 * MINUTE, maxAgeMs: 1 * HOUR, persist: false },
} as const satisfies Record<string, ResourcePolicy>

export type ResourceFamily = keyof typeof RESOURCE_POLICIES
export type ResourceKey = ResourceFamily | `${ResourceFamily}:${string}`

// Unknown families fall back to memory-only, so a new key can never leak to disk by omission.
const MEMORY_ONLY_POLICY: ResourcePolicy = { staleMs: 0, maxAgeMs: 1 * HOUR, persist: false }

export function resourceFamily(key: string) {
  const separator = key.indexOf(':')
  return separator === -1 ? key : key.slice(0, separator)
}

export function resourcePolicyFor(key: string): ResourcePolicy {
  const family = resourceFamily(key)
  return Object.hasOwn(RESOURCE_POLICIES, family)
    ? RESOURCE_POLICIES[family as ResourceFamily]
    : MEMORY_ONLY_POLICY
}
