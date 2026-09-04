import {
  HCMC_DISTRICTS,
  buildLocalWorkerDisplayCode,
  extractKnownDistrictLabel,
  hasSpecificWorkerRouteAddress,
  toLocalDealStatus,
  type JobStatus,
  type LocalDealDraft,
  type LocalDealEstimate,
  type LocalDealPayment,
  type LocalOriginalScopePriceQuote,
  type LocalRemoteBroadcastSnapshot,
  type LocalRemoteJobSnapshot,
  type LocalScopeChange,
  type LocalWorkflowState,
  type ServiceType,
} from '@nestscout/shared'
import type {
  AddressAccessView,
  ConfirmSearchResponse,
  CreateJobResponse,
  JobDetailResponse,
  OriginalScopePriceQuote,
  WorkerBroadcastsResponse,
  WorkerJobListResponse,
} from '../api-types'

const REQUIRED_PRICE_DISCLAIMER = 'Đây là ước tính do Kael tính theo dữ liệu hiện có. Kael có thể cập nhật khi có bằng chứng phạm vi mới.'
const vndFormatter = new Intl.NumberFormat('vi-VN')

export function createJobResponseToSnapshot(data: CreateJobResponse, draft: LocalDealDraft): LocalRemoteJobSnapshot {
  const estimate = estimateFromCreateResponse(data)
  return {
    id: data.job_id,
    displayCode: data.display_code ?? null,
    backendStatus: data.status,
    status: toLocalDealStatus(data.status),
    serviceType: data.estimate.service_type,
    description: draft.description,
    problemChips: draft.problemChips,
    addressLabel: draft.addressLabel,
    districtLabel: draft.districtLabel || draft.addressLabel,
    mediaCount: draft.mediaCount,
    estimate,
    broadcast: data.status === 'broadcasting'
      ? {
          status: data.broadcast_sent === false ? 'expired' : 'sent',
          jobId: data.job_id,
          serviceType: data.estimate.service_type,
          problemSummary: estimate.problemLabel,
          generalArea: draft.districtLabel || 'Khu vực TP.HCM',
          prebrief: [
            estimate.problemLabel,
            data.message ?? 'Kael đang gửi yêu cầu đến thợ phù hợp.',
          ],
          fullAddressVisible: false,
          fullAddressLabel: null,
          secondsRemaining: data.broadcast_sent === false ? 0 : null,
        }
      : null,
    scopeChange: null,
    finalPrice: data.final_price ?? null,
    matchingState: null,
  }
}

export function confirmSearchToSnapshot(data: ConfirmSearchResponse, deal: NonNullable<LocalWorkflowState['deal']>): LocalRemoteJobSnapshot {
  const snapshot = dealToSnapshot(deal)
  const broadcastSent = data.broadcast_sent
  const matchingState = data.matching_state ?? null
  return {
    ...snapshot,
    backendStatus: data.status,
    status: toLocalDealStatus(data.status),
    workerProfile: workerProfileSummaryFromApi(data.worker),
    matchingState,
    broadcast: matchingState?.stage === 'awaiting_choice' ? null : {
      status: broadcastSent ? 'sent' : 'expired',
      jobId: data.job_id,
      serviceType: deal.draft.serviceType as ServiceType,
      problemSummary: deal.estimate?.problemLabel ?? deal.draft.problemChips[0] ?? deal.draft.description,
      generalArea: deal.draft.districtLabel || 'Khu vực TP.HCM',
      prebrief: [
        `${deal.estimate?.problemLabel ?? deal.draft.problemChips[0] ?? 'Yêu cầu mới'}`,
        data.message,
      ],
      fullAddressVisible: false,
      fullAddressLabel: null,
      secondsRemaining: broadcastSent ? null : 0,
    },
  }
}

