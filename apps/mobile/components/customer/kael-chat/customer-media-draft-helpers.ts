import type * as ImagePicker from 'expo-image-picker'

import type { LocalMediaUploadDraft } from '@/lib/media-upload'

export function mergeMediaDrafts(
  current: LocalMediaUploadDraft[],
  drafts: LocalMediaUploadDraft[],
  limit = 5,
) {
  const seenUris = new Set(current.map((item) => item.uri))
  const merged = [...current]
  for (const draft of drafts) {
    if (seenUris.has(draft.uri)) continue
    seenUris.add(draft.uri)
    merged.push(draft)
    if (merged.length >= limit) break
  }
  return merged
}

export function mediaDraftTypeFromPickerAsset(
  asset: ImagePicker.ImagePickerAsset,
): LocalMediaUploadDraft['type'] {
  if (asset.type === 'video' || asset.mimeType?.startsWith('video/')) return 'video'
  return 'image'
}
