import {
  LOCAL_DEAL_ID,
  type CustomerCancellationRequestInput,
  type CustomerKaelMemoryPreferenceUpdateInput,
  type JobStatus,
  type LocalDealDraft,
  type LocalWorkflowState,
} from '@nestscout/shared'
import type { KaelMemorySelfViewResponse } from '../api-types'
import type { AppLanguage } from '../app-language'

// Statuses during which the customer wants a live timeline (worker en route,
// on-site, working, scope/completion review). Shared by realtime and the
// reduced-interval poll fallback.
export const ACTIVE_TIMELINE_STATUSES = [
  'broadcasting',
  'worker_matched',
  'worker_on_way',
  'arrived',
  'inspecting',
  'repairing',
  'scope_change_pending',
  'completed_by_worker',
]

export const readCustomerKaelMemoryPermission = (
  memory: KaelMemorySelfViewResponse['memory'] | null,
  key: CustomerKaelMemoryPreferenceUpdateInput['key'],
) => {
  const servicePreferences = memory?.service_preferences
  if (!servicePreferences || typeof servicePreferences !== 'object' || Array.isArray(servicePreferences)) return null
  const permissions = servicePreferences.memory_permissions
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) return null
  const value = (permissions as Record<string, unknown>)[key]
  return typeof value === 'boolean' ? value : null
}
export const mergeCustomerKaelMemoryPermission = (
  memory: KaelMemorySelfViewResponse['memory'] | null,
  key: CustomerKaelMemoryPreferenceUpdateInput['key'],
  enabled: boolean,
): KaelMemorySelfViewResponse['memory'] => {
  const servicePreferences = memory?.service_preferences
  const currentPreferences =
    servicePreferences && typeof servicePreferences === 'object' && !Array.isArray(servicePreferences)
      ? servicePreferences
      : {}
  const currentPermissions = currentPreferences.memory_permissions
  const permissions =
    currentPermissions && typeof currentPermissions === 'object' && !Array.isArray(currentPermissions)
      ? currentPermissions as Record<string, unknown>
      : {}
  return {
    ...(memory ?? {}),
    service_preferences: {
      ...currentPreferences,
      memory_permissions: {
        ...permissions,
        [key]: enabled,
      },
    },
  }
}

export function getRemoteJobId(state: LocalWorkflowState) {
  const id = state.deal?.broadcast?.jobId ?? state.deal?.id ?? null
  if (!id || id === LOCAL_DEAL_ID) return null
  return id
}

export function usesBeforeAcceptCancelEndpoint(status: JobStatus) {
  return status === 'draft' ||
    status === 'analyzing' ||
    status === 'estimate_ready' ||
    status === 'awaiting_customer_confirm' ||
    status === 'broadcasting'
}

export function defaultCustomerCancellationInput(language: AppLanguage): CustomerCancellationRequestInput {
  return {
    reason_code: 'changed_mind',
    reason_note: language === 'en'
      ? 'Customer requested cancellation from the mobile workflow.'
      : 'Khách yêu cầu hủy từ ứng dụng.',
    requested_at: new Date().toISOString(),
  }
}

export function jobCreateClientRequestFingerprint(
  draft: LocalDealDraft,
  districtLabel: string,
): string {
  return JSON.stringify({
    service_type: draft.serviceType,
    description: draft.description.trim(),
    problem_chips: draft.problemChips,
    address_building: draft.addressLabel.trim(),
    address_district: districtLabel,
  })
}

const WORKER_OPERATIONAL_JOB_STATUSES = new Set<JobStatus>([
  'worker_matched',
  'worker_on_way',
  'arrived',
  'inspecting',
  'repairing',
  'scope_change_pending',
  'completed_by_worker',
])
const vndFormatter = new Intl.NumberFormat('vi-VN')

export function isWorkerOperationalJobStatus(status: JobStatus) {
  return WORKER_OPERATIONAL_JOB_STATUSES.has(status)
}

export function hasStaleRemoteBroadcast(state: LocalWorkflowState) {
  return state.workerGate === 'remote_backend' &&
    state.deal?.status === 'broadcasting' &&
    state.deal.broadcast?.status === 'sent'
}

export function isStaleBroadcastError(code: string) {
  return ['EXPIRED', 'BROADCAST_NOT_ACTIVE', 'ALREADY_TAKEN', 'NOT_FOUND'].includes(code)
}

export function currentWorkerMonthRange(referenceDate = new Date()) {
  const from = new Date(referenceDate)
  from.setDate(1)
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setMonth(to.getMonth() + 1)
  to.setMilliseconds(-1)
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  }
}
