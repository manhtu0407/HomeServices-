import type { LocalMediaUploadDraft } from './media-upload'
import { generateClientRequestId } from './client-request-id'
import { readResponseBytesBounded, withNetworkDeadline } from './response-guard'
import { supabase } from './supabase'

type WorkerVerificationDrafts = {
  cccdFront?: LocalMediaUploadDraft
  cccdBack?: LocalMediaUploadDraft
  selfie?: LocalMediaUploadDraft
}

type WorkerVerificationUrls = {
  cccd_front_url: string
  cccd_back_url: string
  selfie_url: string
}

type WorkerVerificationUploadResult =
  | {
      success: true
      field: keyof WorkerVerificationUrls
      objectPath: string
      url: string
    }
  | {
      success: false
      code?: string
      error: string
    }

type WorkerVerificationCleanupBucket = {
  remove(paths: string[]): PromiseLike<{ error: unknown }>
}

const MAX_WORKER_VERIFICATION_BYTES = 10 * 1024 * 1024
const LOCAL_MEDIA_READ_TIMEOUT_MS = 15_000
// Let the shared 65-second transport abort settle before treating the SDK outcome as unknown.
const WORKER_VERIFICATION_UPLOAD_TIMEOUT_MS = 75_000
const WORKER_VERIFICATION_CLEANUP_TIMEOUT_MS = 10_000
const WORKER_VERIFICATION_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

export async function uploadWorkerVerificationDrafts(files: WorkerVerificationDrafts, expectedOwnerId?: string) {
  const client = supabase
  if (!client) {
    return {
      success: false as const,
      error: 'Kho xác minh thợ chưa được cấu hình',
    }
  }

  let user: Awaited<ReturnType<typeof client.auth.getUser>>
  try {
    user = await withNetworkDeadline(
      () => client.auth.getUser(),
      LOCAL_MEDIA_READ_TIMEOUT_MS,
    )
  } catch {
    return {
      success: false as const,
      code: 'AUTH_UNAVAILABLE',
      error: 'Chưa thể xác minh phiên đăng nhập. Vui lòng thử lại.',
    }
  }
  const userId = user.data.user?.id
  if (user.error || !userId) {
    return {
      success: false as const,
      code: 'AUTH_REQUIRED',
      error: 'Cần đăng nhập tài khoản thợ trước khi gửi hồ sơ',
    }
  }

  if (expectedOwnerId !== undefined && userId !== expectedOwnerId) {
    return {
      success: false as const,
      code: 'AUTH_CHANGED',
      error: 'Phiên đăng nhập đã thay đổi. Mở lại hồ sơ trước khi gửi giấy tờ.',
    }
  }

  const entries = [
    ['cccd_front_url', 'cccd-front', files.cccdFront],
    ['cccd_back_url', 'cccd-back', files.cccdBack],
    ['selfie_url', 'selfie', files.selfie],
  ] as const
  const preparedEntries = entries.flatMap(([field, folder, item]) => {
    if (!item) return []
    const mimeType = workerVerificationMimeType(item)
    return [{
      field,
      item,
      mimeType,
      objectPath: `${userId}/${folder}/${generateClientRequestId()}${workerVerificationExtension(mimeType)}`,
    }]
  })
  if (preparedEntries.length === 0) {
    return {
      success: false as const,
      code: 'MEDIA_REQUIRED',
      error: 'Chọn ít nhất một ảnh giấy tờ trước khi tải lên',
    }
  }
  if (preparedEntries.some(({ item }) =>
    typeof item.fileSizeBytes === 'number' && item.fileSizeBytes > MAX_WORKER_VERIFICATION_BYTES
  )) {
    return {
      success: false as const,
      code: 'MEDIA_TOO_LARGE',
      error: 'Mỗi file xác minh phải nhỏ hơn hoặc bằng 10 MB',
    }
  }
  if (preparedEntries.some(({ item, mimeType }) =>
    item.type !== 'image' || !WORKER_VERIFICATION_MIME_TYPES.has(mimeType)
  )) {
    return {
      success: false as const,
      code: 'UNSUPPORTED_MEDIA',
      error: 'File xác minh phải là ảnh JPEG, PNG hoặc WebP',
    }
  }

  const bucket = client.storage.from('worker-verification')
  const uploadResults = await Promise.all(
    preparedEntries.map(async ({ field, item, mimeType, objectPath }): Promise<WorkerVerificationUploadResult> => {
      const localFile = await readWorkerVerificationBytes(item.uri)
      if (!localFile.success) {
        return {
          success: false,
          code: 'MEDIA_READ_FAILED',
          error: 'Không thể đọc file xác minh đã chọn',
        }
      }
      const fileSizeBytes = positiveFileSize(localFile.bytes.byteLength)
      if (!fileSizeBytes) {
        return {
          success: false,
          code: 'MEDIA_READ_FAILED',
          error: 'File xác minh rỗng hoặc không thể đọc',
        }
      }
      if (fileSizeBytes > MAX_WORKER_VERIFICATION_BYTES) {
        return {
          success: false,
          code: 'MEDIA_TOO_LARGE',
          error: 'Mỗi file xác minh phải nhỏ hơn hoặc bằng 10 MB',
        }
      }

      try {
        const uploaded = await withNetworkDeadline(
          () => bucket.upload(objectPath, localFile.bytes, {
            contentType: mimeType,
            upsert: false,
          }),
          WORKER_VERIFICATION_UPLOAD_TIMEOUT_MS,
        )
        if (uploaded.error) throw new Error('UPLOAD_FAILED')
      } catch {
        return {
          success: false,
          code: 'MEDIA_UPLOAD_FAILED',
          error: 'Không thể tải file xác minh lên kho bảo mật',
        }
      }
      return {
        success: true,
        field,
        objectPath,
        url: `supabase://worker-verification/${objectPath}`,
      }
    }),
  )
  const failedUpload = uploadResults.find((result) => !result.success)
  if (failedUpload && !failedUpload.success) {
    // A rejected or unknown upload may name an existing object; only acknowledgements prove this batch created it.
    const acknowledgedPaths = uploadResults.flatMap((result) => result.success ? [result.objectPath] : [])
    if (acknowledgedPaths.length > 0) await cleanupWorkerVerificationDrafts(bucket, acknowledgedPaths)
    return {
      success: false as const,
      code: failedUpload.code ?? 'MEDIA_UPLOAD_FAILED',
      error: failedUpload.error,
    }
  }

  const uploaded: Partial<WorkerVerificationUrls> = {}
  for (const result of uploadResults) {
    if (result.success) uploaded[result.field] = result.url
  }
  if (preparedEntries.some(({ field }) => !uploaded[field])) {
    return {
      success: false as const,
      code: 'MEDIA_UPLOAD_FAILED',
      error: 'Hồ sơ xác minh chưa đủ file bắt buộc',
    }
  }
  return {
    success: true as const,
    urls: uploaded,
  }
}

