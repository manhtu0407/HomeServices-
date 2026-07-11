import { jobService, kaelChatService } from './services'
import { supabase } from './supabase'
import * as VideoThumbnails from 'expo-video-thumbnails'
import type { CaseWorkEvidence } from '@nestscout/shared'
import type { JobMediaAttachInput, JobMediaStage } from './api-types'

export type LocalMediaUploadDraft = {
  uri: string
  type: 'image' | 'video' | 'audio'
  fileName?: string
  mimeType?: string
  fileSizeBytes?: number
  durationMillis?: number
}

type WorkerVerificationDrafts = {
  cccdFront: LocalMediaUploadDraft
  cccdBack: LocalMediaUploadDraft
  selfie: LocalMediaUploadDraft
}

type WorkerVerificationUrls = {
  cccd_front_url: string
  cccd_back_url: string
  selfie_url: string
}

type MediaUploadFailure = {
  success: false
  code?: string
  error: string
}

export function localizeMediaUploadFailure(
  failure: { code?: string; error: string },
  language: 'vi' | 'en',
) {
  if (language === 'vi') return failure.error
  switch (failure.code) {
    case 'RAW_AUDIO_PRIVATE':
      return 'Raw voice audio stays on your device. Send the reviewed transcript instead.'
    case 'VIDEO_FRAME_EXTRACTION_UNAVAILABLE':
      return 'This device could not extract video frames. The original video was not uploaded.'
    case 'MEDIA_STORAGE_UNAVAILABLE':
      return 'Media storage is not configured yet.'
    case 'MEDIA_READ_FAILED':
      return 'The selected media could not be read.'
    case 'MEDIA_UPLOAD_FAILED':
      return 'The selected media could not be uploaded. Please try again.'
    case 'UNSUPPORTED_MEDIA':
      return 'Use a compatible JPEG, PNG, or WebP image for Kael analysis.'
    default:
      return 'The selected media could not be processed. Please try again.'
  }
}

type JobMediaUploadResult =
  | {
      success: true
      asset: JobMediaAttachInput['assets'][number]
    }
  | MediaUploadFailure

type WorkerVerificationUploadResult =
  | {
      success: true
      field: keyof WorkerVerificationUrls
      url: string
    }
  | MediaUploadFailure

export async function uploadJobMediaDrafts(
  jobId: string,
  mediaItems: LocalMediaUploadDraft[],
  stage: Extract<JobMediaStage, 'before' | 'after' | 'kael_reference' | 'cancellation_evidence' | 'scope_change_evidence' | 'access_check_in'> = 'before',
) {
  if (mediaItems.length === 0) return { success: true as const, mediaRefs: [] as string[] }
  if (
    mediaItems.some((item) =>
      item.type === 'audio' || item.mimeType?.trim().toLowerCase().startsWith('audio/'),
    )
  ) {
    return {
      success: false as const,
      code: 'RAW_AUDIO_PRIVATE',
      error: 'Giọng nói gốc chỉ ở trên thiết bị. Hãy gửi bản chép lời đã kiểm tra.',
    }
  }
  const client = supabase
  if (!client) {
    return {
      success: false as const,
      code: 'MEDIA_STORAGE_UNAVAILABLE',
      error: 'Kho media chưa được cấu hình',
    }
  }

  const uploadResults = await Promise.all(
    mediaItems.slice(0, 5).map(async (item, index): Promise<JobMediaUploadResult> => {
      const mimeType = item.mimeType ?? fallbackMimeType(item)
      const objectPath = `${jobId}/${stage}/${safeObjectName(item.fileName, item.uri, index, mimeType)}`
      const localBlob = await readLocalMediaBlob(item.uri)
      if (!localBlob.success) {
        return {
          success: false,
          error: 'Không thể đọc tệp media đã chọn',
        }
      }
      const { error } = await client.storage.from('job-media').upload(objectPath, localBlob.blob, {
        contentType: mimeType,
        upsert: false,
      })
      if (error) {
        return {
          success: false,
          error: 'Không thể tải tệp media lên kho media',
        }
      }
      return {
        success: true,
        asset: {
          object_path: objectPath,
          stage,
          mime_type: mimeType,
          file_size_bytes: item.fileSizeBytes ?? localBlob.blob.size,
        },
      }
    }),
  )
  const failedUpload = uploadResults.find((result) => !result.success)
  if (failedUpload && !failedUpload.success) {
    return {
      success: false as const,
      error: failedUpload.error,
    }
  }
  const uploadedAssets = uploadResults.flatMap((result) => (result.success ? [result.asset] : []))

  const attached = await jobService.attachJobMedia(jobId, { assets: uploadedAssets })
  if (!attached.success) {
    return {
      success: false as const,
      error: attached.error,
    }
  }
  return {
    success: true as const,
    mediaRefs: attached.data.media.map((item) => item.storage_ref),
  }
}

