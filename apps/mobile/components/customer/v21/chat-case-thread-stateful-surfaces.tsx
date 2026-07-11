import type { ReactNode } from 'react'
import { Text, View, type StyleProp, type TextStyle } from 'react-native'

import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { LocalDeal } from '@nestscout/shared'

import type { CustomerThemeTokens } from '../customer-theme'
import {
  AgenticCaseAcceptedWorkerCardPanel,
  AgenticCaseEtaCardPanel,
  AgenticCaseJobProgressCardPanel,
  AgenticCaseMatchingCardPanel,
  AgenticCaseOptionsCardPanel,
} from './agentic-case-surfaces'
import { AgenticCaseQuoteDecisionCardPanel } from './agentic-decision-surfaces'
import { AgenticCasePaymentCardPanel, AgenticChatFact } from './agentic-surfaces'
import { CaseWideMintAura, CaseWorkActionButtonAura, CaseWorkCardAura, SourceCardSkin } from './aura-surfaces'
import { customerV21Assets } from './assets'
import { customerV21AgenticStyles as agenticStyles } from './agentic-styles'
import { buildAgenticCaseThreadStageCardModels, type AgenticCaseThreadStageCardModels } from './case-thread-display-model'
import type {
  AgenticCaseSignal as AgenticCaseThreadLiveSignalModel,
  AgenticCaseThreadApprovalModel,
  AgenticCaseThreadLiveNoticeCardModel,
  AgenticCaseThreadOverviewModel,
  AgenticCaseThreadQuoteDecisionModel,
  AgenticCaseThreadRecommendationModel,
} from './case-work-display-model'
import { buildAgenticCaseThreadModel } from './case-work-display-model'
import { CaseWorkDataSourceFooter, CaseWorkSourceChip } from './history-active-surfaces'
import { customerV21HistoryActiveStyles as historyActiveStyles } from './history-active-styles'
import { customerV21SharedStyles as sharedStyles } from './shared-styles'
import { AssetTile, V21Card } from './shared-surfaces'

export function AgenticCaseThreadPanel({
  activityLabel,
  caseEvidenceGateActive,
  caseEvidenceGateNode,
  completionReviewNode,
  caseOptionsAcknowledged,
  caseQuoteRejectOpen,
  caseQuoteRejectReason,
  confirmingCaseQuote,
  deal,
  editing,
  language,
  onAcknowledgeOptions,
  onApproveScopeChange,
  onApproveQuote,
  onOpenActivity,
  onQuoteRejectReasonChange,
  onQuoteRejectReasonSubmit,
  onRejectScopeChange,
  onRejectQuote,
  onRequestEdit,
  renderJobProgressBar,
  sourceFooterLabel,
  submittingCaseEvidence,
  submittingCaseQuoteRejectReason,
  textInputStyle,
  tokens,
}: {
  activityLabel: string
  caseEvidenceGateActive: boolean
  caseEvidenceGateNode: ReactNode
  completionReviewNode: ReactNode
  caseOptionsAcknowledged: boolean
  caseQuoteRejectOpen: boolean
  caseQuoteRejectReason: string
  confirmingCaseQuote: boolean
  deal: LocalDeal
  editing: boolean
  language: AppLanguage
  onAcknowledgeOptions: () => void
  onApproveScopeChange: (id: string) => void
  onApproveQuote: () => void
  onOpenActivity: () => void
  onQuoteRejectReasonChange: (value: string) => void
  onQuoteRejectReasonSubmit: () => void
  onRejectScopeChange: (id: string) => void
  onRejectQuote: () => void
  onRequestEdit: () => void
  renderJobProgressBar: (active: boolean, progress: number) => ReactNode
  sourceFooterLabel: string
  submittingCaseEvidence: boolean
  submittingCaseQuoteRejectReason: boolean
  textInputStyle: StyleProp<TextStyle>
  tokens: CustomerThemeTokens
}) {
  const threadModel = buildAgenticCaseThreadModel({
    caseEvidenceGateActive,
    caseOptionsAcknowledged,
    deal,
    editing,
    language,
    sourceFooterLabel,
    submittingCaseEvidence,
  })
  const stageCards = buildAgenticCaseThreadStageCardModels(deal, language, threadModel)
  const jobProgressBar = stageCards.jobProgress
    ? renderJobProgressBar(stageCards.jobProgress.started, stageCards.jobProgress.progress)
    : null
  return (
    <AgenticCaseThreadView
      activityLabel={activityLabel}
      approval={threadModel.approval}
      caseEvidenceGateNode={caseEvidenceGateActive ? caseEvidenceGateNode : null}
      completionReviewNode={completionReviewNode}
      caseStageNodes={(
        <AgenticCaseThreadStageNodes
          cards={stageCards}
          confirmingQuote={confirmingCaseQuote}
          jobProgressBar={jobProgressBar}
          language={language}
          onAcknowledgeOptions={onAcknowledgeOptions}
          onApproveQuote={onApproveQuote}
          onQuoteRejectReasonChange={onQuoteRejectReasonChange}
          onQuoteRejectReasonSubmit={onQuoteRejectReasonSubmit}
          onRejectQuote={onRejectQuote}
          quoteRejectOpen={caseQuoteRejectOpen}
          quoteRejectReason={caseQuoteRejectReason}
          submittingQuoteRejectReason={submittingCaseQuoteRejectReason}
          textInputStyle={textInputStyle}
          tokens={tokens}
        />
      )}
      language={language}
      liveSignal={threadModel.liveSignal}
      onApproveScopeChange={onApproveScopeChange}
      onOpenActivity={onOpenActivity}
      onRejectScopeChange={onRejectScopeChange}
      onRequestEdit={onRequestEdit}
      overview={threadModel.overview}
      recommendation={threadModel.recommendation}
      tokens={tokens}
    />
  )
}

