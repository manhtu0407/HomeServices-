import { jobService, kaelChatService } from './services'
import { supabase } from './supabase'
import type { JobMediaAttachInput, JobMediaStage } from './api-types'

export type LocalMediaUploadDraft = {
  uri: string
  type: 'image' | 'video' | 'audio'
  fileName?: string
  mimeType?: string
  fileSizeBytes?: number
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
  const client = supabase
  if (!client) {
    return {
      success: false as const,
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
  if (mediaItems.length === 0) return { success: true as const, urls: [] as string[], mediaRefs: [] as string[] }
  const client = supabase
  if (!client) {
    return {
      success: false as const,
      error: 'Kho media chưa được cấu hình',
    }
  }

  const uploadResults = await Promise.all(
    mediaItems.slice(0, 5).map(async (item, index): Promise<{ success: true; mediaRef: string; signedUrl?: string; uploadMode: 'edge' | 'direct' } | MediaUploadFailure> => {
      const mimeType = mimeTypeForUpload(item)
      const localBlob = await readLocalMediaBlob(item.uri)
      if (!localBlob.success) {
        return {
          success: false,
          error: 'Không thể đọc tệp media đã chọn',
        }
      }
      const fileSizeBytes = positiveUploadFileSize(item.fileSizeBytes) ?? positiveUploadFileSize(localBlob.blob.size)
      const signedUpload = await kaelChatService.createMediaUpload({
        file_name: safeUploadRequestFileName(item.fileName, item.uri, index, mimeType),
        mime_type: mimeType,
        ...(fileSizeBytes ? { file_size_bytes: fileSizeBytes } : {}),
      })
      if (!signedUpload.success) {
        if (shouldUseDirectKaelChatMediaUploadFallback(signedUpload)) {
          return uploadKaelChatMediaDirect(client, item, index, mimeType, localBlob.blob)
        }
        return {
          success: false,
          code: signedUpload.code,
          error: signedUpload.error,
        }
      }
      const storageApi = client.storage.from('kael-chat-media') as unknown as {
        createSignedUrl: (path: string, expiresIn: number) => Promise<{ data: { signedUrl?: string } | null; error: unknown }>
        uploadToSignedUrl: (
          path: string,
          token: string,
          fileBody: Blob,
          fileOptions?: { contentType?: string; upsert?: boolean },
        ) => Promise<{ error: unknown }>
      }
      const { error: uploadError } = await storageApi.uploadToSignedUrl(
        signedUpload.data.object_path,
        signedUpload.data.token,
        localBlob.blob,
        {
          contentType: mimeType,
          upsert: false,
        },
      )
      if (uploadError) {
        return {
          success: false,
          error: 'Không thể tải ảnh/video lên kho media',
        }
      }
      const signed = await storageApi.createSignedUrl(signedUpload.data.object_path, 60 * 60)
      return {
        success: true,
        mediaRef: signedUpload.data.media_ref,
        signedUrl: signed.error ? undefined : signed.data?.signedUrl,
        uploadMode: 'edge',
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
  return {
    success: true as const,
    urls: uploadResults.flatMap((result) => (result.success && result.signedUrl ? [result.signedUrl] : [])),
    mediaRefs: uploadResults.flatMap((result) => (result.success ? [result.mediaRef] : [])),
    usedDirectUpload: uploadResults.some((result) => result.success && result.uploadMode === 'direct'),
  }
}

async function uploadKaelChatMediaDirect(
  client: NonNullable<typeof supabase>,
  item: LocalMediaUploadDraft,
  index: number,
  mimeType: string,
  blob: Blob,
): Promise<{ success: true; mediaRef: string; signedUrl: string; uploadMode: 'direct' } | MediaUploadFailure> {
  const userResult = await client.auth.getUser()
  const userId = userResult.data.user?.id
  if (userResult.error || !userId) {
    return {
      success: false,
      code: 'AUTH_REQUIRED',
      error: 'Cần đăng nhập để gửi media',
    }
  }
  const objectPath = `${userId}/kael-chat/${safeObjectName(item.fileName, item.uri, index, mimeType)}`
  const storageApi = client.storage.from('kael-chat-media') as unknown as {
    createSignedUrl: (path: string, expiresIn: number) => Promise<{ data: { signedUrl?: string } | null; error: unknown }>
    upload: (
      path: string,
      fileBody: Blob,
      fileOptions?: { contentType?: string; upsert?: boolean },
    ) => Promise<{ error: unknown }>
  }
  const { error: uploadError } = await storageApi.upload(objectPath, blob, {
    contentType: mimeType,
    upsert: false,
  })
  if (uploadError) {
    return {
      success: false,
      code: 'KAEL_CHAT_DIRECT_UPLOAD_FAILED',
      error: 'Không thể tải ảnh/video lên kho media',
    }
  }
  const signed = await storageApi.createSignedUrl(objectPath, 60 * 60)
  if (signed.error || !signed.data?.signedUrl) {
    return {
      success: false,
      code: 'KAEL_CHAT_DIRECT_SIGN_FAILED',
      error: 'Không thể chuẩn bị media cho Kael',
    }
  }
  return {
    success: true,
    mediaRef: `supabase://kael-chat-media/${objectPath}`,
    signedUrl: signed.data.signedUrl,
    uploadMode: 'direct',
  }
}

function shouldUseDirectKaelChatMediaUploadFallback(result: { code?: string; status?: number }) {
  return result.status === 404 ||
    result.code === 'NOT_FOUND' ||
    (result.status === 400 && result.code === 'VALIDATION')
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