export function jobDetailToSnapshot(data: JobDetailResponse, includeWorkerBrief = false): LocalRemoteJobSnapshot {
  const job = data.job
  const customerEvidencePhotoUrls = job.customer_evidence_photo_urls ?? job.photo_urls ?? []
  const fieldEvidencePhotoUrls = job.field_evidence_photo_urls ?? []
  const completionPhotoUrls = job.completion_photo_urls ?? []
  const serviceType = job.service_type
  const districtLabel = districtLabelFromValue(job.address_district)
  const addressLabel = formatStoredJobAddress({
    building: job.address_building,
    floor: job.address_floor,
    unit: job.address_unit,
    district: job.address_district,
  })
  const estimate = job.kael_price_min && job.kael_price_max
    ? {
        problemLabel: job.kael_problem_identified ?? job.problem_chips[0] ?? 'Yêu cầu sửa chữa',
        complexity: job.kael_complexity ?? 'unknown',
        priceRangeLabel: formatPriceRange(job.kael_price_min, job.kael_price_max),
        confidenceLabel: 'Kael ước tính',
        advisory: job.kael_advisory ?? 'Kael giữ giá theo chính sách và cập nhật khi có bằng chứng phạm vi mới.',
        disclaimer: REQUIRED_PRICE_DISCLAIMER,
        hasVndPrice: true,
      } satisfies LocalDealEstimate
    : null
  const broadcastProblemSummary = includeWorkerBrief
    ? job.problem_chips[0] ?? job.kael_problem_identified ?? job.description
    : job.kael_problem_identified ?? job.problem_chips[0] ?? job.description
  const statusBroadcast = broadcastFromJobStatus(
    job.status,
    serviceType,
    broadcastProblemSummary,
    districtLabel,
    addressLabel,
    data.broadcast_state,
    job.address_access.exact_unit_released && hasSpecificWorkerRouteAddress(addressLabel, districtLabel) ? addressLabel : null,
    includeWorkerBrief
      ? workerBriefLinesFromRecord(job.kael_worker_brief_guidance ?? job.kael_worker_brief_core)
      : [],
    job.address_access,
  )
  const estimatedWorkerNet = includeWorkerBrief
    ? job.estimated_worker_net ?? null
    : null
  const broadcast = statusBroadcast && estimatedWorkerNet !== null
    ? {
        ...statusBroadcast,
        estimatedEarning: estimatedWorkerNet,
        estimatedEarningLabel: formatNullableSinglePrice(estimatedWorkerNet),
      }
    : statusBroadcast

  return {
    id: job.id,
    displayCode: job.display_code ?? null,
    backendStatus: job.status,
    status: toLocalDealStatus(job.status),
    serviceType,
    description: job.description,
    problemChips: job.problem_chips,
    addressLabel,
    districtLabel,
    mediaCount: customerEvidencePhotoUrls.length,
    estimate,
    broadcast,
    scopeReview: scopeReviewFromJobDetail(data),
    scopeChange: scopeChangeFromJobDetail(data),
    finalPrice: job.final_price,
    paymentRailAvailable: job.payment_rail_available === true,
    paymentRailProvider: job.payment_rail_provider ?? null,
    payment: paymentFromJob(job),
    customerEvidencePhotoUrls,
    fieldEvidencePhotoUrls,
    completionPhotoUrls,
    completionNotes: job.completion_notes,
    workerProfile: workerProfileSummaryFromApi(data.worker),
    scheduledAt: job.scheduled_at,
    createdAt: job.created_at,
    matchedAt: job.matched_at,
    completedAt: job.completed_at,
    confirmedAt: job.confirmed_at,
    paidAt: job.paid_at,
    reviewedAt: job.reviewed_at,
    matchingState: data.matching_state,
  }
}

export function workerBroadcastToSnapshot(broadcast: WorkerBroadcastsResponse['broadcasts'][number]): LocalRemoteBroadcastSnapshot {
  return {
    broadcastId: broadcast.broadcast_id,
    jobId: broadcast.job_id,
    status: broadcast.status,
    serviceType: broadcast.service_type,
    problemSummary: broadcast.problem_summary ?? 'Yêu cầu sửa chữa',
    scopeSummary: broadcast.scope_summary ?? undefined,
    generalArea: districtLabelFromValue(broadcast.district),
    prebrief: workerBriefLinesFromRecord(broadcast.worker_brief_core),
    mediaCount: broadcast.media_count,
    secondsRemaining: broadcast.seconds_remaining,
    estimatedPriceLabel: formatNullablePriceRange(broadcast.estimated_price_min, broadcast.estimated_price_max),
    estimatedEarningLabel: formatNullablePriceRange(broadcast.estimated_earning_min, broadcast.estimated_earning_max),
    priceQuote: broadcast.original_scope_price_quote
      ? originalScopePriceQuoteFromApi(broadcast.original_scope_price_quote)
      : undefined,
    scheduledAt: broadcast.scheduled_at,
  }
}

