import AsyncStorage from '@react-native-async-storage/async-storage'
import type { WorkerKaelChatMode } from '@nestscout/shared'

import type { WorkerKaelChatSession } from '@/lib/api-types'

const STORAGE_PREFIX = 'nestscout.worker.kael_session_catalog.v2'
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_CACHED_SESSIONS = 20
const pendingWrites = new Map<string, Promise<void>>()

type StoredWorkerKaelSessionCatalog = {
  cached_at: number
  mode: WorkerKaelChatMode
  sessions: WorkerKaelChatSession[]
  version: 2
  worker_id: string
}

export async function readWorkerKaelSessionCatalog(
  workerId: string,
  mode: WorkerKaelChatMode,
): Promise<WorkerKaelChatSession[] | null> {
  const key = storageKey(workerId, mode)
  await pendingWrites.get(key)?.catch(() => undefined)
  const raw = await AsyncStorage.getItem(key).catch(() => null)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<StoredWorkerKaelSessionCatalog>
    if (
      parsed.version !== 2
      || parsed.worker_id !== workerId
      || parsed.mode !== mode
      || typeof parsed.cached_at !== 'number'
      || Date.now() - parsed.cached_at > CACHE_MAX_AGE_MS
      || !Array.isArray(parsed.sessions)
    ) {
      void AsyncStorage.removeItem(key).catch(() => undefined)
      return null
    }

    return parsed.sessions
      .map((session) => parseCachedSession(session, workerId, mode))
      .filter((session): session is WorkerKaelChatSession => Boolean(session))
      .slice(0, MAX_CACHED_SESSIONS)
  } catch {
    void AsyncStorage.removeItem(key).catch(() => undefined)
    return null
  }
}

export async function writeWorkerKaelSessionCatalog(
  workerId: string,
  mode: WorkerKaelChatMode,
  sessions: WorkerKaelChatSession[],
): Promise<void> {
  const safeSessions = sessions
    .filter((session) => session.worker_id === workerId && session.mode === mode)
    .slice(0, MAX_CACHED_SESSIONS)
    .map(toCachedSession)
  const payload: StoredWorkerKaelSessionCatalog = {
    cached_at: Date.now(),
    mode,
    sessions: safeSessions,
    version: 2,
    worker_id: workerId,
  }
  const key = storageKey(workerId, mode)
  const previousWrite = pendingWrites.get(key) ?? Promise.resolve()
  const nextWrite = previousWrite
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(key, JSON.stringify(payload)))
    .catch(() => undefined)
  pendingWrites.set(key, nextWrite)
  await nextWrite
  if (pendingWrites.get(key) === nextWrite) pendingWrites.delete(key)
}

function storageKey(workerId: string, mode: WorkerKaelChatMode) {
  return `${STORAGE_PREFIX}.${encodeURIComponent(workerId)}.${mode}`
}

function toCachedSession(session: WorkerKaelChatSession): WorkerKaelChatSession {
  return {
    closed_at: session.closed_at,
    id: session.id,
    job_id: session.job_id,
    mode: session.mode,
    pinned_at: session.pinned_at,
    progress: null,
    started_at: session.started_at,
    status: session.status,
    title: session.title,
    total_turns: session.total_turns,
    worker_id: session.worker_id,
  }
}

function parseCachedSession(
  value: unknown,
  workerId: string,
  mode: WorkerKaelChatMode,
): WorkerKaelChatSession | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const session = value as Record<string, unknown>
  const jobId = typeof session.job_id === 'string' ? session.job_id : null
  if (
    typeof session.id !== 'string'
    || (mode === 'normal' && jobId !== null)
    || session.mode !== mode
    || session.worker_id !== workerId
    || typeof session.started_at !== 'string'
    || typeof session.total_turns !== 'number'
    || !Number.isFinite(session.total_turns)
    || !isWorkerKaelSessionStatus(session.status)
  ) return null

  return {
    closed_at: nullableString(session.closed_at),
    id: session.id,
    job_id: jobId,
    mode,
    pinned_at: nullableString(session.pinned_at),
    progress: null,
    started_at: session.started_at,
    status: session.status,
    title: nullableString(session.title),
    total_turns: Math.max(0, Math.floor(session.total_turns)),
    worker_id: workerId,
  }
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function isWorkerKaelSessionStatus(value: unknown): value is WorkerKaelChatSession['status'] {
  return value === 'active' || value === 'closed' || value === 'escalated' || value === 'error'
}
