import type { AppLanguage } from '@/lib/app-language'
import type { LocalMediaUploadDraft } from '@/lib/media-upload'
import {
  cleanupKaelChatMediaRefs,
  localizeMediaUploadFailure,
  uploadKaelChatMediaDrafts,
} from '@/lib/media-upload'

import type { CustomerKaelTurnStreamOptions } from './customer-kael-conversation-stream-options'
import type { useCustomerKaelConversations } from './use-customer-kael-conversations'

type Props = {
  abortSignal: AbortSignal
  beginReasoningReceipt: () => void
  clearComposer: () => void
  commitComposer: () => void
  clearMediaDrafts: () => void
  completeLegacyStreamingReply: () => void
  conversations: ReturnType<typeof useCustomerKaelConversations>
  failReasoningReceipt: (message: string) => void
  getActiveReasoningReceiptId: () => string | null
  getReceivedReasoningTerminal: () => boolean
  getReceivedResponseTerminal: () => boolean
  hasComposerMedia: boolean
  isRequestCurrent: () => boolean
  language: AppLanguage
  mediaDrafts: LocalMediaUploadDraft[]
  message: string
  onReasoning: NonNullable<CustomerKaelTurnStreamOptions['onReasoning']>
  onResponseCommitted: () => void
  onResponseDelta: NonNullable<CustomerKaelTurnStreamOptions['onResponseDelta']>
  onResponseEvent: NonNullable<CustomerKaelTurnStreamOptions['onResponseEvent']>
  onRetainStreamingReply: (retain: boolean) => void
  resetReasoningReceipt: () => void
  restoreComposer: () => void
  setError: (message: string | null) => void
  setLoading: (loading: boolean) => void
  setPendingNormalMessage: (message: string | null) => void
  setUploadingMedia: (uploading: boolean) => void
  stopProcessLines: () => void
}

export async function sendCustomerNormalTurn({
  abortSignal,
  beginReasoningReceipt,
  clearComposer,
  commitComposer,
  clearMediaDrafts,
  completeLegacyStreamingReply,
  conversations,
  failReasoningReceipt,
  getActiveReasoningReceiptId,
  getReceivedReasoningTerminal,
  getReceivedResponseTerminal,
  hasComposerMedia,
  isRequestCurrent,
  language,
  mediaDrafts,
  message,
  onReasoning,
  onResponseCommitted,
  onResponseDelta,
  onResponseEvent,
  onRetainStreamingReply,
  resetReasoningReceipt,
  restoreComposer,
  setError,
  setLoading,
  setPendingNormalMessage,
  setUploadingMedia,
  stopProcessLines,
}: Props) {
  if (mediaDrafts.some((item) => item.type !== 'image')) {
    setError(language === 'vi'
      ? 'Chat thường chỉ nhận ảnh. Video có thể gửi trong Xử lý công việc.'
      : 'Normal chat accepts photos only. Send videos in Work handling.')
    return
  }

  setPendingNormalMessage(message)
  beginReasoningReceipt()
  clearComposer()
  setLoading(true)
  setError(null)
  let uploadedMediaRefs: string[] = []
  try {
    if (hasComposerMedia) {
      setUploadingMedia(true)
      const uploaded = await uploadKaelChatMediaDrafts(mediaDrafts)
      if (!isRequestCurrent()) {
        if (uploaded.success) await cleanupKaelChatMediaRefs(uploaded.mediaRefs)
        return
      }
      setUploadingMedia(false)
      if (abortSignal.aborted) {
        if (uploaded.success) await cleanupKaelChatMediaRefs(uploaded.mediaRefs)
        restoreComposer()
        setPendingNormalMessage(null)
        resetReasoningReceipt()
        setError(null)
        return
      }
      if (!uploaded.success) {
        restoreComposer()
        setPendingNormalMessage(null)
        resetReasoningReceipt()
        setError(localizeMediaUploadFailure(uploaded, language))
        return
      }
      uploadedMediaRefs = uploaded.mediaRefs
    }
    const result = await conversations.sendConversationTurn(message, {
      mediaRefs: uploadedMediaRefs,
      signal: abortSignal,
      onResponseCommitted,
      onResponseDelta,
      onResponseEvent,
      onReasoning,
    })
    if (!isRequestCurrent()) return
    if (abortSignal.aborted && !result) {
      await cleanupKaelChatMediaRefs(uploadedMediaRefs)
      restoreComposer()
      setPendingNormalMessage(null)
      resetReasoningReceipt()
      setError(null)
      return
    }
    if (!result) {
      await cleanupKaelChatMediaRefs(uploadedMediaRefs)
      restoreComposer()
      setPendingNormalMessage(null)
      const failureMessage = conversations.sessionsError ?? (language === 'vi'
        ? 'Kael chưa thể trả lời lúc này.'
        : 'Kael could not reply right now.')
      failReasoningReceipt(failureMessage)
      setError(failureMessage)
      return
    }
    if (!getReceivedReasoningTerminal()) {
      if (getActiveReasoningReceiptId()) {
        failReasoningReceipt(language === 'vi'
          ? 'Kael đã nhận được phản hồi, nhưng biên nhận xử lý chưa hoàn tất.'
          : 'Kael received a reply, but the processing receipt did not finish.')
      } else {
        resetReasoningReceipt()
      }
    }
    completeLegacyStreamingReply()
    onRetainStreamingReply(getReceivedResponseTerminal())
    commitComposer()
    if (hasComposerMedia) clearMediaDrafts()
  } catch {
    await cleanupKaelChatMediaRefs(uploadedMediaRefs)
    if (!isRequestCurrent()) return
    restoreComposer()
    setPendingNormalMessage(null)
    if (abortSignal.aborted) {
      resetReasoningReceipt()
      setError(null)
      return
    }
    const failureMessage = hasComposerMedia
      ? language === 'vi'
        ? 'Kael chưa thể phân tích ảnh lúc này. Vui lòng thử lại.'
        : 'Kael could not analyze the photo right now. Please try again.'
      : language === 'vi'
        ? 'Kael chưa thể trả lời lúc này. Vui lòng thử lại.'
        : 'Kael could not reply right now. Please try again.'
    failReasoningReceipt(failureMessage)
    setError(failureMessage)
  } finally {
    if (isRequestCurrent()) {
      setLoading(false)
      setUploadingMedia(false)
      stopProcessLines()
    }
  }
}