export async function uploadKaelChatMediaDrafts(mediaItems: LocalMediaUploadDraft[]) {
  if (mediaItems.length === 0) {
    return {
      success: true as const,
      urls: [] as string[],
      mediaRefs: [] as string[],
      evidenceItems: [] as CaseWorkEvidence[],
    }
  }
  if (mediaItems.some((item) => item.type === 'audio' || (item.mimeType ?? '').toLowerCase().startsWith('audio/'))) {
    return {
      success: false as const,
      code: 'RAW_AUDIO_PRIVATE',
      error: 'Tệp ghi âm gốc chỉ được xử lý trên thiết bị. Hãy gửi bản chép lời đã kiểm tra.',
    }
  }
  const client = supabase
  if (!client) {
    return {
      success: false as const,
      code: 'MEDIA_STORAGE_UNAVAILABLE',
      error: 'Kho media chưa được cấu hình',
    }
  }

  const storageApi = client.storage.from('kael-chat-media') as unknown as {
    uploadToSignedUrl: (
      path: string,
      token: string,
      fileBody: Blob,
      fileOptions?: { contentType?: string; upsert?: boolean },
    ) => Promise<{ error: unknown }>
    remove?: (paths: string[]) => Promise<{ error: unknown }>
  }
  const uploadResults: ({
    success: true
    evidence: CaseWorkEvidence
    mediaRef: string
  } | MediaUploadFailure)[] = []
  const selectedDrafts = mediaItems.slice(0, 5)
  const videoIndexes = selectedDrafts.flatMap((item, index) => item.type === 'video' ? [index] : [])
  const frameCounts = new Map(videoIndexes.map((index) => [index, 1]))
  let extraVisionSlots = Math.max(0, 5 - selectedDrafts.length)
  while (extraVisionSlots > 0 && videoIndexes.length > 0) {
    let allocated = false
    for (const index of videoIndexes) {
      const current = frameCounts.get(index) ?? 1
      if (current >= 3 || extraVisionSlots <= 0) continue
      frameCounts.set(index, current + 1)
      extraVisionSlots -= 1
      allocated = true
    }
    if (!allocated) break
  }

  const extractedFrames = new Map<number, LocalMediaUploadDraft[]>()
  for (const index of videoIndexes) {
    const frames = await extractPrivateVideoFrames(
      selectedDrafts[index],
      frameCounts.get(index) ?? 1,
    )
    if (!frames.success) return frames
    extractedFrames.set(index, frames.drafts)
  }

  const uploadPlan: {
    index: number
    item: LocalMediaUploadDraft
    options: KaelEvidenceObjectOptions
  }[] = []
  for (const [index, item] of selectedDrafts.entries()) {
    if (item.type === 'image') {
      uploadPlan.push({
        index,
        item,
        options: { kind: 'photo', modelEligible: true },
      })
      continue
    }
    for (const [frameIndex, frame] of (extractedFrames.get(index) ?? []).entries()) {
      uploadPlan.push({
        index: index * 10 + frameIndex + 1,
        item: frame,
        options: { kind: 'video_frame', modelEligible: true },
      })
    }
  }
  // Keep originals last so extraction or model-image failures cannot leave a
  // private video orphan in Storage.
  for (const index of videoIndexes) {
    uploadPlan.push({
      index: 100 + index,
      item: selectedDrafts[index],
      options: { kind: 'video_original_private', modelEligible: false },
    })
  }

  for (const planned of uploadPlan) {
    const uploaded = await uploadKaelChatEvidenceObject(
      storageApi,
      planned.item,
      planned.index,
      planned.options,
    )
    uploadResults.push(uploaded)
    if (!uploaded.success) break
  }
  const failedUpload = uploadResults.find((result) => !result.success)
  if (failedUpload && !failedUpload.success) {
    await cleanupKaelChatMediaRefs(
      uploadResults.flatMap((result) => result.success ? [result.mediaRef] : []),
    )
    return {
      success: false as const,
      code: failedUpload.code,
      error: failedUpload.error,
    }
  }
  return {
    success: true as const,
    urls: [] as string[],
    mediaRefs: uploadResults.flatMap((result) => (result.success ? [result.mediaRef] : [])),
    evidenceItems: uploadResults.flatMap((result) => (result.success ? [result.evidence] : [])),
  }
}

