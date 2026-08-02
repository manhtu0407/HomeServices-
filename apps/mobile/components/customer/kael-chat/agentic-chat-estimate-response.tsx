import { useMemo } from 'react'
import type { StyleProp, TextStyle } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { KaelChatResponse } from '@/lib/api-types'

import { AgenticChatEstimateResponsePanel } from './agentic-decision-surfaces'
import {
  agenticEstimateHeaderTitle,
  agenticEstimateSupportingPhase,
} from './agentic-estimate-display-model'

type AgenticEstimate = NonNullable<KaelChatResponse['session']['estimate']>

export function AgenticChatEstimateResponse({
  adjustmentOpen,
  adjustmentText,
  canConfirm,
  confirmed,
  confirming,
  diagnosisScope,
  evidencePreviews,
  estimate,
  formatPriceRange,
  language,
  onAdjust,
  onAdjustmentChange,
  onConfirm,
  onReject,
  onReasonChange,
  onSubmitAdjustment,
  onSubmitRejectReason,
  rejected,
  rejectReason,
  sourceExplanationForLanguage,
  priceExplanationForEstimate,
  submittingAdjustment,
  submittingRejectReason,
  textInputStyle,
}: {
  adjustmentOpen: boolean
  adjustmentText: string
  canConfirm: boolean
  confirmed: boolean
  confirming: boolean
  diagnosisScope?: Record<string, unknown> | null
  evidencePreviews: NonNullable<KaelChatResponse['session']['evidence_previews']>
  estimate: AgenticEstimate
  formatPriceRange: (min: number, max: number, language: AppLanguage) => string
  language: AppLanguage
  onAdjust: () => void
  onAdjustmentChange: (value: string) => void
  onConfirm: () => void
  onReject: () => void
  onReasonChange: (value: string) => void
  onSubmitAdjustment: () => void
  onSubmitRejectReason: () => void
  priceExplanationForEstimate: (estimate: AgenticEstimate, language: AppLanguage) => string
  rejected: boolean
  rejectReason: string
  sourceExplanationForLanguage: (language: AppLanguage) => string
  submittingAdjustment: boolean
  submittingRejectReason: boolean
  textInputStyle: StyleProp<TextStyle>
}) {
  const serviceLabel = agenticEstimateHeaderTitle(estimate, language)
  const needsInspection = estimate.needs_inspection === true
  const needsMoreInfo = needsInspection
  const confirmLabel = confirmed
    ? (language === 'vi' ? 'Đã xác nhận' : 'Confirmed')
    : confirming
      ? (language === 'vi' ? 'Đang xác nhận' : 'Confirming')
      : (language === 'vi' ? 'Xác nhận' : 'Confirm')
  const rejectLabel = rejected
    ? (language === 'vi' ? 'Đang trao đổi' : 'Discussing')
    : (language === 'vi' ? 'Từ chối' : 'Decline')
  const canSubmitRejectReason = rejectReason.trim().length > 0 &&
    !submittingRejectReason && !submittingAdjustment && !confirming
  const canSubmitAdjustment = adjustmentText.trim().length > 0 &&
    !submittingAdjustment && !submittingRejectReason && !confirming
  const statusLabel = confirmed
    ? (language === 'vi' ? 'Công việc đã được mở' : 'Work request opened')
    : needsInspection
      ? (language === 'vi' ? 'Cần khảo sát hiện trường' : 'Inspection required')
      : needsMoreInfo
        ? (language === 'vi' ? 'Cần thêm dữ liệu' : 'Needs more context')
        : canConfirm
          ? (language === 'vi' ? 'Cần bạn chốt' : 'Needs your decision')
          : (language === 'vi' ? 'Đang chờ' : 'Waiting')
  const priceExplanation = priceExplanationForEstimate(estimate, language)
  const priceSource = estimate.price_source
  const priceSourceLabel = priceSource === 'perplexity_validated'
    ? (language === 'vi'
        ? 'Nguồn giá: thị trường đã kiểm chứng.'
        : 'Price source: validated market evidence.')
    : priceSource === 'baseline_with_market'
      ? (language === 'vi'
          ? 'Nguồn giá: mức giá cơ sở và tín hiệu thị trường.'
          : 'Price source: baseline and market signals.')
      : priceSource === 'baseline_only'
        ? (language === 'vi'
            ? 'Nguồn giá: mức giá cơ sở đã kiểm chứng.'
            : 'Price source: governed baseline.')
        : priceSource === 'inspection_required'
          ? (language === 'vi'
              ? 'Nguồn giá chưa đủ chắc chắn, cần khảo sát.'
              : 'Price evidence is not yet sufficient, inspection is required.')
          : null
  const sourceExplanation = [sourceExplanationForLanguage(language), priceSourceLabel]
    .filter(Boolean)
    .join(' ')
  // Keep the receipt identity stable while the user opens decision controls.
  const supportingPhase = useMemo(
    () => agenticEstimateSupportingPhase(estimate, language, diagnosisScope, evidencePreviews),
    [diagnosisScope, estimate, evidencePreviews, language],
  )
  const price = formatPriceRange(estimate.price_min, estimate.price_max, language)
  const moreInfoText = needsInspection && estimate.needs_inspection_reason
    ? estimate.needs_inspection_reason
    : language === 'vi'
      ? 'Dữ liệu hiện tại chưa đủ chắc chắn. Bạn gửi thêm ảnh/video hoặc mô tả rõ phạm vi, mức độ và thời điểm xảy ra để Kael kiểm tra lại.'
      : 'Current evidence is not yet sufficient. Add media or clarify the scope, severity, and timing so Kael can re-check.'

  return (
    <AgenticChatEstimateResponsePanel
      adjustmentOpen={adjustmentOpen}
      adjustmentText={adjustmentText}
      advisory={estimate.advisory ?? undefined}
      canConfirm={canConfirm}
      canSubmitAdjustment={canSubmitAdjustment}
      canSubmitRejectReason={canSubmitRejectReason}
      confirmed={confirmed}
      confirming={confirming}
      confirmLabel={confirmLabel}
      disclaimer={estimate.disclaimer}
      language={language}
      moreInfoText={moreInfoText}
      needsMoreInfo={needsMoreInfo}
      onAdjust={onAdjust}
      onAdjustmentChange={onAdjustmentChange}
      onConfirm={onConfirm}
      onReasonChange={onReasonChange}
      onReject={onReject}
      onSubmitAdjustment={onSubmitAdjustment}
      onSubmitRejectReason={onSubmitRejectReason}
      price={price}
      priceExplanation={priceExplanation}
      rejected={rejected}
      rejectLabel={rejectLabel}
      rejectReason={rejectReason}
      serviceLabel={serviceLabel}
      sourceExplanation={sourceExplanation}
      statusLabel={statusLabel}
      submittingAdjustment={submittingAdjustment}
      submittingRejectReason={submittingRejectReason}
      supportingPhase={supportingPhase}
      textInputStyle={textInputStyle}
    />
  )
}
