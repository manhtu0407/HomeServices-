import AsyncStorage from '@react-native-async-storage/async-storage'
import { SERVICE_TYPES, type KaelPerformanceMode, type ServiceType } from '@nestscout/shared'

import { performanceProfileForServiceType } from './kael-performance-intake'
import { type LocalMediaUploadDraft } from './media-upload'

export const PENDING_KAEL_CHAT_DRAFT_TTL_MS = 30 * 60 * 1000

const PENDING_KAEL_CHAT_DRAFT_STORAGE_KEY = 'nestscout.customer.pending_kael_chat_draft.v2'
const LEGACY_PENDING_KAEL_CHAT_DRAFT_STORAGE_KEY = 'nestscout.customer.pending_kael_chat_draft.v1'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type PendingKaelScheduleWindow = {
  date: string
  start: string
  end: string
  timeZone: 'Asia/Ho_Chi_Minh'
}

export type PendingKaelChatDraft = {
  addressLabel?: string
  clientRequestFingerprint?: string
  clientRequestId?: string
  createdAt?: string
  description?: string
  districtLabel?: string | null
  locale?: 'vi' | 'en'
  message: string
  mediaCount?: number
  photoDrafts?: LocalMediaUploadDraft[]
  preferredWorkerId?: string
  problemChips?: string[]
  profileId: KaelPerformanceMode
  scheduleMode: 'now' | 'scheduled'
  scheduledAt: string
  scheduleWindow?: PendingKaelScheduleWindow
  serviceType: ServiceType | null
  source?: 'booking' | 'kael'
}

type PendingKaelChatDraftEnvelope = {
  draft: PendingKaelChatDraft
  ownerId: string
  savedAt: number
  version: 2
}

// Pending intake can contain an address and local media references, so it must
// never outlive its account owner or the short booking handoff window.
let pendingKaelChatDraftEnvelope: PendingKaelChatDraftEnvelope | null = null
let pendingKaelChatDraftStorageRevision = 0
let pendingKaelChatDraftStorageLane: Promise<void> = Promise.resolve()

function currentPendingKaelChatDraftEnvelope() {
  return pendingKaelChatDraftEnvelope
}

function clonePendingKaelChatDraft(draft: PendingKaelChatDraft): PendingKaelChatDraft {
  return {
    addressLabel: draft.addressLabel,
    clientRequestFingerprint: draft.clientRequestFingerprint,
    clientRequestId: draft.clientRequestId,
    createdAt: draft.createdAt,
    description: draft.description,
    districtLabel: draft.districtLabel,
    locale: draft.locale,
    message: draft.message,
    mediaCount: draft.mediaCount,
    photoDrafts: draft.photoDrafts?.map((photoDraft) => ({ ...photoDraft })),
    preferredWorkerId: draft.preferredWorkerId,
    problemChips: draft.problemChips ? [...draft.problemChips] : undefined,
    profileId: draft.serviceType ? performanceProfileForServiceType(draft.serviceType) : draft.profileId,
    scheduleMode: draft.scheduleMode,
    scheduledAt: draft.scheduledAt,
    scheduleWindow: draft.scheduleWindow ? { ...draft.scheduleWindow } : undefined,
    serviceType: draft.serviceType,
    source: draft.source,
  }
}

function clonePendingKaelChatDraftEnvelope(envelope: PendingKaelChatDraftEnvelope): PendingKaelChatDraftEnvelope {
  return {
    ...envelope,
    draft: clonePendingKaelChatDraft(envelope.draft),
  }
}

function normalizeOwnerId(ownerId: string | null | undefined) {
  if (typeof ownerId !== 'string') return null
  const normalizedOwnerId = ownerId.trim()
  return normalizedOwnerId.length > 0 ? normalizedOwnerId : null
}

