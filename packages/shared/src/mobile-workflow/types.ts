import type { JobStatus, ScopeChangeStatus, ServiceType } from '../constants'
import type { LocalDealStatus } from './status'

export type LocalDealSource = 'home' | 'kael' | 'booking'
export type LocalWorkerBroadcastStatus = 'pending' | 'sent' | 'accepted' | 'declined' | 'expired' | 'reassigned' | 'cancelled'
export type LocalWorkerGate = 'backend_pending' | 'local_deal_audit' | 'remote_backend'
export type LocalScheduleMode = 'now_only'
export type LocalCustomerSearchState = 'idle' | 'searching' | 'no_worker' | 'candidate' | 'matched' | 'active' | 'completed'

export type LocalAddressAccess = {
  release_stage: 'area_only' | 'building_released' | 'unit_released'
  exact_unit_released: boolean
  worker_checked_in?: boolean
  check_in_required: boolean
  identity_check_required: boolean
  customer_handoff_required: boolean
  evidence_mode: 'none' | 'geofence' | 'manual_photo'
  access_profile: {
    entry_method?: string
    parking_note?: string
    guard_note?: string
    building_note?: string
    customer_handoff_note?: string
  }
}

export type LocalDealDraft = {
  serviceType: ServiceType | null
  problemChips: string[]
  description: string
  mediaCount: number
  addressLabel: string
  districtLabel: string
  timeChoice: 'now'
  source: LocalDealSource
  needsServiceChoice: boolean
  inferredProblemLabel: string | null
  unsupportedServiceLabel: string | null
}

export type LocalDealEstimate = {
  problemLabel: string
  complexity: 'small' | 'medium' | 'large' | 'unknown'
  priceRangeLabel: string
  confidenceLabel: string
  advisory: string
  disclaimer: string
  hasVndPrice: boolean
  fallbackUsed?: boolean
}

export type LocalWorkerBroadcast = {
  status: LocalWorkerBroadcastStatus
  broadcastId?: string
  jobId?: string
  serviceType: ServiceType
  problemSummary: string
  generalArea: string
  prebrief: string[]
  fullAddressVisible: boolean
  fullAddressLabel: string | null
  addressAccess?: LocalAddressAccess | null
  secondsRemaining: number | null
  estimatedPriceLabel?: string
  estimatedEarningLabel?: string
  safe_metadata?: Record<string, unknown> | null
}

export type LocalWorkerProfileSummary = {
  avatarUrl: string | null
  displayCode?: string | null
  fullName: string
  id: string
  rating: number
  reviewCount?: number | null
  totalJobs: number
}

export type LocalPaymentStatus =
  | 'not_started'
  | 'code_requested'
  | 'vietqr_ready'
  | 'pending'
  | 'received'
  | 'amount_mismatch'
  | 'expired'
  | 'failed'
  | 'reconciled'

export type LocalDealPayment = {
  provider: 'sepay_vietqr' | 'cash' | 'bank_transfer' | string | null
  status: LocalPaymentStatus
  grossAmount: number | null
  platformFee: number | null
  workerNet: number | null
  paymentCode?: string | null
  transferContent?: string | null
  qrImageUrl?: string | null
  expiresAt?: string | null
  receivedAt?: string | null
  amountReceived?: number | null
  updatedAt?: string | null
}

export type LocalDeal = {
  id: string
  displayCode?: string | null
  status: LocalDealStatus
  backendStatus?: JobStatus
  draft: LocalDealDraft
  estimate: LocalDealEstimate | null
  broadcast: LocalWorkerBroadcast | null
  scopeChange: LocalScopeChange | null
  finalPrice?: number | null
  payment?: LocalDealPayment | null
  customerEvidencePhotoUrls?: string[]
  fieldEvidencePhotoUrls?: string[]
  completionPhotoUrls?: string[]
  completionNotes?: string | null
  workerProfile?: LocalWorkerProfileSummary | null
  scheduledAt?: string | null
  createdAt?: string | null
  matchedAt?: string | null
  completedAt?: string | null
  confirmedAt?: string | null
  paidAt?: string | null
  reviewedAt?: string | null
}