export async function cleanupKaelChatMediaRefs(mediaRefs: readonly string[]) {
  const client = supabase
  if (!client || mediaRefs.length === 0) return false
  const paths = [...new Set(mediaRefs)]
    .map(kaelChatObjectPath)
    .filter((path): path is string => Boolean(path))
  if (paths.length === 0) return false
  try {
    const revoked = await kaelChatService.revokeMedia({ media_refs: [...new Set(mediaRefs)] })
    if (revoked.success && !revoked.data.deletion_pending) return true
  } catch {
    // Legacy deployments may not expose the revoke route yet. The owner-only
    // Storage delete remains a best-effort rollback fallback.
  }
  try {
    const { error } = await client.storage.from('kael-chat-media').remove(paths)
    return !error
  } catch {
    return false
  }
}

type KaelEvidenceObjectOptions = {
  kind: Extract<CaseWorkEvidence['kind'], 'photo' | 'video_frame' | 'video_original_private'>
  modelEligible: boolean
}

async function uploadKaelChatEvidenceObject(
  storageApi: {
    uploadToSignedUrl: (
      path: string,
      token: string,
      fileBody: Blob,
      fileOptions?: { contentType?: string; upsert?: boolean },
    ) => Promise<{ error: unknown }>
  },
  item: LocalMediaUploadDraft,
  index: number,
  options: KaelEvidenceObjectOptions,
): Promise<{
  success: true
  evidence: CaseWorkEvidence
  mediaRef: string
} | MediaUploadFailure> {
  const mimeType = mimeTypeForUpload(item)
  if (
    options.modelEligible &&
    !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)
  ) {
    return {
      success: false,
      code: 'UNSUPPORTED_MEDIA',
      error: 'Ảnh cần ở định dạng JPEG, PNG hoặc WebP để Kael phân tích',
    }
  }
  const localBlob = await readLocalMediaBlob(item.uri)
  if (!localBlob.success) {
    return { success: false, code: 'MEDIA_READ_FAILED', error: 'Không thể đọc tệp media đã chọn' }
  }
  const fileSizeBytes = positiveUploadFileSize(item.fileSizeBytes) ?? positiveUploadFileSize(localBlob.blob.size)
  if (!fileSizeBytes) {
    return {
      success: false,
      code: 'MEDIA_READ_FAILED',
      error: 'Tệp media rỗng hoặc không thể đọc',
    }
  }
  const signedUpload = await kaelChatService.createMediaUpload({
    file_name: safeUploadRequestFileName(item.fileName, item.uri, index, mimeType),
    mime_type: mimeType,
    purpose: options.kind === 'video_original_private' ? 'private_video_original' : 'model_vision',
    file_size_bytes: fileSizeBytes,
  })
  if (!signedUpload.success) {
    return { success: false, code: signedUpload.code, error: signedUpload.error }
  }
  const { error: uploadError } = await storageApi.uploadToSignedUrl(
    signedUpload.data.object_path,
    signedUpload.data.token,
    localBlob.blob,
    { contentType: mimeType, upsert: false },
  )
  if (uploadError) {
    return { success: false, code: 'MEDIA_UPLOAD_FAILED', error: 'Không thể tải ảnh/video lên kho media' }
  }
  return {
    success: true,
    mediaRef: signedUpload.data.media_ref,
    evidence: {
      kind: options.kind,
      ref: signedUpload.data.media_ref,
      model_eligible: options.modelEligible,
    },
  }
}

function kaelChatObjectPath(mediaRef: string) {
  const prefix = 'supabase://kael-chat-media/'
  return mediaRef.startsWith(prefix) ? mediaRef.slice(prefix.length) : null
}