function parsePendingKaelChatDraft(value: unknown): PendingKaelChatDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const parsed = value as Partial<PendingKaelChatDraft>
  const serviceType = typeof parsed.serviceType === 'string' && SERVICE_TYPES.includes(parsed.serviceType as ServiceType)
    ? parsed.serviceType as ServiceType
    : null
  if (typeof parsed.message !== 'string' || parsed.message.trim().length === 0 || !serviceType) return null
  const profileId = performanceProfileForServiceType(serviceType)
  const scheduleWindow = parseScheduleWindow(parsed.scheduleWindow)
  const scheduledAt = normalizeIsoTimestamp(parsed.scheduledAt)
  const scheduleMode = parsed.scheduleMode === 'now'
    ? 'now'
    : parsed.scheduleMode === 'scheduled'
      ? 'scheduled'
      : null
  if (
    !scheduledAt || !scheduleMode ||
    (scheduleMode === 'scheduled' && (!scheduleWindow || !scheduleWindowMatchesTimestamp(scheduleWindow, scheduledAt)))
  ) return null
  return clonePendingKaelChatDraft({
    addressLabel: typeof parsed.addressLabel === 'string' ? parsed.addressLabel : undefined,
    clientRequestFingerprint: typeof parsed.clientRequestFingerprint === 'string'
      ? parsed.clientRequestFingerprint
      : undefined,
    clientRequestId: typeof parsed.clientRequestId === 'string' ? parsed.clientRequestId : undefined,
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : undefined,
    description: typeof parsed.description === 'string' ? parsed.description : undefined,
    districtLabel: typeof parsed.districtLabel === 'string' ? parsed.districtLabel : null,
    locale: parsed.locale === 'en' ? 'en' : 'vi',
    mediaCount: typeof parsed.mediaCount === 'number' && Number.isFinite(parsed.mediaCount) && parsed.mediaCount >= 0
      ? parsed.mediaCount
      : undefined,
    message: parsed.message,
    photoDrafts: parseLocalMediaUploadDrafts(parsed.photoDrafts),
    preferredWorkerId: validPreferredWorkerId(parsed.preferredWorkerId),
    problemChips: Array.isArray(parsed.problemChips) ? parsed.problemChips.filter((chip): chip is string => typeof chip === 'string') : undefined,
    profileId,
    scheduleMode,
    scheduledAt,
    scheduleWindow,
    serviceType,
    source: parsed.source === 'kael' ? 'kael' : 'booking',
  })
}

function parsePendingKaelChatDraftEnvelope(value: string | null): PendingKaelChatDraftEnvelope | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<PendingKaelChatDraftEnvelope>
    const ownerId = normalizeOwnerId(parsed.ownerId)
    const draft = parsePendingKaelChatDraft(parsed.draft)
    if (parsed.version !== 2 || !ownerId || typeof parsed.savedAt !== 'number' || !Number.isFinite(parsed.savedAt) || !draft) return null
    return {
      draft,
      ownerId,
      savedAt: parsed.savedAt,
      version: 2,
    }
  } catch {
    return null
  }
}

function parseLocalMediaUploadDrafts(value: unknown): LocalMediaUploadDraft[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const candidate = item as Partial<LocalMediaUploadDraft>
    if (
      typeof candidate.uri !== 'string' || candidate.uri.trim().length === 0 ||
      (candidate.type !== 'image' && candidate.type !== 'video' && candidate.type !== 'audio')
    ) return []
    return [{
      durationMillis: validNonNegativeNumber(candidate.durationMillis),
      fileName: typeof candidate.fileName === 'string' ? candidate.fileName : undefined,
      fileSizeBytes: validNonNegativeNumber(candidate.fileSizeBytes),
      mimeType: typeof candidate.mimeType === 'string' ? candidate.mimeType : undefined,
      type: candidate.type,
      uri: candidate.uri,
    }]
  })
}

function validNonNegativeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function validPreferredWorkerId(value: unknown) {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : undefined
}

function parseScheduleWindow(value: unknown): PendingKaelScheduleWindow | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const candidate = value as Partial<PendingKaelScheduleWindow>
  const dateValue = typeof candidate.date === 'string' ? candidate.date : null
  const startValue = typeof candidate.start === 'string' ? candidate.start : null
  const endValue = typeof candidate.end === 'string' ? candidate.end : null
  const date = parseCalendarDate(dateValue)
  const startMinutes = parseClockMinutes(startValue)
  const endMinutes = parseClockMinutes(endValue)
  if (
    !dateValue || !startValue || !endValue || !date ||
    startMinutes === null || endMinutes === null || startMinutes >= endMinutes ||
    candidate.timeZone !== 'Asia/Ho_Chi_Minh'
  ) return undefined
  return {
    date: dateValue,
    start: startValue,
    end: endValue,
    timeZone: candidate.timeZone,
  }
}

