import {
  WORKER_AVATAR_MAX_BYTES,
} from '@nestscout/shared'

import type { ApiResult } from './api'
import { supabase } from './supabase'

export type ProfileAvatarDraft = {
  uri: string
  fileName?: string
  mimeType?: string
  fileSizeBytes?: number
}

type ProfileAvatarResponse = {
  avatar_url: string | null
}

type ProfileAvatarUploadInput = {
  file_name: string
  file_size_bytes: number
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp'
}

type ProfileAvatarUploadResponse = {
  avatar_ref: string
  bucket_id: 'customer-avatars' | 'worker-avatars'
  object_path: string
  token: string
}

type ProfileAvatarService<Response extends ProfileAvatarResponse> = {
  createAvatarUpload: (
    input: ProfileAvatarUploadInput,
  ) => Promise<ApiResult<ProfileAvatarUploadResponse>>
  updateAvatar: (
    input: { avatar_ref: string },
  ) => Promise<ApiResult<Response>>
}

const ALLOWED_AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function uploadProfileAvatar<Response extends ProfileAvatarResponse>(
  draft: ProfileAvatarDraft,
  service: ProfileAvatarService<Response>,
): Promise<ApiResult<Response>> {
  if (!supabase) {
    return failure('MEDIA_STORAGE_UNAVAILABLE', 'Kho ảnh đại diện chưa được cấu hình')
  }

  const mimeType = normalizeAvatarMime(draft.mimeType, draft.fileName, draft.uri)
  if (!mimeType || !ALLOWED_AVATAR_MIME_TYPES.has(mimeType)) {
    return failure('UNSUPPORTED_MEDIA', 'Ảnh đại diện phải là JPEG, PNG hoặc WebP')
  }

  const localBlob = await readLocalBlob(draft.uri)
  if (!localBlob) {
    return failure('MEDIA_READ_FAILED', 'Không thể đọc ảnh đại diện đã chọn')
  }
  const fileSizeBytes = localBlob.size
  if (fileSizeBytes <= 0 || fileSizeBytes > WORKER_AVATAR_MAX_BYTES) {
    return failure('PAYLOAD_TOO_LARGE', 'Ảnh đại diện phải nhỏ hơn hoặc bằng 5 MB')
  }

  const prepared = await service.createAvatarUpload({
    file_name: safeAvatarFileName(draft.fileName, mimeType),
    mime_type: mimeType as ProfileAvatarUploadInput['mime_type'],
    file_size_bytes: fileSizeBytes,
  })
  if (!prepared.success) return prepared

  const uploaded = await supabase.storage.from(prepared.data.bucket_id).uploadToSignedUrl(
    prepared.data.object_path,
    prepared.data.token,
    localBlob,
    { contentType: mimeType, upsert: false },
  )
  if (uploaded.error) {
    return failure('MEDIA_UPLOAD_FAILED', 'Không thể tải ảnh đại diện lên hệ thống')
  }

  return service.updateAvatar({ avatar_ref: prepared.data.avatar_ref })
}

async function readLocalBlob(uri: string) {
  try {
    const response = await fetch(uri)
    if (!response.ok) return null
    return await response.blob()
  } catch {
    return null
  }
}

function normalizeAvatarMime(
  declaredMime: string | undefined,
  fileName: string | undefined,
  uri: string,
) {
  const normalized = declaredMime?.split(';', 1)[0]?.trim().toLowerCase()
  if (normalized === 'image/jpg' || normalized === 'image/pjpeg') return 'image/jpeg'
  if (normalized) return normalized
  const source = `${fileName ?? ''} ${uri}`.toLowerCase()
  if (/\.png(?:\?|$|\s)/.test(source)) return 'image/png'
  if (/\.webp(?:\?|$|\s)/.test(source)) return 'image/webp'
  if (/\.(?:jpe?g)(?:\?|$|\s)/.test(source)) return 'image/jpeg'
  return null
}

function safeAvatarFileName(fileName: string | undefined, mimeType: string) {
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'
  const base = (fileName ?? 'profile-avatar')
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 140) || 'profile-avatar'
  return `${base}.${extension}`
}

function failure(code: string, error: string): ApiResult<never> {
  return { success: false, code, error, status: 0 }
}
