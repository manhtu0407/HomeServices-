import type { ImageSourcePropType } from 'react-native'

import { appCopy, localizedProblemLabel, type AppLanguage } from '@/lib/app-language'
import { formatHcmcScheduledAt } from '@/lib/hcmc-schedule'
import {
  buildLocalJobDisplayCode,
  type LocalDeal,
  type LocalDealEstimate,
  type LocalDealStatus,
  type LocalPaymentStatus,
  type ServiceType,
} from '@nestscout/shared'

import { customerV21Assets, customerV21ServiceAssets } from './assets'
import { customerV21CommonCopy, customerV21ServiceCopy, customerV21StatusCopy } from './copy'
import {
  approvalConfidenceLabel,
  canCustomerDecideScopeChange,
  formatNumber,
  formatShortClockTime,
  formatVnd,
  isDealPaymentProtected,
  isPendingCustomerScopeChange,
  scopeChangeAmountLabel,
  scopeChangeApproveLabel,
} from './case-work-money-display-model'

export {
  approvalConfidenceLabel,
  canCustomerDecideScopeChange,
  formatNumber,
  formatShortClockTime,
  formatVnd,
  isDealPaymentProtected,
  isPaymentProtectedStatus,
  isPendingCustomerScopeChange,
  paymentLedgerConfirmationStep,
  scopeChangeAmountLabel,
  scopeChangeApproveLabel,
} from './case-work-money-display-model'

export type AgenticCaseSignal = {
  body: string
  chip: string
  image: ImageSourcePropType
  title: string
}

export type FulfillmentStepState = 'active' | 'done' | 'pending'

export type AgenticCaseThreadOverviewModel = {
  address: string
  codeLabel: string
  confidenceLabel: string
  estimateLabel: string
  evidenceLabel: string
  problem: string
  service: string
  timeWindow: string
}

export type AgenticCaseThreadPaymentPanelModel = {
  amount: string
  caseCode: string
  ledgerMethod: string
  method: string
  platformFee: string
  protectedPayment: boolean
  service: string
  status: string
  workerNet: string
}

export type AgenticCaseThreadApprovalModel = {
  amountLabel: string
  approveLabel: string
  confidenceLabel: string
  id: string
  reason: string
  requestedDescription: string
}

export type AgenticCaseThreadRecommendationModel = {
  actionStatus: string
  dataSourceFooterLabel: string
  recommendation: string
  requestEditLabel: string
}

export type AgenticCaseThreadFactModel = {
  label: string
  value: string
}

export type AgenticCaseThreadScopeRowModel = {
  label: string
  state: FulfillmentStepState
  value: string
}

export type AgenticCaseThreadEtaCardModel = {
  address: string
  area: string
  eta: string
  status: string
  workerName: string
}

export type AgenticCaseThreadLiveNoticeCardModel = {
  address: string
  codeStatus: string
  eta: string
  status: string
  workerName: string
}

export type AgenticCaseThreadAcceptedWorkerCardModel = {
  address: string
  paymentProtection: string
  scope: string
  status: string
  workerName: string
}

export type AgenticCaseThreadJobProgressCardModel = {
  evidenceLabel: string
  note: string
  progress: number
  riskLabel: string
  started: boolean
  status: string
}

export type AgenticCaseThreadMatchingCardModel = {
  area: string
  confidence: string
  service: string
  status: string
  workerLabel: string
}

export type AgenticCaseThreadOptionsCardModel = {
  body: string
  estimate: string
  facts: AgenticCaseThreadFactModel[]
  scopeRows: AgenticCaseThreadScopeRowModel[]
  service: string
  serviceAsset: ImageSourcePropType
}

export type AgenticCaseThreadQuoteDecisionModel = {
  advisory?: string
  confidence: string
  evidence: string
  price: string
  problem: string
  service: string
}

export type AgenticCaseThreadModel = {
  acceptedWorkerGateActive: boolean
  approval: AgenticCaseThreadApprovalModel | null
  casePaymentPanel: AgenticCaseThreadPaymentPanelModel | null
  etaGateActive: boolean
  jobProgressGateActive: boolean
  liveNoticeGateActive: boolean
  liveSignal: AgenticCaseSignal | null
  matchingGateActive: boolean
  optionsGateActive: boolean
  overview: AgenticCaseThreadOverviewModel
  paymentGateActive: boolean
  quoteDecision: LocalDealEstimate | null
  recommendation: AgenticCaseThreadRecommendationModel | null
}

