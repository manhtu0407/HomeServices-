import { jobService } from './services'
import { supabase } from './supabase'
import type { JobMediaAttachInput, JobMediaStage } from './api-types'

export type LocalMediaUploadDraft = {
  uri: string
  type: 'image' | 'video'
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
  stage: Extract<JobMediaStage, 'before' | 'after' | 'cancellation_evidence' | 'scope_change_evidence'> = 'before',
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
          error: 'Không thể đọc ảnh/video đã chọn',
        }
      }
      const { error } = await client.storage.from('job-media').upload(objectPath, localBlob.blob, {
        contentType: mimeType,
        upsert: false,
      })
      if (error) {
        return {
          success: false,
          error: 'Không thể tải ảnh/video lên kho media',
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

function fallbackMimeType(item: LocalMediaUploadDraft) {
  if (item.type === 'video') return 'video/mp4'
  const name = (item.fileName ?? item.uri).toLowerCase()
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/webp') return '.webp'
  if (mimeType === 'video/mp4') return '.mp4'
  return '.jpg'
}
