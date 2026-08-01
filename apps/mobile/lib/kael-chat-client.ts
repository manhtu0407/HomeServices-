import type { KaelChatIntakeConfirmationDecisionInput } from '@nestscout/shared'

import { api } from './api'
import type { KaelChatResponse } from './api-types'

export type MobileKaelScheduleWindowInput = {
  date: string
  start: string
  end: string
  timeZone: 'Asia/Ho_Chi_Minh'
}

export function decideKaelIntakeConfirmation(
  sessionId: string,
  input: KaelChatIntakeConfirmationDecisionInput,
  accessToken?: string,
) {
  const path = `/kael/chat/${encodeURIComponent(sessionId)}/intake-confirmation`
  return accessToken
    ? api.postAuthenticated<KaelChatResponse>(path, input, accessToken)
    : api.post<KaelChatResponse>(path, input)
}