function originalScopePriceQuoteFromApi(
  quote: OriginalScopePriceQuote,
): LocalOriginalScopePriceQuote {
  return {
    schemaVersion: quote.schema_version,
    quoteId: quote.quote_id,
    referencePriceMin: quote.reference_price_min,
    referencePriceMax: quote.reference_price_max,
    customerTotal: quote.customer_total,
    platformFee: quote.platform_fee,
    workerNet: quote.worker_net,
    commissionLevel: quote.commission_level,
    commissionRateBps: quote.commission_rate_bps,
    priceSource: quote.price_source,
    selectionRule: quote.selection_rule,
    workerConfirmationRequired: quote.worker_confirmation_required,
    customerConfirmationRequired: quote.customer_confirmation_required,
    workerConfirmedAt: quote.worker_confirmed_at,
    expiresAt: quote.expires_at,
    evidenceSummary: {
      confidence: quote.evidence_summary.confidence,
      baselineSourceCount: quote.evidence_summary.baseline_source_count,
      marketSourceCount: quote.evidence_summary.market_source_count,
      highTrustSourceCount: quote.evidence_summary.high_trust_source_count,
      quorumMet: quote.evidence_summary.quorum_met,
      capStatement: quote.evidence_summary.cap_statement,
    },
  }
}

export function workerJobToSnapshot(job: WorkerJobListResponse['jobs'][number]): LocalRemoteJobSnapshot {
  const districtLabel = districtLabelFromValue(job.district)
  const addressLabel = formatStoredJobAddress({
    building: job.address_building,
    floor: job.address_floor,
    unit: job.address_unit,
    district: job.district,
  })
  const broadcast = broadcastFromJobStatus(
    job.status,
    job.service_type,
    job.problem_summary ?? 'Yêu cầu sửa chữa',
    districtLabel,
    addressLabel || districtLabel,
    undefined,
    job.address_access.exact_unit_released && hasSpecificWorkerRouteAddress(addressLabel, districtLabel) ? addressLabel : null,
    workerBriefLinesFromRecord(job.worker_brief_guidance),
    job.address_access,
  )
  return {
    id: job.id,
    displayCode: job.display_code ?? null,
    backendStatus: job.status,
    status: toLocalDealStatus(job.status),
    serviceType: job.service_type,
    description: job.scope_summary ?? job.problem_summary ?? 'Yêu cầu sửa chữa',
    problemChips: job.problem_summary ? [job.problem_summary] : [],
    addressLabel: addressLabel || districtLabel,
    districtLabel,
    estimate: null,
    broadcast: broadcast
      ? {
          ...broadcast,
          estimatedPriceLabel: formatNullableSinglePrice(job.final_price),
          estimatedEarning: job.estimated_earning,
          estimatedEarningLabel: formatNullableSinglePrice(job.estimated_earning),
        }
      : null,
    scopeChange: null,
    finalPrice: job.final_price,
    paymentRailAvailable: false,
    paymentRailProvider: null,
    payment: paymentFromJob(job),
    customerEvidencePhotoUrls: job.customer_evidence_photo_urls,
    fieldEvidencePhotoUrls: job.field_evidence_photo_urls,
    completionPhotoUrls: job.completion_photo_urls,
    completionNotes: job.completion_notes,
    scheduledAt: job.scheduled_at,
    createdAt: job.created_at,
    matchedAt: job.matched_at,
    completedAt: job.completed_at,
    matchingState: null,
  }
}

