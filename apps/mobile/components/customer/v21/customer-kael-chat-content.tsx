import { useCallback, useMemo } from 'react'

import { MediaDraftPreviewTray } from '../kael-chat/media-draft-preview-tray'
import {
  agenticEstimatePriceExplanation,
  agenticEstimateProblemLabel,
  agenticEstimateSourceExplanation,
  formatPriceRange,
} from './agentic-estimate-display-model'
import { AgenticChatEstimateResponse } from './agentic-chat-estimate-response'
import { KaelChatSurfaceView } from './chat-stateful-surfaces'
import { customerV21KaelChatRootStyles as rootStyles } from './chat-styles'
import { ChatBubble } from './chat-surfaces'
import { CustomerKaelCaseThreadNode } from './customer-kael-case-thread-node'
import { CustomerKaelAnalysisEvidenceNode } from './customer-kael-analysis-evidence-node'
import { KaelLiquidReveal } from './kael-liquid-reveal'
import { CustomerKaelIntakeResponseNode } from './customer-kael-intake-response-node'
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
  const composerBusy = conversation.loading || chatUi.uploadingMedia || conversations.sending
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
  const showEmptyHero = !hasCurrentConversation && !conversation.loading
  const onOpenActivity = useCallback(() => {
    router.replace('/(customer)/history' as never)
  }, [router])
  const caseIntakeResponseNode = useMemo(
    () => <CustomerKaelIntakeResponseNode controller={controller} />,
    [controller],
  )
  const caseThreadNode = useMemo(
    () => (
      <CustomerKaelCaseThreadNode
        controller={controller}
        onOpenActivity={onOpenActivity}
      />
    ),
    [controller, onOpenActivity],
  )
  const workerCandidateNode = useMemo(
    () => <CustomerWorkerCandidateNode controller={controller} />,
    [controller],
  )
  const analysisEvidenceNode = useMemo(
    () => <CustomerKaelAnalysisEvidenceNode controller={controller} />,
    [controller],
  )
  const streamingReplyNode = useMemo(() => (
    conversation.streamingReply ? (
      <KaelLiquidReveal reduceMotion={reduceMotion}>
        <ChatBubble
          reduceMotion={reduceMotion}
          speaker="kael"
          streaming
          testID="customer-v21-kael-streaming-response"
          text={conversation.streamingReply.text}
          tokens={tokens}
        />
      </KaelLiquidReveal>
    ) : null
  ), [conversation.streamingReply, reduceMotion, tokens])

  return (
    <KaelChatSurfaceView
      agenticEstimateNode={presentation.offerReviewActive &&
        presentation.chatEstimate &&
        !processController.processLines &&
        !chatUi.submittingAgenticRejectReason &&
        !chatUi.confirmingAgenticEstimate ? (
          <AgenticChatEstimateResponse
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
      analysisEvidenceNode={analysisEvidenceNode}
      agenticVisibleTurns={mode === 'case' || presentation.agenticIntakeModeActive
        ? presentation.agenticVisibleTurns
        : []}
      animatedModeMenuSheenStyle={modeMenu.animatedModeMenuSheenStyle}
      animatedModeMenuStyle={modeMenu.animatedModeMenuStyle}
      canStartNewConversation={conversations.canCreateSession}
      canUseComposerMedia={canUseComposerMedia}
      caseAssistantTurns={presentation.showCaseConversation ? presentation.caseAssistantTurns : []}
      caseIntakeResponseNode={caseIntakeResponseNode}
      caseThreadNode={caseThreadNode}
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
      draft={chatUi.draft}
      error={visibleError}
      hiddenScrollbarStyle={customerV21HiddenScrollbar}
      hydratingCase={caseHydration.hydrating && !deal}
      language={language}
      mode={mode}
      modeMenuOpen={chatUi.modeMenuOpen}
      normalAssistantTurns={presentation.normalAssistantTurns}
      normalChatLabel={copy.normalChat}
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
      streamingReplyNode={streamingReplyNode}
      streamingReplyTurnId={conversation.streamingReply?.turnId ?? null}
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
      workerCandidateNode={workerCandidateNode}
      missingCaseWorkDeal={presentation.missingCaseWorkDeal}
    />
  )
}
