import { typography } from '@/design/theme'
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import { CaseWorkResponse } from './case-work-response'
import type { CaseWorkResponseModel } from './case-work-response-model'
import type { AgenticEstimateSupportingPhaseModel } from './agentic-estimate-display-model'
import { AgenticPriceReasoningStream } from './agentic-price-reasoning-stream'
import { AgenticScheduleGate } from './agentic-schedule-gate'
import { useCustomerV21SurfaceTheme } from '../ui/shared-surfaces'

export function AgenticChatEstimateResponsePanel({
  adjustmentOpen,
  adjustmentText,
  advisory,
  canConfirm,
  canSubmitAdjustment,
  canSubmitRejectReason,
  confirmed,
  confirming,
  confirmLabel,
  disclaimer,
  language,
  moreInfoText,
  needsMoreInfo,
  onAskPrice,
  onAdjust,
  onAdjustmentChange,
  onConfirm,
  onReasonChange,
  onReject,
  onSubmitAdjustment,
  onSubmitRejectReason,
  onSubmitSchedule,
  priceExplanation,
  priceQuestionOpen,
  rejected,
  rejectLabel,
  rejectReason,
  serviceLabel,
  sourceExplanation,
  statusLabel,
  requiresSchedule,
  submittingAdjustment,
  submittingRejectReason,
  supportingPhase,
  textInputStyle,
}: {
  adjustmentOpen: boolean
  adjustmentText: string
  advisory?: string
  canConfirm: boolean
  canSubmitAdjustment: boolean
  canSubmitRejectReason: boolean
  confirmed: boolean
  confirming: boolean
  confirmLabel: string
  disclaimer: string
  language: AppLanguage
  moreInfoText: string
  needsMoreInfo: boolean
  onAskPrice: () => void
  onAdjust: () => void
  onAdjustmentChange: (value: string) => void
  onConfirm: () => void
  onReasonChange: (value: string) => void
  onReject: () => void
  onSubmitAdjustment: () => void
  onSubmitRejectReason: () => void
  onSubmitSchedule: (input: {
    message: string
    scheduled_at: string
    schedule_window: {
      date: string
      end: string
      start: string
      time_zone: 'Asia/Ho_Chi_Minh'
    }
  }) => Promise<void>
  priceExplanation: string
  priceQuestionOpen: boolean
  rejected: boolean
  rejectLabel: string
  rejectReason: string
  serviceLabel: string
  sourceExplanation: string
  statusLabel: string
  requiresSchedule: boolean
  submittingAdjustment: boolean
  submittingRejectReason: boolean
  supportingPhase: AgenticEstimateSupportingPhaseModel | null
  textInputStyle: StyleProp<TextStyle>
}) {
  const { reduceMotion, tokens } = useCustomerV21SurfaceTheme()
  const hasPriceReasoningReceipt = Boolean(supportingPhase?.receiptId)
  const confirmationBlockedForPriceReasoning = canConfirm && !confirmed && !hasPriceReasoningReceipt
  const confirmationBlockedForSchedule = canConfirm && !confirmed && requiresSchedule
  const canConfirmWithPreconditions = canConfirm && hasPriceReasoningReceipt && !requiresSchedule
  const priceReasoningRequiredText = language === 'vi'
    ? 'Kael chưa có biên nhận phân tích giá đã xác thực nên bạn chưa thể xác nhận. Bạn có thể điều chỉnh thông tin để Kael phân tích lại.'
    : 'Kael does not yet have a validated price reasoning receipt, so you cannot approve this estimate. You can adjust the information for another analysis.'
  const model: CaseWorkResponseModel = {
    actionKind: 'offer',
    noteCopy: priceExplanation,
    noteTitle: language === 'vi' ? 'Phạm vi và ước tính' : 'Scope and estimate',
    phase: 'ticket_review',
    status: statusLabel,
    title: serviceLabel,
  }

  return (
    <CaseWorkResponse
      controls={(
        <>
          {priceQuestionOpen ? (
            <View style={styles.reason} testID="customer-v21-agentic-price-question">
              <Text style={[styles.reasonTitle, { color: tokens.text }]}>
                {language === 'vi' ? 'Cách Kael trả lời về giá' : 'How Kael answers price questions'}
              </Text>
              <Text style={[styles.adjustmentHint, { color: tokens.muted }]}>
                {language === 'vi'
                  ? 'Biên nhận bên trên là căn cứ cho đề nghị hiện tại. Việc xem hoặc hỏi về giá không tạo báo giá mới và không thay đổi phạm vi. Nếu có dấu hiệu hoặc hạng mục mới, hãy dùng Điều chỉnh phạm vi để Kael phân tích lại.'
                  : 'The receipt above is the basis for the current offer. Viewing or asking about the price does not create a new quote or change the scope. Use Adjust scope when there is a new symptom or work item for Kael to analyze again.'}
              </Text>
            </View>
          ) : null}
          {adjustmentOpen ? (
            <View style={styles.reason} testID="customer-v21-agentic-adjustment">
              <Text style={[styles.reasonTitle, { color: tokens.text }]}>
                {language === 'vi' ? 'Thông tin bạn muốn bổ sung' : 'Information to add'}
              </Text>
              <Text style={[styles.adjustmentHint, { color: tokens.muted }]}>
                {language === 'vi'
                  ? 'Nêu dấu hiệu mới, phạm vi hoặc điểm Kael chưa hiểu đúng để Kael phân tích lại.'
                  : 'Add new symptoms, scope, or anything Kael misunderstood so it can analyze again.'}
              </Text>
              <KaelTextField
                multiline
                onChangeText={onAdjustmentChange}
                placeholder={language === 'vi' ? 'Bổ sung thông tin cho Kael' : 'Add information for Kael'}
                placeholderTextColor={tokens.subtleText}
                style={[textInputStyle, styles.adjustmentInput, { color: tokens.text }]}
                testID="customer-v21-agentic-adjustment-input"
                value={adjustmentText}
              />
              <KaelButton
                disabled={!canSubmitAdjustment}
                label={submittingAdjustment
                  ? (language === 'vi' ? 'Đang phân tích lại' : 'Analyzing again')
                  : (language === 'vi' ? 'Gửi Kael phân tích lại' : 'Send for re-analysis')}
                loading={submittingAdjustment}
                onPress={onSubmitAdjustment}
                size="small"
                testID="customer-v21-agentic-adjustment-send"
              />
            </View>
          ) : null}
          {rejected ? (
            <View style={styles.reason} testID="customer-v21-agentic-reject-reason">
              <Text style={[styles.reasonTitle, { color: tokens.text }]}>
                {language === 'vi' ? 'Lý do bạn từ chối' : 'Reason for declining'}
              </Text>
              <KaelTextField
                onChangeText={onReasonChange}
                placeholder={language === 'vi' ? 'Nêu ngắn lý do từ chối' : 'Briefly explain why'}
                placeholderTextColor={tokens.subtleText}
                style={[textInputStyle, { color: tokens.text }]}
                testID="customer-v21-agentic-reject-reason-input"
                value={rejectReason}
              />
              <KaelButton
                disabled={!canSubmitRejectReason}
                label={submittingRejectReason
                  ? (language === 'vi' ? 'Đang gửi' : 'Sending')
                  : (language === 'vi' ? 'Gửi lý do' : 'Send reason')}
                onPress={onSubmitRejectReason}
                size="small"
                testID="customer-v21-agentic-reject-reason-send"
              />
            </View>
          ) : null}
          {requiresSchedule && !confirmed ? (
            <AgenticScheduleGate
              language={language}
              onSubmitSchedule={onSubmitSchedule}
              textInputStyle={textInputStyle}
            />
          ) : null}
          <View style={styles.inquiryActions}>
            <KaelButton
              disabled={confirming || submittingAdjustment || submittingRejectReason}
              label={language === 'vi' ? 'Hỏi về giá' : 'Ask about price'}
              onPress={onAskPrice}
              size="small"
              style={styles.action}
              testID="customer-v21-agentic-estimate-ask-price"
              variant="secondary"
            />
            <KaelButton
              disabled={confirming || submittingAdjustment || submittingRejectReason}
              label={language === 'vi' ? 'Điều chỉnh phạm vi' : 'Adjust scope'}
              onPress={onAdjust}
              size="small"
              style={styles.action}
              testID="customer-v21-agentic-estimate-adjust-scope"
              variant="secondary"
            />
          </View>
          <View style={styles.actions}>
            <KaelButton
              disabled={confirming || submittingAdjustment || submittingRejectReason}
              label={rejectLabel}
              onPress={onReject}
              size="small"
              style={styles.action}
              testID="customer-v21-agentic-estimate-reject"
              variant="secondary"
            />
            <KaelButton
              accessibilityState={{ busy: confirming, disabled: !canConfirmWithPreconditions || confirming || submittingAdjustment || submittingRejectReason }}
              disabled={!canConfirmWithPreconditions || confirming || submittingAdjustment || submittingRejectReason}
              label={confirmLabel}
              onPress={onConfirm}
              size="small"
              style={styles.action}
              testID="customer-v21-agentic-estimate-confirm"
            />
          </View>
        </>
      )}
      details={(
        <View style={styles.details}>
          {supportingPhase ? (
            <AgenticPriceReasoningStream
              model={supportingPhase}
              reduceMotion={reduceMotion}
              tokens={tokens}
            />
          ) : null}
          {confirmationBlockedForPriceReasoning ? (
            <Text
              style={[styles.detail, { color: tokens.text }]}
              testID="customer-v21-agentic-estimate-price-reasoning-required"
            >
              {priceReasoningRequiredText}
            </Text>
          ) : null}
          {confirmationBlockedForSchedule ? (
            <Text
              style={[styles.detail, { color: tokens.text }]}
              testID="customer-v21-agentic-estimate-schedule-required"
            >
              {language === 'vi'
                ? 'Hãy chọn thời gian hẹn trước khi Kael mở bước tìm thợ.'
                : 'Choose a service time before Kael starts worker matching.'}
            </Text>
          ) : null}
          {needsMoreInfo ? (
            <Text style={[styles.detail, { color: tokens.text }]} testID="customer-v21-agentic-estimate-more-info">
              {moreInfoText}
            </Text>
          ) : advisory ? (
            <Text style={[styles.detail, { color: tokens.text }]} testID="customer-v21-agentic-estimate-advisory">
              {advisory}
            </Text>
          ) : null}
          {!supportingPhase ? (
            <Text style={[styles.meta, { color: tokens.muted }]} testID="customer-v21-agentic-estimate-price-explanation">
              {sourceExplanation}
            </Text>
          ) : null}
          <Text style={[styles.meta, { color: tokens.muted }]} testID="customer-v21-agentic-estimate-source-explanation">
            {disclaimer}
          </Text>
        </View>
      )}
      model={model}
      reduceMotion={reduceMotion}
      testID="customer-v21-agentic-estimate-response"
      titleStyle={styles.estimateServiceTitle}
      tokens={tokens}
    />
  )
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  inquiryActions: { flexDirection: 'row', gap: 10 },
  adjustmentHint: { ...typography.caption1 },
  adjustmentInput: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
  detail: { ...typography.subheadline },
  details: { gap: 7 },
  estimateServiceTitle: { ...typography.title2, fontWeight: '600' },
  meta: { ...typography.caption1 },
  reason: { gap: 10 },
  reasonTitle: { ...typography.subheadline, fontWeight: '600' },
})
