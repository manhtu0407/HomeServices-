import type { CustomerServiceId } from '@nestscout/shared'
import {
  useCallback,
  useMemo,
  useReducer,
  type Dispatch,
  type SetStateAction,
} from 'react'

import type { PendingKaelChatDraft } from '../kael-chat/pending-intake'

type BookingFormState = {
  selectedService: CustomerServiceId | null
  selectedProblems: string[]
  address: string
  description: string
  selectedScheduleDate: string | null
  customScheduleDateInput: string
  selectedScheduleTime: string | null
  customScheduleTimeInput: string
  error: string | null
}

type BookingFormAction =
  | {
      type: 'set-field'
      field: keyof BookingFormState
      value: unknown
    }
  | {
      type: 'apply-pending-draft'
      draft: PendingKaelChatDraft
      selectedService: CustomerServiceId
    }
  | { type: 'clear' }

const emptyBookingFormState: BookingFormState = {
  selectedService: null,
  selectedProblems: [],
  address: '',
  description: '',
  selectedScheduleDate: null,
  customScheduleDateInput: '',
  selectedScheduleTime: null,
  customScheduleTimeInput: '',
  error: null,
}

function bookingFormReducer(
  state: BookingFormState,
  action: BookingFormAction,
): BookingFormState {
  if (action.type === 'clear') return emptyBookingFormState
  if (action.type === 'apply-pending-draft') {
    const [year, month, day] = action.draft.scheduleWindow?.date.split('-') ?? []
    return {
      selectedService: action.selectedService,
      selectedProblems: [...(action.draft.problemChips ?? [])],
      address: action.draft.addressLabel ?? '',
      description: action.draft.description ?? '',
      selectedScheduleDate: action.draft.scheduleWindow?.date ?? null,
      customScheduleDateInput: year && month && day ? `${day}/${month}/${year}` : '',
      selectedScheduleTime: action.draft.scheduleWindow?.start ?? null,
      customScheduleTimeInput: action.draft.scheduleWindow?.start ?? '',
      error: null,
    }
  }
  const previousValue = state[action.field]
  const nextValue = typeof action.value === 'function'
    ? (action.value as (value: typeof previousValue) => typeof previousValue)(previousValue)
    : action.value
  return { ...state, [action.field]: nextValue }
}

function fieldSetter<K extends keyof BookingFormState>(
  dispatch: Dispatch<BookingFormAction>,
  field: K,
): Dispatch<SetStateAction<BookingFormState[K]>> {
  return (value) => dispatch({ type: 'set-field', field, value })
}

export function useBookingFormState(input: {
  selectedService: CustomerServiceId | null
  selectedScheduleDate: string | null
  selectedScheduleTime: string | null
}) {
  const [state, dispatch] = useReducer(bookingFormReducer, {
    ...emptyBookingFormState,
    selectedService: input.selectedService,
    selectedScheduleDate: input.selectedScheduleDate,
    selectedScheduleTime: input.selectedScheduleTime,
  })
  const setters = useMemo(() => ({
    setSelectedService: fieldSetter(dispatch, 'selectedService'),
    setSelectedProblems: fieldSetter(dispatch, 'selectedProblems'),
    setAddress: fieldSetter(dispatch, 'address'),
    setDescription: fieldSetter(dispatch, 'description'),
    setSelectedScheduleDate: fieldSetter(dispatch, 'selectedScheduleDate'),
    setCustomScheduleDateInput: fieldSetter(dispatch, 'customScheduleDateInput'),
    setSelectedScheduleTime: fieldSetter(dispatch, 'selectedScheduleTime'),
    setCustomScheduleTimeInput: fieldSetter(dispatch, 'customScheduleTimeInput'),
    setError: fieldSetter(dispatch, 'error'),
  }), [])
  const applyPendingDraft = useCallback((
    draft: PendingKaelChatDraft,
    selectedService: CustomerServiceId,
  ) => {
    dispatch({ type: 'apply-pending-draft', draft, selectedService })
  }, [])
  const clear = useCallback(() => dispatch({ type: 'clear' }), [])

  return { state, ...setters, applyPendingDraft, clear }
}
