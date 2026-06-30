// Worker verification form state + reducer, extracted from worker-surfaces.tsx (C4 stage 5b).
import type { ServiceType } from '@home-services/shared'
import type { WorkerProfileResponse } from '@/lib/api-types'
import type { LocalMediaUploadDraft } from '@/lib/media-upload'
import type { WorkerVerificationFileSlot } from './types'

export const workerVerificationServices: ServiceType[] = ['electrical', 'plumbing', 'cleaning']

export type WorkerVerificationField =
  | 'bankAccount'
  | 'bankName'
  | 'dateOfBirth'
  | 'districts'
  | 'homeLat'
  | 'homeLng'
  | 'legalName'
  | 'problemSpecializations'
  | 'serviceRadiusKm'
  | 'yearsExperience'

export type WorkerVerificationFormState = {
  bankAccount: string
  bankName: string
  dateOfBirth: string
  districts: string
  files: Partial<Record<WorkerVerificationFileSlot, LocalMediaUploadDraft>>
  homeLat: string
  homeLng: string
  legalName: string
  problemSpecializations: string
  serviceRadiusKm: string
  serviceTypes: ServiceType[]
  submitError: string | null
  submitting: boolean
  yearsExperience: string
}

export type WorkerVerificationFormAction =
  | { type: 'field'; field: WorkerVerificationField; value: string }
  | { type: 'file'; slot: WorkerVerificationFileSlot; file: LocalMediaUploadDraft }
  | { type: 'hydrate'; profile: WorkerProfileResponse }
  | { type: 'reset_bank_account' }
  | { type: 'submit_error'; error: string | null }
  | { type: 'submitting'; submitting: boolean }
  | { type: 'toggle_service'; serviceType: ServiceType }

export function createWorkerVerificationFormState(workerProfile: WorkerProfileResponse | null): WorkerVerificationFormState {
  return {
    bankAccount: '',
    bankName: workerProfile?.bank_name ?? '',
    dateOfBirth: workerProfile?.date_of_birth ?? '',
    districts: workerProfile?.districts.join(', ') ?? '',
    files: {},
    homeLat: workerProfile?.home_lat === null || workerProfile?.home_lat === undefined ? '' : String(workerProfile.home_lat),
    homeLng: workerProfile?.home_lng === null || workerProfile?.home_lng === undefined ? '' : String(workerProfile.home_lng),
    legalName: workerProfile?.legal_name ?? '',
    problemSpecializations: workerProfile?.problem_specializations.join(', ') ?? '',
    serviceRadiusKm: String(workerProfile?.service_radius_km ?? 8),
    serviceTypes: workerProfile?.service_types.length ? workerProfile.service_types : ['electrical'],
    submitError: null,
    submitting: false,
    yearsExperience: workerProfile?.years_experience ? String(workerProfile.years_experience) : '',
  }
}

export function workerVerificationFormReducer(
  state: WorkerVerificationFormState,
  action: WorkerVerificationFormAction,
): WorkerVerificationFormState {
  switch (action.type) {
    case 'field':
      return { ...state, [action.field]: action.value }
    case 'file':
      return { ...state, files: { ...state.files, [action.slot]: action.file }, submitError: null }
    case 'hydrate':
      return {
        ...state,
        bankName: state.bankName || action.profile.bank_name || '',
        dateOfBirth: state.dateOfBirth || action.profile.date_of_birth || '',
        districts: state.districts || action.profile.districts.join(', '),
        homeLat: state.homeLat || (action.profile.home_lat === null ? '' : String(action.profile.home_lat)),
        homeLng: state.homeLng || (action.profile.home_lng === null ? '' : String(action.profile.home_lng)),
        legalName: state.legalName || action.profile.legal_name || '',
        problemSpecializations: state.problemSpecializations || action.profile.problem_specializations.join(', '),
        serviceRadiusKm: state.serviceRadiusKm || String(action.profile.service_radius_km ?? 8),
        serviceTypes: action.profile.service_types.length > 0 ? action.profile.service_types : state.serviceTypes,
        yearsExperience: state.yearsExperience || (action.profile.years_experience ? String(action.profile.years_experience) : ''),
      }
    case 'reset_bank_account':
      return { ...state, bankAccount: '' }
    case 'submit_error':
      return { ...state, submitError: action.error }
    case 'submitting':
      return { ...state, submitting: action.submitting }
    case 'toggle_service':
      if (state.serviceTypes.includes(action.serviceType)) {
        return state.serviceTypes.length === 1
          ? state
          : { ...state, serviceTypes: state.serviceTypes.filter((item) => item !== action.serviceType) }
      }
      return { ...state, serviceTypes: [...state.serviceTypes, action.serviceType] }
    default:
      return state
  }
}