export type BuildAgenticCaseThreadModelInput = {
  caseEvidenceGateActive: boolean
  caseOptionsAcknowledged: boolean
  deal: LocalDeal
  editing: boolean
  language: AppLanguage
  sourceFooterLabel: string
  submittingCaseEvidence: boolean
}

export function caseDisplayCode(deal: LocalDeal, language: AppLanguage) {
  if (deal.displayCode) return deal.displayCode
  if (!deal.id.startsWith('local-')) {
    return buildLocalJobDisplayCode({
      jobId: deal.id,
      createdAt: deal.createdAt,
    })
  }
  return language === 'vi' ? 'Nháp dịch vụ' : 'Service draft'
}

export function caseAddressLabel(deal: LocalDeal, language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  return deal.broadcast?.fullAddressVisible
    ? deal.broadcast.fullAddressLabel || deal.draft.addressLabel || deal.broadcast.generalArea || copy.dataPending
    : deal.broadcast?.generalArea || deal.draft.districtLabel || deal.draft.addressLabel || copy.dataPending
}

export function paymentProviderLabel(provider: string, language: AppLanguage) {
  if (provider === 'sepay_vietqr') return language === 'vi' ? 'VietQR qua SePay' : 'SePay VietQR'
  if (provider === 'cash') return language === 'vi' ? 'Tiền mặt' : 'Cash'
  if (provider === 'bank_transfer') return language === 'vi' ? 'Chuyển khoản ngân hàng' : 'Bank transfer'
  return language === 'vi' ? 'Phương thức hệ thống' : provider
}

export function paymentStatusLabel(status: LocalPaymentStatus, language: AppLanguage) {
  const vi: Record<LocalPaymentStatus, string> = {
    amount_mismatch: 'Sai lệch số tiền',
    code_requested: 'Đã yêu cầu mã thanh toán',
    expired: 'Đã hết hạn',
    failed: 'Thanh toán lỗi',
    not_started: 'Chưa bắt đầu',
    pending: 'Đang chờ xác nhận',
    received: 'Đã nhận tiền',
    reconciled: 'Đã đối soát',
    vietqr_ready: 'VietQR sẵn sàng',
  }
  const en: Record<LocalPaymentStatus, string> = {
    amount_mismatch: 'Amount mismatch',
    code_requested: 'Payment code requested',
    expired: 'Expired',
    failed: 'Failed',
    not_started: 'Not started',
    pending: 'Pending',
    received: 'Received',
    reconciled: 'Reconciled',
    vietqr_ready: 'VietQR ready',
  }
  return language === 'vi' ? vi[status] : en[status]
}

export function paymentAmountLabel(payment: LocalDeal['payment'] | null, language: AppLanguage, fallback: string) {
  const amount = payment?.grossAmount ?? payment?.amountReceived
  if (typeof amount === 'number') return formatVnd(amount, language)
  return fallback
}

export function formatDurationShort(seconds: number, language: AppLanguage) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return language === 'vi' ? `${minutes} phút` : `${minutes} min`
}

export function formatEvidenceFileCount(value: number | null | undefined, language: AppLanguage) {
  const realCount = typeof value === 'number' ? value : 0
  const count = formatNumber(realCount, language)
  return language === 'vi' ? `${count} tệp` : `${count} file${realCount === 1 ? '' : 's'}`
}

export function normalizeKaelRoutingText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function agenticProblemTaxonomyLabel(value: string, language: AppLanguage) {
  const normalized = normalizeKaelRoutingText(value).replace(/[^a-z0-9]+/g, '_')
  const viLabels: Record<string, string> = {
    electrical_outlet_switch: 'Ổ điện',
    outlet_switch: 'Ổ điện',
    pipe_leak: 'Rò nước',
    plumbing_pipe_leak: 'Rò nước',
    weak_pressure: 'Áp yếu',
    plumbing_weak_pressure: 'Áp yếu',
    clogged_drain: 'Tắc cống',
    plumbing_clogged_drain: 'Tắc cống',
    faucet_issue: 'Vòi hỏng',
    plumbing_faucet_issue: 'Vòi hỏng',
  }
  const enLabels: Record<string, string> = {
    electrical_outlet_switch: 'Outlet or switch',
    outlet_switch: 'Outlet or switch',
    pipe_leak: 'Pipe leak',
    plumbing_pipe_leak: 'Pipe leak',
    weak_pressure: 'Weak water pressure',
    plumbing_weak_pressure: 'Weak water pressure',
    clogged_drain: 'Clogged drain',
    plumbing_clogged_drain: 'Clogged drain',
    faucet_issue: 'Faucet issue',
    plumbing_faucet_issue: 'Faucet issue',
  }
  const labels = language === 'vi' ? viLabels : enLabels
  return labels[normalized] ?? null
}

