import { jobService, kaelChatService } from './services'
import { supabase } from './supabase'
import * as VideoThumbnails from 'expo-video-thumbnails'
import type { CaseWorkEvidence } from '@nestscout/shared'
import type { JobMediaAttachInput, JobMediaStage } from './api-types'
import { readResponseBlobBounded, withNetworkDeadline } from './response-guard'

export { uploadWorkerVerificationDrafts } from './worker-verification-upload'

export type LocalMediaUploadDraft = {
  uri: string
  type: 'image' | 'video' | 'audio'
  fileName?: string
  mimeType?: string
  fileSizeBytes?: number
  durationMillis?: number
}

type MediaUploadFailure = {
  success: false
  code?: string
  error: string
}

const MAX_JOB_MEDIA_BYTES = 26_214_400
const MAX_KAEL_CHAT_MEDIA_BYTES = 50 * 1024 * 1024
const LOCAL_MEDIA_READ_TIMEOUT_MS = 15_000
const JOB_MEDIA_UPLOAD_TIMEOUT_MS = 60_000
const JOB_MEDIA_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
])

export function localizeMediaUploadFailure(
  failure: { code?: string; error: string },
  language: 'vi' | 'en',
) {
  const localized = mediaUploadFailureCopy[language]
  return localized.byCode[failure.code ?? ''] ?? localized.fallback
}

