import { useCallback, useMemo } from 'react'

import { MediaDraftPreviewTray } from './media-draft-preview-tray'
import { CustomerAgenticEstimateNode } from './customer-agentic-estimate-node'
import { KaelChatSurfaceView } from './chat-stateful-surfaces'
import { customerV21KaelChatRootStyles as rootStyles } from './chat-styles'
import { ChatBubble } from './chat-surfaces'
import { CustomerKaelCaseThreadNode } from './customer-kael-case-thread-node'
import { CustomerKaelAnalysisEvidenceNode } from './customer-kael-analysis-evidence-node'
import { KaelResponseSurface } from './kael-response-surface'
import { CustomerKaelIntakeResponseNode } from './customer-kael-intake-response-node'
import { CustomerWorkerCandidateNode } from './customer-worker-candidate-node'
import { CustomerKaelSessionMenu } from './kael-session-menu'
import { KaelProcessLines } from './kael-process-line-view'
import { customerKaelInlineError } from './customer-kael-error-display'
import {
  readCustomerKaelSessionEphemeralSummary,
  summarizeCustomerKaelEphemeralSession,
} from './customer-kael-ephemeral-state'
import {
  customerV21HiddenScrollbar,
  customerV21WebTextInputNoOutline,
} from '../ui/platform-styles'
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
    stateScopeKey,
    timelineHeadline,
    tokens,
    visibleError,
  } = controller
  const composerBusy = conversation.loading || chatUi.uploadingMedia || conversations.sending
  const canUseComposerMedia = mode === 'case' && (
    !deal ||
    presentation.caseEvidenceGateActive ||
    presentation.workIntakeActive
  )
  const composerPlaceholder = mode === 'normal'
    ? (language === 'vi' ? 'Nhập tin nhắn cho Kael...' : 'Message Kael...')
    : deal
      ? (language === 'vi'
          ? 'Hỏi Kael về việc này...'
          : 'Ask about this service...')
      : (language === 'vi'
          ? 'Mô tả nhu cầu cho Kael...'
          : 'Describe what you need...')
  const hasCurrentConversation = mode === 'normal'
    ? Boolean(
        processController.processLines ||
        conversation.chat ||
        conversation.turns.length > 0 ||
        presentation.normalAssistantTurns.length > 0 ||
        Boolean(conversation.pendingNormalMessage) ||
        conversation.reasoningReceipt.status !== 'idle' ||
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
  const inlineError = customerKaelInlineError(
    visibleError,
    mode,
    conversation.reasoningReceipt.status,
  )
  const { setReasoningReceipt } = conversation
  const sessionEphemeralStateById = useMemo(() => {
    const summaries: Record<string, ReturnType<typeof summarizeCustomerKaelEphemeralSession>> = {}
    conversations.sessions.forEach((session) => {
      summaries[session.id] = session.id === conversations.activeSessionId
        ? summarizeCustomerKaelEphemeralSession({
            composer: {
              draft: chatUi.draft,
              voiceTranscript: chatUi.voiceTranscript,
            },
            mediaDrafts: conversation.composerMediaDrafts,
            turns: conversation.assistantTurns,
          })
        : readCustomerKaelSessionEphemeralSummary(stateScopeKey, session.id)
    })
    return summaries
  }, [chatUi.draft, chatUi.voiceTranscript, conversation.assistantTurns, conversation.composerMediaDrafts, conversations.activeSessionId, conversations.sessions, stateScopeKey])
  const onOpenActivity = useCallback(() => {
    router.replace('/(customer)/history' as never)
  }, [router])
  const onToggleNormalReasoningReceipt = useCallback(() => {
    setReasoningReceipt((current) => ({
      ...current,
      expanded: !current.expanded,
    }))
  }, [setReasoningReceipt])
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
      <KaelResponseSurface
        language={language}
        onPresentationSettled={messageActions.settleStreamingReply}
        reduceMotion={reduceMotion}
        state={conversation.streamingReply}
        testID="customer-v21-kael-streaming-response"
        tokens={tokens}
      />
    ) : null
  ), [conversation.streamingReply, language, messageActions.settleStreamingReply, reduceMotion, tokens])
  const agenticEstimateNode = useMemo(
    () => <CustomerAgenticEstimateNode controller={controller} />,
    [controller],
  )
  const composerMediaNode = useMemo(() => (
    <MediaDraftPreviewTray
      busy={composerBusy}
      drafts={conversation.composerMediaDrafts}
      language={language}
      onRemove={(index) => conversation.setComposerMediaDrafts((current) =>
        current.filter((_, currentIndex) => currentIndex !== index))}
      tokens={tokens}
    />
  ), [composerBusy, conversation, language, tokens])
  const processLinesNode = useMemo(() => (
    processController.processLines ? (
      <>
        {processController.processLines.prompt ? (
          <ChatBubble speaker="customer" text={processController.processLines.prompt} tokens={tokens} />
        ) : null}
        <KaelProcessLines state={processController.processLines} />
      </>
    ) : null
  ), [processController.processLines, tokens])
  const sessionMenuNode = useMemo(() => (
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
      sessionEphemeralStateById={sessionEphemeralStateById}
      sessions={conversations.sessions}
      tokens={tokens}
    />
  ), [
    conversations.activeSessionId,
    conversations.canCreateSession,
    conversations.pendingSessionIds,
    conversations.sessions,
    conversations.sessionsError,
    conversations.sessionsLoading,
    conversations.renameSession,
    conversations.setSessionPinned,
    language,
    mode,
    reduceMotion,
    reduceTransparency,
    sessionCatalog,
    sessionEphemeralStateById,
    tokens,
  ])

  return (
    <KaelChatSurfaceView
      agenticEstimateNode={agenticEstimateNode}
      analysisEvidenceNode={analysisEvidenceNode}
      agenticVisibleTurns={mode === 'case' || presentation.agenticIntakeModeActive
        ? presentation.agenticVisibleTurns
        : []}
      animatedModeMenuStyle={modeMenu.animatedModeMenuStyle}
      caseAssistantTurns={presentation.showCaseConversation ? presentation.caseAssistantTurns : []}
      caseIntakeResponseNode={caseIntakeResponseNode}
      caseThreadNode={caseThreadNode}
      caseWorkLabel={copy.caseWork}
      composerMediaNode={composerMediaNode}
      composer={{
        busy: composerBusy,
        canUseMedia: canUseComposerMedia,
        draft: chatUi.draft,
        hasVoiceTranscript: Boolean(chatUi.voiceTranscript.trim()),
        mediaDraftCount: conversation.composerMediaDrafts.length,
        placeholder: composerPlaceholder,
        show: presentation.showComposer,
      }}
      error={inlineError}
      hiddenScrollbarStyle={customerV21HiddenScrollbar}
      language={language}
      mode={mode}
      motion={{ reduceMotion, reduceTransparency }}
      normalAssistantTurns={presentation.normalAssistantTurns}
      normalChatLabel={copy.normalChat}
      normalReasoningReceipt={conversation.reasoningReceipt}
      onBack={() => router.replace('/(customer)/home' as never)}
      onDraftChange={chatUi.setDraft}
      onPickMedia={evidenceActions.pickComposerMedia}
      onSendMessage={() => void messageActions.sendMessage()}
      onSwitchMode={modeMenu.switchChatMode}
      onToggleModeMenu={modeMenu.toggleModeMenu}
      onToggleNormalReasoningReceipt={onToggleNormalReasoningReceipt}
      onToggleSessionMenu={sessionCatalog.toggleSessionMenu}
      pendingDraftMessage={presentation.pendingDraftMessage}
      pendingNormalMessage={conversation.pendingNormalMessage}
      processLinesNode={processLinesNode}
      streamingReplyNode={streamingReplyNode}
      streamingReplyTurnId={conversation.streamingReply?.responseId ?? null}
      rootStyles={rootStyles}
      sessionMenuNode={sessionMenuNode}
      textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
      timelineHeadline={timelineHeadline}
      tokens={tokens}
      visibility={{
        canStartNewConversation: conversations.canCreateSession,
        hydratingCase: caseHydration.hydrating && !deal,
        missingCaseWorkDeal: presentation.missingCaseWorkDeal,
        modeMenuOpen: chatUi.modeMenuOpen,
        sessionMenuOpen: chatUi.sessionMenuOpen,
        showEmptyHero,
        showNormalGreeting: false,
        showPendingDraftBubble: presentation.showPendingDraftBubble,
      }}
      workerCandidateNode={workerCandidateNode}
    />
  )
}