export function looksLikeRawProblemTaxonomy(value: string) {
  const trimmed = value.trim()
  return /^[a-z]+:[\s_a-z0-9-]+$/i.test(trimmed) || /^[a-z]+(?:_[a-z0-9]+)+$/i.test(trimmed)
}

export function agenticDealProblemLabel(deal: LocalDeal, language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  const candidates = [
    deal.estimate?.problemLabel,
    deal.broadcast?.problemSummary,
    ...deal.draft.problemChips,
    deal.draft.inferredProblemLabel,
    deal.draft.description,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  for (const candidate of candidates) {
    const mapped = agenticProblemTaxonomyLabel(candidate, language)
    if (mapped) return mapped
    if (looksLikeRawProblemTaxonomy(candidate)) continue
    const localized = localizedProblemLabel(candidate, deal.draft.serviceType, language)
    if (localized !== appCopy[language].common.unknown) return localized.trim()
  }
  return copy.dataPending
}

export function timeChoiceLabel(value: LocalDeal['draft']['timeChoice'], language: AppLanguage, scheduledAt?: string | null) {
  const scheduledLabel = formatHcmcScheduledAt(scheduledAt)
  if (scheduledLabel) return scheduledLabel
  if (value === 'now') return language === 'vi' ? 'Sớm nhất có thể' : 'As soon as possible'
  return customerV21CommonCopy[language].dataPending
}

export function caseThreadLiveSignal(deal: LocalDeal, language: AppLanguage): AgenticCaseSignal | null {
  const copy = customerV21CommonCopy[language]
  const status = customerV21StatusCopy[language][deal.status]
  if (deal.payment) {
    const amount = paymentAmountLabel(deal.payment, language, copy.dataPending)
    const method = deal.payment.provider ? paymentProviderLabel(deal.payment.provider, language) : copy.dataPending
    const paymentStatus = paymentStatusLabel(deal.payment.status, language)
    return {
      body: `${amount} · ${method}`,
      chip: paymentStatus,
      image: customerV21Assets.payment,
      title: language === 'vi' ? 'Thanh toán an toàn' : 'Protected payment',
    }
  }

  if (deal.broadcast && (deal.status === 'worker_on_way' || deal.status === 'worker_matched')) {
    const eta = deal.broadcast.secondsRemaining ? formatDurationShort(deal.broadcast.secondsRemaining, language) : status
    const area = deal.broadcast.fullAddressVisible
      ? deal.broadcast.fullAddressLabel ?? deal.broadcast.generalArea
      : deal.broadcast.generalArea
    return {
      body: area || copy.dataPending,
      chip: eta,
      image: customerV21Assets.map,
      title: language === 'vi' ? 'Thợ & thời gian' : 'Worker and ETA',
    }
  }

  if (deal.status === 'repairing' || deal.status === 'scope_change_pending' || deal.status === 'completed_by_worker') {
    const completionCount = (deal.completionPhotoUrls?.length ?? 0) + (deal.completionNotes ? 1 : 0)
    return {
      body: completionCount > 0 ? formatEvidenceFileCount(completionCount, language) : status,
      chip: status,
      image: customerV21Assets.activity,
      title: language === 'vi' ? 'Tiến độ hiện trường' : 'Field progress',
    }
  }

  if (deal.workerProfile || deal.broadcast) {
    const workerName = deal.workerProfile?.fullName?.trim() || deal.broadcast?.generalArea || copy.dataPending
    return {
      body: workerName,
      chip: status,
      image: customerV21Assets.identity,
      title: language === 'vi' ? 'Thợ thật' : 'Real worker',
    }
  }

  return null
}

export function buildAgenticCaseThreadModel({
  caseEvidenceGateActive,
  caseOptionsAcknowledged,
  deal,
  editing,
  language,
  sourceFooterLabel,
  submittingCaseEvidence,
}: BuildAgenticCaseThreadModelInput): AgenticCaseThreadModel {
  const copy = customerV21CommonCopy[language]
  const estimate = deal.estimate
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  const problem = agenticDealProblemLabel(deal, language)
  const address = deal.draft.addressLabel || deal.draft.districtLabel || copy.dataPending
  const timeWindow = timeChoiceLabel(deal.draft.timeChoice, language, deal.scheduledAt)
  const evidenceLabel = formatEvidenceFileCount(deal.draft.mediaCount, language)
  const estimateLabel = estimate?.priceRangeLabel || copy.dataPending
  const confidenceLabel = estimate?.confidenceLabel || copy.dataPending
  const hasEstimate = Boolean(estimate?.priceRangeLabel)
  const pendingText = language === 'vi' ? 'Chờ' : 'Pending'
  const recommendationText = estimate?.advisory || deal.draft.description || copy.dataPending
  const pendingScopeChange = deal.scopeChange && isPendingCustomerScopeChange(deal.scopeChange) ? deal.scopeChange : null
  const customerDecidableScopeChange = pendingScopeChange && canCustomerDecideScopeChange(pendingScopeChange)
    ? pendingScopeChange
    : null
  const caseFlowBlockedByEvidence = caseEvidenceGateActive || submittingCaseEvidence
  const matchingGateActive = !caseFlowBlockedByEvidence && deal.status === 'broadcasting'
  const optionsGateActive = !caseFlowBlockedByEvidence && deal.status === 'awaiting_customer_confirm' && Boolean(estimate) && !caseOptionsAcknowledged
  const quoteDecision = !caseFlowBlockedByEvidence && deal.status === 'awaiting_customer_confirm' && estimate && caseOptionsAcknowledged ? estimate : null
  const etaGateActive = !caseFlowBlockedByEvidence && Boolean(deal.broadcast) && deal.status === 'worker_matched'
  const liveNoticeGateActive = !caseFlowBlockedByEvidence && Boolean(deal.broadcast) && deal.status === 'worker_on_way'
  const acceptedWorkerGateActive = !caseFlowBlockedByEvidence && (deal.status === 'arrived' || deal.status === 'inspecting')
  const jobProgressGateActive = !caseFlowBlockedByEvidence && ['repairing', 'completed_by_worker', 'confirmed_by_customer', 'reviewed'].includes(deal.status)
  const paymentGateActive = !caseFlowBlockedByEvidence && Boolean(deal.payment) &&
    deal.status !== 'completed_by_worker' &&
    ['payment_pending', 'paid', 'reviewed'].includes(deal.status)
  const casePayment = deal.payment
  const casePaymentPanel = casePayment ? {
    amount: paymentAmountLabel(casePayment, language, copy.dataPending),
    caseCode: caseDisplayCode(deal, language),
    ledgerMethod: [casePayment.paymentCode, formatShortClockTime(casePayment.receivedAt, language), casePayment.provider ? paymentProviderLabel(casePayment.provider, language) : copy.dataPending].filter(Boolean).join(' · ') || (casePayment.provider ? paymentProviderLabel(casePayment.provider, language) : copy.dataPending),
    method: casePayment.provider ? paymentProviderLabel(casePayment.provider, language) : copy.dataPending,
    platformFee: casePayment.platformFee === 0 || casePayment.platformFee ? formatVnd(casePayment.platformFee, language) : copy.dataPending,
    protectedPayment: isDealPaymentProtected(deal),
    service: deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending,
    status: deal.status === 'payment_pending'
      ? customerV21StatusCopy[language].payment_pending
      : paymentStatusLabel(casePayment.status, language),
    workerNet: casePayment.workerNet === 0 || casePayment.workerNet ? formatVnd(casePayment.workerNet, language) : copy.dataPending,
  } : null
  const liveSignal = caseThreadLiveSignal(deal, language)
  const actionStatus = editing
    ? (language === 'vi' ? 'Đang trao đổi' : 'Discussing')
    : deal.status === 'awaiting_customer_confirm' && hasEstimate
      ? (language === 'vi' ? 'Cần bạn chốt' : 'Needs decision')
      : pendingText
  const liveSignalModel = liveSignal && !pendingScopeChange && !quoteDecision && !matchingGateActive && !optionsGateActive && !paymentGateActive && !etaGateActive && !liveNoticeGateActive && !acceptedWorkerGateActive && !jobProgressGateActive ? liveSignal : null
  const approvalModel = customerDecidableScopeChange && !editing && !quoteDecision && !matchingGateActive && !optionsGateActive && !paymentGateActive && !etaGateActive && !liveNoticeGateActive && !acceptedWorkerGateActive && !jobProgressGateActive ? {
    amountLabel: scopeChangeAmountLabel(customerDecidableScopeChange, language),
    approveLabel: scopeChangeApproveLabel(customerDecidableScopeChange, language),
    confidenceLabel: approvalConfidenceLabel(customerDecidableScopeChange, deal, language),
    id: customerDecidableScopeChange.id,
    reason: customerDecidableScopeChange.reason ?? copy.dataPending,
    requestedDescription: customerDecidableScopeChange.requestedDescription ?? customerDecidableScopeChange.reason ?? copy.dataPending,
  } : null
  const recommendationModel = !pendingScopeChange && !liveSignal && !quoteDecision && !matchingGateActive && !optionsGateActive && !paymentGateActive && !etaGateActive && !liveNoticeGateActive && !acceptedWorkerGateActive && !jobProgressGateActive ? {
    actionStatus,
    dataSourceFooterLabel: sourceFooterLabel,
    recommendation: recommendationText,
    requestEditLabel: editing ? (language === 'vi' ? 'Đang chỉnh' : 'Editing') : (language === 'vi' ? 'Yêu cầu chỉnh sửa' : 'Request edits'),
  } : null

  return {
    acceptedWorkerGateActive,
    approval: approvalModel,
    casePaymentPanel,
    etaGateActive,
    jobProgressGateActive,
    liveNoticeGateActive,
    liveSignal: liveSignalModel,
    matchingGateActive,
    optionsGateActive,
    overview: {
      address,
      codeLabel: caseDisplayCode(deal, language),
      confidenceLabel,
      estimateLabel,
      evidenceLabel,
      problem,
      service,
      timeWindow,
    },
    paymentGateActive,
    quoteDecision,
    recommendation: recommendationModel,
  }
}

export function buildAgenticCaseThreadEtaCardModel(
  deal: LocalDeal,
  language: AppLanguage,
): AgenticCaseThreadEtaCardModel {
  const copy = customerV21CommonCopy[language]
  return {
    address: caseAddressLabel(deal, language),
    area: deal.broadcast?.generalArea || deal.draft.districtLabel || copy.dataPending,
    eta: typeof deal.broadcast?.secondsRemaining === 'number'
      ? formatDurationShort(deal.broadcast.secondsRemaining, language)
      : copy.dataPending,
    status: customerV21StatusCopy[language][deal.status],
    workerName: deal.workerProfile?.fullName?.trim() || copy.dataPending,
  }
}

export function buildAgenticCaseThreadLiveNoticeCardModel(
  deal: LocalDeal,
  language: AppLanguage,
): AgenticCaseThreadLiveNoticeCardModel {
  const copy = customerV21CommonCopy[language]
  return {
    address: deal.broadcast?.fullAddressVisible
      ? caseAddressLabel(deal, language)
      : (deal.broadcast?.generalArea || deal.draft.districtLabel || copy.dataPending),
    codeStatus: copy.dataPending,
    eta: typeof deal.broadcast?.secondsRemaining === 'number'
      ? formatDurationShort(deal.broadcast.secondsRemaining, language)
      : customerV21StatusCopy[language][deal.status],
    status: customerV21StatusCopy[language][deal.status],
    workerName: deal.workerProfile?.fullName?.trim() || copy.dataPending,
  }
}

export function buildAgenticCaseThreadAcceptedWorkerCardModel(
  deal: LocalDeal,
  language: AppLanguage,
): AgenticCaseThreadAcceptedWorkerCardModel {
  const copy = customerV21CommonCopy[language]
  return {
    address: caseAddressLabel(deal, language),
    paymentProtection: deal.payment
      ? paymentStatusLabel(deal.payment.status, language)
      : copy.dataPending,
    scope: currentScopeLabel(deal, language),
    status: customerV21StatusCopy[language][deal.status],
    workerName: deal.workerProfile?.fullName?.trim() || copy.dataPending,
  }
}

export function buildAgenticCaseThreadJobProgressCardModel(
  deal: LocalDeal,
  language: AppLanguage,
): AgenticCaseThreadJobProgressCardModel {
  const copy = customerV21CommonCopy[language]
  const started = isWorkStartedStatus(deal.status)
  const evidenceCount = (deal.draft.mediaCount ?? 0) + (deal.completionPhotoUrls?.length ?? 0) + (deal.completionNotes ? 1 : 0)
  return {
    evidenceLabel: formatEvidenceFileCount(evidenceCount, language),
    note: deal.completionNotes?.trim()
      || (started
        ? (language === 'vi' ? 'Kael theo d\u00f5i ti\u1ebfn \u0111\u1ed9 theo tr\u1ea1ng th\u00e1i c\u00f4ng vi\u1ec7c th\u1eadt.' : 'Kael follows progress from the real job state.')
        : copy.dataPending),
    progress: workProgressPercent(deal.status),
    riskLabel: deal.scopeChange
      ? (language === 'vi' ? 'C\u1ea7n duy\u1ec7t' : 'Needs approval')
      : started
        ? (language === 'vi' ? 'An to\u00e0n' : 'Safe')
        : copy.dataPending,
    started,
    status: customerV21StatusCopy[language][deal.status],
  }
}

export function buildAgenticCaseThreadMatchingCardModel(
  deal: LocalDeal,
  language: AppLanguage,
): AgenticCaseThreadMatchingCardModel {
  const copy = customerV21CommonCopy[language]
  return {
    area: deal.broadcast?.generalArea || deal.draft.districtLabel || deal.draft.addressLabel || copy.dataPending,
    confidence: deal.estimate?.confidenceLabel || copy.dataPending,
    service: deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending,
    status: customerV21StatusCopy[language][deal.status],
    workerLabel: deal.workerProfile?.fullName?.trim() || (language === 'vi' ? '\u0110ang t\u00ecm th\u1ee3' : 'Matching'),
  }
}

export function buildAgenticCaseThreadOptionsCardModel(
  deal: LocalDeal,
  language: AppLanguage,
): AgenticCaseThreadOptionsCardModel {
  const copy = customerV21CommonCopy[language]
  const options = caseSecondaryOptionsForDeal(deal, language)
  return {
    body: deal.estimate?.advisory || agenticDealProblemLabel(deal, language),
    estimate: deal.estimate?.priceRangeLabel || copy.dataPending,
    facts: options.map((option) => ({ label: option.title, value: option.rightLabel })),
    scopeRows: caseScopeRowsForDeal(deal, language).slice(0, 4),
    service: deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending,
    serviceAsset: deal.draft.serviceType ? customerV21ServiceAssets[deal.draft.serviceType] : customerV21Assets.request,
  }
}

export function buildAgenticCaseThreadQuoteDecisionModel(
  quoteDecision: LocalDealEstimate,
  overview: AgenticCaseThreadOverviewModel,
  language: AppLanguage,
): AgenticCaseThreadQuoteDecisionModel {
  const copy = customerV21CommonCopy[language]
  return {
    advisory: quoteDecision.advisory ?? undefined,
    confidence: quoteDecision.confidenceLabel || copy.dataPending,
    evidence: overview.evidenceLabel,
    price: quoteDecision.priceRangeLabel || copy.dataPending,
    problem: overview.problem,
    service: overview.service,
  }
}

export function caseScopeRowsForDeal(deal: LocalDeal, language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  const includedLabel = deal.estimate ? (language === 'vi' ? 'Đã gồm' : 'Included') : copy.dataPending
  const approvalLabel = language === 'vi' ? 'Phải duyệt' : 'Approval'
  const serviceType = deal.draft.serviceType
  const rowsByService: Record<ServiceType, string[]> = {
    cleaning: language === 'vi'
      ? ['Dọn khu vực chính', 'Làm sạch bề mặt', 'Bếp/phòng tắm theo yêu cầu', 'Thu gom rác nhẹ', 'Kiểm tra sau dọn', 'Vật tư phát sinh']
      : ['Clean main areas', 'Surface cleaning', 'Kitchen/bathroom by request', 'Light trash collection', 'Post-clean check', 'Extra supplies'],
    electrical: language === 'vi'
      ? ['Khoanh vùng điểm lỗi', 'Kiểm tra an toàn điện', 'Xử lý kết nối cơ bản', 'Test tải sau xử lý', 'Dọn điểm thao tác', 'Vật tư phát sinh']
      : ['Locate fault point', 'Electrical safety check', 'Basic connection fix', 'Post-fix load test', 'Clean work point', 'Extra materials'],
    plumbing: language === 'vi'
      ? ['Xác định rò rỉ/tắc', 'Kiểm tra áp lực nước', 'Xử lý đường ống nhẹ', 'Siết/đổi ron cơ bản', 'Test sau xử lý', 'Vật tư phát sinh']
      : ['Locate leak/blockage', 'Water pressure check', 'Light pipe handling', 'Basic seal replacement', 'Post-fix test', 'Extra materials'],
    hvac: language === 'vi'
      ? ['Xác nhận hiện trạng máy', 'Kiểm tra an toàn', 'Chốt phạm vi vệ sinh/sửa chữa', 'Thử vận hành', 'Ghi nhận kết quả', 'Vật tư phát sinh']
      : ['Confirm unit condition', 'Safety check', 'Lock cleaning/repair scope', 'Operation test', 'Record result', 'Extra materials'],
    upholstery: language === 'vi'
      ? ['Xác nhận chất liệu', 'Kiểm tra vết bẩn/mùi', 'Chốt phương pháp làm sạch', 'Xử lý theo phạm vi', 'Kiểm tra sau làm sạch', 'Vật tư phát sinh']
      : ['Confirm material', 'Check stain/odor', 'Lock cleaning method', 'Clean agreed scope', 'Post-clean check', 'Extra materials'],
    handyman: language === 'vi'
      ? ['Xác nhận từng việc nhỏ', 'Kiểm tra bề mặt/an toàn', 'Chốt vật tư và dụng cụ', 'Thực hiện theo phạm vi', 'Kiểm tra hoàn tất', 'Vật tư phát sinh']
      : ['Confirm each small task', 'Check surface/safety', 'Lock materials and tools', 'Complete agreed scope', 'Completion check', 'Extra materials'],
  }
  const labels = serviceType
    ? rowsByService[serviceType]
    : (language === 'vi'
      ? ['Xác nhận dịch vụ', 'Đọc mô tả', 'Kiểm tra bằng chứng', 'Chốt phạm vi', 'Dự kiến thời gian', 'Vật tư phát sinh']
      : ['Confirm service', 'Read description', 'Check evidence', 'Lock scope', 'Estimate time', 'Extra materials'])

  return labels.map((label, index) => ({
    label,
    state: index === labels.length - 1 ? 'active' as const : deal.estimate ? 'done' as const : 'pending' as const,
    value: index === labels.length - 1 ? approvalLabel : includedLabel,
  }))
}

export function caseSecondaryOptionsForDeal(deal: LocalDeal, language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType] : null
  const serviceLabel = service?.label ?? copy.dataPending
  return [
    {
      body: language === 'vi' ? 'Giữ phạm vi tối thiểu theo mô tả.' : 'Keep the minimum scope from the description.',
      image: deal.draft.serviceType ? customerV21ServiceAssets[deal.draft.serviceType] : customerV21Assets.request,
      rightLabel: deal.estimate?.priceRangeLabel || copy.dataPending,
      testID: 'customer-v21-options-standard',
      title: serviceLabel,
    },
    {
      body: language === 'vi' ? 'Dùng khi cần thợ xác nhận thêm tại chỗ.' : 'Use when on-site confirmation is needed.',
      image: customerV21Assets.tools,
      rightLabel: copy.dataPending,
      testID: 'customer-v21-options-onsite',
      title: language === 'vi' ? 'Kiểm tra tại chỗ' : 'On-site check',
    },
  ]
}