function paymentFromJob(job: JobDetailResponse['job'] | WorkerJobListResponse['jobs'][number]): LocalDealPayment | null {
  const receipt = 'payment_receipt' in job ? job.payment_receipt ?? null : null
  const paymentStatus = paymentStatusFromReceipt(receipt?.status)
    ?? job.payment_status
    ?? paymentStatusFromJobStatus(job.status)
  const grossAmount = numericOrNull(job.gross_amount)
  const platformFee = numericOrNull(job.platform_fee)
  const workerNet = numericOrNull(job.worker_net)
  const amountReceived = numericOrNull(job.payment_amount_received)
  const provider = job.payment_provider ?? null
  const hasActivePaymentStatus = paymentStatus !== null && paymentStatus !== 'not_started'
  const hasPaymentData = Boolean(
    hasActivePaymentStatus
    || provider
    || grossAmount
    || platformFee
    || workerNet
    || amountReceived
    || job.payment_code
    || job.payment_transfer_content
    || job.payment_qr_image_url
    || job.payment_expires_at
    || job.payment_received_at
  )
  if (!hasPaymentData) return null
  return {
    amountReceived,
    expiresAt: job.payment_expires_at ?? null,
    grossAmount,
    paymentCode: job.payment_code ?? null,
    platformFee,
    provider,
    qrImageUrl: job.payment_qr_image_url ?? null,
    receivedAt: job.payment_received_at ?? null,
    status: paymentStatus ?? 'not_started',
    transferContent: job.payment_transfer_content ?? null,
    workerNet,
    holdUntil: receipt?.hold_until ?? null,
    directResponseDeadline: receipt?.response_deadline ?? null,
    directCustomerConfirmedAt: receipt?.customer_confirmed_at ?? null,
    directWorkerConfirmedAt: receipt?.worker_confirmed_at ?? null,
    collateralAmount: numericOrNull(receipt?.collateral_amount),
    directPaymentAvailable: receipt?.direct_payment_available ?? null,
    bankCode: receipt?.bank_code ?? null,
    accountHolder: receipt?.account_holder ?? null,
    accountMasked: receipt?.account_masked ?? null,
  }
}

function paymentStatusFromReceipt(status: string | null | undefined): LocalDealPayment['status'] | null {
  switch (status) {
    case 'manual_qr_ready':
    case 'manual_customer_claimed':
    case 'manual_reconcile_required':
    case 'manual_verified':
    case 'direct_awaiting_customer_confirmation':
    case 'direct_awaiting_worker_confirmation':
    case 'direct_admin_confirmation_required':
    case 'direct_reconcile_required':
    case 'direct_paid':
      return status
    default:
      return null
  }
}

