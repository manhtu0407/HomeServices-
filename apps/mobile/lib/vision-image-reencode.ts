import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'

import type { LocalMediaUploadDraft } from './media-upload'

// Images a vision model will see are re-encoded on the device: Storage transforms are not
// available on the Supabase Free plan, and a JPEG rebuilt from pixels carries none of the
// original's EXIF location. The server still refuses any image that keeps one (RULES.md
// Multimodal Evidence Privacy); this is what lets a clean photo through.
export const VISION_IMAGE_MAX_EDGE = 1600
const VISION_IMAGE_QUALITY = 0.82

export async function reencodeVisionImage(
  draft: LocalMediaUploadDraft,
): Promise<LocalMediaUploadDraft | null> {
  try {
    const original = await ImageManipulator.manipulate(draft.uri).renderAsync()
    const longEdge = Math.max(original.width, original.height)
    const rendered = longEdge > VISION_IMAGE_MAX_EDGE
      ? await ImageManipulator.manipulate(original)
        .resize(original.width >= original.height ? { width: VISION_IMAGE_MAX_EDGE } : { height: VISION_IMAGE_MAX_EDGE })
        .renderAsync()
      : original
    const saved = await rendered.saveAsync({ compress: VISION_IMAGE_QUALITY, format: SaveFormat.JPEG })
    return {
      ...draft,
      fileName: `${(draft.fileName ?? 'photo').replace(/\.[^.]+$/, '')}.jpg`,
      fileSizeBytes: undefined,
      mimeType: 'image/jpeg',
      type: 'image',
      uri: saved.uri,
    }
  } catch {
    return null
  }
}