export function currentScopeLabel(deal: LocalDeal, language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  const serviceLabel = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : null
  const problemLabel = agenticDealProblemLabel(deal, language)
  const parts = [serviceLabel, problemLabel]
    .filter((part): part is string => Boolean(part && part !== copy.dataPending))
    .filter((part, index, values) => values.indexOf(part) === index)

  return parts.length > 0 ? parts.join(' · ') : copy.dataPending
}

export function caseEtaTimelineRows(deal: LocalDeal, language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  const workerName = deal.workerProfile?.fullName?.trim() || copy.dataPending
  const address = caseAddressLabel(deal, language)
  const eta = typeof deal.broadcast?.secondsRemaining === 'number'
    ? formatDurationShort(deal.broadcast.secondsRemaining, language)
    : copy.dataPending
  const accepted = ['worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker', 'confirmed_by_customer', 'payment_pending', 'paid', 'reviewed'].includes(deal.status)
  const onWay = ['worker_on_way', 'arrived', 'inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker', 'confirmed_by_customer', 'payment_pending', 'paid', 'reviewed'].includes(deal.status)
  const arrived = ['arrived', 'inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker', 'confirmed_by_customer', 'payment_pending', 'paid', 'reviewed'].includes(deal.status)

  return [
    {
      body: workerName,
      state: accepted ? 'done' as const : 'pending' as const,
      title: language === 'vi' ? 'Thợ đã nhận đơn' : 'Worker accepted',
    },
    {
      body: address,
      state: deal.broadcast?.fullAddressVisible ? 'done' as const : 'pending' as const,
      title: language === 'vi' ? 'Đã mở khu vực' : 'Area opened',
    },
    {
      body: eta,
      state: onWay ? 'active' as const : 'pending' as const,
      title: language === 'vi' ? 'Đang trên đường' : 'On the way',
    },
    {
      body: arrived ? (language === 'vi' ? 'Đã đến' : 'Arrived') : copy.dataPending,
      state: arrived ? 'done' as const : 'pending' as const,
      title: language === 'vi' ? 'Đến địa điểm' : 'Arrive',
    },
  ]
}