function numericOrNull(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function paymentStatusFromJobStatus(status: JobStatus): LocalDealPayment['status'] | null {
  if (status === 'payment_pending') return 'pending'
  if (status === 'paid' || status === 'reviewed') return 'received'
  return null
}

export function dealToSnapshot(deal: NonNullable<LocalWorkflowState['deal']>): LocalRemoteJobSnapshot {
  return {
    id: deal.id,
    displayCode: deal.displayCode ?? null,
    backendStatus: deal.backendStatus,
    status: deal.status,
    serviceType: deal.draft.serviceType as ServiceType,
    description: deal.draft.description,
    problemChips: deal.draft.problemChips,
    addressLabel: deal.draft.addressLabel,
    districtLabel: deal.draft.districtLabel,
    mediaCount: deal.draft.mediaCount,
    estimate: deal.estimate,
    broadcast: deal.broadcast,
    scopeReview: deal.scopeReview ?? null,
    scopeChange: deal.scopeChange,
    finalPrice: deal.finalPrice ?? null,
    paymentRailAvailable: deal.paymentRailAvailable === true,
    paymentRailProvider: deal.paymentRailProvider ?? null,
    payment: deal.payment ?? null,
    customerEvidencePhotoUrls: deal.customerEvidencePhotoUrls ?? [],
    fieldEvidencePhotoUrls: deal.fieldEvidencePhotoUrls ?? [],
    completionPhotoUrls: deal.completionPhotoUrls ?? [],
    completionNotes: deal.completionNotes ?? null,
    workerProfile: deal.workerProfile ?? null,
    scheduledAt: deal.scheduledAt ?? null,
    createdAt: deal.createdAt ?? null,
    matchedAt: deal.matchedAt ?? null,
    completedAt: deal.completedAt ?? null,
    confirmedAt: deal.confirmedAt ?? null,
    paidAt: deal.paidAt ?? null,
    reviewedAt: deal.reviewedAt ?? null,
    matchingState: deal.matchingState ?? null,
  }
}

function scopeReviewFromJobDetail(data: JobDetailResponse): LocalRemoteJobSnapshot['scopeReview'] {
  const incident = data.current_job_incident
  if (!incident) return null
  return {
    id: incident.id,
    status: incident.status,
    evidenceStatus: incident.evidence_status,
    reportedDescription: incident.reported_description,
    reportedReason: incident.reported_reason,
    evidenceCount: incident.evidence_count,
    lastSummary: incident.last_summary,
    lastQuestion: incident.last_question,
    lastNextActor: incident.last_next_actor,
    createdAt: incident.created_at,
    updatedAt: incident.updated_at,
  }
}

function workerProfileSummaryFromApi(
  worker: ConfirmSearchResponse['worker'] | JobDetailResponse['worker'] | null | undefined,
): LocalRemoteJobSnapshot['workerProfile'] {
  if (!worker) return null
  return {
    avatarUrl: worker.avatar_url,
    displayCode: worker.display_code ?? buildLocalWorkerDisplayCode(worker.id),
    fullName: worker.full_name,
    id: worker.id,
    rating: worker.rating,
    reviewCount: worker.review_count ?? null,
    totalJobs: worker.total_jobs,
  }
}

function scopeChangeFromJobDetail(data: JobDetailResponse): LocalScopeChange | null {
  const scope = data.current_scope_change
  if (!scope) return null
  return {
    id: scope.id,
    status: scope.status,
    requestedDescription: scope.requested_description,
    reason: scope.reason,
    priceMin: scope.kael_computed_min ?? scope.price_min,
    priceMax: scope.kael_computed_max ?? scope.price_max,
    kaelReview: scope.kael_review,
    kaelProgress: scope.kael_progress ?? data.job.kael_progress ?? null,
    evidencePhotoUrls: scope.evidence_photo_urls,
    requestTiming: scope.request_timing,
    resumeJobStatus: scope.resume_job_status,
    createdAt: scope.created_at,
  }
}

function estimateFromCreateResponse(data: CreateJobResponse): LocalDealEstimate {
  return {
    problemLabel: data.estimate.problem_summary || data.estimate.problem_category,
    complexity: data.estimate.complexity,
    priceRangeLabel: formatPriceRange(data.estimate.price_min, data.estimate.price_max),
    confidenceLabel: `${Math.round(data.estimate.confidence * 100)}%`,
    advisory: data.estimate.advisory ?? 'Kael giữ giá theo chính sách và cập nhật khi có bằng chứng phạm vi mới.',
    disclaimer: REQUIRED_PRICE_DISCLAIMER,
    hasVndPrice: true,
    fallbackUsed: data.fallback_used,
  }
}

function broadcastFromJobStatus(
  status: JobStatus,
  serviceType: ServiceType,
  problemSummary: string,
  districtLabel: string,
  addressLabel: string,
  broadcastState: JobDetailResponse['broadcast_state'] = null,
  releasedFullAddressLabel: string | null = hasSpecificWorkerRouteAddress(addressLabel, districtLabel) ? addressLabel : null,
  prebriefOverride: string[] = [],
  addressAccess: AddressAccessView | null = null,
) {
  if (status === 'awaiting_customer_confirm' || status === 'cancelled' || status === 'reviewed') return null
  const accepted = ['worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker', 'confirmed_by_customer', 'paid', 'payment_pending'].includes(status)
  const expiredBroadcast = status === 'broadcasting' && broadcastState?.active_count === 0
  const canRevealFullAddress = accepted && Boolean(releasedFullAddressLabel) && (addressAccess?.exact_unit_released ?? true)
  const stagedGeneralArea = accepted && addressAccess && addressAccess.release_stage !== 'area_only'
    ? addressLabel
    : districtLabel
  districtLabel = stagedGeneralArea || districtLabel
  const prebrief = prebriefOverride.length > 0
    ? prebriefOverride
    : [
        problemSummary,
        expiredBroadcast
          ? 'Chưa có thợ phản hồi.'
          : accepted ? 'Yêu cầu đã được nhận.' : 'Đang chờ thợ phản hồi.',
      ]
  return {
    status: expiredBroadcast ? 'expired' as const : accepted ? 'accepted' as const : 'sent' as const,
    serviceType,
    problemSummary,
    generalArea: districtLabel || 'Khu vực TP.HCM',
    prebrief,
    fullAddressVisible: canRevealFullAddress,
    fullAddressLabel: canRevealFullAddress ? releasedFullAddressLabel : null,
    addressAccess,
    secondsRemaining: expiredBroadcast ? 0 : status === 'broadcasting' ? broadcastState?.seconds_remaining ?? null : null,
  }
}

const LEGACY_WORKER_BRIEF_LINE_REPLACEMENTS: Readonly<Record<string, string>> = {
  'Nếu phát sinh thêm, gửi scope-change kèm lý do và ảnh trước khi làm.': 'Nếu phát sinh thêm, gửi đề xuất đổi phạm vi kèm lý do; thêm ảnh nếu có. Chỉ làm khi khách xác nhận trong ứng dụng.',
  'Nếu phát sinh thêm, gửi yêu cầu đổi phạm vi kèm lý do và ảnh trước khi làm.': 'Nếu phát sinh thêm, gửi đề xuất đổi phạm vi kèm lý do; thêm ảnh nếu có. Chỉ làm khi khách xác nhận trong ứng dụng.',
  'Không bắt đầu phần phát sinh khi Kael chưa quyết định hoặc chưa có override hợp lệ.': 'Không bắt đầu phần phát sinh khi khách chưa xác nhận đề xuất đổi phạm vi trong ứng dụng.',
}

function workerBriefLinesFromRecord(record: Record<string, unknown> | null | undefined) {
  const brief = unwrapWorkerBriefRecord(record)
  const sections = isRecord(brief?.sections) ? brief.sections : null
  if (!sections) return []
  return uniqueStrings([
    ...stringArrayFromRecord(sections, 'guidance'),
    ...stringArrayFromRecord(sections, 'safety'),
    ...stringArrayFromRecord(sections, 'context'),
  ].map(normalizeWorkerBriefLine)).slice(0, 4)
}

function normalizeWorkerBriefLine(line: string) {
  return LEGACY_WORKER_BRIEF_LINE_REPLACEMENTS[line] ?? line
}

function unwrapWorkerBriefRecord(record: Record<string, unknown> | null | undefined) {
  if (!record) return null
  return isRecord(record.brief) ? record.brief : record
}

function stringArrayFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (!Array.isArray(value)) return []
  const lines: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const line = item.trim()
    if (line) lines.push(line)
  }
  return lines
}

