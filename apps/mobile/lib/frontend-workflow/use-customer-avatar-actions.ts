import { useCallback, useEffect, useState } from 'react'
import type { UserRole } from '@nestscout/shared'
import { uploadCustomerAvatar, type CustomerAvatarDraft } from '../customer-avatar-upload'
import { customerProfileService } from '../services'
import { isAppForeground } from './helpers'

type CustomerAvatarState = {
  avatarUrl: string | null
  sessionUserId: string | null
}

const initialCustomerAvatarState: CustomerAvatarState = {
  avatarUrl: null,
  sessionUserId: null,
}

type CustomerAvatarActionsInput = {
  role: UserRole | null
  sessionUserId: string | null
  setRemoteError: (error: string) => false
}

export function useCustomerAvatarActions({
  role,
  sessionUserId,
  setRemoteError,
}: CustomerAvatarActionsInput) {
  const [customerAvatarState, setCustomerAvatarState] = useState<CustomerAvatarState>(initialCustomerAvatarState)
  // The signed read URL expires, so never show one issued for a previous session.
  const customerAvatarUrl = customerAvatarState.sessionUserId === sessionUserId ? customerAvatarState.avatarUrl : null

  const refreshCustomerAvatar = useCallback(async () => {
    if (!sessionUserId) {
      setCustomerAvatarState(initialCustomerAvatarState)
      return false
    }
    const result = await customerProfileService.getAvatar()
    if (!result.success) {
      setCustomerAvatarState({ avatarUrl: null, sessionUserId })
      return false
    }
    setCustomerAvatarState({ avatarUrl: result.data.avatar_url, sessionUserId })
    return true
  }, [sessionUserId])

  const customerUploadAvatar = useCallback(async (input: CustomerAvatarDraft) => {
    if (!sessionUserId) return setRemoteError('Bạn cần đăng nhập để đổi ảnh đại diện')
    const result = await uploadCustomerAvatar(input)
    if (!result.success) return setRemoteError(result.error)
    if (!result.data.avatar_url) return setRemoteError('Không thể mở ảnh đại diện vừa cập nhật')
    setCustomerAvatarState({ avatarUrl: result.data.avatar_url, sessionUserId })
    return true
  }, [sessionUserId, setRemoteError])

  useEffect(() => {
    if (!sessionUserId || (role !== 'customer' && role !== 'admin')) return
    const refreshTimer = setTimeout(() => {
      if (isAppForeground()) void refreshCustomerAvatar()
    }, 0)
    return () => clearTimeout(refreshTimer)
  }, [role, sessionUserId, refreshCustomerAvatar])

  return {
    customerAvatarUrl,
    customerUploadAvatar,
    refreshCustomerAvatar,
  }
}
