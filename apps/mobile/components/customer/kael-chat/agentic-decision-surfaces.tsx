import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import { CaseWorkResponse } from './case-work-response'
import type { CaseWorkResponseModel } from './case-work-response-model'
import type { AgenticEstimateSupportingPhaseModel } from './agentic-estimate-display-model'
import { useCustomerV21SurfaceTheme } from '../ui/shared-surfaces'

export function AgenticChatEstimateResponsePanel({
  advisory,
  canConfirm,
  canSubmitRejectReason,
  confirmed,
  confirming,
  confirmLabel,
  disclaimer,
  language,
  moreInfoText,
  needsMoreInfo,
  onConfirm,
  onReasonChange,
  onReject,
  onSubmitRejectReason,
  price,
  priceExplanation,
  problem,
  rejected,
  rejectLabel,
  rejectReason,
  serviceLabel,
  sourceExplanation,
  statusLabel,
  submittingRejectReason,
  supportingPhase,
  textInputStyle,
}: {
  advisory?: string
  canConfirm: boolean
  canSubmitRejectReason: boolean
  confirmed: boolean
  confirming: boolean
  confirmLabel: string
  disclaimer: string
  language: AppLanguage
  moreInfoText: string
  needsMoreInfo: boolean
  onConfirm: () => void
  onReasonChange: (value: string) => void
  onReject: () => void
  onSubmitRejectReason: () => void
  price: string
  priceExplanation: string
  problem: string
  rejected: boolean
  rejectLabel: string
  rejectReason: string
  serviceLabel: string
  sourceExplanation: string
  statusLabel: string
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
    title: `${serviceLabel}: ${problem}`,
  }

  return (
    <CaseWorkResponse
      controls={(
        <>
          {rejected ? (
            <View style={styles.reason} testID="customer-v21-agentic-reject-reason">
              <Text style={[styles.reasonTitle, { color: tokens.text }]}>
                {language === 'vi' ? 'Điều bạn muốn điều chỉnh' : 'What should be adjusted'}
              </Text>
              <KaelTextField
                onChangeText={onReasonChange}
                placeholder={language === 'vi' ? 'Mô tả ngắn điều cần đổi' : 'Briefly describe the change'}
                placeholderTextColor={tokens.subtleText}
                style={[textInputStyle, { color: tokens.text }]}
                testID="customer-v21-agentic-reject-reason-input"
                value={rejectReason}
              />
              <KaelButton
                disabled={!canSubmitRejectReason}
                label={submittingRejectReason
                  ? (language === 'vi' ? 'Đang gửi' : 'Sending')
                  : (language === 'vi' ? 'Gửi điều chỉnh' : 'Send changes')}
                onPress={onSubmitRejectReason}
                size="small"
                testID="customer-v21-agentic-reject-reason-send"
              />
            </View>
          ) : null}
          <View style={styles.actions}>
            <KaelButton
              disabled={confirming || submittingRejectReason}
              label={rejectLabel}
              onPress={onReject}
              size="small"
              style={styles.action}
              testID="customer-v21-agentic-estimate-reject"
              variant="secondary"
            />
            <KaelButton
              accessibilityState={{ busy: confirming, disabled: !canConfirm || confirming || submittingRejectReason }}
              disabled={!canConfirm || confirming || submittingRejectReason}
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
            <AgenticEstimateSupportingPhase
              model={supportingPhase}
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

function AgenticEstimateSupportingPhase({
  model,
  tokens,
}: {
  model: AgenticEstimateSupportingPhaseModel
  tokens: ReturnType<typeof useCustomerV21SurfaceTheme>['tokens']
}) {
  return (
    <View
      accessibilityLabel={`${model.title}. ${model.rows.map((row) => `${row.label}: ${row.detail}`).join('. ')}. ${model.valueStatement}`}
      style={[styles.support, { borderColor: tokens.border }]}
      testID="customer-v21-agentic-estimate-supporting-phase"
    >
      <Text accessibilityRole="header" style={[styles.supportTitle, { color: tokens.text }]}>
        {model.title}
      </Text>
      {model.rows.map((row) => (
        <View key={row.key} style={styles.supportRow} testID={`customer-v21-agentic-estimate-support-${row.key}`}>
          <Text style={[styles.supportLabel, { color: tokens.primary }]}>
            {row.label}
          </Text>
          <Text style={[styles.supportDetail, { color: tokens.text }]}>
            {row.detail}
          </Text>
        </View>
      ))}
      <Text style={[styles.supportValue, { color: tokens.muted }]}>
        {model.valueStatement}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  detail: { fontSize: 14, lineHeight: 21 },
  details: { gap: 7 },
  meta: { fontSize: 12, lineHeight: 18 },
  reason: { gap: 10 },
  reasonTitle: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  support: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
    paddingBottom: 17,
  },
  supportDetail: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },
  supportLabel: {
    flexBasis: 88,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 19,
  },
  supportRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  supportTitle: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  supportValue: {
    fontSize: 12.5,
    lineHeight: 19,
    marginTop: 1,
  },
})
