import AsyncStorage from '@react-native-async-storage/async-storage'
import { SERVICE_TYPES, type KaelPerformanceMode, type ServiceType } from '@nestscout/shared'
import { type LocalMediaUploadDraft } from '@/lib/media-upload'
import { performanceProfileForServiceType } from '@/lib/kael-performance-intake'

export type PendingKaelScheduleWindow = {
  date: string
  start: string
  end: string
  timeZone: 'Asia/Ho_Chi_Minh'
}

export type PendingKaelChatDraft = {
  addressLabel?: string
  clientRequestId?: string
  createdAt?: string
  description?: string
  districtLabel?: string | null
  locale?: 'vi' | 'en'
  message: string
  mediaCount?: number
  photoDrafts?: LocalMediaUploadDraft[]
  problemChips?: string[]
  profileId: KaelPerformanceMode
  scheduleMode: 'now' | 'scheduled'
  scheduledAt: string
  scheduleWindow?: PendingKaelScheduleWindow
  serviceType: ServiceType | null
  source?: 'booking' | 'kael'
}

let pendingKaelChatDraft: PendingKaelChatDraft | null = null
const PENDING_KAEL_CHAT_DRAFT_STORAGE_KEY = 'nestscout.customer.pending_kael_chat_draft.v1'

function clonePendingKaelChatDraft(draft: PendingKaelChatDraft): PendingKaelChatDraft {
  return {
    addressLabel: draft.addressLabel,
    clientRequestId: draft.clientRequestId,
    createdAt: draft.createdAt,
    description: draft.description,
    districtLabel: draft.districtLabel,
    locale: draft.locale,
    message: draft.message,
    mediaCount: draft.mediaCount,
    photoDrafts: draft.photoDrafts ? [...draft.photoDrafts] : undefined,
    problemChips: draft.problemChips ? [...draft.problemChips] : undefined,
    profileId: draft.serviceType ? performanceProfileForServiceType(draft.serviceType) : draft.profileId,
    scheduleMode: draft.scheduleMode,
    scheduledAt: draft.scheduledAt,
    scheduleWindow: draft.scheduleWindow ? { ...draft.scheduleWindow } : undefined,
    serviceType: draft.serviceType,
    source: draft.source,
  }
}

function parsePendingKaelChatDraft(value: string | null): PendingKaelChatDraft | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<PendingKaelChatDraft>
    const serviceType = typeof parsed.serviceType === 'string' && SERVICE_TYPES.includes(parsed.serviceType as ServiceType)
      ? parsed.serviceType as ServiceType
      : null
    if (typeof parsed.message !== 'string' || parsed.message.trim().length === 0 || !serviceType) return null
    const profileId = performanceProfileForServiceType(serviceType)
    const scheduleWindow = parseScheduleWindow(parsed.scheduleWindow)
    const scheduledAt = typeof parsed.scheduledAt === 'string' && !Number.isNaN(Date.parse(parsed.scheduledAt))
      ? parsed.scheduledAt
      : null
    const scheduleMode = parsed.scheduleMode === 'now'
      ? 'now'
      : parsed.scheduleMode === 'scheduled'
        ? 'scheduled'
        : null
    if (!scheduledAt || !scheduleMode || (scheduleMode === 'scheduled' && !scheduleWindow)) return null
    return clonePendingKaelChatDraft({
      addressLabel: typeof parsed.addressLabel === 'string' ? parsed.addressLabel : undefined,
      clientRequestId: typeof parsed.clientRequestId === 'string' ? parsed.clientRequestId : undefined,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : undefined,
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
      districtLabel: typeof parsed.districtLabel === 'string' ? parsed.districtLabel : null,
      locale: parsed.locale === 'en' ? 'en' : 'vi',
      mediaCount: typeof parsed.mediaCount === 'number' ? parsed.mediaCount : undefined,
      message: parsed.message,
      photoDrafts: Array.isArray(parsed.photoDrafts) ? parsed.photoDrafts as LocalMediaUploadDraft[] : undefined,
      problemChips: Array.isArray(parsed.problemChips) ? parsed.problemChips.filter((chip): chip is string => typeof chip === 'string') : undefined,
      profileId,
      scheduleMode,
      scheduledAt,
      scheduleWindow,
      serviceType,
      source: parsed.source === 'kael' ? 'kael' : 'booking',
    })
  } catch {
    return null
  }
}

function parseScheduleWindow(value: unknown): PendingKaelScheduleWindow | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<PendingKaelScheduleWindow>
  if (
    typeof candidate.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.date) ||
    typeof candidate.start !== 'string' || !/^\d{2}:\d{2}$/.test(candidate.start) ||
    typeof candidate.end !== 'string' || !/^\d{2}:\d{2}$/.test(candidate.end) ||
    candidate.timeZone !== 'Asia/Ho_Chi_Minh'
  ) return undefined
  return {
    date: candidate.date,
    start: candidate.start,
    end: candidate.end,
    timeZone: candidate.timeZone,
  }
}

export function setPendingKaelChatDraft(draft: PendingKaelChatDraft) {
  if (!hasValidPendingSchedule(draft)) {
    pendingKaelChatDraft = null
    return AsyncStorage.removeItem(PENDING_KAEL_CHAT_DRAFT_STORAGE_KEY)
      .catch(() => undefined)
      .then(() => {
        throw new Error('Basic Intake requires an explicit desired time or now schedule')
      })
  }
  pendingKaelChatDraft = clonePendingKaelChatDraft(draft)
  return AsyncStorage.setItem(
    PENDING_KAEL_CHAT_DRAFT_STORAGE_KEY,
    JSON.stringify(pendingKaelChatDraft),
  ).catch(() => undefined)
}

function hasValidPendingSchedule(draft: PendingKaelChatDraft) {
  if (!draft.scheduledAt || Number.isNaN(Date.parse(draft.scheduledAt))) return false
  if (draft.scheduleMode === 'now') return true
  if (draft.scheduleMode === 'scheduled') return Boolean(parseScheduleWindow(draft.scheduleWindow))
  return false
}

export function peekPendingKaelChatDraft() {
  const draft = pendingKaelChatDraft
  if (!draft) return null
  return clonePendingKaelChatDraft(draft)
}

export async function readPendingKaelChatDraft() {
  const memoryDraft = peekPendingKaelChatDraft()
  if (memoryDraft) return memoryDraft
  const storedDraft = parsePendingKaelChatDraft(await AsyncStorage.getItem(PENDING_KAEL_CHAT_DRAFT_STORAGE_KEY).catch(() => null))
  if (!storedDraft) return null
  pendingKaelChatDraft = clonePendingKaelChatDraft(storedDraft)
  return clonePendingKaelChatDraft(storedDraft)
}

export function clearPendingKaelChatDraft() {
  pendingKaelChatDraft = null
  void AsyncStorage.removeItem(PENDING_KAEL_CHAT_DRAFT_STORAGE_KEY).catch(() => undefined)
}

export function takePendingKaelChatDraft() {
  const draft = peekPendingKaelChatDraft()
  clearPendingKaelChatDraft()
  return draft
}
