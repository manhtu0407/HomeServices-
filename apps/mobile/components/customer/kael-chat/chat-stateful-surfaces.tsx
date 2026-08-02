import { useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated from 'react-native-reanimated'

import type { AppLanguage } from '@/lib/app-language'
import { createCompletedKaelResponseState } from '@/lib/kael-response-stream'

import type { CustomerThemeTokens } from '../customer-theme'
import { ChatBubble, ChatCanvasAura } from './chat-surfaces'
import { customerV21ChatStyles as chatStyles } from './chat-styles'
import { CaseWorkResponse } from './case-work-response'
import { buildCaseWorkResponseModel } from './case-work-response-model'
import { customerV21HistoryActiveStyles as historyActiveStyles } from '../history/history-active-styles'
import { customerV21SharedStyles as sharedStyles } from '../ui/shared-styles'
import { CustomerKaelEmptyHero } from './kael-empty-hero'
import { CustomerKaelChatHeader } from './kael-chat-header'
import { KaelChatComposer, type RootChatStyles } from './kael-chat-composer'
import { customerVisibleCaseRequestText } from './kael-chat-turn-display-model'
import { CustomerThemeSystemBar, InactiveAgenticGate } from '../ui/shared-surfaces'
import type { CustomerKaelMode } from '../ui/types'
import { KaelResponseSurface } from './kael-response-surface'
import { KaelChatTranscript, type ChatTranscriptRow } from './kael-chat-transcript'

type AnimatedViewStyle = ComponentProps<typeof Animated.View>['style']

type ChatTurnView = {
  id: string
  role: 'customer' | 'worker' | 'kael'
  text_content: string
}

type AgenticTurnView = {
  id: string
  role: string
  text_content?: string | null
}

function appendChatTranscriptRow(rows: ChatTranscriptRow[], key: string, node: ReactNode) {
  if (node === null || node === undefined || node === false) return
  rows.push({ key, node })
}

function renderConversationTurn(
  turn: ChatTurnView,
  language: AppLanguage,
  reduceMotion: boolean,
  tokens: CustomerThemeTokens,
) {
  if (turn.role !== 'kael') {
    return <ChatBubble speaker={turn.role} text={turn.text_content} tokens={tokens} />
  }
  return (
    <KaelResponseSurface
      language={language}
      reduceMotion={reduceMotion}
      state={createCompletedKaelResponseState(turn.text_content, turn.id)}
      tokens={tokens}
    />
  )
}

export function KaelChatSurfaceView({
  agenticEstimateNode,
  analysisEvidenceNode,
  agenticVisibleTurns,
  animatedModeMenuSheenStyle,
  animatedModeMenuStyle,
  canUseComposerMedia,
  canStartNewConversation = false,
  caseIntakeResponseNode,
  caseThreadNode,
  caseWorkLabel,
  composerBusy,
  composerMediaDraftCount,
  composerMediaNode,
  composerPlaceholder,
  draft,
  error,
  hiddenScrollbarStyle,
  hydratingCase,
  language,
  mode,
  modeMenuOpen,
  normalAssistantTurns,
  normalChatLabel,
  onBack,
  onDraftChange,
  onPickMedia,
  onSendMessage,
  onSwitchMode,
  onToggleModeMenu,
  onToggleSessionMenu,
  processLinesNode,
  streamingReplyNode,
  streamingReplyTurnId,
  reduceMotion,
  reduceTransparency,
  rootStyles,
  sessionMenuNode = null,
  sessionMenuOpen = false,
  showComposer,
  showEmptyHero = false,
  showNormalGreeting = false,
  showPendingDraftBubble,
  textInputNoOutlineStyle,
  tokens,
  workerCandidateNode,
  caseAssistantTurns,
  missingCaseWorkDeal,
  pendingDraftMessage,
}: {
  agenticEstimateNode: ReactNode
  analysisEvidenceNode: ReactNode
  agenticVisibleTurns: AgenticTurnView[]
  animatedModeMenuSheenStyle: AnimatedViewStyle
  animatedModeMenuStyle: AnimatedViewStyle
  canUseComposerMedia: boolean
  canStartNewConversation?: boolean
  caseIntakeResponseNode: ReactNode
  caseAssistantTurns: ChatTurnView[]
  caseThreadNode: ReactNode
  caseWorkLabel: string
  composerBusy: boolean
  composerMediaDraftCount: number
  composerMediaNode: ReactNode
  composerPlaceholder: string
  draft: string
  error: string | null
  hiddenScrollbarStyle: StyleProp<ViewStyle>
  hydratingCase: boolean
  language: AppLanguage
  missingCaseWorkDeal: boolean
  mode: CustomerKaelMode
  modeMenuOpen: boolean
  normalAssistantTurns: ChatTurnView[]
  normalChatLabel: string
  onBack: () => void
  onDraftChange: (value: string) => void
  onPickMedia: () => void
  onSendMessage: () => void
  onSwitchMode: (mode: CustomerKaelMode) => void
  onToggleModeMenu: () => void
  onToggleSessionMenu?: () => void
  pendingDraftMessage: string
  processLinesNode: ReactNode
  streamingReplyNode: ReactNode
  streamingReplyTurnId: string | null
  reduceMotion: boolean
  reduceTransparency: boolean
  rootStyles: RootChatStyles
  sessionMenuNode?: ReactNode
  sessionMenuOpen?: boolean
  showComposer: boolean
  showEmptyHero?: boolean
  showNormalGreeting?: boolean
  showPendingDraftBubble: boolean
  textInputNoOutlineStyle: StyleProp<TextStyle>
  timelineHeadline?: string
  tokens: CustomerThemeTokens
  workerCandidateNode: ReactNode
}) {
  const [composerFocused, setComposerFocused] = useState(false)
  const emptyHeroVisible = showEmptyHero && !composerFocused && draft.trim().length === 0
  const responseInFlight = Boolean(processLinesNode || streamingReplyNode)

  const toggleSessionMenu = () => {
    Keyboard.dismiss()
    setComposerFocused(false)
    onToggleSessionMenu?.()
  }

  const selectMode = (nextMode: CustomerKaelMode) => {
    Keyboard.dismiss()
    setComposerFocused(false)
    onSwitchMode(nextMode)
  }

  const transcriptRows = useMemo(() => {
    const rows: ChatTranscriptRow[] = []
    if (emptyHeroVisible) {
      appendChatTranscriptRow(rows, 'empty-hero', (
        <CustomerKaelEmptyHero language={language} mode={mode} reduceMotion={reduceMotion} tokens={tokens} />
      ))
    }
    if (showPendingDraftBubble) {
      appendChatTranscriptRow(rows, 'pending-draft', (
        <ChatBubble
          speaker="customer"
          testID="customer-v21-pending-draft-bubble"
          text={customerVisibleCaseRequestText(pendingDraftMessage, language)}
          tokens={tokens}
        />
      ))
    }
    if (showNormalGreeting) {
      appendChatTranscriptRow(rows, 'normal-greeting', (
        <ChatBubble
          speaker="kael"
          testID="customer-v21-normal-greeting-bubble"
          text={language === 'vi' ? 'Chào bạn, mình là Kael. Bạn muốn hỏi gì hôm nay?' : 'Hi, I am Kael. What would you like to ask today?'}
          tokens={tokens}
        />
      ))
    }
    appendChatTranscriptRow(rows, 'case-intake-response', caseIntakeResponseNode)
    if (mode === 'case' && hydratingCase) {
      const hydrationModel = buildCaseWorkResponseModel({ language, phase: 'kael_collecting' })
      appendChatTranscriptRow(rows, 'case-hydrating', (
        <CaseWorkResponse
          details={<ActivityIndicator color={tokens.primary} />}
          model={{
            ...hydrationModel,
            noteCopy: language === 'vi'
              ? 'Phiên và trạng thái công việc đang được đồng bộ từ hệ thống.'
              : 'The session and work status are syncing from the system.',
            status: language === 'vi' ? 'Đang đồng bộ' : 'Syncing',
            title: language === 'vi' ? 'Đang tải công việc' : 'Loading work',
          }}
          reduceMotion={reduceMotion}
          testID="customer-v21-case-hydrating"
          tokens={tokens}
        />
      ))
    }
    for (const turn of caseAssistantTurns) {
      appendChatTranscriptRow(rows, `turn-${turn.id}`, (
        renderConversationTurn(turn, language, reduceMotion, tokens)
      ))
    }
    for (const turn of agenticVisibleTurns) {
      appendChatTranscriptRow(rows, `turn-${turn.id}`, (
        turn.role === 'customer'
          ? <ChatBubble speaker="customer" text={turn.text_content ?? ''} tokens={tokens} />
          : <KaelResponseSurface
              language={language}
              reduceMotion={reduceMotion}
              state={createCompletedKaelResponseState(turn.text_content ?? '', turn.id)}
              tokens={tokens}
            />
      ))
    }
    appendChatTranscriptRow(rows, 'case-thread', caseThreadNode)
    appendChatTranscriptRow(rows, 'worker-candidate', workerCandidateNode)
    appendChatTranscriptRow(rows, 'analysis-evidence', analysisEvidenceNode)
    appendChatTranscriptRow(rows, 'agentic-estimate', agenticEstimateNode)
    if (mode === 'normal') {
      for (const turn of normalAssistantTurns) {
        appendChatTranscriptRow(rows, `turn-${turn.id}`, (
          renderConversationTurn(turn, language, reduceMotion, tokens)
        ))
      }
    }
    appendChatTranscriptRow(rows, 'process-lines', processLinesNode)
    appendChatTranscriptRow(
      rows,
      streamingReplyTurnId ? `turn-${streamingReplyTurnId}` : 'streaming-reply',
      streamingReplyNode,
    )
    if (missingCaseWorkDeal && !hydratingCase) {
      appendChatTranscriptRow(rows, 'case-work-inactive', (
        <InactiveAgenticGate testID="customer-v21-case-work-inactive" />
      ))
    }
    return rows
  }, [
    agenticEstimateNode,
    agenticVisibleTurns,
    analysisEvidenceNode,
    caseAssistantTurns,
    caseIntakeResponseNode,
    caseThreadNode,
    emptyHeroVisible,
    hydratingCase,
    language,
    missingCaseWorkDeal,
    mode,
    normalAssistantTurns,
    pendingDraftMessage,
    processLinesNode,
    streamingReplyNode,
    streamingReplyTurnId,
    reduceMotion,
    showNormalGreeting,
    showPendingDraftBubble,
    tokens,
    workerCandidateNode,
  ])

  return (
    <SafeAreaView style={[sharedStyles.safeArea, { backgroundColor: tokens.canvas }]} testID="customer-v21-kael-chat">
      <CustomerThemeSystemBar mode={tokens.mode} />
      <ChatCanvasAura mode={tokens.mode} reduceTransparency={reduceTransparency} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={rootStyles.flex}>
        <View style={[chatStyles.chatFrame, mode === 'case' ? historyActiveStyles.caseChatFrame : null]} testID={mode === 'normal' ? 'customer-v21-screen-2.4-chat-normal' : 'customer-v21-screen-2.5-chat-case'}>
          <CustomerKaelChatHeader
            animatedModeMenuSheenStyle={animatedModeMenuSheenStyle}
            animatedModeMenuStyle={animatedModeMenuStyle}
            canStartNewConversation={canStartNewConversation}
            caseWorkLabel={caseWorkLabel}
            language={language}
            mode={mode}
            modeMenuOpen={modeMenuOpen}
            normalChatLabel={normalChatLabel}
            onBack={onBack}
            onSwitchMode={selectMode}
            onToggleModeMenu={onToggleModeMenu}
            onToggleSessionMenu={toggleSessionMenu}
            reduceMotion={reduceMotion}
            reduceTransparency={reduceTransparency}
            sessionMenuNode={sessionMenuNode}
            sessionMenuOpen={sessionMenuOpen}
            tokens={tokens}
          />

          <KaelChatTranscript
            empty={emptyHeroVisible}
            hiddenScrollbarStyle={hiddenScrollbarStyle}
            language={language}
            menuOpen={modeMenuOpen || sessionMenuOpen}
            reduceMotion={reduceMotion}
            responseInFlight={responseInFlight}
            rows={transcriptRows}
            tokens={tokens}
          />

          {composerMediaNode}
          {error ? <Text style={[rootStyles.errorText, { color: tokens.primary }]} testID="customer-v21-kael-error">{error}</Text> : null}
          {showComposer ? (
            <KaelChatComposer
              canUseComposerMedia={canUseComposerMedia}
              composerBusy={composerBusy}
              composerMediaDraftCount={composerMediaDraftCount}
              composerPlaceholder={composerPlaceholder}
              draft={draft}
              language={language}
              onBlur={() => setComposerFocused(false)}
              onDraftChange={onDraftChange}
              onFocus={() => setComposerFocused(true)}
              onPickMedia={onPickMedia}
              onSendMessage={onSendMessage}
              reduceTransparency={reduceTransparency}
              rootStyles={rootStyles}
              textInputNoOutlineStyle={textInputNoOutlineStyle}
              tokens={tokens}
            />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
