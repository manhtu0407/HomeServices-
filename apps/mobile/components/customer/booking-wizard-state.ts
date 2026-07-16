import type { ServiceType } from '@nestscout/shared'
import type { LocalMediaUploadDraft } from '@/lib/media-upload'
import { mergeBookingPhotoDrafts } from './booking-wizard-support'

export type WizardStep = 'service' | 'describe' | 'analyzing' | 'done'
export type BookingPriority = 'fast' | 'low' | 'normal'
export const bookingPriorityOrder: readonly BookingPriority[] = ['low', 'normal', 'fast']

export type WizardState = {
  step: WizardStep
  serviceType: ServiceType | null
  description: string
  priority: BookingPriority
  problemChips: string[]
  photoDrafts: LocalMediaUploadDraft[]
  addressLabel: string
  districtLabel: string | null
  isSubmitting: boolean
  error: string | null
}
export type WizardAction =
  | { type: 'select_service'; serviceType: ServiceType }
  | { type: 'update_description'; description: string }
  | { type: 'select_priority'; priority: BookingPriority }
  | { type: 'toggle_problem_chip'; chip: string }
  | { type: 'add_photos'; drafts: LocalMediaUploadDraft[] }
  | { type: 'remove_photo'; index: number }
  | { type: 'update_address'; label: string; district: string | null }
  | { type: 'goto'; step: WizardStep }
  | { type: 'set_submitting'; flag: boolean }
  | { type: 'set_error'; error: string | null }
  | { type: 'reset' }

const INITIAL: WizardState = {
  step: 'service',
  serviceType: null,
  description: '',
  priority: 'normal',
  problemChips: [],
  photoDrafts: [],
  addressLabel: '',
  districtLabel: null,
  isSubmitting: false,
  error: null,
}

export function createInitialWizardState(routeServiceType: ServiceType | null): WizardState {
  return routeServiceType
    ? { ...INITIAL, serviceType: routeServiceType, step: 'describe', photoDrafts: [] }
    : { ...INITIAL, photoDrafts: [] }
}

export function formatBookingMessageForKael(copy: { priorityMessagePrefix: string; priorityOptions: Record<BookingPriority, string> }, state: WizardState) {
  const description = state.description.trim()
  if (state.priority === 'normal') return description
  return `${copy.priorityMessagePrefix}: ${copy.priorityOptions[state.priority]}\n${description}`
}

export function bookingWizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'select_service':
      return { ...state, serviceType: action.serviceType, problemChips: [], step: 'describe', error: null }
    case 'update_description':
      return { ...state, description: action.description }
    case 'select_priority':
      return { ...state, priority: action.priority }
    case 'toggle_problem_chip':
      return {
        ...state,
        problemChips: state.problemChips.includes(action.chip)
          ? state.problemChips.filter((chip) => chip !== action.chip)
          : [...state.problemChips, action.chip],
      }
    case 'add_photos':
      return { ...state, photoDrafts: mergeBookingPhotoDrafts(state.photoDrafts, action.drafts) }
    case 'remove_photo':
      return { ...state, photoDrafts: state.photoDrafts.filter((_, index) => index !== action.index) }
    case 'update_address':
      return { ...state, addressLabel: action.label, districtLabel: action.district }
    case 'goto':
      return { ...state, step: action.step }
    case 'set_submitting':
      return { ...state, isSubmitting: action.flag }
    case 'set_error':
      return { ...state, error: action.error }
    case 'reset':
      return INITIAL
  }
}
