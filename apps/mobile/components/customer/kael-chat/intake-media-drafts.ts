import type { LocalMediaUploadDraft } from '@/lib/media-upload'

/** Drops drafts already sent with the intake so the composer does not offer them again. */
export function withoutSubmittedMediaDrafts(
  current: LocalMediaUploadDraft[],
  submitted: readonly LocalMediaUploadDraft[] | undefined,
) {
  if (!submitted?.length) return current
  const submittedUris = new Set(submitted.map((draft) => draft.uri))
  return current.filter((draft) => !submittedUris.has(draft.uri))
}
