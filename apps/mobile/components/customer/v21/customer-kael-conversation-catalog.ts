import type { AppLanguage } from '@/lib/app-language'
import type {
  CustomerKaelConversationMode,
  CustomerKaelConversationSession,
} from '@/lib/api-types/customer'

export function customerCatalogKey(customerId: string, mode: CustomerKaelConversationMode) {
  return `${customerId}:${mode}`
}

export function upsertSession(
  sessions: CustomerKaelConversationSession[],
  next: CustomerKaelConversationSession,
) {
  return sortSessions([next, ...sessions.filter((session) => session.id !== next.id)])
}

export function sortSessions(sessions: CustomerKaelConversationSession[]) {
  return [...sessions].sort((left, right) => {
    const leftPinned = left.pinned_at ? 1 : 0
    const rightPinned = right.pinned_at ? 1 : 0
    if (leftPinned !== rightPinned) return rightPinned - leftPinned
    return Date.parse(right.updated_at) - Date.parse(left.updated_at)
  })
}

export function customerConversationCopy(language: AppLanguage, vi: string, en: string) {
  return language === 'vi' ? vi : en
}