export function AgenticCaseThreadView({
  activityLabel,
  approval,
  caseEvidenceGateNode,
  completionReviewNode,
  caseStageNodes,
  language,
  liveSignal,
  onApproveScopeChange,
  onOpenActivity,
  onRejectScopeChange,
  onRequestEdit,
  overview,
  recommendation,
  tokens,
}: {
  activityLabel: string
  approval: AgenticCaseThreadApprovalModel | null
  caseEvidenceGateNode: ReactNode
  completionReviewNode: ReactNode
  caseStageNodes: ReactNode
  language: AppLanguage
  liveSignal: AgenticCaseThreadLiveSignalModel | null
  onApproveScopeChange: (id: string) => void
  onOpenActivity: () => void
  onRejectScopeChange: (id: string) => void
  onRequestEdit: () => void
  overview: AgenticCaseThreadOverviewModel
  recommendation: AgenticCaseThreadRecommendationModel | null
  tokens: CustomerThemeTokens
}) {
  return (
    <>
      <V21Card
        style={[agenticStyles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
        testID="customer-v21-case-overview"
      >
        <SourceCardSkin />
        <CaseWideMintAura scope="CaseThreadOverview" />
        <View style={agenticStyles.agenticChatHeader}>
          <AssetTile image={customerV21Assets.request} label={overview.service} size={44} sourceAura style={agenticStyles.agenticChatIcon} />
          <View style={sharedStyles.flex}>
            <Text numberOfLines={2} style={[agenticStyles.agenticChatTitle, { color: tokens.text }]}>
              {language === 'vi' ? 'Kael đang điều hành công việc' : 'Kael is running the work'}
            </Text>
            <Text numberOfLines={2} style={[agenticStyles.agenticChatBody, { color: tokens.muted }]}>
              {`${overview.service} · ${overview.problem}`}
            </Text>
            <Text numberOfLines={1} style={[agenticStyles.agenticChatNote, { color: tokens.muted }]}>
              {overview.address}
            </Text>
          </View>
          <CaseWorkSourceChip label={overview.codeLabel} scope="CaseThreadCode" />
        </View>
        <View style={agenticStyles.agenticChatFactGrid}>
          <AgenticChatFact label={language === 'vi' ? 'Khung giờ' : 'Time'} value={overview.timeWindow} />
          <AgenticChatFact label={language === 'vi' ? 'Bằng chứng' : 'Evidence'} value={overview.evidenceLabel} />
        </View>
        <View style={agenticStyles.agenticChatFactGrid}>
          <AgenticChatFact label={language === 'vi' ? 'Ước tính' : 'Estimate'} value={overview.estimateLabel} />
          <AgenticChatFact label={language === 'vi' ? 'Độ tin cậy' : 'Confidence'} value={overview.confidenceLabel} />
        </View>
      </V21Card>

      {caseEvidenceGateNode}
      {caseStageNodes}
      {completionReviewNode}

      {liveSignal ? (
        <V21Card
          style={[agenticStyles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
          testID="customer-v21-case-work-live-signal"
        >
          <SourceCardSkin />
          <CaseWideMintAura scope="CaseThreadLiveSignal" testID="customer-v21-case-work-live-signal-mint-aura" />
          <View style={agenticStyles.agenticChatHeader}>
            <AssetTile image={liveSignal.image} label={liveSignal.title} size={42} sourceAura style={agenticStyles.agenticChatIcon} />
            <View style={sharedStyles.flex}>
              <Text numberOfLines={1} style={[agenticStyles.agenticChatTitle, { color: tokens.text }]}>{liveSignal.title}</Text>
              <Text numberOfLines={2} style={[agenticStyles.agenticChatBody, { color: tokens.muted }]}>{liveSignal.body}</Text>
            </View>
            <CaseWorkSourceChip label={liveSignal.chip} scope="CaseThreadLiveSignalStatus" />
          </View>
        </V21Card>
      ) : null}

      {approval ? (
        <V21Card style={historyActiveStyles.caseRecommendationCard} testID="customer-v21-case-work-approval-card">
          <SourceCardSkin />
          <CaseWorkCardAura scope="CaseThreadApproval" testID="customer-v21-case-work-approval-mint-aura" />
          <View style={sharedStyles.cardHeaderRow}>
            <AssetTile image={customerV21Assets.request} label="Kael" size={42} style={sharedStyles.infoNoticeIcon} />
            <View style={sharedStyles.flex}>
              <Text style={[sharedStyles.cardTitle, { color: tokens.text }]}>
                {language === 'vi' ? 'Kael cần bạn chốt' : 'Kael needs your decision'}
              </Text>
              <Text numberOfLines={2} style={[sharedStyles.bodyText, { color: tokens.muted }]}>
                {approval.requestedDescription}
              </Text>
            </View>
            <CaseWorkSourceChip label={approval.amountLabel} scope="CaseThreadApprovalAmount" />
          </View>
          <View style={agenticStyles.agenticChatFactGrid}>
            <AgenticChatFact label={language === 'vi' ? 'Lý do' : 'Reason'} value={approval.reason} />
            <AgenticChatFact label={language === 'vi' ? 'Kael đánh giá' : 'Kael review'} value={approval.confidenceLabel} />
          </View>
          <View style={agenticStyles.agenticChatActions}>
            <KaelButton
              backgroundLayer={<CaseWorkActionButtonAura scope="CaseScopeReject" />}
              label={language === 'vi' ? 'Từ chối' : 'Decline'}
              onPress={() => onRejectScopeChange(approval.id)}
              size="small"
              style={agenticStyles.agenticChatActionButton}
              testID="customer-v21-case-work-scope-reject"
              variant="secondary"
            />
            <KaelButton
              label={approval.approveLabel}
              onPress={() => onApproveScopeChange(approval.id)}
              size="small"
              style={agenticStyles.agenticChatActionButton}
              testID="customer-v21-case-work-scope-approve"
            />
          </View>
        </V21Card>
      ) : null}

      {recommendation ? (
        <V21Card style={historyActiveStyles.caseRecommendationCard} testID="customer-v21-case-work-recommendation">
          <SourceCardSkin />
          <CaseWorkCardAura scope="Recommendation" testID="customer-v21-case-work-recommendation-mint-aura" />
          <View style={sharedStyles.cardHeaderRow}>
            <AssetTile image={customerV21Assets.kael} label="Kael" size={42} style={sharedStyles.infoNoticeIcon} />
            <View style={sharedStyles.flex}>
              <Text style={[sharedStyles.cardTitle, { color: tokens.text }]}>
                {language === 'vi' ? 'Đề xuất tiếp theo' : 'Next recommendation'}
              </Text>
              <Text numberOfLines={3} style={[sharedStyles.bodyText, { color: tokens.muted }]}>{recommendation.recommendation}</Text>
            </View>
            <CaseWorkSourceChip label={recommendation.actionStatus} scope="CaseThreadDecision" />
          </View>
          <View style={historyActiveStyles.caseWorkLockedActions}>
            <KaelButton backgroundLayer={<CaseWorkActionButtonAura scope="EditReal" />} label={recommendation.requestEditLabel} onPress={onRequestEdit} size="small" style={historyActiveStyles.caseWorkLockedActionButton} testID="customer-v21-case-work-request-edit" variant="secondary" />
            <KaelButton label={activityLabel} onPress={onOpenActivity} size="small" style={historyActiveStyles.caseWorkLockedActionButton} testID="customer-v21-case-open-activity" variant="secondary" />
          </View>
          <CaseWorkDataSourceFooter label={recommendation.dataSourceFooterLabel} testID="customer-v21-case-work-source-footer" />
        </V21Card>
      ) : null}
    </>
  )
}

export function AgenticCaseThreadStageNodes({
  cards,
  confirmingQuote,
  jobProgressBar,
  language,
  onAcknowledgeOptions,
  onApproveQuote,
  onQuoteRejectReasonChange,
  onQuoteRejectReasonSubmit,
  onRejectQuote,
  quoteRejectOpen,
  quoteRejectReason,
  submittingQuoteRejectReason,
  textInputStyle,
  tokens,
}: {
  cards: AgenticCaseThreadStageCardModels
  confirmingQuote: boolean
  jobProgressBar: ReactNode
  language: AppLanguage
  onAcknowledgeOptions: () => void
  onApproveQuote: () => void
  onQuoteRejectReasonChange: (value: string) => void
  onQuoteRejectReasonSubmit: () => void
  onRejectQuote: () => void
  quoteRejectOpen: boolean
  quoteRejectReason: string
  submittingQuoteRejectReason: boolean
  textInputStyle: StyleProp<TextStyle>
  tokens: CustomerThemeTokens
}) {
  return (
    <>
      {cards.matching ? <AgenticCaseMatchingCardPanel {...cards.matching} /> : null}
      {cards.options ? <AgenticCaseOptionsCardPanel {...cards.options} onContinue={onAcknowledgeOptions} /> : null}
      {cards.quoteDecision ? (
        <AgenticCaseQuoteDecisionNode
          confirming={confirmingQuote}
          model={cards.quoteDecision}
          onConfirm={onApproveQuote}
          onReasonChange={onQuoteRejectReasonChange}
          onReject={onRejectQuote}
          onSubmitReason={onQuoteRejectReasonSubmit}
          rejectOpen={quoteRejectOpen}
          rejectReason={quoteRejectReason}
          submittingReason={submittingQuoteRejectReason}
          textInputStyle={textInputStyle}
        />
      ) : null}
      {cards.payment ? <AgenticCasePaymentCardPanel {...cards.payment} /> : null}
      {cards.eta ? <AgenticCaseEtaCardPanel {...cards.eta} /> : null}
      {cards.liveNotice ? <AgenticCaseLiveNoticeCardPanel {...cards.liveNotice} language={language} tokens={tokens} /> : null}
      {cards.acceptedWorker ? <AgenticCaseAcceptedWorkerCardPanel {...cards.acceptedWorker} /> : null}
      {cards.jobProgress ? (
        <AgenticCaseJobProgressCardPanel
          {...cards.jobProgress}
          progressBar={jobProgressBar}
        />
      ) : null}
    </>
  )
}

export function AgenticCaseQuoteDecisionNode({
  confirming,
  model,
  onConfirm,
  onReasonChange,
  onReject,
  onSubmitReason,
  rejectOpen,
  rejectReason,
  submittingReason,
  textInputStyle,
}: {
  confirming: boolean
  model: AgenticCaseThreadQuoteDecisionModel
  onConfirm: () => void
  onReasonChange: (value: string) => void
  onReject: () => void
  onSubmitReason: () => void
  rejectOpen: boolean
  rejectReason: string
  submittingReason: boolean
  textInputStyle: StyleProp<TextStyle>
}) {
  return (
    <AgenticCaseQuoteDecisionCardPanel
      advisory={model.advisory}
      canSubmitReason={rejectReason.trim().length > 0 && !submittingReason && !confirming}
      confidence={model.confidence}
      confirming={confirming}
      evidence={model.evidence}
      onConfirm={onConfirm}
      onReasonChange={onReasonChange}
      onReject={onReject}
      onSubmitReason={onSubmitReason}
      price={model.price}
      problem={model.problem}
      rejectOpen={rejectOpen}
      rejectReason={rejectReason}
      service={model.service}
      submittingReason={submittingReason}
      textInputStyle={textInputStyle}
    />
  )
}

export function AgenticCaseLiveNoticeCardPanel({
  address,
  codeStatus,
  eta,
  language,
  status,
  tokens,
  workerName,
}: AgenticCaseThreadLiveNoticeCardModel & {
  language: AppLanguage
  tokens: CustomerThemeTokens
}) {
  return (
    <V21Card
      style={[agenticStyles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-case-live-alert-card"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="CaseLiveNoticeChat" testID="customer-v21-case-live-alert-card-mint-aura" />
      <View style={agenticStyles.agenticChatHeader}>
        <AssetTile
          image={customerV21Assets.map}
          label={language === 'vi' ? 'Th\u1ee3 \u0111ang t\u1edbi' : 'Worker on the way'}
          size={44}
          sourceAura
          style={agenticStyles.agenticChatIcon}
        />
        <View style={sharedStyles.flex}>
          <Text numberOfLines={2} style={[agenticStyles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael \u0111ang canh th\u1eddi \u0111i\u1ec3m th\u1ee3 \u0111\u1ebfn' : 'Kael is tracking the worker arrival'}
          </Text>
          <Text numberOfLines={2} style={[agenticStyles.agenticChatBody, { color: tokens.muted }]}>
            {workerName}
          </Text>
        </View>
        <CaseWorkSourceChip label={eta} scope="CaseLiveNoticeEta" />
      </View>
      <View style={agenticStyles.agenticChatFactGrid}>
        <AgenticChatFact label={language === 'vi' ? 'L\u1ed1i v\u00e0o' : 'Entry'} value={address} />
        <AgenticChatFact label={language === 'vi' ? 'M\u00e3 \u0111\u1ebfn n\u01a1i' : 'Arrival code'} value={codeStatus} />
        <AgenticChatFact label={language === 'vi' ? 'Tr\u1ea1ng th\u00e1i' : 'Status'} value={status} />
      </View>
      <Text numberOfLines={2} style={[agenticStyles.agenticChatNote, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'M\u00e3 ch\u1ec9 m\u1edf khi h\u1ec7 th\u1ed1ng x\u00e1c minh th\u1ee3 \u0111\u1ebfn n\u01a1i th\u1eadt.'
          : 'The code opens only after the system verifies a real arrival.'}
      </Text>
    </V21Card>
  )
}
