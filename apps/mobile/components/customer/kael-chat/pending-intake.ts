import { type ServiceType } from '@home-services/shared'

type PendingKaelChatDraft = {
  message: string
  serviceType: ServiceType | null
}

let pendingKaelChatDraft: PendingKaelChatDraft | null = null

export function setPendingKaelChatDraft(draft: PendingKaelChatDraft) {
  pendingKaelChatDraft = {
    message: draft.message,
    serviceType: draft.serviceType,
  }
}

export function takePendingKaelChatDraft() {
  const draft = pendingKaelChatDraft
  pendingKaelChatDraft = null
  return draft
}
