import { AgenticEvidenceGateCard } from '../kael-chat/agentic-evidence-gate-card'
import { MediaDraftPreviewTray } from '../kael-chat/media-draft-preview-tray'
import { OnDeviceVoiceTranscript } from '../kael-chat/on-device-voice-transcript'
import { QuoteReadinessReviewCard } from '../kael-chat/quote-readiness-review-card'
import {
  agenticEstimatePriceExplanation,
  agenticEstimateProblemLabel,
  agenticEstimateSourceExplanation,
  formatPriceRange,
} from './agentic-estimate-display-model'
import {
  AgenticChatEstimateCard,
  ChatEvidenceStrip,
  KaelChatSurfaceView,
} from './chat-stateful-surfaces'
import { customerV21KaelChatRootStyles as rootStyles } from './chat-styles'
import { ChatBubble } from './chat-surfaces'
import { formatKnownCount } from './case-stage-display-model'
import { CustomerKaelCaseThreadNode } from './customer-kael-case-thread-node'
import { CustomerWorkerCandidateNode } from './customer-worker-candidate-node'
import { CustomerKaelSessionMenu } from './kael-session-menu'
import { KaelProcessLines } from './kael-process-line-view'
import {
  customerV21HiddenScrollbar,
  customerV21WebTextInputNoOutline,
} from './platform-styles'
import type { useCustomerKaelSurfaceController } from './use-customer-kael-surface-controller'

type Controller = ReturnType<typeof useCustomerKaelSurfaceController>