async function extractPrivateVideoFrames(
  item: LocalMediaUploadDraft,
  limit: number,
): Promise<{ success: true; drafts: LocalMediaUploadDraft[] } | MediaUploadFailure> {
  if (limit <= 0) return { success: true, drafts: [] }
  try {
    const drafts: LocalMediaUploadDraft[] = []
    for (const [index, time] of videoFrameTimes(item.durationMillis, limit).entries()) {
      const frame = await VideoThumbnails.getThumbnailAsync(item.uri, { quality: 0.82, time })
      drafts.push({
        fileName: `video-frame-${index + 1}.jpg`,
        mimeType: 'image/jpeg',
        type: 'image',
        uri: frame.uri,
      })
    }
    if (drafts.length === 0) throw new Error('No video frame was generated')
    return { success: true, drafts }
  } catch {
    return {
      success: false,
      code: 'VIDEO_FRAME_EXTRACTION_UNAVAILABLE',
      error: 'Thiết bị chưa thể tách khung hình video. Video gốc vẫn ở trên thiết bị và chưa được gửi.',
    }
  }
}

export function videoFrameTimes(durationMillis: number | undefined, limit = 3) {
  const boundedLimit = Math.max(1, Math.min(3, Math.floor(limit)))
  if (!durationMillis || !Number.isFinite(durationMillis) || durationMillis <= 0) return [0]
  if (boundedLimit === 1 || durationMillis < 1_500) return [Math.max(0, Math.round(durationMillis / 2))]
  const ratios = boundedLimit === 2 ? [0.3, 0.7] : [0.2, 0.5, 0.8]
  return [...new Set(ratios.map((ratio) => Math.max(0, Math.round(durationMillis * ratio))))]
}


export async function uploadWorkerVerificationDrafts(files: WorkerVerificationDrafts) {
  const client = supabase
  if (!client) {
    return {
      success: false as const,
      error: 'Kho xác minh thợ chưa được cấu hình',
    }
  }

  const user = await client.auth.getUser()
  const userId = user.data.user?.id
  if (user.error || !userId) {
    return {
      success: false as const,
      error: 'Cần đăng nhập tài khoản thợ trước khi gửi hồ sơ',
    }
  }

  const uploaded: Partial<WorkerVerificationUrls> = {}
  const entries = [
    ['cccd_front_url', 'cccd-front', files.cccdFront],
    ['cccd_back_url', 'cccd-back', files.cccdBack],
    ['selfie_url', 'selfie', files.selfie],
  ] as const

  const uploadResults = await Promise.all(
    entries.map(async ([field, folder, item]): Promise<WorkerVerificationUploadResult> => {
      const mimeType = item.mimeType ?? fallbackMimeType(item)
      const objectPath = `${userId}/${folder}/${safeObjectName(item.fileName, item.uri, 0, mimeType)}`
      const localBlob = await readLocalMediaBlob(item.uri)
      if (!localBlob.success) {
        return {
          success: false,
          error: 'Không thể đọc file xác minh đã chọn',
        }
      }
      const { error } = await client.storage.from('worker-verification').upload(objectPath, localBlob.blob, {
        contentType: mimeType,
        upsert: false,
      })
      if (error) {
        return {
          success: false,
          error: 'Không thể tải file xác minh lên kho bảo mật',
        }
      }
      return {
        success: true,
        field,
        url: `supabase://worker-verification/${objectPath}`,
      }
    }),
  )
  const failedUpload = uploadResults.find((result) => !result.success)
  if (failedUpload && !failedUpload.success) {
    return {
      success: false as const,
      error: failedUpload.error,
    }
  }
  for (const result of uploadResults) {
    if (result.success) uploaded[result.field] = result.url
  }

  if (!uploaded.cccd_front_url || !uploaded.cccd_back_url || !uploaded.selfie_url) {
    return {
      success: false as const,
      error: 'Hồ sơ xác minh chưa đủ file bắt buộc',
    }
  }
  return {
    success: true as const,
    urls: uploaded as WorkerVerificationUrls,
  }
}

async function readLocalMediaBlob(uri: string): Promise<{ success: true; blob: Blob } | { success: false }> {
  try {
    const response = await fetch(uri)
    if (!response.ok) return { success: false }
    return { success: true, blob: await response.blob() }
  } catch {
    return { success: false }
  }
}

function safeObjectName(fileName: string | undefined, uri: string, index: number, mimeType: string) {
  const rawName = fileName || uri.split('/').pop() || `media-${index}${extensionForMimeType(mimeType)}`
  const dotIndex = rawName.lastIndexOf('.')
  const base = dotIndex > 0 ? rawName.slice(0, dotIndex) : rawName
  const extension = dotIndex > 0 ? rawName.slice(dotIndex) : extensionForMimeType(mimeType)
  const safeBase = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 70) || `media-${index}`
  return `${Date.now()}-${index}-${safeBase}${safeExtension(extension, mimeType)}`
}

