import type { CaseWorkEvidence } from '@nestscout/shared'

import type { KaelChatSession } from '@/lib/api-types'
import {
  kaelChatTurnImages,
  localKaelChatMediaUri,
  rememberKaelChatLocalMedia,
  type KaelChatMediaPreview,
  type KaelChatTurnImage,
} from '@/lib/kael-chat-local-media'
import { uploadKaelChatMediaDrafts, type LocalMediaUploadDraft } from '@/lib/media-upload'

// Stand-in messages the client or server writes when a turn carries media but no words. With the
// photos on screen they say nothing new, so the bubble shows the photos alone.
const MEDIA_ONLY_PLACEHOLDER_TEXTS = new Set([
  'Đã gửi ảnh/video.',
  'Sent media.',
  'Đã gửi bằng chứng.',
  'Evidence submitted.',
  'Đã gửi bằng chứng hiện trạng.',
  'Sent current evidence.',
  'Khách đã gửi ngữ cảnh dịch vụ.',
  'Customer sent service context.',
])

export function isCaseWorkMediaPlaceholderText(text: string | null | undefined) {
  return MEDIA_ONLY_PLACEHOLDER_TEXTS.has((text ?? '').trim())
}

// Upload order puts each picked photo's evidence first and in pick order, so the photo refs pair
// one-to-one with the picked image drafts. A count mismatch remembers nothing.
export function rememberCaseWorkPhotoDrafts(
  evidenceItems: readonly CaseWorkEvidence[],
  drafts: readonly LocalMediaUploadDraft[],
) {
  const photoRefs = evidenceItems.flatMap((item) => item.kind === 'photo' && item.ref ? [item.ref] : [])
  const imageUris = drafts.slice(0, 5).flatMap((draft) => draft.type === 'image' ? [draft.uri] : [])
  rememberKaelChatLocalMedia(photoRefs, imageUris)
}

// Uploads Work handling media and keeps each photo's device URI, so the sent turn shows the photo
// at once instead of waiting for a signed preview link.
export async function uploadCaseWorkMediaDrafts(drafts: LocalMediaUploadDraft[]) {
  const uploaded = await uploadKaelChatMediaDrafts(drafts)
  if (uploaded.success) rememberCaseWorkPhotoDrafts(uploaded.evidenceItems, drafts)
  return uploaded
}

type DiagnosisEvidence = { kind?: unknown; model_eligible?: unknown; ref?: unknown }

// The photos a customer turn carried. Video originals and extracted frames stay out: the bubble
// shows what the customer picked as a photo. Signed previews arrive keyed by kind and 1-based
// index over the model-eligible photo and frame evidence, the same walk the server's
// kaelEvidencePreviewCandidates makes, so the index recovers each preview's ref.
export function caseWorkTurnImages(
  mediaRefs: readonly string[] | undefined,
  session: Pick<KaelChatSession, 'diagnosis_scope' | 'evidence_previews'> | null | undefined,
): KaelChatTurnImage[] {
  if (!mediaRefs?.length) return []
  const scopeEvidence = session?.diagnosis_scope?.evidence
  const evidence: DiagnosisEvidence[] = Array.isArray(scopeEvidence) ? scopeEvidence : []
  const previews = session?.evidence_previews ?? []
  const kindByRef = new Map<string, string>()
  const previewByRef: KaelChatMediaPreview[] = []
  const counters = { photo: 0, video_frame: 0 }
  for (const item of evidence) {
    if (!item || typeof item.ref !== 'string' || !item.ref.trim() || typeof item.kind !== 'string') continue
    const ref = item.ref.trim()
    kindByRef.set(ref, item.kind)
    if ((item.kind !== 'photo' && item.kind !== 'video_frame') || item.model_eligible === false) continue
    const evidenceKind = item.kind
    const evidenceIndex = ++counters[evidenceKind]
    const preview = previews.find((candidate) =>
      candidate.evidence_kind === evidenceKind && candidate.evidence_index === evidenceIndex)
    if (preview) previewByRef.push({ ref, status: 'available', url: preview.url })
  }
  const photoRefs = mediaRefs.filter((ref) => localKaelChatMediaUri(ref) !== null || kindByRef.get(ref) === 'photo')
  return kaelChatTurnImages(photoRefs, previewByRef)
}

// True when a turn carried a video (original or extracted frames) beside or instead of photos.
// The photo bubble cannot show it, so the turn keeps its text as the sign that video was sent.
export function caseWorkTurnHasVideo(
  mediaRefs: readonly string[] | undefined,
  session: Pick<KaelChatSession, 'diagnosis_scope'> | null | undefined,
): boolean {
  if (!mediaRefs?.length) return false
  const scopeEvidence = session?.diagnosis_scope?.evidence
  const evidence: DiagnosisEvidence[] = Array.isArray(scopeEvidence) ? scopeEvidence : []
  const photoRefs = new Set(evidence.flatMap((item) =>
    item?.kind === 'photo' && typeof item.ref === 'string' ? [item.ref.trim()] : []))
  return mediaRefs.some((ref) => localKaelChatMediaUri(ref) === null && !photoRefs.has(ref))
}
