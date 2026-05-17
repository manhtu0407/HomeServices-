import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react'
import {
  createInitialLocalWorkflowState,
  localWorkflowReducer,
  selectLocalWorkflow,
  type LocalWorkflowAction,
  type LocalWorkflowSelectors,
  type LocalWorkflowState,
} from '@home-services/shared'
import { useAuth } from './auth-provider'

type FrontendWorkflowContextValue = {
  state: LocalWorkflowState
  selectors: LocalWorkflowSelectors
  dispatch: Dispatch<LocalWorkflowAction>
}

const FrontendWorkflowContext = createContext<FrontendWorkflowContextValue | null>(null)

export function FrontendWorkflowProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [state, dispatch] = useReducer(localWorkflowReducer, undefined, createInitialLocalWorkflowState)
  const selectors = useMemo(() => selectLocalWorkflow(state), [state])
  const sessionUserId = session?.user.id ?? null
  const previousSessionUserIdRef = useRef(sessionUserId)

  useEffect(() => {
    if (previousSessionUserIdRef.current === sessionUserId) return
    previousSessionUserIdRef.current = sessionUserId
    dispatch({ type: 'reset_workflow' })
  }, [sessionUserId])

  const broadcast = state.deal?.broadcast

  useEffect(() => {
    if (state.deal?.status !== 'broadcasting' || broadcast?.status !== 'sent') return
    if (broadcast.secondsRemaining === null) return

    const timer = setTimeout(() => dispatch({ type: 'tick_broadcast' }), 1000)
    return () => clearTimeout(timer)
  }, [state.deal?.status, broadcast?.status, broadcast?.secondsRemaining])

  return (
    <FrontendWorkflowContext.Provider value={{ state, selectors, dispatch }}>
      {children}
    </FrontendWorkflowContext.Provider>
  )
}

export function useFrontendWorkflow() {
  const value = useContext(FrontendWorkflowContext)
  if (!value) {
    throw new Error('useFrontendWorkflow must be used inside FrontendWorkflowProvider')
  }
  return value
}
