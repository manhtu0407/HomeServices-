import type { KaelMemoryPayload } from '@/lib/api-types'

export type WorkerV5MemoryPreferenceUiId =
  | 'area-preference'
  | 'income-preference'
  | 'travel-limit'
  | 'skill-preference'
  | 'opportunity-filter'
  | 'auto-accept-work'
type WorkerV5MemoryPreferenceApiKey =
  | 'area_preference'
  | 'income_preference'
  | 'travel_limit'
  | 'skill_preference'
  | 'opportunity_filter'
  | 'auto_accept_work'

export const WORKER_V5_MEMORY_PREFERENCE_API_KEYS: Record<WorkerV5MemoryPreferenceUiId, WorkerV5MemoryPreferenceApiKey> = {
  'area-preference': 'area_preference',
  'income-preference': 'income_preference',
  'travel-limit': 'travel_limit',
  'skill-preference': 'skill_preference',
  'opportunity-filter': 'opportunity_filter',
  'auto-accept-work': 'auto_accept_work',
}

function workerV5RecordFromUnknown(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function workerV5MemoryPreferenceOverridesFromMemory(memory: KaelMemoryPayload | null): Partial<Record<WorkerV5MemoryPreferenceUiId, boolean>> {
  const safeMetadata = workerV5RecordFromUnknown(memory?.safe_metadata)
  const preferences = workerV5RecordFromUnknown(safeMetadata?.memory_preferences)
  const overrides: Partial<Record<WorkerV5MemoryPreferenceUiId, boolean>> = {}
  if (!preferences) return overrides
  for (const [uiId, apiKey] of Object.entries(WORKER_V5_MEMORY_PREFERENCE_API_KEYS) as [WorkerV5MemoryPreferenceUiId, WorkerV5MemoryPreferenceApiKey][]) {
    if (typeof preferences[apiKey] === 'boolean') {
      overrides[uiId] = preferences[apiKey]
    }
  }
  return overrides
}