export function CustomerKaelChatContent({ controller }: { controller: Controller }) {
  const {
    caseHydration,
    chatUi,
    conversation,
    conversations,
    copy,
    deal,
    decisionActions,
    evidenceActions,
    language,
    messageActions,
    mode,
    modeMenu,
    presentation,
    processController,
    reduceMotion,
    reduceTransparency,
    router,
    sessionCatalog,
    timelineHeadline,
    tokens,
    visibleError,
  } = controller
  const composerBusy = conversation.loading || chatUi.uploadingMedia || conversations.busy
  const canUseComposerMedia = mode === 'normal' ||
    (mode === 'case' && !deal) ||
    presentation.caseEvidenceGateActive ||
    presentation.workIntakeActive
  const composerPlaceholder = mode === 'normal'
    ? (language === 'vi' ? 'Nhập tin nhắn cho Kael...' : 'Message Kael...')
    : deal
      ? (language === 'vi'
          ? 'Trao đổi với Kael về công việc này...'
          : 'Ask Kael about this service...')
      : (language === 'vi'
          ? 'Mô tả nhu cầu dịch vụ cho Kael...'
          : 'Describe the service you need...')
  const hasCurrentConversation = mode === 'normal'
    ? Boolean(
        processController.processLines ||
        conversation.chat ||
        conversation.turns.length > 0 ||
        presentation.normalAssistantTurns.length > 0 ||
        conversation.composerMediaDrafts.length > 0 ||
        chatUi.voiceTranscript.trim()
      )
    : Boolean(
        processController.processLines ||
        conversation.chat ||
        conversation.turns.length > 0 ||
        deal ||
        caseHydration.hydrating ||
        presentation.showPendingDraftBubble ||
        presentation.caseAssistantTurns.length > 0 ||
        conversation.composerMediaDrafts.length > 0 ||
        chatUi.voiceTranscript.trim()
      )
  const showEmptyHero = !hasCurrentConversation && !conversation.loading && !conversations.busy
  const onOpenActivity = () => {
    router.replace('/(customer)/history' as never)
  }

  return (
    <KaelChatSurfaceView
      agenticEstimateNode={presentation.offerReviewActive &&
        presentation.chatEstimate &&
        !processController.processLines &&
        !chatUi.submittingAgenticRejectReason &&
        !chatUi.confirmingAgenticEstimate ? (
          <AgenticChatEstimateCard
            canConfirm={presentation.canConfirmAgenticEstimate}
            confirming={chatUi.confirmingAgenticEstimate}
            confirmed={presentation.agenticEstimateConfirmed}
            estimate={presentation.chatEstimate}
            formatPriceRange={formatPriceRange}
            language={language}
            onConfirm={decisionActions.confirmAgenticEstimate}
            onReject={() => {
              chatUi.setAgenticRejectOpen(true)
              conversation.setError(null)
            }}
            onReasonChange={chatUi.setAgenticRejectReason}
            onSubmitRejectReason={() => void decisionActions.submitAgenticRejectReason()}
            priceExplanationForEstimate={agenticEstimatePriceExplanation}
            problemLabelForEstimate={agenticEstimateProblemLabel}
            rejected={chatUi.agenticRejectOpen}
            rejectReason={chatUi.agenticRejectReason}
            sourceExplanationForLanguage={agenticEstimateSourceExplanation}
            submittingRejectReason={chatUi.submittingAgenticRejectReason}
            textInputStyle={[rootStyles.composerInput, customerV21WebTextInputNoOutline]}
          />
        ) : null}
      analysisEvidenceNode={presentation.agenticEvidenceGateActive ? (
        <AgenticEvidenceGateCard
          allowSkip={false}
          busy={conversation.loading ||
            chatUi.uploadingMedia ||
            chatUi.submittingAgenticEvidence ||
            !conversation.chat?.session.id}
          language={language}
          mediaDrafts={conversation.composerMediaDrafts}
          onAddMedia={evidenceActions.pickComposerMedia}
          onConfirm={() => void evidenceActions.submitAgenticEvidence('confirmed')}
          onReasonChange={chatUi.setAgenticEvidenceReason}
          onRemoveMedia={(index) => conversation.setComposerMediaDrafts((current) =>
            current.filter((_, currentIndex) => currentIndex !== index))}
          onReject={() => {
            chatUi.setAgenticEvidenceRejectOpen(true)
            conversation.setError(null)
          }}
          onSkip={() => void evidenceActions.submitAgenticEvidence('skipped')}
          onVoiceTranscriptChange={chatUi.setVoiceTranscript}
          prompt={presentation.serverEvidencePrompt}
          rejectOpen={chatUi.agenticEvidenceRejectOpen}
          rejectReason={chatUi.agenticEvidenceReason}
          requiredEvidenceKind={presentation.serverEvidenceKind}
          textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
          tokens={tokens}
          voiceTranscript={chatUi.voiceTranscript}
        />
      ) : presentation.serverPriceReviewBlocked ? (
        <QuoteReadinessReviewCard
          language={language}
          reason={typeof presentation.artifactNextAction?.reason === 'string'
            ? presentation.artifactNextAction.reason
            : undefined}
          safetyMessages={presentation.serverSafetyMessages}
          tokens={tokens}
        />
      ) : null}
      agenticVisibleTurns={presentation.agenticIntakeModeActive ? presentation.agenticVisibleTurns : []}
      animatedModeMenuSheenStyle={modeMenu.animatedModeMenuSheenStyle}
      animatedModeMenuStyle={modeMenu.animatedModeMenuStyle}
      canStartNewConversation={!composerBusy}
      canUseComposerMedia={canUseComposerMedia}
      caseAssistantTurns={presentation.showCaseConversation ? presentation.caseAssistantTurns : []}
      caseThreadNode={<CustomerKaelCaseThreadNode controller={controller} onOpenActivity={onOpenActivity} />}
      caseWorkLabel={copy.caseWork}
      composerBusy={composerBusy}
      composerMediaDraftCount={conversation.composerMediaDrafts.length}
      composerMediaNode={(
        <MediaDraftPreviewTray
          busy={composerBusy}
          drafts={conversation.composerMediaDrafts}
          language={language}
          onRemove={(index) => conversation.setComposerMediaDrafts((current) =>
            current.filter((_, currentIndex) => currentIndex !== index))}
          tokens={tokens}
        />
      )}
      composerPlaceholder={composerPlaceholder}
      composerVoiceNode={presentation.agenticAnalysisActive && !presentation.agenticEvidenceGateActive ? (
        <OnDeviceVoiceTranscript
          disabled={composerBusy}
          language={language}
          onChangeText={chatUi.setVoiceTranscript}
          tokens={tokens}
          transcript={chatUi.voiceTranscript}
        />
      ) : null}
      draft={chatUi.draft}
      error={visibleError}
      hiddenScrollbarStyle={customerV21HiddenScrollbar}
      hydratingCase={caseHydration.hydrating && !deal}
      language={language}
      mode={mode}
      modeMenuOpen={chatUi.modeMenuOpen}
      normalAssistantTurns={presentation.normalAssistantTurns}
      normalChatLabel={copy.normalChat}
      normalEvidenceNode={presentation.showNormalEvidence ? (
        <ChatEvidenceStrip
          formatCount={formatKnownCount}
          language={language}
          mediaCount={presentation.normalEvidenceCount}
          mode={mode}
          tokens={tokens}
        />
      ) : null}
      onBack={() => router.replace('/(customer)/home' as never)}
      onDraftChange={chatUi.setDraft}
      onPickMedia={evidenceActions.pickComposerMedia}
      onSendMessage={() => void messageActions.sendMessage()}
      onSwitchMode={modeMenu.switchChatMode}
      onToggleModeMenu={modeMenu.toggleModeMenu}
      onToggleSessionMenu={sessionCatalog.toggleSessionMenu}
      pendingDraftMessage={presentation.pendingDraftMessage}
      processLinesNode={processController.processLines ? (
        <>
          <ChatBubble speaker="customer" text={processController.processLines.prompt} tokens={tokens} />
          <KaelProcessLines state={processController.processLines} />
        </>
      ) : null}
      reduceMotion={reduceMotion}
      reduceTransparency={reduceTransparency}
      rootStyles={rootStyles}
      sessionMenuNode={(
        <CustomerKaelSessionMenu
          activeSessionId={conversations.activeSessionId}
          canCreate={conversations.canCreateSession}
          error={conversations.sessionsError}
          language={language}
          loading={conversations.sessionsLoading}
          mode={mode}
          onArchive={sessionCatalog.archiveConversation}
          onCreate={() => void sessionCatalog.startNewConversation()}
          onPin={conversations.setSessionPinned}
          onRename={conversations.renameSession}
          onSelect={(conversationId) => void sessionCatalog.openConversation(conversationId)}
          pendingSessionIds={conversations.pendingSessionIds}
          reduceMotion={reduceMotion}
          reduceTransparency={reduceTransparency}
          sessions={conversations.sessions}
          tokens={tokens}
        />
      )}
      sessionMenuOpen={chatUi.sessionMenuOpen}
      showComposer={presentation.showComposer}
      showEmptyHero={showEmptyHero}
      showNormalGreeting={false}
      showPendingDraftBubble={presentation.showPendingDraftBubble}
      textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
      timelineHeadline={timelineHeadline}
      tokens={tokens}
      workerCandidateNode={<CustomerWorkerCandidateNode controller={controller} />}
      missingCaseWorkDeal={presentation.missingCaseWorkDeal}
    />
  )
}