function hasValidPendingSchedule(draft: PendingKaelChatDraft) {
  const scheduledAt = normalizeIsoTimestamp(draft.scheduledAt)
  if (!scheduledAt) return false
  if (draft.scheduleMode === 'now') return true
  if (draft.scheduleMode === 'scheduled') {
    const scheduleWindow = parseScheduleWindow(draft.scheduleWindow)
    return Boolean(scheduleWindow && scheduleWindowMatchesTimestamp(scheduleWindow, scheduledAt))
  }
  return false
}

function normalizeIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const offsetHour = match[8] === undefined ? 0 : Number(match[8])
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9])
  const daysInMonth = month >= 1 && month <= 12
    ? new Date(Date.UTC(year, month, 0)).getUTCDate()
    : 0
  if (
    year === 0 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59 ||
    offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)
  ) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function parseCalendarDate(value: unknown): { day: number; month: number; year: number } | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const daysInMonth = month >= 1 && month <= 12
    ? new Date(Date.UTC(year, month, 0)).getUTCDate()
    : 0
  return year > 0 && day >= 1 && day <= daysInMonth ? { day, month, year } : null
}

function parseClockMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null
}

function scheduleWindowMatchesTimestamp(window: PendingKaelScheduleWindow, scheduledAt: string) {
  const date = parseCalendarDate(window.date)
  const startMinutes = parseClockMinutes(window.start)
  if (!date || startMinutes === null) return false
  const startHour = Math.floor(startMinutes / 60)
  const startMinute = startMinutes % 60
  const expectedUtc = Date.UTC(date.year, date.month - 1, date.day, startHour - 7, startMinute)
  return Date.parse(scheduledAt) === expectedUtc
}

function isEnvelopeFresh(envelope: PendingKaelChatDraftEnvelope, now = Date.now()) {
  return envelope.savedAt <= now && now - envelope.savedAt < PENDING_KAEL_CHAT_DRAFT_TTL_MS
}

function enqueuePendingKaelChatDraftStorageMutation(mutation: () => Promise<void>) {
  const queued = pendingKaelChatDraftStorageLane.then(mutation, mutation)
  pendingKaelChatDraftStorageLane = queued.catch(() => undefined)
  return queued
}

function removeStoredPendingKaelChatDraft() {
  return enqueuePendingKaelChatDraftStorageMutation(async () => {
    await Promise.all([
      AsyncStorage.removeItem(PENDING_KAEL_CHAT_DRAFT_STORAGE_KEY).catch(() => undefined),
      AsyncStorage.removeItem(LEGACY_PENDING_KAEL_CHAT_DRAFT_STORAGE_KEY).catch(() => undefined),
    ])
  })
}

export async function setPendingKaelChatDraft(ownerId: string, draft: PendingKaelChatDraft) {
  const normalizedOwnerId = normalizeOwnerId(ownerId)
  if (!normalizedOwnerId) throw new Error('Pending Kael intake requires an authenticated owner')
  if (!hasValidPendingSchedule(draft)) {
    await clearPendingKaelChatDraft(normalizedOwnerId)
    throw new Error('Basic Intake requires an explicit desired time or now schedule')
  }
  const envelope: PendingKaelChatDraftEnvelope = {
    draft: clonePendingKaelChatDraft(draft),
    ownerId: normalizedOwnerId,
    savedAt: Date.now(),
    version: 2,
  }
  pendingKaelChatDraftStorageRevision += 1
  pendingKaelChatDraftEnvelope = clonePendingKaelChatDraftEnvelope(envelope)
  await enqueuePendingKaelChatDraftStorageMutation(async () => {
    await Promise.all([
      AsyncStorage.setItem(PENDING_KAEL_CHAT_DRAFT_STORAGE_KEY, JSON.stringify(envelope)).catch(() => undefined),
      AsyncStorage.removeItem(LEGACY_PENDING_KAEL_CHAT_DRAFT_STORAGE_KEY).catch(() => undefined),
    ])
  })
}

