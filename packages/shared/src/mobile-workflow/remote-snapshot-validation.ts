import {
  BROADCAST_STATUSES,
  JOB_STATUSES,
  SERVICE_TYPES,
  SCOPE_CHANGE_STATUSES,
  type JobStatus,
  type ServiceType,
} from '../constants.ts'
import { isLocalDealStatus } from './status.ts'
import type {
  LocalRemoteBroadcastSnapshot,
  LocalRemoteJobSnapshot,
  LocalWorkerBroadcastStatus,
  LocalWorkerGate,
} from './types.ts'

const JOB_STATUS_SET = new Set<string>(JOB_STATUSES)
const SERVICE_TYPE_SET = new Set<string>(SERVICE_TYPES)
const BROADCAST_STATUS_SET = new Set<string>(BROADCAST_STATUSES)
const SCOPE_CHANGE_STATUS_SET = new Set<string>(SCOPE_CHANGE_STATUSES)
const LOCAL_WORKER_GATE_SET = new Set<string>(['backend_pending', 'local_deal_audit', 'remote_backend'])
const ESTIMATE_COMPLEXITY_SET = new Set<string>(['small', 'medium', 'large', 'unknown'])
const PAYMENT_STATUS_SET = new Set<string>([
  'not_started',
  'code_requested',
  'vietqr_ready',
  'pending',
  'received',
  'amount_mismatch',
  'expired',
  'failed',
  'reconciled',
])

export function isLocalWorkerGate(value: unknown): value is LocalWorkerGate {
  return typeof value === 'string' && LOCAL_WORKER_GATE_SET.has(value)
}

function isSupportedServiceType(value: unknown): value is ServiceType {
  return typeof value === 'string' && SERVICE_TYPE_SET.has(value)
}

function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === 'string' && JOB_STATUS_SET.has(value)
}

