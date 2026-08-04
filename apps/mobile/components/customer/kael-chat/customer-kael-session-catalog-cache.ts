import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  KAEL_PERFORMANCE_PROFILE_IDS,
  SERVICE_TYPES,
  type KaelPerformanceMode,
  type ServiceType,
} from '@nestscout/shared'

import type {
  CustomerKaelConversationMode,
  CustomerKaelConversationSession,
} from '@/lib/api-types'

const STORAGE_PREFIX = 'nestscout.customer.kael_session_catalog.v1'
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_CACHED_SESSIONS = 20
const pendingWrites = new Map<string, Promise<void>>()

type StoredCustomerKaelSessionCatalog = {
  active_session_id?: string | null
  cached_at: number
  customer_id: string
  mode: CustomerKaelConversationMode
  sessions: CustomerKaelConversationSession[]
  version: 1
}

export type CustomerKaelSessionCatalogState = {
  activeSessionId: string | null
  sessions: CustomerKaelConversationSession[]
}

export async function readCustomerKaelSessionCatalogState(
  customerId: string,
  mode: CustomerKaelConversationMode,
): Promise<CustomerKaelSessionCatalogState | null> {
  const key = storageKey(customerId, mode)
  await pendingWrites.get(key)?.catch(() => undefined)
  const raw = await AsyncStorage.getItem(key).catch(() => null)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<StoredCustomerKaelSessionCatalog>
    if (
      parsed.version !== 1
      || parsed.customer_id !== customerId
      || parsed.mode !== mode
      || typeof parsed.cached_at !== 'number'
      || Date.now() - parsed.cached_at > CACHE_MAX_AGE_MS
      || !Array.isArray(parsed.sessions)
    ) {
      void AsyncStorage.removeItem(key).catch(() => undefined)
      return null
    }

    const sessions = parsed.sessions
      .map((session) => parseCachedSession(session, customerId, mode))
      .filter((session): session is CustomerKaelConversationSession => Boolean(session))
      .slice(0, MAX_CACHED_SESSIONS)
    const activeSessionId = typeof parsed.active_session_id === 'string'
      && sessions.some((session) => session.id === parsed.active_session_id)
      ? parsed.active_session_id
      : null
    return { activeSessionId, sessions }
  } catch {
    void AsyncStorage.removeItem(key).catch(() => undefined)
    return null
  }
}

export async function writeCustomerKaelSessionCatalog(
  customerId: string,
  mode: CustomerKaelConversationMode,
  sessions: CustomerKaelConversationSession[],
  activeSessionId: string | null = null,
): Promise<void> {
  const safeSessions = sessions
    .filter((session) => session.customer_id === customerId && session.mode === mode)
    .slice(0, MAX_CACHED_SESSIONS)
  const payload: StoredCustomerKaelSessionCatalog = {
    active_session_id: safeSessions.some((session) => session.id === activeSessionId)
      ? activeSessionId
      : null,
    cached_at: Date.now(),
    customer_id: customerId,
    mode,
    sessions: safeSessions,
    version: 1,
  }
  const key = storageKey(customerId, mode)
  const previousWrite = pendingWrites.get(key) ?? Promise.resolve()
  const nextWrite = previousWrite
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(key, JSON.stringify(payload)))
    .catch(() => undefined)
  pendingWrites.set(key, nextWrite)
  await nextWrite
  if (pendingWrites.get(key) === nextWrite) pendingWrites.delete(key)
}

function storageKey(customerId: string, mode: CustomerKaelConversationMode) {
  return `${STORAGE_PREFIX}.${encodeURIComponent(customerId)}.${mode}`
}

function parseCachedSession(
  value: unknown,
  customerId: string,
  mode: CustomerKaelConversationMode,
): CustomerKaelConversationSession | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const session = value as Record<string, unknown>
  if (
    typeof session.id !== 'string'
    || session.mode !== mode
    || session.customer_id !== customerId
    || typeof session.client_request_id !== 'string'
    || typeof session.started_at !== 'string'
    || typeof session.updated_at !== 'string'
    || typeof session.total_turns !== 'number'
    || !Number.isFinite(session.total_turns)
  ) return null

  return {
    case_job_id: nullableString(session.case_job_id),
    case_session_id: nullableString(session.case_session_id),
    client_request_id: session.client_request_id,
    customer_id: customerId,
    id: session.id,
    mode,
    pinned_at: nullableString(session.pinned_at),
    profile_id: nullablePerformanceProfile(session.profile_id),
    service_type: nullableServiceType(session.service_type),
    started_at: session.started_at,
    title: nullableString(session.title),
    total_turns: Math.max(0, Math.floor(session.total_turns)),
    updated_at: session.updated_at,
  }
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function nullablePerformanceProfile(value: unknown): KaelPerformanceMode | null {
  return typeof value === 'string' && (KAEL_PERFORMANCE_PROFILE_IDS as readonly string[]).includes(value)
    ? value as KaelPerformanceMode
    : null
}

function nullableServiceType(value: unknown): ServiceType | null {
  return typeof value === 'string' && (SERVICE_TYPES as readonly string[]).includes(value)
    ? value as ServiceType
    : null
}
