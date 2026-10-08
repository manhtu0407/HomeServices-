import type { ServiceType } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'
import type { LocalMediaUploadDraft } from '@/lib/media-upload'

type PendingSendSetters = {
  setComposerMediaDrafts: (drafts: LocalMediaUploadDraft[]) => void
  setPendingNormalImageUris: (uris: string[]) => void
  setPendingNormalMessage: (message: string | null) => void
}

// A Work handling send shows the customer's words and photos at once and empties the composer
// before any upload or Kael call starts, the way a chat app does. The returned restore hands the
// text-free part back: the photos return to the composer and the pending bubble goes away.
export function showCaseWorkPendingSend(
  conversation: PendingSendSetters,
  input: { drafts: LocalMediaUploadDraft[]; text: string },
) {
  const drafts = [...input.drafts]
  conversation.setPendingNormalMessage(input.text)
  conversation.setPendingNormalImageUris(drafts.flatMap((draft) => draft.type === 'image' ? [draft.uri] : []))
  if (drafts.length > 0) conversation.setComposerMediaDrafts([])
  return () => {
    if (drafts.length > 0) conversation.setComposerMediaDrafts(drafts)
    conversation.setPendingNormalMessage(null)
  }
}

// The create request's retry key: the same picked media, words and service reuse one upload and
// one client request id across a manual retry.
export function caseWorkCreateFingerprint(input: {
  catalogClientRequestId: string | null
  drafts: LocalMediaUploadDraft[]
  language: AppLanguage
  message: string
  problemChips: string[]
  serviceType: ServiceType | null
  voiceTranscript: string
}) {
  return JSON.stringify({
    evidence: {
      media: input.drafts.map((item) => ({
        durationMillis: item.durationMillis,
        fileName: item.fileName,
        fileSizeBytes: item.fileSizeBytes,
        mimeType: item.mimeType,
        type: item.type,
        uri: item.uri,
      })),
      voiceTranscript: input.voiceTranscript,
    },
    language: input.language,
    message: input.message,
    catalog_client_request_id: input.catalogClientRequestId,
    problem_chips: input.problemChips,
    service_type: input.serviceType,
  })
}
