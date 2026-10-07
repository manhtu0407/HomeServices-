import { resourcePolicyFor } from './resource-policies'

export type CacheEntry<T = unknown> = {
  data: T
  fetchedAt: number
  invalidated: boolean
}

export type FetchOutcome<T> =
  | { success: true; data: T }
  | { success: false; error?: string; code?: string }

type Listener = () => void

// Every key carries its owner, so one account can never read another account's entry,
// even before the sign-out wipe has run.
const entries = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<FetchOutcome<unknown>>>()
const listeners = new Set<Listener>()
const ownerGenerations = new Map<string, number>()
const writeObservers = new Set<(ownerId: string) => void>()

function entryKey(ownerId: string, key: string) {
  return `${ownerId}\u0000${key}`
}

function notify() {
  listeners.forEach((listener) => listener())
}

function ownerGeneration(ownerId: string) {
  return ownerGenerations.get(ownerId) ?? 0
}

export function subscribeResources(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function observeResourceWrites(observer: (ownerId: string) => void) {
  writeObservers.add(observer)
  return () => {
    writeObservers.delete(observer)
  }
}

export function peekResource<T>(ownerId: string, key: string): CacheEntry<T> | null {
  return (entries.get(entryKey(ownerId, key)) as CacheEntry<T> | undefined) ?? null
}

export function readResource<T>(ownerId: string, key: string, now = Date.now()): CacheEntry<T> | null {
  const entry = peekResource<T>(ownerId, key)
  if (!entry) return null
  return now - entry.fetchedAt > resourcePolicyFor(key).maxAgeMs ? null : entry
}

export function isResourceStale(key: string, entry: CacheEntry | null, now = Date.now()) {
  if (!entry) return true
  return entry.invalidated || now - entry.fetchedAt >= resourcePolicyFor(key).staleMs
}

export function writeResource<T>(ownerId: string, key: string, data: T, fetchedAt = Date.now()) {
  entries.set(entryKey(ownerId, key), { data, fetchedAt, invalidated: false })
  writeObservers.forEach((observer) => observer(ownerId))
  notify()
}

export function removeResource(ownerId: string, key: string) {
  if (!entries.delete(entryKey(ownerId, key))) return
  writeObservers.forEach((observer) => observer(ownerId))
  notify()
}

// Restores persisted entries without overwriting anything fetched during this launch.
export function seedResource<T>(ownerId: string, key: string, entry: CacheEntry<T>) {
  const id = entryKey(ownerId, key)
  const current = entries.get(id)
  if (current && current.fetchedAt >= entry.fetchedAt) return false
  entries.set(id, entry)
  return true
}

export function notifyResourceSeeded() {
  notify()
}

export function ownerResourceEntries(ownerId: string) {
  const prefix = `${ownerId}\u0000`
  const owned: Array<[string, CacheEntry]> = []
  entries.forEach((entry, id) => {
    if (id.startsWith(prefix)) owned.push([id.slice(prefix.length), entry])
  })
  return owned
}

// Keeps the last value visible but forces the next reader to revalidate it.
export function invalidateResource(ownerId: string, keyPrefix: string) {
  const prefix = entryKey(ownerId, keyPrefix)
  let changed = false
  entries.forEach((entry, id) => {
    if (!id.startsWith(prefix) || entry.invalidated) return
    entries.set(id, { ...entry, invalidated: true })
    changed = true
  })
  if (changed) {
    writeObservers.forEach((observer) => observer(ownerId))
    notify()
  }
}

export function fetchResource<T>(
  ownerId: string,
  key: string,
  fetcher: () => Promise<FetchOutcome<T>>,
): Promise<FetchOutcome<T>> {
  const id = entryKey(ownerId, key)
  const pending = inFlight.get(id)
  if (pending) return pending as Promise<FetchOutcome<T>>

  const generation = ownerGeneration(ownerId)
  const request = (async (): Promise<FetchOutcome<T>> => {
    try {
      const outcome = await fetcher()
      // A response that lands after the owner was wiped belongs to a session that no longer exists.
      if (outcome.success && ownerGeneration(ownerId) === generation) {
        writeResource(ownerId, key, outcome.data)
      }
      return outcome
    } catch {
      return { success: false, code: 'RESOURCE_FETCH_FAILED' }
    } finally {
      inFlight.delete(id)
    }
  })()
  inFlight.set(id, request as Promise<FetchOutcome<unknown>>)
  return request
}

export function clearResourceOwner(ownerId: string) {
  ownerGenerations.set(ownerId, ownerGeneration(ownerId) + 1)
  const prefix = `${ownerId}\u0000`
  for (const id of [...entries.keys()]) {
    if (id.startsWith(prefix)) entries.delete(id)
  }
  for (const id of [...inFlight.keys()]) {
    if (id.startsWith(prefix)) inFlight.delete(id)
  }
  notify()
}

export function resetResourceCacheForTests() {
  entries.clear()
  inFlight.clear()
  ownerGenerations.clear()
  notify()
}
