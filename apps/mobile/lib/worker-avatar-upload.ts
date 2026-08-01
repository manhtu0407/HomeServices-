import type { ApiResult } from './api'
import type { WorkerAvatarUpdateResponse } from './api-types'
import {
  uploadProfileAvatar,
  type ProfileAvatarDraft,
} from './profile-avatar-upload'
import { workerService } from './services'

export type WorkerAvatarDraft = ProfileAvatarDraft

export async function uploadWorkerAvatar(
  draft: WorkerAvatarDraft,
): Promise<ApiResult<WorkerAvatarUpdateResponse>> {
  return uploadProfileAvatar(draft, workerService)
}
