import { type ServiceType } from '@home-services/shared'
import { type LocalMediaUploadDraft } from '@/lib/media-upload'

export type PendingKaelChatDraft = {
  addressLabel?: string
  clientRequestId?: string
  createdAt?: string
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

export function setPendingKaelChatDraft(draft: PendingKaelChatDraft) {
  pendingKaelChatDraft = {
    addressLabel: draft.addressLabel,
    clientRequestId: draft.clientRequestId,
    createdAt: draft.createdAt,
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

export function takePendingKaelChatDraft() {
  const draft = pendingKaelChatDraft
  pendingKaelChatDraft = null
  return draft
}
