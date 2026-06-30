import AsyncStorage from '@react-native-async-storage/async-storage'
import { type ServiceType } from '@nestscout/shared'
import { type LocalMediaUploadDraft } from '@/lib/media-upload'

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
    serviceType: draft.serviceType,
    source: draft.source,
  }
}

function parsePendingKaelChatDraft(value: string | null): PendingKaelChatDraft | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<PendingKaelChatDraft>
    const serviceType = parsed.serviceType === 'electrical' || parsed.serviceType === 'plumbing' || parsed.serviceType === 'cleaning'
      ? parsed.serviceType
      : null
    if (typeof parsed.message !== 'string' || parsed.message.trim().length === 0 || !serviceType) return null
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
      serviceType,
      source: parsed.source === 'kael' ? 'kael' : 'booking',
    })
  } catch {
    return null
  }
}

export function setPendingKaelChatDraft(draft: PendingKaelChatDraft) {
  pendingKaelChatDraft = clonePendingKaelChatDraft(draft)
  return AsyncStorage.setItem(PENDING_KAEL_CHAT_DRAFT_STORAGE_KEY, JSON.stringify(pendingKaelChatDraft)).catch(() => undefined)
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
