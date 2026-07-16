export type KaelChatMediaUploadResponse = {
  bucket_id: 'kael-chat-media'
  object_path: string
  media_ref: string
  token: string
  signed_upload_url: string
  expires_in_seconds: number
}

export type JobMediaStage = 'before' | 'after' | 'kael_reference' | 'cancellation_evidence' | 'scope_change_evidence' | 'access_check_in'

export type JobMediaAttachInput = {
  assets: {
    object_path: string
    stage: JobMediaStage
    mime_type?: string
    file_size_bytes?: number
  }[]
}

export type JobMediaUploadRequest = {
  file_name: string
  file_size_bytes: number
  mime_type: string
  stage: JobMediaStage
}

export type JobMediaUploadIntentResponse = {
  bucket_id: 'job-media'
  object_path: string
  storage_ref: string
  signed_upload_url: string
  token: string
  expires_in_seconds: number
}

export type JobMediaRevokeRequest = {
  object_paths: string[]
}

export type JobMediaRevokeResult = {
  job_id: string
  revoked_count: number
  deletion_pending: boolean
}

export type ApartmentAccessAuthorizeResponse = {
  job_id: string
  release_stage: string
  already_authorized: boolean
}

export type JobMediaAttachResponse = {
  job_id: string
  photo_urls: string[]
  media: {
    bucket_id: 'job-media'
    object_path: string
    storage_ref: string
    stage: JobMediaStage
  }[]
}
