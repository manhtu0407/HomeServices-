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

export async function uploadJobMediaDrafts(
  jobId: string,
  mediaItems: LocalMediaUploadDraft[],
  stage: Extract<JobMediaStage, 'before' | 'after' | 'cancellation_evidence' | 'scope_change_evidence'> = 'before',
) {
  if (mediaItems.length === 0) return { success: true as const, mediaRefs: [] as string[] }
  if (!supabase) {
    return {
      success: false as const,
      error: 'Kho media chưa được cấu hình',
    }
  }

  const uploadedAssets: JobMediaAttachInput['assets'] = []
  for (const [index, item] of mediaItems.slice(0, 5).entries()) {
    const mimeType = item.mimeType ?? fallbackMimeType(item)
    const objectPath = `${jobId}/${stage}/${safeObjectName(item.fileName, item.uri, index, mimeType)}`
    const response = await fetch(item.uri)
    if (!response.ok) {
      return {
        success: false as const,
        error: 'Không thể đọc ảnh/video đã chọn',
      }
    }
    const blob = await response.blob()
    const { error } = await supabase.storage.from('job-media').upload(objectPath, blob, {
      contentType: mimeType,
      upsert: false,
    })
    if (error) {
      return {
        success: false as const,
        error: 'Không thể tải ảnh/video lên kho media',
      }
    }
    uploadedAssets.push({
      object_path: objectPath,
      stage,
      mime_type: mimeType,
      file_size_bytes: item.fileSizeBytes ?? blob.size,
    })
  }

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
  if (!supabase) {
    return {
      success: false as const,
      error: 'Kho xác minh thợ chưa được cấu hình',
    }
  }

  const user = await supabase.auth.getUser()
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

  for (const [field, folder, item] of entries) {
    const mimeType = item.mimeType ?? fallbackMimeType(item)
    const objectPath = `${userId}/${folder}/${safeObjectName(item.fileName, item.uri, 0, mimeType)}`
    const response = await fetch(item.uri)
    if (!response.ok) {
      return {
        success: false as const,
        error: 'Không thể đọc file xác minh đã chọn',
      }
    }
    const blob = await response.blob()
    const { error } = await supabase.storage.from('worker-verification').upload(objectPath, blob, {
      contentType: mimeType,
      upsert: false,
    })
    if (error) {
      return {
        success: false as const,
        error: 'Không thể tải file xác minh lên Supabase',
      }
    }
    uploaded[field] = `supabase://worker-verification/${objectPath}`
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