export function isArrivalConfirmedStatus(status: LocalDealStatus) {
  return ['arrived', 'inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker', 'confirmed_by_customer', 'payment_pending', 'paid', 'reviewed'].includes(status)
}

export function isWorkStartedStatus(status: LocalDealStatus) {
  return ['inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker', 'confirmed_by_customer', 'payment_pending', 'paid', 'reviewed'].includes(status)
}

export function isWorkCompletedStatus(status: LocalDealStatus) {
  return ['completed_by_worker', 'confirmed_by_customer', 'payment_pending', 'paid', 'reviewed'].includes(status)
}

export function workProgressPercent(status: LocalDealStatus | undefined) {
  if (!status) return 0
  if (isWorkCompletedStatus(status)) return 100
  if (status === 'scope_change_pending') return 62
  if (status === 'repairing') return 58
  if (status === 'inspecting') return 28
  if (status === 'arrived') return 14
  return 0
}

export function caseJobProgressSteps(status: LocalDealStatus | undefined, language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  const arrived = status ? isArrivalConfirmedStatus(status) : false
  const started = status ? isWorkStartedStatus(status) : false
  const repairing = status === 'repairing' || status === 'scope_change_pending' || (status ? isWorkCompletedStatus(status) : false)
  const completed = status ? isWorkCompletedStatus(status) : false
  const step = (
    title: string,
    body: string,
    state: FulfillmentStepState,
  ) => ({ body, state, title })

  return [
    step(
      language === 'vi' ? 'Khảo sát hiện trạng' : 'Inspect current state',
      arrived ? (language === 'vi' ? 'Hoàn tất' : 'Done') : copy.dataPending,
      arrived ? 'done' : status ? 'active' : 'pending',
    ),
    step(
      language === 'vi' ? 'Thực hiện công việc' : 'Do the work',
      repairing ? `${workProgressPercent(status)}%` : copy.dataPending,
      repairing ? 'active' : started ? 'active' : 'pending',
    ),
    step(
      language === 'vi' ? 'Kiểm tra vận hành' : 'Operational check',
      completed ? (language === 'vi' ? 'Hoàn tất' : 'Done') : copy.dataPending,
      completed ? 'done' : repairing ? 'pending' : 'pending',
    ),
    step(
      language === 'vi' ? 'Bàn giao & bằng chứng' : 'Handoff and evidence',
      completed ? (language === 'vi' ? 'Đã có bằng chứng' : 'Evidence ready') : copy.dataPending,
      completed ? 'done' : 'pending',
    ),
  ]
}
