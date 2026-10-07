import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'

import type { LocalMediaUploadDraft } from './media-upload'

// Images a vision model will see are re-encoded on the device: Storage transforms are not
// available on the Supabase Free plan, and a JPEG rebuilt from pixels carries none of the
// original's EXIF location. The server still refuses any image that keeps one (RULES.md
// Multimodal Evidence Privacy); this is what lets a clean photo through.
export const VISION_IMAGE_MAX_EDGE = 1600
const VISION_IMAGE_QUALITY = 0.82
// Evidence, avatar and verification photos stay sharp enough to read a label or a crack,
// while a 12 MP original shrinks from several MB to a size a 3G uplink sends within the upload deadline.
export const UPLOAD_IMAGE_MAX_EDGE = 2048
const UPLOAD_IMAGE_QUALITY = 0.85

export function reencodeVisionImage(draft: LocalMediaUploadDraft) {
  return reencodeImage(draft, VISION_IMAGE_MAX_EDGE, VISION_IMAGE_QUALITY)
}

// Falls back to the original when the device cannot re-encode, so an upload never fails only for being unresized.
export async function reencodeUploadImage(draft: LocalMediaUploadDraft): Promise<LocalMediaUploadDraft> {
  if (draft.type !== 'image') return draft
  return (await reencodeImage(draft, UPLOAD_IMAGE_MAX_EDGE, UPLOAD_IMAGE_QUALITY)) ?? draft
}

async function reencodeImage(
  draft: LocalMediaUploadDraft,
  maxEdge: number,
  quality: number,
): Promise<LocalMediaUploadDraft | null> {
  try {
    const original = await ImageManipulator.manipulate(draft.uri).renderAsync()
    const longEdge = Math.max(original.width, original.height)
    const rendered = longEdge > maxEdge
      ? await ImageManipulator.manipulate(original)
        .resize(original.width >= original.height ? { width: maxEdge } : { height: maxEdge })
        .renderAsync()
      : original
    const saved = await rendered.saveAsync({ compress: quality, format: SaveFormat.JPEG })
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
