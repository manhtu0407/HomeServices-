import { useCallback, useMemo, useReducer } from 'react'
import type { EntryAccessStep, EntryRole } from './types'

export type EntryAccessState = {
  acceptedTerms: boolean
  busy: boolean
  error: string | null
  fullName: string
  identifier: string
  password: string
  passwordConfirmation: string
  recoveryIdentifier: string
  remember: boolean
  role: EntryRole
  step: EntryAccessStep
}

type EntryAccessStateAction =
  | { type: 'patch'; patch: Partial<EntryAccessState> }
  | { type: 'toggleAcceptedTerms' }
  | { type: 'toggleRemember' }

function entryAccessStateReducer(
  state: EntryAccessState,
  action: EntryAccessStateAction,
): EntryAccessState {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch }
    case 'toggleAcceptedTerms':
      return { ...state, acceptedTerms: !state.acceptedTerms }
    case 'toggleRemember':
      return { ...state, remember: !state.remember }
  }
}

export function useEntryAccessState(initialRole: EntryRole, initialStep: EntryAccessStep) {
  const [state, dispatch] = useReducer(entryAccessStateReducer, {
    acceptedTerms: false,
    busy: false,
    error: null,
    fullName: '',
    identifier: '',
    password: '',
    passwordConfirmation: '',
    recoveryIdentifier: '',
    remember: true,
    role: initialRole,
    step: initialStep,
  })
  const patchState = useCallback((patch: Partial<EntryAccessState>) => {
    dispatch({ type: 'patch', patch })
  }, [])
  const actions = useMemo(() => ({
    setAcceptedTerms: () => dispatch({ type: 'toggleAcceptedTerms' as const }),
    setBusy: (busy: boolean) => patchState({ busy }),
    setError: (error: string | null) => patchState({ error }),
    setFullName: (fullName: string) => patchState({ fullName }),
    setIdentifier: (identifier: string) => patchState({ identifier }),
    setPassword: (password: string) => patchState({ password }),
    setPasswordConfirmation: (passwordConfirmation: string) => patchState({ passwordConfirmation }),
    setRecoveryIdentifier: (recoveryIdentifier: string) => patchState({ recoveryIdentifier }),
    setRemember: () => dispatch({ type: 'toggleRemember' as const }),
  }), [patchState])

  return {
    ...state,
    ...actions,
    updateState: patchState,
  }
}
