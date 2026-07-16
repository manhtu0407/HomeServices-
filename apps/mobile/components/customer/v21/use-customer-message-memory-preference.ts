import { useRef, useState } from 'react'
import { Alert } from 'react-native'
import type { CustomerKaelMemoryPreferenceUpdateInput } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'
import {
  memoryPreferenceActionSucceeded,
  memoryPreferenceSyncFailureLabel,
  type MemoryPreferenceActionResult,
} from './agentic-memory-display-model'
import {
  customerKaelStateScopeKey,
  useCustomerKaelRequestGuard,
} from './customer-kael-state-scope'

type MessageMemoryPreferenceState = {
  observedBackendEnabled: boolean
  ownerId: string | null
  override: boolean | null
  pending: boolean
}

export function useCustomerMessageMemoryPreference(input: {
  accessToken: string | null
  backendEnabled: boolean
  language: AppLanguage
  ownerId: string | null
  updatePreference: (input: CustomerKaelMemoryPreferenceUpdateInput) => Promise<MemoryPreferenceActionResult>
}) {
  const scope = customerKaelStateScopeKey({
    accountId: input.ownerId,
    caseId: null,
    mode: 'normal',
    sessionId: 'profile-memory',
  })
  const requestGuard = useCustomerKaelRequestGuard(scope)
  const pendingOperationRef = useRef<{ ownerId: string | null } | null>(null)
  const [state, setState] = useState<MessageMemoryPreferenceState>({
    observedBackendEnabled: input.backendEnabled,
    ownerId: input.ownerId,
    override: null,
    pending: false,
  })

  if (state.ownerId !== input.ownerId || state.observedBackendEnabled !== input.backendEnabled) {
    const ownerChanged = state.ownerId !== input.ownerId
    setState({
      observedBackendEnabled: input.backendEnabled,
      ownerId: input.ownerId,
      override: ownerChanged || state.override === input.backendEnabled ? null : state.override,
      pending: ownerChanged ? false : state.pending,
    })
  }

  const enabled = state.override ?? input.backendEnabled
  const toggle = async () => {
    if (state.pending || pendingOperationRef.current?.ownerId === input.ownerId) return
    const operation = { ownerId: input.ownerId }
    pendingOperationRef.current = operation
    const nextEnabled = !enabled
    const requestToken = requestGuard.begin('memory-preference')
    setState((current) => ({ ...current, override: nextEnabled, pending: true }))
    let result: MemoryPreferenceActionResult = false
    try {
      result = await input.updatePreference({
        enabled: nextEnabled,
        key: 'message_interaction_memory',
      })
    } catch {
      result = false
    }
    try {
      if (requestGuard.isCurrent(requestToken)) {
        if (memoryPreferenceActionSucceeded(result)) {
          setState((current) => ({ ...current, pending: false }))
        } else {
          setState((current) => ({ ...current, pending: false }))
          Alert.alert(
            input.language === 'vi' ? 'Chưa lưu được' : 'Not saved',
            memoryPreferenceSyncFailureLabel(result, input.language, {
              accessToken: input.accessToken,
              hasSession: Boolean(input.ownerId),
            }),
          )
        }
      }
    } finally {
      if (pendingOperationRef.current === operation) pendingOperationRef.current = null
    }
  }

  return { enabled, pending: state.pending, toggle }
}