function uniqueStrings(lines: string[]) {
  const seen = new Set<string>()
  return lines.filter((line) => {
    const normalized = line.toLowerCase()
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function districtLabelFromValue(value: string | null | undefined) {
  if (!value) return 'Khu vực TP.HCM'
  return HCMC_DISTRICTS[value as keyof typeof HCMC_DISTRICTS] ?? value
}

function formatStoredJobAddress(address: { building: string | null; unit: string | null; floor: string | null; district: string | null }) {
  const district = address.district ? districtLabelFromValue(address.district) : ''
  const baseParts = [address.building, address.floor, address.unit]
    .flatMap((part) => {
      const trimmed = part?.trim()
      return trimmed ? [trimmed] : []
    })
  const baseLabel = baseParts.join(', ')
  const shouldAppendDistrict = Boolean(district && !addressLabelContainsDistrict(baseLabel, district))
  return [...baseParts, ...(shouldAppendDistrict ? [district] : [])].join(', ')
}

function addressLabelContainsDistrict(addressLabel: string, districtLabel: string) {
  if (!addressLabel || !districtLabel) return false
  const addressDistrict = extractKnownDistrictLabel(addressLabel)
  const expectedDistrict = extractKnownDistrictLabel(districtLabel) || districtLabel
  return Boolean(addressDistrict && addressDistrict === expectedDistrict)
}

function formatNullablePriceRange(min: number | null, max: number | null) {
  if (min === null || max === null) return undefined
  return formatPriceRange(min, max)
}

function formatNullableSinglePrice(value: number | null) {
  if (value === null) return undefined
  return formatVnd(value)
}

function formatPriceRange(min: number, max: number) {
  return `${formatVnd(min)} - ${formatVnd(max)}`
}

function formatVnd(value: number) {
  return `${vndFormatter.format(value)}đ`
}