export function peekPendingKaelChatDraft(ownerId: string | null | undefined) {
  const normalizedOwnerId = normalizeOwnerId(ownerId)
  if (!normalizedOwnerId || !pendingKaelChatDraftEnvelope) return null
  if (pendingKaelChatDraftEnvelope.ownerId !== normalizedOwnerId || !isEnvelopeFresh(pendingKaelChatDraftEnvelope)) {
    pendingKaelChatDraftEnvelope = null
    pendingKaelChatDraftStorageRevision += 1
    void removeStoredPendingKaelChatDraft()
    return null
  }
  return clonePendingKaelChatDraft(pendingKaelChatDraftEnvelope.draft)
}

export async function readPendingKaelChatDraft(ownerId: string | null | undefined) {
  const normalizedOwnerId = normalizeOwnerId(ownerId)
  if (!normalizedOwnerId) return null
  if (pendingKaelChatDraftEnvelope) {
    if (pendingKaelChatDraftEnvelope.ownerId === normalizedOwnerId && isEnvelopeFresh(pendingKaelChatDraftEnvelope)) {
      return clonePendingKaelChatDraft(pendingKaelChatDraftEnvelope.draft)
    }
    pendingKaelChatDraftEnvelope = null
    pendingKaelChatDraftStorageRevision += 1
    await removeStoredPendingKaelChatDraft()
    return null
  }
  await pendingKaelChatDraftStorageLane
  if (currentPendingKaelChatDraftEnvelope()) {
    return readPendingKaelChatDraft(normalizedOwnerId)
  }
  const readRevision = pendingKaelChatDraftStorageRevision
  const [storedEnvelope, legacyDraft] = await Promise.all([
    AsyncStorage.getItem(PENDING_KAEL_CHAT_DRAFT_STORAGE_KEY).catch(() => null),
    AsyncStorage.getItem(LEGACY_PENDING_KAEL_CHAT_DRAFT_STORAGE_KEY).catch(() => null),
  ])
  if (readRevision !== pendingKaelChatDraftStorageRevision) {
    const currentEnvelope = currentPendingKaelChatDraftEnvelope()
    return currentEnvelope?.ownerId === normalizedOwnerId && isEnvelopeFresh(currentEnvelope)
      ? clonePendingKaelChatDraft(currentEnvelope.draft)
      : null
  }
  if (legacyDraft !== null) {
    await enqueuePendingKaelChatDraftStorageMutation(async () => {
      await AsyncStorage.removeItem(LEGACY_PENDING_KAEL_CHAT_DRAFT_STORAGE_KEY).catch(() => undefined)
    })
  }
  if (storedEnvelope === null) return null
  const envelope = parsePendingKaelChatDraftEnvelope(storedEnvelope)
  if (!envelope || envelope.ownerId !== normalizedOwnerId || !isEnvelopeFresh(envelope)) {
    pendingKaelChatDraftStorageRevision += 1
    await removeStoredPendingKaelChatDraft()
    return null
  }
  pendingKaelChatDraftEnvelope = clonePendingKaelChatDraftEnvelope(envelope)
  return clonePendingKaelChatDraft(envelope.draft)
}

export async function clearPendingKaelChatDraft(ownerId: string) {
  const normalizedOwnerId = normalizeOwnerId(ownerId)
  if (!normalizedOwnerId) return
  const clearRevision = ++pendingKaelChatDraftStorageRevision
  if (pendingKaelChatDraftEnvelope?.ownerId === normalizedOwnerId) {
    pendingKaelChatDraftEnvelope = null
  }
  await enqueuePendingKaelChatDraftStorageMutation(async () => {
    const storedEnvelope = await AsyncStorage.getItem(PENDING_KAEL_CHAT_DRAFT_STORAGE_KEY).catch(() => undefined)
    if (clearRevision !== pendingKaelChatDraftStorageRevision) return
    if (typeof storedEnvelope === 'string') {
      const envelope = parsePendingKaelChatDraftEnvelope(storedEnvelope)
      if (!envelope || envelope.ownerId === normalizedOwnerId) {
        await AsyncStorage.removeItem(PENDING_KAEL_CHAT_DRAFT_STORAGE_KEY).catch(() => undefined)
      }
    }
    await AsyncStorage.removeItem(LEGACY_PENDING_KAEL_CHAT_DRAFT_STORAGE_KEY).catch(() => undefined)
  })
}
