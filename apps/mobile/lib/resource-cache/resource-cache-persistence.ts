import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  clearResourceOwner,
  notifyResourceSeeded,
  observeResourceWrites,
  ownerResourceEntries,
  seedResource,
  type CacheEntry,
} from './resource-cache'
import { resourcePolicyFor } from './resource-policies'

// One envelope for one account: the device never holds two accounts' cached data at once.
export const RESOURCE_CACHE_STORAGE_KEY = 'nestscout.resource-cache.v1'
const SCHEMA_VERSION = 1
const WRITE_DEBOUNCE_MS = 250
// Android AsyncStorage rows fail above ~2 MB; stay well under it.
const MAX_PERSISTED_CHARS = 900_000

type PersistedEnvelope = {
  v: number
  ownerId: string
  entries: Record<string, CacheEntry>
}

let activeOwner: string | null = null
let hydration: Promise<void> | null = null
let writeTimer: ReturnType<typeof setTimeout> | null = null
let writeChain: Promise<void> = Promise.resolve()

function isCacheEntry(value: unknown): value is CacheEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return 'data' in entry
    && typeof entry.fetchedAt === 'number'
    && Number.isFinite(entry.fetchedAt)
    && typeof entry.invalidated === 'boolean'
}

function parseEnvelope(raw: string): PersistedEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedEnvelope> | null
    if (!parsed || parsed.v !== SCHEMA_VERSION || typeof parsed.ownerId !== 'string') return null
    if (typeof parsed.entries !== 'object' || parsed.entries === null) return null
    return parsed as PersistedEnvelope
  } catch {
    return null
  }
}

export function hydrateResourceOwner(ownerId: string): Promise<void> {
  if (activeOwner === ownerId && hydration) return hydration
  activeOwner = ownerId
  const request = (async () => {
    try {
      // A sign-out removal still queued must land first, or the wiped envelope would be read back.
      await writeChain
      const raw = await AsyncStorage.getItem(RESOURCE_CACHE_STORAGE_KEY)
      if (!raw || activeOwner !== ownerId) return
      const envelope = parseEnvelope(raw)
      if (!envelope || envelope.ownerId !== ownerId) {
        await AsyncStorage.removeItem(RESOURCE_CACHE_STORAGE_KEY)
        return
      }
      const now = Date.now()
      let seeded = false
      for (const [key, entry] of Object.entries(envelope.entries)) {
        const policy = resourcePolicyFor(key)
        if (!policy.persist || !isCacheEntry(entry)) continue
        if (entry.fetchedAt > now || now - entry.fetchedAt > policy.maxAgeMs) continue
        seeded = seedResource(ownerId, key, entry) || seeded
      }
      if (seeded) notifyResourceSeeded()
    } catch {
      // A cache that cannot be read is only a slower launch; the server stays the source of truth.
    }
  })()
  hydration = request
  return request
}

function serializeOwner(ownerId: string) {
  const persisted = ownerResourceEntries(ownerId)
    .filter(([key]) => resourcePolicyFor(key).persist)
    .map(([key, entry]) => [key, entry, JSON.stringify(entry).length] as const)
    .sort((left, right) => left[2] - right[2])

  const kept: Record<string, CacheEntry> = {}
  let size = 0
  for (const [key, entry, length] of persisted) {
    if (size + length > MAX_PERSISTED_CHARS) break
    kept[key] = entry
    size += length
  }
  return JSON.stringify({ v: SCHEMA_VERSION, ownerId, entries: kept } satisfies PersistedEnvelope)
}

function persistOwner(ownerId: string) {
  writeChain = writeChain
    .then(async () => {
      if (activeOwner !== ownerId) return
      await AsyncStorage.setItem(RESOURCE_CACHE_STORAGE_KEY, serializeOwner(ownerId))
    })
    .catch(() => undefined)
  return writeChain
}

function schedulePersist(ownerId: string) {
  if (activeOwner !== ownerId) return
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    writeTimer = null
    void persistOwner(ownerId)
  }, WRITE_DEBOUNCE_MS)
}

observeResourceWrites(schedulePersist)

// Sign-out and account switch: drop memory, cancel pending writes, and remove the disk copy.
export async function forgetResourceOwner(ownerId: string | null) {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = null
  if (ownerId) clearResourceOwner(ownerId)
  if (!ownerId || activeOwner === ownerId) {
    activeOwner = null
    hydration = null
  }
  writeChain = writeChain
    .then(() => AsyncStorage.removeItem(RESOURCE_CACHE_STORAGE_KEY))
    .catch(() => undefined)
  await writeChain
}

export async function flushResourcePersistenceForTests() {
  if (writeTimer && activeOwner) {
    clearTimeout(writeTimer)
    writeTimer = null
    await persistOwner(activeOwner)
  }
  await writeChain
}

export function resetResourcePersistenceForTests() {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = null
  activeOwner = null
  hydration = null
  writeChain = Promise.resolve()
}
