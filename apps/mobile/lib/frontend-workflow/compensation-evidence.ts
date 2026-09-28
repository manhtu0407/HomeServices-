import { readLocalMediaBlob } from '../media-upload'
import { compensationService } from '../services/compensation-service'
import { supabase } from '../supabase'

const EVIDENCE_BUCKET = 'discipline-evidence'
const MAX_PHOTO_BYTES = 25 * 1024 * 1024
export const MAX_COMPENSATION_PHOTOS = 3

export type CompensationPhotoDraft = { uri: string; mimeType: 'image/jpeg' | 'image/png' }

type SignedUploadBucket = {
  uploadToSignedUrl: (
    path: string,
    token: string,
    body: Blob,
    options?: { contentType?: string; upsert?: boolean },
  ) => Promise<{ error: unknown }>
}

// Each photo goes straight to private storage through a one-time signed URL; only the paths
// travel with the claim, and the server refuses any path outside this customer's case.
export async function uploadCompensationPhotos(caseId: string, photos: CompensationPhotoDraft[], accessToken: string) {
  if (photos.length === 0) return { success: true as const, paths: [] as string[] }
  const bucket = supabase?.storage.from(EVIDENCE_BUCKET) as unknown as SignedUploadBucket | undefined
  if (!bucket) return { success: false as const, code: 'MEDIA_STORAGE_UNAVAILABLE' }
  const paths: string[] = []
  for (const photo of photos.slice(0, MAX_COMPENSATION_PHOTOS)) {
    const local = await readLocalMediaBlob(photo.uri, MAX_PHOTO_BYTES)
    if (!local.success) return { success: false as const, code: 'MEDIA_READ_FAILED' }
    const intent = await compensationService.createEvidenceUpload(caseId, photo.mimeType, accessToken)
    if (!intent.success) return { success: false as const, code: intent.code }
    const uploaded = await bucket.uploadToSignedUrl(intent.data.path, intent.data.token, local.blob, {
      contentType: photo.mimeType,
      upsert: false,
    })
    if (uploaded.error) return { success: false as const, code: 'MEDIA_UPLOAD_FAILED' }
    paths.push(intent.data.path)
  }
  return { success: true as const, paths }
}
