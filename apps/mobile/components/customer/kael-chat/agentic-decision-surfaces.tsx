import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import { CaseWorkResponse } from './case-work-response'
import type { CaseWorkResponseModel } from './case-work-response-model'
import type { AgenticEstimateSupportingPhaseModel } from './agentic-estimate-display-model'
import { AgenticPriceReasoningStream } from './agentic-price-reasoning-stream'
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
  onAdjust,
  onAdjustmentChange,
  onConfirm,
  onReasonChange,
  onReject,
  onSubmitAdjustment,
  onSubmitRejectReason,
  price,
  priceExplanation,
  rejected,
  rejectLabel,
  rejectReason,
  serviceLabel,
  sourceExplanation,
  statusLabel,
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
  onAdjust: () => void
  onAdjustmentChange: (value: string) => void
  onConfirm: () => void
  onReasonChange: (value: string) => void
  onReject: () => void
  onSubmitAdjustment: () => void
  onSubmitRejectReason: () => void
  price: string
  priceExplanation: string
  rejected: boolean
  rejectLabel: string
  rejectReason: string
  serviceLabel: string
  sourceExplanation: string
  statusLabel: string
  submittingAdjustment: boolean
  submittingRejectReason: boolean
  supportingPhase: AgenticEstimateSupportingPhaseModel | null
  textInputStyle: StyleProp<TextStyle>
}) {
  const { reduceMotion, tokens } = useCustomerV21SurfaceTheme()
  const model: CaseWorkResponseModel = {
    actionKind: 'offer',
    noteCopy: `${price}\n${priceExplanation}`,
    noteTitle: language === 'vi' ? 'Phạm vi và ước tính' : 'Scope and estimate',
    phase: 'ticket_review',
    status: statusLabel,
    title: serviceLabel,
  }

  return (
    <CaseWorkResponse
      controls={(
        <>
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
              disabled={confirming || submittingAdjustment || submittingRejectReason}
              label={language === 'vi' ? 'Điều chỉnh' : 'Adjust'}
              onPress={onAdjust}
              size="small"
              style={styles.action}
              testID="customer-v21-agentic-estimate-adjust"
              variant="secondary"
            />
            <KaelButton
              accessibilityState={{ busy: confirming, disabled: !canConfirm || confirming || submittingAdjustment || submittingRejectReason }}
              disabled={!canConfirm || confirming || submittingAdjustment || submittingRejectReason}
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
      tokens={tokens}
    />
  )
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  adjustmentHint: { fontSize: 12, lineHeight: 18 },
  adjustmentInput: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
  detail: { fontSize: 14, lineHeight: 21 },
  details: { gap: 7 },
  meta: { fontSize: 12, lineHeight: 18 },
  reason: { gap: 10 },
  reasonTitle: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
})
