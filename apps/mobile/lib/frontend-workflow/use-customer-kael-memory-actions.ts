import { useCallback, useEffect, useState } from 'react'
import type { CustomerKaelMemoryPreferenceUpdateInput, UserRole } from '@nestscout/shared'
import type { KaelMemorySelfViewResponse } from '../api-types'
import { kaelMemoryService } from '../services'
import {
  isAppForeground,
  mergeCustomerKaelMemoryPermission,
  readCustomerKaelMemoryPermission,
} from './helpers'

export type CustomerKaelMemoryStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

type CustomerKaelMemoryState = {
  memory: KaelMemorySelfViewResponse['memory'] | null
  sessionUserId: string | null
  status: CustomerKaelMemoryStatus
}

const initialCustomerKaelMemoryState: CustomerKaelMemoryState = {
  memory: null,
  sessionUserId: null,
  status: 'idle',
}

type CustomerKaelMemoryActionsInput = {
  role: UserRole | null
  sessionUserId: string | null
  setRemoteError: (error: string) => false
}

export function useCustomerKaelMemoryActions({
  role,
  sessionUserId,
  setRemoteError,
}: CustomerKaelMemoryActionsInput) {
  const [customerKaelMemoryState, setCustomerKaelMemoryState] = useState<CustomerKaelMemoryState>(initialCustomerKaelMemoryState)
  const customerKaelMemory = customerKaelMemoryState.sessionUserId === sessionUserId ? customerKaelMemoryState.memory : null
  const customerKaelMemoryStatus = customerKaelMemoryState.sessionUserId === sessionUserId ? customerKaelMemoryState.status : 'idle'

  const refreshCustomerKaelMemory = useCallback(async () => {
    if (!sessionUserId) {
      setCustomerKaelMemoryState(initialCustomerKaelMemoryState)
      return false
    }
    setCustomerKaelMemoryState((current) => ({
      memory: current.sessionUserId === sessionUserId ? current.memory : null,
      sessionUserId,
      status: 'loading',
    }))
    const result = await kaelMemoryService.getMyMemory()
    if (!result.success) {
      setCustomerKaelMemoryState({
        memory: null,
        sessionUserId,
        status: 'unavailable',
      })
      return false
    }
    setCustomerKaelMemoryState({
      memory: result.data.subject_type === 'customer' ? result.data.memory : null,
      sessionUserId,
      status: 'ready',
    })
    return true
  }, [sessionUserId])

  const updateCustomerKaelMemoryPreference = useCallback(async (input: CustomerKaelMemoryPreferenceUpdateInput) => {
    if (!sessionUserId) return setRemoteError('Bạn cần đăng nhập để cập nhật bộ nhớ Kael')
    const result = await kaelMemoryService.updateMyPreference(input)
    if (!result.success) {
      setRemoteError(result.error)
      return {
        success: false,
        code: result.code,
        error: result.error,
        status: result.status,
      }
    }
    const responseMemory = result.data.subject_type === 'customer' ? result.data.memory : null
    const currentMemory = customerKaelMemoryState.sessionUserId === sessionUserId ? customerKaelMemoryState.memory : null
    const memory = mergeCustomerKaelMemoryPermission(responseMemory ?? currentMemory, input.key, input.enabled)
    setCustomerKaelMemoryState({
      memory,
      sessionUserId,
      status: 'ready',
    })
    if (readCustomerKaelMemoryPermission(memory, input.key) !== input.enabled) {
      return setRemoteError('Không thể xác nhận cập nhật bộ nhớ Kael')
    }
    return true
  }, [customerKaelMemoryState, sessionUserId, setRemoteError])

  useEffect(() => {
    setCustomerKaelMemoryState(initialCustomerKaelMemoryState)
  }, [sessionUserId])

  useEffect(() => {
    if (!sessionUserId || (role !== 'customer' && role !== 'admin')) return
    if (isAppForeground()) void refreshCustomerKaelMemory()
  }, [role, sessionUserId, refreshCustomerKaelMemory])

  return {
    customerKaelMemory,
    customerKaelMemoryStatus,
    refreshCustomerKaelMemory,
    updateCustomerKaelMemoryPreference,
  }
}