function safeExtension(extension: string, mimeType: string) {
  const normalized = extension.toLowerCase().replace(/[^a-z0-9.]/g, '')
  if (/^\.[a-z0-9]{2,5}$/.test(normalized)) return normalized
  return extensionForMimeType(mimeType)
}

function mimeTypeForUpload(item: LocalMediaUploadDraft) {
  return normalizeUploadMimeType(item.mimeType ?? fallbackKaelChatMimeType(item), item)
}

function normalizeUploadMimeType(mimeType: string, item: LocalMediaUploadDraft) {
  const normalized = mimeType.trim().toLowerCase()
  if (normalized === 'image/jpg' || normalized === 'image/pjpeg') return 'image/jpeg'
  if (normalized === 'video/mov') return 'video/quicktime'
  if (normalized === 'audio/x-m4a' || normalized === 'audio/m4a') return 'audio/mp4'
  if (normalized === 'audio/mp3') return 'audio/mpeg'
  if (normalized === 'application/octet-stream') return fallbackKaelChatMimeType(item)
  return normalized || fallbackKaelChatMimeType(item)
}

function positiveUploadFileSize(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return Math.round(value)
}

function safeUploadRequestFileName(fileName: string | undefined, uri: string, index: number, mimeType: string) {
  const rawName = (fileName || uri.split('/').pop() || `media-${index}${extensionForMimeType(mimeType)}`).split(/[?#]/)[0]
  const dotIndex = rawName.lastIndexOf('.')
  const rawBase = dotIndex > 0 ? rawName.slice(0, dotIndex) : rawName
  const rawExtension = dotIndex > 0 ? rawName.slice(dotIndex) : extensionForMimeType(mimeType)
  const extension = safeExtension(rawExtension, mimeType)
  const safeBase = rawBase
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, Math.max(12, 170 - extension.length)) || `media-${index}`
  return `${safeBase}${extension}`
}

function fallbackMimeType(item: LocalMediaUploadDraft) {
  if (item.type === 'video') return 'video/mp4'
  if (item.type === 'audio') {
    const name = (item.fileName ?? item.uri).toLowerCase()
    if (name.endsWith('.mp3')) return 'audio/mpeg'
    if (name.endsWith('.wav')) return 'audio/wav'
    if (name.endsWith('.aac')) return 'audio/aac'
    if (name.endsWith('.mp4')) return 'audio/mp4'
    return 'audio/m4a'
  }
  const name = (item.fileName ?? item.uri).toLowerCase()
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

function fallbackKaelChatMimeType(item: LocalMediaUploadDraft) {
  const name = (item.fileName ?? item.uri).toLowerCase()
  if (item.type === 'video') {
    if (name.endsWith('.mov')) return 'video/quicktime'
    if (name.endsWith('.webm')) return 'video/webm'
    return 'video/mp4'
  }
  if (item.type === 'audio') {
    if (name.endsWith('.mp3')) return 'audio/mpeg'
    if (name.endsWith('.wav')) return 'audio/wav'
    if (name.endsWith('.aac')) return 'audio/aac'
    if (name.endsWith('.webm')) return 'audio/webm'
    if (name.endsWith('.mp4') || name.endsWith('.m4a')) return 'audio/mp4'
    return 'audio/mp4'
  }
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.gif')) return 'image/gif'
  if (name.endsWith('.heic')) return 'image/heic'
  if (name.endsWith('.heif')) return 'image/heif'
  return 'image/jpeg'
}

function extensionForMimeType(mimeType: string) {
  const normalized = mimeType.toLowerCase()
  if (normalized === 'image/png') return '.png'
  if (normalized === 'image/webp') return '.webp'
  if (normalized === 'image/gif') return '.gif'
  if (normalized === 'image/heic') return '.heic'
  if (normalized === 'image/heif') return '.heif'
  if (normalized === 'video/mp4') return '.mp4'
  if (normalized === 'video/quicktime') return '.mov'
  if (normalized === 'video/webm') return '.webm'
  if (normalized === 'audio/mpeg') return '.mp3'
  if (normalized === 'audio/wav') return '.wav'
  if (normalized === 'audio/aac') return '.aac'
  if (normalized === 'audio/mp4') return '.mp4'
  if (normalized === 'audio/m4a') return '.m4a'
  if (normalized === 'audio/webm') return '.webm'
  return '.jpg'
}
