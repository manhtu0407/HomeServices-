import type {
  NormalChatSuggestionsRequest,
  NormalChatSuggestionsResponse,
} from '@nestscout/shared'

import { api } from '../api'
import type { CustomerKaelConversationArchiveResponse } from '../api-types/customer'
import type { WorkerKaelChatArchiveResponse } from '../api-types/worker'
import { clearNormalChatSuggestionCache } from '../normal-chat-suggestions'

export const customerNormalChatSessionMethods = {
  async archive(conversationId: string, confirmCaseWork = false) {
    const confirmation = confirmCaseWork ? '?confirm_case_work=true' : ''
    const result = await api.delete<CustomerKaelConversationArchiveResponse>(
      `/me/kael/conversations/${conversationId}${confirmation}`,
    )
    if (result.success) clearNormalChatSuggestionCache({ sessionId: conversationId })
    return result
  },

  getSuggestions(conversationId: string, input: NormalChatSuggestionsRequest, signal?: AbortSignal) {
    const path = `/me/kael/conversations/${encodeURIComponent(conversationId)}/suggestions`
    return signal
      ? api.post<NormalChatSuggestionsResponse>(path, input, { signal })
      : api.post<NormalChatSuggestionsResponse>(path, input)
  },
}

export const workerNormalChatSessionMethods = {
  async archive(sessionId: string) {
    const result = await api.delete<WorkerKaelChatArchiveResponse>(
      `/workers/me/kael/chat/${sessionId}`,
    )
    if (result.success) clearNormalChatSuggestionCache({ sessionId })
    return result
  },

  getSuggestions(sessionId: string, input: NormalChatSuggestionsRequest, signal?: AbortSignal) {
    const path = `/workers/me/kael/chat/${encodeURIComponent(sessionId)}/suggestions`
    return signal
      ? api.post<NormalChatSuggestionsResponse>(path, input, { signal })
      : api.post<NormalChatSuggestionsResponse>(path, input)
  },
}