export type LocalScopeChange = {
  id: string
  status: ScopeChangeStatus
  requestedDescription: string | null
  reason: string | null
  priceMin: number | null
  priceMax: number | null
  kaelReview: Record<string, unknown> | null
  kaelProgress: LocalKaelProgress | null
  evidencePhotoUrls: string[]
  requestTiming?: 'pre_arrival' | 'on_site'
  resumeJobStatus?: JobStatus | null
  createdAt: string | null
}

export type LocalKaelProgress = {
  current_stage: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  progress: number
  failure_reason?: string | null
  updated_at: string
}

export type LocalWorkflowState = {
  deal: LocalDeal | null
  workerGate: LocalWorkerGate
  lastError: string | null
  lastRemoteSyncAt: string | null
}

export type LocalRemoteJobSnapshot = {
  id: string
  displayCode?: string | null
  status: LocalDealStatus
  backendStatus?: JobStatus
  serviceType: ServiceType
  description: string
  problemChips: string[]
  addressLabel: string
  districtLabel: string
  mediaCount?: number
  estimate?: LocalDealEstimate | null
  broadcast?: LocalWorkerBroadcast | null
  scopeChange?: LocalScopeChange | null
  finalPrice?: number | null
  payment?: LocalDealPayment | null
  customerEvidencePhotoUrls?: string[]
  fieldEvidencePhotoUrls?: string[]
  completionPhotoUrls?: string[]
  completionNotes?: string | null
  workerProfile?: LocalWorkerProfileSummary | null
  scheduledAt?: string | null
  createdAt?: string | null
  matchedAt?: string | null
  completedAt?: string | null
  confirmedAt?: string | null
  paidAt?: string | null
  reviewedAt?: string | null
}

export type LocalRemoteBroadcastSnapshot = {
  broadcastId: string
  jobId: string
  status: LocalWorkerBroadcastStatus
  serviceType: ServiceType
  problemSummary: string
  generalArea: string
  prebrief?: string[]
  mediaCount?: number
  secondsRemaining: number | null
  estimatedPriceLabel?: string
  estimatedEarningLabel?: string
  scheduledAt?: string | null
}

export type LocalDealDraftPatch = Partial<
  Pick<LocalDealDraft, 'addressLabel' | 'description' | 'districtLabel' | 'mediaCount' | 'problemChips' | 'serviceType'>
>

export type LocalWorkflowAction =
  | { type: 'start_home_service'; serviceType: ServiceType }
  | { type: 'submit_kael_draft'; text: string }
  | { type: 'update_booking_draft'; patch: LocalDealDraftPatch }
  | { type: 'submit_booking_draft' }
  | { type: 'finish_local_analysis' }
  | { type: 'confirm_customer_search' }
  | { type: 'tick_broadcast' }
  | { type: 'retry_customer_search' }
  | { type: 'reopen_booking_draft' }
  | { type: 'worker_accept_broadcast' }
  | { type: 'worker_decline_broadcast' }
  | { type: 'worker_start_travel' }
  | { type: 'worker_mark_arrived' }
  | { type: 'worker_start_inspection' }
  | { type: 'worker_start_repair' }
  | { type: 'worker_complete_job' }
  | { type: 'customer_confirm_completion' }
  | { type: 'customer_submit_review' }
  | { type: 'cancel_deal' }
  | { type: 'hydrate_remote_job'; job: LocalRemoteJobSnapshot; workerGate?: LocalWorkerGate }
  | { type: 'hydrate_remote_broadcast'; broadcast: LocalRemoteBroadcastSnapshot }
  | { type: 'mark_remote_broadcast_expired' }
  | { type: 'set_workflow_error'; error: string | null }
  | { type: 'reset_workflow' }

export type LocalWorkflowSelectors = {
  currentStatus: LocalDealStatus | null
  currentBackendStatus: JobStatus | null
  scheduleMode: LocalScheduleMode
  customerSearchState: LocalCustomerSearchState
  hasLocalBroadcast: boolean
  canConfirmCustomerSearch: boolean
  canWorkerAccept: boolean
  canWorkerAdvance: boolean
  canWorkerSeeFullAddress: boolean
  canCustomerCancelDeal: boolean
  canCustomerConfirmCompletion: boolean
  canCustomerSubmitReview: boolean
  paymentLocked: true
  reviewLocked: boolean
  draftValidationMessage: string | null
}