function isWorkerBroadcastStatus(value: unknown): value is LocalWorkerBroadcastStatus {
  return typeof value === 'string' && BROADCAST_STATUS_SET.has(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isBoundedString(value: unknown, maxLength = 5_000): value is string {
  return typeof value === 'string' && value.length <= maxLength
}

function isNonEmptyBoundedString(value: unknown, maxLength = 5_000): value is string {
  return isBoundedString(value, maxLength) && value.trim().length > 0
}

function isStringArray(value: unknown, maxItems = 100, maxItemLength = 2_048): value is string[] {
  return Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => isBoundedString(item, maxItemLength))
}

function isOptionalStringArray(value: unknown): value is string[] | undefined {
  return value === undefined || isStringArray(value)
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || isBoundedString(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isBoundedString(value)
}

function isSafeMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isNullableSafeMoney(value: unknown): value is number | null {
  return value === null || isSafeMoney(value)
}

function isOptionalSafeMoney(value: unknown): value is number | null | undefined {
  return value === undefined || isNullableSafeMoney(value)
}

function isOptionalEstimate(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (!isRecord(value)) return false
  return isBoundedString(value.problemLabel) &&
    typeof value.complexity === 'string' && ESTIMATE_COMPLEXITY_SET.has(value.complexity) &&
    isBoundedString(value.priceRangeLabel) &&
    isBoundedString(value.confidenceLabel) &&
    isBoundedString(value.advisory) &&
    isBoundedString(value.disclaimer) &&
    typeof value.hasVndPrice === 'boolean' &&
    (value.fallbackUsed === undefined || typeof value.fallbackUsed === 'boolean')
}

function isOptionalAddressAccess(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (!isRecord(value) || !isRecord(value.access_profile)) return false
  const profile = value.access_profile
  return (value.release_stage === 'area_only' || value.release_stage === 'building_released' || value.release_stage === 'unit_released') &&
    typeof value.exact_unit_released === 'boolean' &&
    (value.worker_checked_in === undefined || typeof value.worker_checked_in === 'boolean') &&
    typeof value.check_in_required === 'boolean' &&
    typeof value.identity_check_required === 'boolean' &&
    typeof value.customer_handoff_required === 'boolean' &&
    (value.evidence_mode === 'none' || value.evidence_mode === 'geofence' || value.evidence_mode === 'manual_photo') &&
    isOptionalNullableString(profile.entry_method) &&
    isOptionalNullableString(profile.parking_note) &&
    isOptionalNullableString(profile.guard_note) &&
    isOptionalNullableString(profile.building_note) &&
    isOptionalNullableString(profile.customer_handoff_note)
}

function isOptionalWorkerBroadcast(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (!isRecord(value)) return false
  return (value.broadcastId === undefined || isNonEmptyBoundedString(value.broadcastId, 200)) &&
    (value.jobId === undefined || isNonEmptyBoundedString(value.jobId, 200)) &&
    isWorkerBroadcastStatus(value.status) &&
    isSupportedServiceType(value.serviceType) &&
    isBoundedString(value.problemSummary, 2_000) &&
    isBoundedString(value.generalArea, 500) &&
    isStringArray(value.prebrief, 20, 1_000) &&
    typeof value.fullAddressVisible === 'boolean' &&
    isNullableString(value.fullAddressLabel) &&
    isOptionalAddressAccess(value.addressAccess) &&
    (value.secondsRemaining === null || (
      typeof value.secondsRemaining === 'number' &&
      Number.isSafeInteger(value.secondsRemaining) &&
      value.secondsRemaining >= 0
    )) &&
    (value.estimatedPriceLabel === undefined || isBoundedString(value.estimatedPriceLabel, 500)) &&
    (value.estimatedEarningLabel === undefined || isBoundedString(value.estimatedEarningLabel, 500)) &&
    (value.safe_metadata === undefined || value.safe_metadata === null || isRecord(value.safe_metadata))
}

function isNullableKaelProgress(value: unknown): boolean {
  if (value === null) return true
  if (!isRecord(value)) return false
  return isNonEmptyBoundedString(value.current_stage, 200) &&
    (value.status === 'queued' || value.status === 'running' || value.status === 'completed' || value.status === 'failed') &&
    typeof value.progress === 'number' &&
    Number.isFinite(value.progress) &&
    value.progress >= 0 &&
    value.progress <= 1 &&
    isOptionalNullableString(value.failure_reason) &&
    isNonEmptyBoundedString(value.updated_at, 100)
}

function isOptionalScopeChange(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (!isRecord(value)) return false
  return isNonEmptyBoundedString(value.id, 200) &&
    typeof value.status === 'string' && SCOPE_CHANGE_STATUS_SET.has(value.status) &&
    isNullableString(value.requestedDescription) &&
    isNullableString(value.reason) &&
    isNullableSafeMoney(value.priceMin) &&
    isNullableSafeMoney(value.priceMax) &&
    (value.kaelReview === null || isRecord(value.kaelReview)) &&
    isNullableKaelProgress(value.kaelProgress) &&
    isStringArray(value.evidencePhotoUrls, 5, 2_048) &&
    (value.requestTiming === undefined || value.requestTiming === 'pre_arrival' || value.requestTiming === 'on_site') &&
    (value.resumeJobStatus === undefined || value.resumeJobStatus === null || isJobStatus(value.resumeJobStatus)) &&
    isNullableString(value.createdAt)
}

function isOptionalPayment(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (!isRecord(value)) return false
  return isNullableString(value.provider) &&
    typeof value.status === 'string' && PAYMENT_STATUS_SET.has(value.status) &&
    isNullableSafeMoney(value.grossAmount) &&
    isNullableSafeMoney(value.platformFee) &&
    isNullableSafeMoney(value.workerNet) &&
    isOptionalNullableString(value.paymentCode) &&
    isOptionalNullableString(value.transferContent) &&
    isOptionalNullableString(value.qrImageUrl) &&
    isOptionalNullableString(value.expiresAt) &&
    isOptionalNullableString(value.receivedAt) &&
    (value.amountReceived === undefined || isNullableSafeMoney(value.amountReceived)) &&
    isOptionalNullableString(value.updatedAt)
}

function isOptionalWorkerProfile(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (!isRecord(value)) return false
  return isNullableString(value.avatarUrl) &&
    isOptionalNullableString(value.displayCode) &&
    isNonEmptyBoundedString(value.fullName, 200) &&
    isNonEmptyBoundedString(value.id, 200) &&
    typeof value.rating === 'number' &&
    Number.isFinite(value.rating) &&
    value.rating >= 0 &&
    value.rating <= 5 &&
    (value.reviewCount === undefined || value.reviewCount === null || (
      typeof value.reviewCount === 'number' && Number.isSafeInteger(value.reviewCount) && value.reviewCount >= 0
    )) &&
    typeof value.totalJobs === 'number' &&
    Number.isSafeInteger(value.totalJobs) &&
    value.totalJobs >= 0
}

export function isValidRemoteJobSnapshot(value: unknown): value is LocalRemoteJobSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const job = value as Partial<LocalRemoteJobSnapshot>
  return isNonEmptyBoundedString(job.id, 200) &&
    isOptionalNullableString(job.displayCode) &&
    isLocalDealStatus(job.status) &&
    (job.backendStatus === undefined || (isJobStatus(job.backendStatus) && job.backendStatus === job.status)) &&
    isSupportedServiceType(job.serviceType) &&
    isBoundedString(job.description, 2_000) &&
    isStringArray(job.problemChips, 10, 100) &&
    isBoundedString(job.addressLabel, 500) &&
    isBoundedString(job.districtLabel, 200) &&
    (job.mediaCount === undefined || (
      typeof job.mediaCount === 'number' &&
      Number.isInteger(job.mediaCount) &&
      job.mediaCount >= 0 &&
      job.mediaCount <= 5
    )) &&
    isOptionalEstimate(job.estimate) &&
    isOptionalWorkerBroadcast(job.broadcast) &&
    isOptionalScopeChange(job.scopeChange) &&
    isOptionalPayment(job.payment) &&
    isOptionalWorkerProfile(job.workerProfile) &&
    isOptionalStringArray(job.fieldEvidencePhotoUrls) &&
    isOptionalStringArray(job.completionPhotoUrls) &&
    isOptionalNullableString(job.completionNotes) &&
    isOptionalSafeMoney(job.finalPrice) &&
    isOptionalNullableString(job.scheduledAt) &&
    isOptionalNullableString(job.createdAt) &&
    isOptionalNullableString(job.matchedAt) &&
    isOptionalNullableString(job.completedAt) &&
    isOptionalNullableString(job.confirmedAt) &&
    isOptionalNullableString(job.paidAt) &&
    isOptionalNullableString(job.reviewedAt)
}

export function isValidRemoteBroadcastSnapshot(value: unknown): value is LocalRemoteBroadcastSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const broadcast = value as Partial<LocalRemoteBroadcastSnapshot>
  return isNonEmptyBoundedString(broadcast.broadcastId, 200) &&
    isNonEmptyBoundedString(broadcast.jobId, 200) &&
    isWorkerBroadcastStatus(broadcast.status) &&
    isSupportedServiceType(broadcast.serviceType) &&
    isNonEmptyBoundedString(broadcast.problemSummary, 2_000) &&
    isNonEmptyBoundedString(broadcast.generalArea, 500) &&
    isOptionalStringArray(broadcast.prebrief) &&
    (broadcast.secondsRemaining === null || (
      typeof broadcast.secondsRemaining === 'number' &&
      Number.isSafeInteger(broadcast.secondsRemaining) &&
      broadcast.secondsRemaining >= 0
    )) &&
    isOptionalNullableString(broadcast.scheduledAt) &&
    (broadcast.estimatedPriceLabel === undefined || typeof broadcast.estimatedPriceLabel === 'string') &&
    (broadcast.estimatedEarningLabel === undefined || typeof broadcast.estimatedEarningLabel === 'string')
}