const mediaUploadFailureCopy = {
  vi: {
    byCode: {
      RAW_AUDIO_PRIVATE: 'Giọng nói gốc chỉ ở trên thiết bị. Hãy gửi bản chép lời đã kiểm tra.',
      VIDEO_FRAME_EXTRACTION_UNAVAILABLE: 'Thiết bị này không thể trích khung hình video. Video gốc không được tải lên.',
      MEDIA_STORAGE_UNAVAILABLE: 'Kho media chưa được cấu hình.',
      MEDIA_READ_FAILED: 'Không thể đọc media đã chọn.',
      MEDIA_TOO_LARGE: 'Media đã chọn vượt giới hạn dung lượng.',
      MEDIA_UPLOAD_FAILED: 'Không thể tải media đã chọn lên. Vui lòng thử lại.',
      UNSUPPORTED_MEDIA: 'Hãy chọn tệp JPEG, PNG, WebP hoặc MP4 phù hợp với bước này.',
    } as Record<string, string>,
    fallback: 'Không thể xử lý media đã chọn. Vui lòng thử lại.',
  },
  en: {
    byCode: {
      RAW_AUDIO_PRIVATE: 'Raw voice audio stays on your device. Send the reviewed transcript instead.',
      VIDEO_FRAME_EXTRACTION_UNAVAILABLE: 'This device could not extract video frames. The original video was not uploaded.',
      MEDIA_STORAGE_UNAVAILABLE: 'Media storage is not configured yet.',
      MEDIA_READ_FAILED: 'The selected media could not be read.',
      MEDIA_TOO_LARGE: 'The selected media exceeds the allowed size limit.',
      MEDIA_UPLOAD_FAILED: 'The selected media could not be uploaded. Please try again.',
      UNSUPPORTED_MEDIA: 'Use a compatible JPEG, PNG, WebP, or MP4 file for this step.',
    } as Record<string, string>,
    fallback: 'The selected media could not be processed. Please try again.',
  },
} as const

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

  const storageApi = client.storage.from('job-media') as unknown as {
    uploadToSignedUrl: (
      path: string,
      token: string,
      fileBody: Blob,
      fileOptions?: { contentType?: string; upsert?: boolean },
    ) => Promise<{ error: unknown }>
  }
  const reservedObjectPaths: string[] = []
  const uploadedAssets: JobMediaAttachInput['assets'] = []

  for (const [index, item] of mediaItems.slice(0, 5).entries()) {
    if (
      typeof item.fileSizeBytes === 'number' &&
      Number.isFinite(item.fileSizeBytes) &&
      item.fileSizeBytes > MAX_JOB_MEDIA_BYTES
    ) {
      await revokeJobMediaUploadsBestEffort(jobId, reservedObjectPaths)
      return jobMediaFailure('MEDIA_TOO_LARGE', 'Tệp media vượt quá giới hạn 25 MB')
    }

    const mimeType = mimeTypeForUpload(item)
    if (
      !JOB_MEDIA_MIME_TYPES.has(mimeType) ||
      (mimeType === 'video/mp4' && stage !== 'before' && stage !== 'kael_reference')
    ) {
      await revokeJobMediaUploadsBestEffort(jobId, reservedObjectPaths)
      return jobMediaFailure(
        'UNSUPPORTED_MEDIA',
        'Tệp media phải ở định dạng JPEG, PNG, WebP hoặc MP4 phù hợp với bước này',
      )
    }

    const localBlob = await readLocalMediaBlob(item.uri, MAX_JOB_MEDIA_BYTES)
    if (!localBlob.success) {
      await revokeJobMediaUploadsBestEffort(jobId, reservedObjectPaths)
      return jobMediaFailure('MEDIA_READ_FAILED', 'Không thể đọc tệp media đã chọn')
    }
    const fileSizeBytes = positiveUploadFileSize(localBlob.blob.size)
    if (!fileSizeBytes) {
      await revokeJobMediaUploadsBestEffort(jobId, reservedObjectPaths)
      return jobMediaFailure('MEDIA_READ_FAILED', 'Tệp media rỗng hoặc không thể đọc')
    }
    if (fileSizeBytes > MAX_JOB_MEDIA_BYTES) {
      await revokeJobMediaUploadsBestEffort(jobId, reservedObjectPaths)
      return jobMediaFailure('MEDIA_TOO_LARGE', 'Tệp media vượt quá giới hạn 25 MB')
    }

    let uploadIntent: Awaited<ReturnType<typeof jobService.createJobMediaUpload>>
    try {
      uploadIntent = await jobService.createJobMediaUpload(jobId, {
        file_name: safeUploadRequestFileName(item.fileName, item.uri, index, mimeType),
        file_size_bytes: fileSizeBytes,
        mime_type: mimeType,
        stage,
      })
    } catch {
      await revokeJobMediaUploadsBestEffort(jobId, reservedObjectPaths)
      return jobMediaFailure('MEDIA_UPLOAD_FAILED', 'Không thể chuẩn bị tệp media')
    }
    if (!uploadIntent.success) {
      await revokeJobMediaUploadsBestEffort(jobId, reservedObjectPaths)
      return jobMediaFailure(uploadIntent.code, uploadIntent.error)
    }

    const { object_path: objectPath, token } = uploadIntent.data
    reservedObjectPaths.push(objectPath)
    try {
      const { error } = await withJobMediaUploadTimeout(
        storageApi.uploadToSignedUrl(
          objectPath,
          token,
          localBlob.blob,
          { contentType: mimeType, upsert: false },
        ),
      )
      if (error) {
        await revokeJobMediaUploadsBestEffort(jobId, reservedObjectPaths)
        return jobMediaFailure('MEDIA_UPLOAD_FAILED', 'Không thể tải tệp media lên kho media')
      }
    } catch {
      await revokeJobMediaUploadsBestEffort(jobId, reservedObjectPaths)
      return jobMediaFailure('MEDIA_UPLOAD_FAILED', 'Không thể tải tệp media lên kho media')
    }

    uploadedAssets.push({
      object_path: uploadIntent.data.object_path,
      stage,
      mime_type: mimeType,
      file_size_bytes: fileSizeBytes,
    })
  }

  let attached: Awaited<ReturnType<typeof jobService.attachJobMedia>>
  try {
    attached = await jobService.attachJobMedia(jobId, { assets: uploadedAssets })
  } catch {
    await revokeJobMediaUploadsBestEffort(jobId, reservedObjectPaths)
    return jobMediaFailure('MEDIA_UPLOAD_FAILED', 'Không thể gắn media vào yêu cầu')
  }
  if (!attached.success) {
    await revokeJobMediaUploadsBestEffort(jobId, reservedObjectPaths)
    return jobMediaFailure(attached.code, attached.error)
  }
  return {
    success: true as const,
    mediaRefs: attached.data.media.map((item) => item.storage_ref),
  }
}

function jobMediaFailure(code: string, error: string): MediaUploadFailure {
  return { success: false, code, error }
}

async function revokeJobMediaUploadsBestEffort(jobId: string, objectPaths: string[]) {
  const uniquePaths = [...new Set(objectPaths)].slice(0, 5)
  if (uniquePaths.length === 0) return
  try {
    await jobService.revokeJobMediaUploads(jobId, { object_paths: uniquePaths })
  } catch {
    return
  }
}

