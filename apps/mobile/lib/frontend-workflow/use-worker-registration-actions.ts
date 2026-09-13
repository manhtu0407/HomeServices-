import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import type { WorkerRegistrationDraftInput } from '@nestscout/shared'
import { createWorkerRegistrationRecovery, type WorkerRegistrationRecoveryView } from './worker-registration-recovery'

const INITIAL_VIEW: WorkerRegistrationRecoveryView = { phase: 'idle', receipt: null }

export function useWorkerRegistrationActions({ ownerId, accessToken, refresh }: {
  ownerId: string | null
  accessToken: string | undefined
  refresh: () => Promise<boolean>
}) {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const [visible, setVisible] = useState<{ session: object; view: WorkerRegistrationRecoveryView } | null>(null)
  const session = useMemo(() => {
    const state = { active: false, view: INITIAL_VIEW }
    const controller = createWorkerRegistrationRecovery({
      ownerId: ownerId ?? '', accessToken: accessToken ?? '', isCurrent: () => state.active,
      onChange: (view) => {
        state.view = view
        setVisible({ session: state, view })
      },
    })
    return { state, controller }
  }, [ownerId, accessToken])

  const reconcile = useCallback(async (explicitRetry = false) => {
    const submitted = await session.controller.reconcile(explicitRetry)
    if (submitted && session.state.active) await refreshRef.current().catch(() => false)
    return submitted
  }, [session])

  useEffect(() => {
    session.state.active = true
    if (AppState.currentState === 'active') void reconcile()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reconcile()
    })
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && session.state.view.phase === 'unknown') void reconcile()
    }, 20_000)
    return () => {
      session.state.active = false
      clearInterval(timer)
      subscription.remove()
    }
  }, [session, reconcile])

  const submit = useCallback(async (input: WorkerRegistrationDraftInput) => {
    const submitted = await session.controller.submit(input)
    if (submitted && session.state.active) await refreshRef.current().catch(() => false)
    return submitted
  }, [session])

  const retry = useCallback(() => reconcile(true), [reconcile])

  return {
    workerRegistrationRecovery: visible?.session === session.state ? visible.view : INITIAL_VIEW,
    workerReconcileRegistration: retry,
    workerSubmitRegistration: submit,
    workerSaveRegistrationDraft: session.controller.saveDraft,
  }
}
