import { useState, type ComponentProps, type ReactNode } from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated from 'react-native-reanimated'

import type { AppLanguage } from '@/lib/app-language'
import type { KaelReasoningReceiptState } from '@/lib/kael-reasoning-receipt'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21HistoryActiveStyles as historyActiveStyles } from '../history/history-active-styles'
import { customerV21SharedStyles as sharedStyles } from '../ui/shared-styles'
import { CustomerThemeSystemBar } from '../ui/shared-surfaces'
import type { CustomerKaelMode } from '../ui/types'
import { KaelChatComposer, type RootChatStyles } from './kael-chat-composer'
import { CustomerKaelChatHeader } from './kael-chat-header'
import { KaelChatTranscript } from './kael-chat-transcript'
import { ChatCanvasAura } from './chat-surfaces'
import { customerV21ChatStyles as chatStyles } from './chat-styles'
import { type AgenticTurnView, type ChatTurnView, useKaelChatTranscript } from './use-kael-chat-transcript'

type AnimatedViewStyle = ComponentProps<typeof Animated.View>['style']

type Props = {
  agenticEstimateNode: ReactNode
  agenticVisibleTurns: AgenticTurnView[]
  analysisEvidenceNode: ReactNode
  animatedModeMenuStyle: AnimatedViewStyle
  caseAssistantTurns: ChatTurnView[]
  caseIntakeResponseNode: ReactNode
  caseThreadNode: ReactNode
  caseWorkLabel: string
  composerMediaNode: ReactNode
  composer: {
    busy: boolean
    canUseMedia: boolean
    draft: string
    mediaDraftCount: number
    placeholder: string
    show: boolean
  }
  error: string | null
  hiddenScrollbarStyle: StyleProp<ViewStyle>
  language: AppLanguage
  motion: {
    reduceMotion: boolean
    reduceTransparency: boolean
  }
  mode: CustomerKaelMode
  normalAssistantTurns: ChatTurnView[]
  normalChatLabel: string
  normalReasoningReceipt: KaelReasoningReceiptState
  onBack: () => void
  onDraftChange: (value: string) => void
  onPickMedia: () => void
  onSendMessage: () => void
  onSwitchMode: (mode: CustomerKaelMode) => void
  onToggleModeMenu: () => void
  onToggleNormalReasoningReceipt: () => void
  onToggleSessionMenu?: () => void
  pendingDraftMessage: string
  pendingNormalMessage: string | null
  processLinesNode: ReactNode
  rootStyles: RootChatStyles
  sessionMenuNode?: ReactNode
  streamingReplyNode: ReactNode
  streamingReplyTurnId: string | null
  textInputNoOutlineStyle: StyleProp<TextStyle>
  timelineHeadline?: string
  tokens: CustomerThemeTokens
  visibility: {
    canStartNewConversation: boolean
    hydratingCase: boolean
    missingCaseWorkDeal: boolean
    modeMenuOpen: boolean
    sessionMenuOpen: boolean
    showEmptyHero: boolean
    showNormalGreeting: boolean
    showPendingDraftBubble: boolean
  }
  workerCandidateNode: ReactNode
}

export function KaelChatSurfaceView({
  agenticEstimateNode,
  agenticVisibleTurns,
  analysisEvidenceNode,
  animatedModeMenuStyle,
  caseAssistantTurns,
  caseIntakeResponseNode,
  caseThreadNode,
  caseWorkLabel,
  composerMediaNode,
  composer,
  error,
  hiddenScrollbarStyle,
  language,
  motion,
  mode,
  normalAssistantTurns,
  normalChatLabel,
  normalReasoningReceipt,
  onBack,
  onDraftChange,
  onPickMedia,
  onSendMessage,
  onSwitchMode,
  onToggleModeMenu,
  onToggleNormalReasoningReceipt,
  onToggleSessionMenu,
  pendingDraftMessage,
  pendingNormalMessage,
  processLinesNode,
  rootStyles,
  sessionMenuNode = null,
  streamingReplyNode,
  streamingReplyTurnId,
  textInputNoOutlineStyle,
  tokens,
  visibility,
  workerCandidateNode,
}: Props) {
  const { busy: composerBusy, canUseMedia: canUseComposerMedia, draft, mediaDraftCount: composerMediaDraftCount, placeholder: composerPlaceholder, show: showComposer } = composer
  const { reduceMotion, reduceTransparency } = motion
  const {
    canStartNewConversation,
    hydratingCase,
    missingCaseWorkDeal,
    modeMenuOpen,
    sessionMenuOpen,
    showEmptyHero,
    showNormalGreeting,
    showPendingDraftBubble,
  } = visibility
  const [composerFocused, setComposerFocused] = useState(false)
  const emptyHeroVisible = showEmptyHero && !composerFocused && draft.trim().length === 0
  const { responseInFlight, transcriptRows } = useKaelChatTranscript({
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
    normalReasoningReceipt,
    onToggleNormalReasoningReceipt,
    pendingDraftMessage,
    pendingNormalMessage,
    processLinesNode,
    reduceMotion,
    showNormalGreeting,
    showPendingDraftBubble,
    streamingReplyNode,
    streamingReplyTurnId,
    tokens,
    workerCandidateNode,
  })
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

  return (
    <SafeAreaView style={[sharedStyles.safeArea, { backgroundColor: tokens.canvas }]} testID="customer-v21-kael-chat">
      <CustomerThemeSystemBar mode={tokens.mode} />
      <ChatCanvasAura mode={tokens.mode} reduceTransparency={reduceTransparency} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={rootStyles.flex}>
        <View style={[chatStyles.chatFrame, mode === 'case' ? historyActiveStyles.caseChatFrame : null]} testID={mode === 'normal' ? 'customer-v21-screen-2.4-chat-normal' : 'customer-v21-screen-2.5-chat-case'}>
          <CustomerKaelChatHeader
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