async function withJobMediaUploadTimeout<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Job media upload timeout')), JOB_MEDIA_UPLOAD_TIMEOUT_MS)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
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
      const frameTime = videoFrameTimes(
        item.durationMillis,
        frameCounts.get(index) ?? 1,
      )[frameIndex]
      uploadPlan.push({
        index: index * 10 + frameIndex + 1,
        item: frame,
        options: {
          kind: 'video_frame',
          modelEligible: true,
          summary: videoFrameEvidenceSummary(frameTime, item.durationMillis),
        },
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
  summary?: string
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
  const localBlob = await readLocalMediaBlob(item.uri, MAX_KAEL_CHAT_MEDIA_BYTES)
  if (!localBlob.success) {
    return { success: false, code: 'MEDIA_READ_FAILED', error: 'Không thể đọc tệp media đã chọn' }
  }
  const fileSizeBytes = positiveUploadFileSize(localBlob.blob.size)
  if (!fileSizeBytes) {
    return {
      success: false,
      code: 'MEDIA_READ_FAILED',
      error: 'Tệp media rỗng hoặc không thể đọc',
    }
  }
  if (fileSizeBytes > MAX_KAEL_CHAT_MEDIA_BYTES) {
    return {
      success: false,
      code: 'MEDIA_TOO_LARGE',
      error: 'Tệp media vượt quá giới hạn dung lượng cho phép',
    }
  }
  let signedUpload: Awaited<ReturnType<typeof kaelChatService.createMediaUpload>>
  try {
    signedUpload = await withJobMediaUploadTimeout(kaelChatService.createMediaUpload({
      file_name: safeUploadRequestFileName(item.fileName, item.uri, index, mimeType),
      mime_type: mimeType,
      purpose: options.kind === 'video_original_private' ? 'private_video_original' : 'model_vision',
      file_size_bytes: fileSizeBytes,
    }))
  } catch {
    return {
      success: false,
      code: 'MEDIA_UPLOAD_FAILED',
      error: 'Không thể chuẩn bị tệp media để tải lên',
    }
  }
  if (!signedUpload.success) {
    return { success: false, code: signedUpload.code, error: signedUpload.error }
  }
  try {
    const { error: uploadError } = await withJobMediaUploadTimeout(storageApi.uploadToSignedUrl(
      signedUpload.data.object_path,
      signedUpload.data.token,
      localBlob.blob,
      { contentType: mimeType, upsert: false },
    ))
    if (!uploadError) {
      return {
        success: true,
        mediaRef: signedUpload.data.media_ref,
        evidence: {
          kind: options.kind,
          ref: signedUpload.data.media_ref,
          model_eligible: options.modelEligible,
          ...(options.summary ? { summary: options.summary } : {}),
        },
      }
    }
  } catch {
    // The upload may have reached Storage before the client observed failure.
  }
  await cleanupKaelChatMediaRefs([signedUpload.data.media_ref])
  return {
    success: false,
    code: 'MEDIA_UPLOAD_FAILED',
    error: 'Không thể tải ảnh/video lên kho media',
  }
}

function kaelChatObjectPath(mediaRef: string) {
  const prefix = 'supabase://kael-chat-media/'
  if (!mediaRef.startsWith(prefix)) return null
  const objectPath = mediaRef.slice(prefix.length)
  if (objectPath.includes('..') || objectPath.includes('//')) return null
  return /^[^/\s?#]{1,128}\/kael-chat\/(?:model_vision|private_video_original)\/[A-Za-z0-9][A-Za-z0-9._-]{0,220}$/.test(objectPath)
    ? objectPath
    : null
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

function videoFrameEvidenceSummary(timestampMillis: number | undefined, durationMillis: number | undefined) {
  const timestamp = formatMediaTimestamp(timestampMillis ?? 0)
  if (!durationMillis || !Number.isFinite(durationMillis) || durationMillis <= 0) {
    return `Video frame position: ${timestamp}.`
  }
  return `Video frame position: ${timestamp} / ${formatMediaTimestamp(durationMillis)}.`
}

function formatMediaTimestamp(durationMillis: number) {
  const seconds = Math.max(0, Math.round(durationMillis / 1_000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

async function readLocalMediaBlob(
  uri: string,
  maxBytes: number,
): Promise<{ success: true; blob: Blob } | { success: false }> {
  try {
    return await withNetworkDeadline(async (signal) => {
      const response = await fetch(uri, { signal })
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)
        return { success: false as const }
      }
      return {
        success: true as const,
        blob: await readResponseBlobBounded(response, maxBytes),
      }
    }, LOCAL_MEDIA_READ_TIMEOUT_MS)
  } catch {
    return { success: false }
  }
}

function safeExtension(mimeType: string) {
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
  const extension = safeExtension(mimeType)
  const safeBase = rawBase
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, Math.max(12, 170 - extension.length)) || `media-${index}`
  return `${safeBase}${extension}`
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
