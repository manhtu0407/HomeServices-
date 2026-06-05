import { type LocalDeal, type ServiceType } from '@home-services/shared'
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import { type KaelChatResponse } from '@/lib/api-types'
import { type LocalMediaUploadDraft } from '@/lib/media-upload'
import { type KaelChatState } from './state'
import { type KaelChatArchiveItem } from './agentic-parts'

export const vietnameseSignalPattern = /[\u00c0-\u1ef9\u0110\u0111]/i

export type KaelChatArchiveText = {
  archiveActiveMeta: string
  archiveCurrentChat: string
  archiveDraftMeta: string
  archiveHistoryMeta: string
  archiveLoadingChat: string
  archiveNoService: string
  archivePendingIntake: string
  archiveServiceRequest: string
  loading: string
}

export function buildKaelChatArchiveItems({
  deal,
  historyTarget,
  language,
  pendingIntake,
  routeSessionId,
  selectedService,
  session,
  text,
}: {
  deal: LocalDeal | null
  historyTarget: string
  language: AppLanguage
  pendingIntake: KaelChatState['pendingIntake']
  routeSessionId: string | undefined
  selectedService: ServiceType | null
  session: KaelChatResponse | null
  text: KaelChatArchiveText
}): KaelChatArchiveItem[] {
  const items: KaelChatArchiveItem[] = []

  if (session) {
    items.push({
      id: `chat:${session.session.id}`,
      meta: text.archiveActiveMeta,
      subtitle: localizedServiceLabel(session.session.service_type, language),
      title: text.archiveCurrentChat,
    })
  } else if (routeSessionId) {
    items.push({
      id: `chat:${routeSessionId}`,
      meta: text.loading,
      subtitle: selectedService ? localizedServiceLabel(selectedService, language) : text.archiveNoService,
      title: text.archiveLoadingChat,
    })
  }

  const serviceRequestJobId = session?.session.job_id ?? deal?.broadcast?.jobId ?? null
  if (session?.session.job_id || deal) {
    const serviceType = deal?.draft.serviceType ?? session?.session.service_type ?? selectedService
    items.push({
      id: `request:${serviceRequestJobId ?? deal?.id ?? 'current'}`,
      meta: text.archiveHistoryMeta,
      subtitle: serviceType ? localizedServiceLabel(serviceType, language) : text.archiveNoService,
      targetPath: serviceRequestJobId ? `/(customer)/history?job_id=${encodeURIComponent(serviceRequestJobId)}` : historyTarget,
      title: text.archiveServiceRequest,
    })
  }

  if (pendingIntake && !session) {
    items.push({
      id: `pending:${pendingIntake.clientRequestId ?? pendingIntake.source}:${pendingIntake.serviceType ?? 'service'}:${pendingIntake.mediaCount}`,
      meta: text.archiveDraftMeta,
      subtitle: pendingIntake.serviceType ? localizedServiceLabel(pendingIntake.serviceType, language) : text.archiveNoService,
      title: text.archivePendingIntake,
    })
  }

  return items
}

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export function mergeKaelChatMediaDrafts(...groups: LocalMediaUploadDraft[][]) {
  const seenUris = new Set<string>()
  const merged: LocalMediaUploadDraft[] = []
  for (const group of groups) {
    for (const draft of group) {
      if (seenUris.has(draft.uri)) continue
      seenUris.add(draft.uri)
      merged.push(draft)
      if (merged.length >= 5) return merged
    }
  }
  return merged
}

export function firstTurnClientRequestFingerprint(
  serviceType: ServiceType,
  message: string,
  addressLabel: string,
  addressDistrict: string | null | undefined,
): string {
  return JSON.stringify({
    service_type: serviceType,
    message,
    problem_chips: [],
    photo_urls: [],
    address_label: addressLabel,
    address_district: addressDistrict ?? null,
  })
}

export function parseServiceType(value: string | undefined): ServiceType | null {
  return value === 'electrical' || value === 'plumbing' || value === 'cleaning' ? value : null
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback
}

export function localizedGeneratedText(value: string, language: AppLanguage, fallback: string) {
  const trimmed = value.trim()
  if (trimmed.length === 0) return fallback
  if (language === 'en' && vietnameseSignalPattern.test(trimmed)) return fallback
  if (language === 'vi' && /^[\x00-\x7F]*$/.test(trimmed)) return fallback
  return trimmed
}

export function localizedKaelChatError(error: string, language: AppLanguage) {
  const hasVietnameseSignal = vietnameseSignalPattern.test(error)
  if (language === 'en' && hasVietnameseSignal) {
    return 'Kael could not update this session. Please try again.'
  }
  if (language === 'vi' && /^[\x00-\x7F]*$/.test(error)) {
    return 'Kael ch\u01b0a th\u1ec3 c\u1eadp nh\u1eadt phi\u00ean n\u00e0y. Vui l\u00f2ng th\u1eed l\u1ea1i.'
  }
  return error
}
