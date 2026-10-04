import type { AppLanguage } from '@/lib/app-language'
import type { NormalChatSuggestionRole } from '@nestscout/shared'
import { color } from '@/design/theme'

export type NormalChatStarterSuggestion = {
  id: string
  label: string
  draft: string
}

export type NormalChatGhostSuggestion = {
  id: string
  text: string
}

export const EMPTY_NORMAL_CHAT_SUGGESTIONS: NormalChatGhostSuggestion[] = []

export type NormalChatTextSelection = {
  start: number
  end: number
}

export function getNormalChatSendPalette(sending: boolean) {
  return sending
    ? { background: color.kaelChatSend.sendingBackground, foreground: color.kaelChatSend.sendingForeground }
    : { background: color.kaelChatSend.idleBackground, foreground: color.kaelChatSend.idleForeground }
}

const STARTERS: Record<AppLanguage, Record<NormalChatSuggestionRole, NormalChatStarterSuggestion[]>> = {
  vi: {
    customer: [
      { id: 'what-can-kael-do', label: 'Kael giúp được gì?', draft: 'Kael có thể giúp tôi những gì?' },
      { id: 'analyze-a-photo', label: 'Phân tích ảnh', draft: 'Tôi muốn gửi ảnh để bạn phân tích tình trạng trong ảnh.' },
      { id: 'describe-a-problem', label: 'Mô tả vấn đề', draft: 'Hướng dẫn tôi mô tả vấn đề trong nhà để bạn hỗ trợ rõ hơn.' },
      { id: 'find-information', label: 'Tìm thông tin', draft: 'Hướng dẫn tôi tìm thông tin liên quan đến dịch vụ trên NestScout.' },
    ],
    worker: [
      { id: 'what-can-kael-do', label: 'Kael giúp được gì?', draft: 'Kael có thể giúp tôi những gì?' },
      { id: 'analyze-a-photo', label: 'Phân tích ảnh', draft: 'Tôi muốn gửi ảnh để bạn phân tích tình trạng trong ảnh.' },
      { id: 'describe-a-fault', label: 'Mô tả lỗi', draft: 'Hướng dẫn tôi mô tả lỗi đang kiểm tra để bạn hỗ trợ rõ hơn.' },
      { id: 'find-information', label: 'Tìm thông tin', draft: 'Hướng dẫn tôi tìm thông tin liên quan đến dịch vụ trên NestScout.' },
    ],
  },
  en: {
    customer: [
      { id: 'what-can-kael-do', label: 'What can Kael do?', draft: 'What can you help me with?' },
      { id: 'analyze-a-photo', label: 'Analyze a photo', draft: "I'd like to send a photo for you to analyze what's shown." },
      { id: 'describe-a-problem', label: 'Describe a problem', draft: 'Help me describe a problem at home so you can assist me more clearly.' },
      { id: 'find-information', label: 'Find information', draft: 'Help me find information about services on NestScout.' },
    ],
    worker: [
      { id: 'what-can-kael-do', label: 'What can Kael do?', draft: 'What can you help me with?' },
      { id: 'analyze-a-photo', label: 'Analyze a photo', draft: "I'd like to send a photo for you to analyze what's shown." },
      { id: 'describe-a-fault', label: 'Describe a fault', draft: "Help me describe the fault I'm checking so you can assist me more clearly." },
      { id: 'find-information', label: 'Find information', draft: 'Help me find information about services on NestScout.' },
    ],
  },
}

function normalizeForMatch(value: string) {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase()
}

export function getNormalChatStarterSuggestions(
  language: AppLanguage,
  role: NormalChatSuggestionRole,
): NormalChatStarterSuggestion[] {
  return STARTERS[language][role].map((item) => ({ ...item }))
}

export function getNormalChatGhostSuffix(
  draft: string,
  suggestions: NormalChatGhostSuggestion[],
  selection: NormalChatTextSelection | null,
  isComposing = false,
): { suggestionId: string; text: string } | null {
  if (isComposing) return null
  if (draft && !selection) return null
  if (selection && (selection.start !== draft.length || selection.end !== draft.length)) return null

  const normalizedDraft = normalizeForMatch(draft)
  for (const suggestion of suggestions) {
    const normalizedSuggestion = suggestion.text.normalize('NFC').replace(/\s+/gu, ' ').trim()
    if (!suggestion.id || !normalizedSuggestion) continue

    if (!normalizedDraft) {
      return { suggestionId: suggestion.id, text: normalizedSuggestion }
    }

    const comparableSuggestion = normalizedSuggestion.toLocaleLowerCase()
    if (!comparableSuggestion.startsWith(normalizedDraft)) continue
    let suffix = normalizedSuggestion.slice(normalizedDraft.length)
    if (/\s$/u.test(draft)) suffix = suffix.trimStart()
    if (suffix) return { suggestionId: suggestion.id, text: suffix }
  }
  return null
}
