import type { StyleProp, TextStyle } from 'react-native'
import { Text, View } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { useAppLanguage } from '@/lib/app-language'

import { CaseWideMintAura, CaseWorkActionButtonAura, SourceCardSkin, ZipMintAura } from './aura-surfaces'
import { customerV21Assets } from './assets'
import { customerV21AgenticStyles as styles } from './agentic-styles'
import { AgenticChatFact } from './agentic-surfaces'
import { CaseWorkSourceChip } from './history-active-surfaces'
import { AssetTile, useCustomerV21SurfaceTheme, V21Card } from './shared-surfaces'
import { customerV21SharedStyles as sharedStyles } from './shared-styles'

export function AgenticChatEstimateCardPanel({
  advisory,
  canConfirm,
  canSubmitRejectReason,
  confidencePercent,
  confirmed,
  confirming,
  confirmLabel,
  disclaimer,
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
  textInputStyle,
}: {
  advisory?: string
  canConfirm: boolean
  canSubmitRejectReason: boolean
  confidencePercent: number
  confirmed: boolean
  confirming: boolean
  confirmLabel: string
  disclaimer: string
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
  textInputStyle: StyleProp<TextStyle>
}) {
  const language = useAppLanguage()
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <V21Card
      style={[styles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-agentic-estimate-card"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="ChatEstimate" testID="customer-v21-agentic-estimate-mint-aura" />
      <View style={styles.agenticChatHeader}>
        <AssetTile image={customerV21Assets.request} label={serviceLabel} size={44} sourceAura style={styles.agenticChatIcon} />
        <View style={sharedStyles.flex}>
          <Text numberOfLines={2} style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael đề xuất bước tiếp theo' : 'Kael suggests the next step'}
          </Text>
          <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {problem}
          </Text>
        </View>
        <CaseWorkSourceChip label={statusLabel} scope="ChatEstimateStatus" testID="customer-v21-agentic-estimate-status" />
      </View>
      <View style={styles.agenticChatFactGrid}>
        <AgenticChatFact label={language === 'vi' ? 'Dịch vụ' : 'Service'} value={serviceLabel} />
        <AgenticChatFact label={language === 'vi' ? 'Ước tính' : 'Estimate'} value={price} />
        <AgenticChatFact label={language === 'vi' ? 'Độ tin cậy' : 'Confidence'} value={`${confidencePercent}%`} />
      </View>
      <Text numberOfLines={4} style={[styles.agenticChatBody, { color: tokens.text }]} testID="customer-v21-agentic-estimate-price-explanation">
        {priceExplanation}
      </Text>
      <Text numberOfLines={3} style={[styles.agenticChatNote, { color: tokens.muted }]} testID="customer-v21-agentic-estimate-source-explanation">
        {sourceExplanation}
      </Text>
      {needsMoreInfo ? (
        <View style={[styles.agenticMoreInfoCard, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]} testID="customer-v21-agentic-estimate-more-info">
          <ZipMintAura scope="ChatEstimateMoreInfo" />
          <Text style={[styles.agenticChatBody, { color: tokens.text }]}>{moreInfoText}</Text>
        </View>
      ) : advisory ? (
        <Text numberOfLines={3} style={[styles.agenticChatBody, { color: tokens.text }]} testID="customer-v21-agentic-estimate-advisory">
          {advisory}
        </Text>
      ) : null}
      <Text numberOfLines={2} style={[styles.agenticChatNote, { color: tokens.muted }]} testID="customer-v21-agentic-estimate-disclaimer">
        {disclaimer}
      </Text>
      {rejected ? (
        <View
          style={[styles.agenticRejectReasonCard, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]}
          testID="customer-v21-agentic-reject-reason"
        >
          <SourceCardSkin />
          <CaseWideMintAura scope="ChatRejectReason" />
          <Text style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael sẽ chỉnh lại' : 'Kael will adjust'}
          </Text>
          <Text style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {language === 'vi' ? 'Nhắn lý do hoặc điều bạn muốn đổi.' : 'Send the reason or what you want changed.'}
          </Text>
          <KaelTextField
            inputShellStyle={styles.agenticEvidenceReasonInputShell}
            onChangeText={onReasonChange}
            placeholder={language === 'vi' ? 'Lý do ngắn' : 'Short reason'}
            placeholderTextColor={tokens.subtleText}
            shellStyle={styles.agenticEvidenceReasonInput}
            style={[textInputStyle, { color: tokens.text }]}
            testID="customer-v21-agentic-reject-reason-input"
            value={rejectReason}
          />
          <KaelButton
            accessibilityState={{ busy: submittingRejectReason, disabled: !canSubmitRejectReason }}
            disabled={!canSubmitRejectReason}
            label={submittingRejectReason ? (language === 'vi' ? 'Đang gửi' : 'Sending') : (language === 'vi' ? 'Gửi cho Kael' : 'Send to Kael')}
            onPress={onSubmitRejectReason}
            size="small"
            style={styles.agenticChatActionButton}
            testID="customer-v21-agentic-reject-reason-send"
          />
        </View>
      ) : null}
      <View style={styles.agenticChatActions}>
        <KaelButton
          backgroundLayer={<CaseWorkActionButtonAura scope="ChatReject" />}
          disabled={confirmed || confirming}
          label={rejectLabel}
          onPress={onReject}
          size="small"
          style={styles.agenticChatActionButton}
          testID="customer-v21-agentic-estimate-reject"
          variant="secondary"
        />
        <KaelButton
          accessibilityState={{ busy: confirming, disabled: !canConfirm || confirming || confirmed || submittingRejectReason }}
          disabled={!canConfirm || confirming || confirmed || submittingRejectReason}
          label={confirmLabel}
          onPress={onConfirm}
          size="small"
          style={styles.agenticChatActionButton}
          testID="customer-v21-agentic-estimate-confirm"
        />
      </View>
    </V21Card>
  )
}

export function AgenticCaseQuoteDecisionCardPanel({
  advisory,
  canSubmitReason,
  confidence,
  confirming,
  evidence,
  onConfirm,
  onReasonChange,
  onReject,
  onSubmitReason,
  price,
  problem,
  rejectOpen,
  rejectReason,
  service,
  submittingReason,
  textInputStyle,
}: {
  advisory?: string
  canSubmitReason: boolean
  confidence: string
  confirming: boolean
  evidence: string
  onConfirm: () => void
  onReasonChange: (value: string) => void
  onReject: () => void
  onSubmitReason: () => void
  price: string
  problem: string
  rejectOpen: boolean
  rejectReason: string
  service: string
  submittingReason: boolean
  textInputStyle: StyleProp<TextStyle>
}) {
  const language = useAppLanguage()
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <V21Card
      style={[styles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-case-quote-decision-card"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="CaseQuoteDecision" testID="customer-v21-case-quote-decision-mint-aura" />
      <View style={styles.agenticChatHeader}>
        <AssetTile image={customerV21Assets.request} label={service} size={44} sourceAura style={styles.agenticChatIcon} />
        <View style={sharedStyles.flex}>
          <Text numberOfLines={2} style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael cần bạn xác nhận' : 'Kael needs your confirmation'}
          </Text>
          <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>{problem}</Text>
        </View>
        <CaseWorkSourceChip label={language === 'vi' ? 'Cần chốt' : 'Needs decision'} scope="CaseQuoteDecisionStatus" />
      </View>

      <View style={styles.agenticChatFactGrid}>
        <AgenticChatFact label={language === 'vi' ? 'Ước tính' : 'Estimate'} value={price} />
        <AgenticChatFact label={language === 'vi' ? 'Bằng chứng' : 'Evidence'} value={evidence} />
        <AgenticChatFact label={language === 'vi' ? 'Độ tin cậy' : 'Confidence'} value={confidence} />
      </View>

      {advisory ? (
        <Text numberOfLines={3} style={[styles.agenticChatBody, { color: tokens.text }]} testID="customer-v21-case-quote-advisory">
          {advisory}
        </Text>
      ) : null}

      {rejectOpen ? (
        <View
          style={[styles.agenticRejectReasonCard, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]}
          testID="customer-v21-case-quote-reject-reason"
        >
          <SourceCardSkin />
          <CaseWideMintAura scope="CaseQuoteRejectReason" />
          <Text style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael sẽ hỏi thêm' : 'Kael will clarify'}
          </Text>
          <Text style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {language === 'vi' ? 'Ghi lý do ngắn để Kael điều chỉnh trước khi chạy bước tiếp theo.' : 'Write a short reason so Kael can adjust before the next step.'}
          </Text>
          <KaelTextField
            inputShellStyle={styles.agenticEvidenceReasonInputShell}
            onChangeText={onReasonChange}
            placeholder={language === 'vi' ? 'Lý do ngắn' : 'Short reason'}
            placeholderTextColor={tokens.subtleText}
            shellStyle={styles.agenticEvidenceReasonInput}
            style={[textInputStyle, { color: tokens.text }]}
            testID="customer-v21-case-quote-reject-input"
            value={rejectReason}
          />
          <KaelButton
            accessibilityState={{ busy: submittingReason, disabled: !canSubmitReason }}
            disabled={!canSubmitReason}
            label={submittingReason ? (language === 'vi' ? 'Đang gửi' : 'Sending') : (language === 'vi' ? 'Gửi cho Kael' : 'Send to Kael')}
            onPress={onSubmitReason}
            size="small"
            style={styles.agenticChatActionButton}
            testID="customer-v21-case-quote-reject-send"
          />
        </View>
      ) : null}

      <View style={styles.agenticChatActions}>
        <KaelButton
          backgroundLayer={<CaseWorkActionButtonAura scope="CaseQuoteReject" />}
          disabled={confirming}
          label={language === 'vi' ? 'Từ chối' : 'Decline'}
          onPress={onReject}
          size="small"
          style={styles.agenticChatActionButton}
          testID="customer-v21-case-quote-reject"
          variant="secondary"
        />
        <KaelButton
          accessibilityState={{ busy: confirming, disabled: confirming || submittingReason }}
          disabled={confirming || submittingReason}
          label={confirming ? (language === 'vi' ? 'Đang xác nhận' : 'Confirming') : (language === 'vi' ? 'Xác nhận' : 'Confirm')}
          onPress={onConfirm}
          size="small"
          style={styles.agenticChatActionButton}
          testID="customer-v21-case-quote-confirm"
        />
      </View>
    </V21Card>
  )
}
