import { type LocalDeal, type ServiceType } from '@home-services/shared'
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import { type KaelChatResponse, type KaelChatSessionSummary } from '@/lib/api-types'
import { type KaelChatArchiveItem } from './agentic-parts'
import { type KaelChatState } from './state'

type KaelChatArchiveText = {
  archiveActiveMeta: string
  archiveCurrentChat: string
  archiveDraftMeta: string
  archiveHistoryMeta: string
  archiveLoadingChat: string
  archiveNoService: string
  archivePendingIntake: string
  archiveSavedChat: string
  archiveSavedMeta: string
  archiveServiceRequest: string
  loading: string
}

export function buildKaelChatArchiveItems({
  deal,
  historyTarget,
  language,
  pendingIntake,
  routeSessionId,
  savedSessions,
  selectedService,
  session,
  text,
}: {
  deal: LocalDeal | null
  historyTarget: string
  language: AppLanguage
  pendingIntake: KaelChatState['pendingIntake']
  routeSessionId: string | undefined
  savedSessions: KaelChatSessionSummary[]
  selectedService: ServiceType | null
  session: KaelChatResponse | null
  text: KaelChatArchiveText
}): KaelChatArchiveItem[] {
  const items: KaelChatArchiveItem[] = []

  if (session) {
    items.push({
      id: `chat:${session.session.id}`,
      meta: text.archiveActiveMeta,
      subtitle: serviceSubtitle(session.session.service_type, language, text),
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

  for (const saved of savedSessions) {
    if (saved.id === session?.session.id || saved.id === routeSessionId) continue
    items.push({
      id: `saved:${saved.id}`,
      meta: text.archiveSavedMeta,
      subtitle: serviceSubtitle(saved.service_type, language, text),
      targetPath: `/(customer)/kael-chat?sessionId=${encodeURIComponent(saved.id)}`,
      title: text.archiveSavedChat,
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

function serviceSubtitle(serviceType: ServiceType | null, language: AppLanguage, text: KaelChatArchiveText) {
  return serviceType ? localizedServiceLabel(serviceType, language) : text.archiveNoService
}