// Raw bytes for the same reason as readLocalMediaBytes: a Blob upload reaches Storage as text/plain.
async function readWorkerVerificationBytes(uri: string) {
  try {
    return await withNetworkDeadline(async (signal) => {
      const response = await fetch(uri, { signal })
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)
        return { success: false as const }
      }
      return {
        success: true as const,
        bytes: await readResponseBytesBounded(response, MAX_WORKER_VERIFICATION_BYTES),
      }
    }, LOCAL_MEDIA_READ_TIMEOUT_MS)
  } catch {
    return { success: false as const }
  }
}

function workerVerificationMimeType(item: LocalMediaUploadDraft) {
  const fallback = workerVerificationFallbackMimeType(item)
  const normalized = (item.mimeType ?? fallback).trim().toLowerCase()
  if (normalized === 'image/jpg' || normalized === 'image/pjpeg') return 'image/jpeg'
  if (!normalized || normalized === 'application/octet-stream') return fallback
  return normalized
}

function workerVerificationFallbackMimeType(item: LocalMediaUploadDraft) {
  const name = (item.fileName ?? item.uri).split(/[?#]/)[0].toLowerCase()
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

function workerVerificationExtension(mimeType: string) {
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/webp') return '.webp'
  return '.jpg'
}

function positiveFileSize(value: number) {
  if (!Number.isFinite(value) || value <= 0) return undefined
  return Math.round(value)
}

async function cleanupWorkerVerificationDrafts(
  bucket: WorkerVerificationCleanupBucket,
  objectPaths: string[],
) {
  try {
    const removed = await withNetworkDeadline(
      async () => await bucket.remove(objectPaths),
      WORKER_VERIFICATION_CLEANUP_TIMEOUT_MS,
    )
    return !removed.error
  } catch {
    return false
  }
}
