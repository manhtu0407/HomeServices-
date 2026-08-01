import type { ApiResult } from './api'
import type { CustomerAvatarResponse } from './api-types'
import {
  uploadProfileAvatar,
  type ProfileAvatarDraft,
} from './profile-avatar-upload'
import { customerProfileService } from './services'

export type CustomerAvatarDraft = ProfileAvatarDraft

export function uploadCustomerAvatar(
  draft: CustomerAvatarDraft,
): Promise<ApiResult<CustomerAvatarResponse>> {
  return uploadProfileAvatar(draft, customerProfileService)
}
