import type { ComponentProps, ReactNode } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated from 'react-native-reanimated'

import { KaelTextField } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { KaelChatResponse } from '@/lib/api-types'

import type { CustomerThemeTokens } from '../customer-theme'
import { SourceCardSkin } from './aura-surfaces'
import { customerV21Assets } from './assets'
import { ChatBubble, ChatCanvasAura, ChatComposerAura, ChatMediaCameraIcon, ChatModeSwitchAura } from './chat-surfaces'
import { customerV21ChatStyles as chatStyles } from './chat-styles'
import { customerV21ServiceCopy } from './copy'
import { customerV21HistoryActiveStyles as historyActiveStyles } from './history-active-styles'
import { AgenticChatEstimateCardPanel } from './agentic-decision-surfaces'
import { MediaRow } from './history-surfaces'
import { customerV21SharedStyles as sharedStyles } from './shared-styles'
import { AssetTile, InactiveAgenticGate, V21Card, V21TopBar } from './shared-surfaces'
import type { CustomerKaelMode } from './types'

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

type RootChatStyles = {
  bodyText: StyleProp<TextStyle>
  composer: StyleProp<ViewStyle>
  composerInput: StyleProp<TextStyle>
  composerTextFieldShell: StyleProp<ViewStyle>
  composerTextFieldStack: StyleProp<ViewStyle>
  errorText: StyleProp<TextStyle>
  flex: StyleProp<ViewStyle>
  modeButton: StyleProp<ViewStyle>
  modeButtonText: StyleProp<TextStyle>
  modeSwitch: StyleProp<ViewStyle>
  sendButton: StyleProp<ViewStyle>
  sendText: StyleProp<TextStyle>
}

type AgenticEstimate = NonNullable<KaelChatResponse['session']['estimate']>

export function ChatEvidenceStrip({
  formatCount,
  language,
  mediaCount,
  mode,
  tokens,
}: {
  formatCount: (value: number | null | undefined, language: AppLanguage) => string
  language: AppLanguage
  mediaCount: number | null | undefined
  mode: CustomerKaelMode
  tokens: CustomerThemeTokens
}) {
  const countLabel = formatCount(mediaCount, language)
  return (
    <View style={[chatStyles.chatEvidenceStrip, { backgroundColor: tokens.ghost, borderColor: tokens.border }]} testID="customer-v21-chat-evidence-strip">
      <MediaRow
        assetTile={AssetTile}
        tokens={tokens}
        image={mode === 'case' ? customerV21Assets.evidence : customerV21Assets.kael}
        label={mode === 'case' ? (language === 'vi' ? 'Bằng chứng công việc' : 'Work evidence') : (language === 'vi' ? 'Ảnh / video' : 'Photo / video')}
        value={countLabel}
      />
    </View>
  )
}

export function AgenticChatEstimateCard({
  canConfirm,
  confirmed,
  confirming,
  estimate,
  formatPriceRange,
  language,
  onConfirm,
  onReject,
  onReasonChange,
  onSubmitRejectReason,
  problemLabelForEstimate,
  rejected,
  rejectReason,
  sourceExplanationForLanguage,
  priceExplanationForEstimate,
  submittingRejectReason,
  textInputStyle,
}: {
  canConfirm: boolean
  confirmed: boolean
  confirming: boolean
  estimate: AgenticEstimate
  formatPriceRange: (min: number, max: number, language: AppLanguage) => string
  language: AppLanguage
  onConfirm: () => void
  onReject: () => void
  onReasonChange: (value: string) => void
  onSubmitRejectReason: () => void
  priceExplanationForEstimate: (estimate: AgenticEstimate, language: AppLanguage) => string
  problemLabelForEstimate: (estimate: AgenticEstimate, language: AppLanguage) => string
  rejected: boolean
  rejectReason: string
  sourceExplanationForLanguage: (language: AppLanguage) => string
  submittingRejectReason: boolean
  textInputStyle: StyleProp<TextStyle>
}) {
  const serviceLabel = customerV21ServiceCopy[language][estimate.service_type].label
  const problem = problemLabelForEstimate(estimate, language)
  const confidencePercent = Math.round(estimate.confidence * 100)
  const needsInspection = estimate.needs_inspection === true
  const needsMoreInfo = needsInspection || estimate.confidence < 0.7
  const confirmLabel = confirmed
    ? (language === 'vi' ? 'Đã xác nhận' : 'Confirmed')
    : confirming
      ? (language === 'vi' ? 'Đang xác nhận' : 'Confirming')
      : (language === 'vi' ? 'Xác nhận' : 'Confirm')
  const rejectLabel = rejected
    ? (language === 'vi' ? 'Đang trao đổi' : 'Discussing')
    : (language === 'vi' ? 'Từ chối' : 'Decline')
  const canSubmitRejectReason = rejectReason.trim().length > 0 && !submittingRejectReason && !confirming
  const statusLabel = confirmed
      ? (language === 'vi' ? 'Công việc đã được mở' : 'Work request opened')
    : needsInspection
      ? (language === 'vi' ? 'Cần khảo sát hiện trường' : 'Inspection required')
    : needsMoreInfo
      ? (language === 'vi' ? 'Cần thêm dữ liệu' : 'Needs more context')
      : canConfirm
      ? (language === 'vi' ? 'Cần bạn chốt' : 'Needs your decision')
      : (language === 'vi' ? 'Đang chờ' : 'Waiting')
  const priceExplanation = priceExplanationForEstimate(estimate, language)
  const priceSource = estimate.price_source
  const priceSourceLabel = priceSource === 'perplexity_validated'
    ? (language === 'vi' ? 'Nguồn giá: thị trường đã kiểm chứng.' : 'Price source: validated market evidence.')
    : priceSource === 'baseline_with_market'
      ? (language === 'vi' ? 'Nguồn giá: mức giá cơ sở và tín hiệu thị trường.' : 'Price source: baseline and market signals.')
      : priceSource === 'baseline_only'
        ? (language === 'vi' ? 'Nguồn giá: mức giá cơ sở đã kiểm chứng.' : 'Price source: governed baseline.')
        : priceSource === 'inspection_required'
          ? (language === 'vi' ? 'Nguồn giá chưa đủ chắc chắn; cần khảo sát.' : 'Price evidence is not yet sufficient; inspection is required.')
          : null
  const sourceExplanation = [sourceExplanationForLanguage(language), priceSourceLabel]
    .filter(Boolean)
    .join(' ')
  const price = formatPriceRange(estimate.price_min, estimate.price_max, language)
  const moreInfoText = needsInspection && estimate.needs_inspection_reason
    ? estimate.needs_inspection_reason
    : language === 'vi'
      ? 'Dữ liệu hiện tại chưa đủ chắc chắn. Bạn gửi thêm ảnh/video hoặc mô tả rõ phạm vi, mức độ và thời điểm xảy ra để Kael kiểm tra lại.'
      : 'Current evidence is not yet sufficient. Add media or clarify the scope, severity, and timing so Kael can re-check.'

  return (
    <AgenticChatEstimateCardPanel
      advisory={estimate.advisory ?? undefined}
      canConfirm={canConfirm}
      canSubmitRejectReason={canSubmitRejectReason}
      confidencePercent={confidencePercent}
      confirmed={confirmed}
      confirming={confirming}
      confirmLabel={confirmLabel}
      disclaimer={estimate.disclaimer}
      moreInfoText={moreInfoText}
      needsMoreInfo={needsMoreInfo}
      onConfirm={onConfirm}
      onReasonChange={onReasonChange}
      onReject={onReject}
      onSubmitRejectReason={onSubmitRejectReason}
      price={price}
      priceExplanation={priceExplanation}
      problem={problem}
      rejected={rejected}
      rejectLabel={rejectLabel}
      rejectReason={rejectReason}
      serviceLabel={serviceLabel}
      sourceExplanation={sourceExplanation}
      statusLabel={statusLabel}
      submittingRejectReason={submittingRejectReason}
      textInputStyle={textInputStyle}
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
  caseThreadNode,
  caseWorkLabel,
  composerBusy,
  composerMediaDraftCount,
  composerMediaNode,
  composerPlaceholder,
  composerVoiceNode,
  draft,
  error,
  hiddenScrollbarStyle,
  hydratingCase,
  language,
  mode,
  modeMenuOpen,
  normalAssistantTurns,
  normalChatLabel,
  normalEvidenceNode,
  onBack,
  onDraftChange,
  onPickMedia,
  onSendMessage,
  onSwitchMode,
  onToggleModeMenu,
  processLinesNode,
  reduceMotion,
  reduceTransparency,
  rootStyles,
  showComposer,
  showNormalGreeting,
  showPendingDraftBubble,
  textInputNoOutlineStyle,
  timelineHeadline,
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
  caseAssistantTurns: ChatTurnView[]
  caseThreadNode: ReactNode
  caseWorkLabel: string
  composerBusy: boolean
  composerMediaDraftCount: number
  composerMediaNode: ReactNode
  composerPlaceholder: string
  composerVoiceNode: ReactNode
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
  normalEvidenceNode: ReactNode
  onBack: () => void
  onDraftChange: (value: string) => void
  onPickMedia: () => void
  onSendMessage: () => void
  onSwitchMode: (mode: CustomerKaelMode) => void
  onToggleModeMenu: () => void
  pendingDraftMessage: string
  processLinesNode: ReactNode
  reduceMotion: boolean
  reduceTransparency: boolean
  rootStyles: RootChatStyles
  showComposer: boolean
  showNormalGreeting: boolean
  showPendingDraftBubble: boolean
  textInputNoOutlineStyle: StyleProp<TextStyle>
  timelineHeadline: string
  tokens: CustomerThemeTokens
  workerCandidateNode: ReactNode
}) {
  return (
    <SafeAreaView style={[sharedStyles.safeArea, { backgroundColor: tokens.canvas }]} testID="customer-v21-kael-chat">
      <ChatCanvasAura reduceTransparency={reduceTransparency} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={rootStyles.flex}>
        <View style={[chatStyles.chatFrame, mode === 'case' ? historyActiveStyles.caseChatFrame : null]} testID={mode === 'normal' ? 'customer-v21-screen-2.4-chat-normal' : 'customer-v21-screen-2.5-chat-case'}>
          <V21TopBar
            actionAccessibilityLabel={language === 'vi' ? 'Chuyển chế độ chat' : 'Switch chat mode'}
            actionLabel="⇄"
            actionTestID="customer-v21-chat-mode-menu-button"
            onBack={onBack}
            onAction={onToggleModeMenu}
            subtitle=""
            title={timelineHeadline}
            titleContainerStyle={chatStyles.chatTopCopyCentered}
            titleStyle={chatStyles.chatTimelineTitle}
          />

          {modeMenuOpen ? (
            <Animated.View style={[rootStyles.modeSwitch, chatStyles.chatModeSwitch, chatStyles.chatModeMenu, { backgroundColor: tokens.ghost, borderColor: 'rgba(255,255,255,0.88)' }, animatedModeMenuStyle]} testID="customer-v21-chat-mode-menu">
              <SourceCardSkin />
              <ChatModeSwitchAura reduceTransparency={reduceTransparency} />
              {!reduceMotion && !reduceTransparency ? (
                <Animated.View pointerEvents="none" style={[chatStyles.chatModeMenuSheen, animatedModeMenuSheenStyle]} testID="customer-v21-chat-mode-menu-sheen" />
              ) : null}
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === 'normal' }}
                onPress={() => onSwitchMode('normal')}
                style={[
                  rootStyles.modeButton,
                  chatStyles.chatModeButton,
                  chatStyles.chatModeMenuButton,
                  chatStyles.chatModeMenuOption,
                  { backgroundColor: mode === 'normal' ? tokens.raised : 'rgba(255,255,255,0.42)', borderColor: mode === 'normal' ? 'rgba(255,255,255,0.92)' : 'rgba(13,167,151,0.12)' },
                  mode === 'normal' ? chatStyles.chatModeButtonActive : null,
                ]}
                testID="customer-v21-chat-tab-normal"
              >
                <Text style={[rootStyles.modeButtonText, chatStyles.chatModeMenuText, { color: mode === 'normal' ? tokens.primary : tokens.muted }]}>{normalChatLabel}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === 'case' }}
                onPress={() => onSwitchMode('case')}
                style={[
                  rootStyles.modeButton,
                  chatStyles.chatModeButton,
                  chatStyles.chatModeMenuButton,
                  chatStyles.chatModeMenuOption,
                  { backgroundColor: mode === 'case' ? tokens.raised : 'rgba(255,255,255,0.42)', borderColor: mode === 'case' ? 'rgba(255,255,255,0.92)' : 'rgba(13,167,151,0.12)' },
                  mode === 'case' ? chatStyles.chatModeButtonActive : null,
                ]}
                testID="customer-v21-chat-tab-case-work"
              >
                <Text style={[rootStyles.modeButtonText, chatStyles.chatModeMenuText, { color: mode === 'case' ? tokens.primary : tokens.muted }]}>{caseWorkLabel}</Text>
              </Pressable>
            </Animated.View>
          ) : null}

          <ScrollView
            contentContainerStyle={[chatStyles.chatTranscript, modeMenuOpen ? chatStyles.chatTranscriptMenuOpen : null]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={hiddenScrollbarStyle}
            testID="customer-v21-kael-thread"
          >
            {showPendingDraftBubble ? (
              <ChatBubble
                role="customer"
                testID="customer-v21-pending-draft-bubble"
                text={pendingDraftMessage}
                tokens={tokens}
              />
            ) : null}
            {showNormalGreeting ? (
              <ChatBubble
                role="kael"
                testID="customer-v21-normal-greeting-bubble"
                text={language === 'vi' ? 'Chào bạn, mình là Kael. Bạn muốn hỏi gì hôm nay?' : 'Hi, I am Kael. What would you like to ask today?'}
                tokens={tokens}
              />
            ) : null}
            {mode === 'case' && hydratingCase ? (
              <V21Card style={historyActiveStyles.caseLoadingCard} testID="customer-v21-case-hydrating">
                <ActivityIndicator color={tokens.primary} />
                <Text style={[rootStyles.bodyText, { color: tokens.muted }]}>{language === 'vi' ? 'Đang tải công việc' : 'Loading job'}</Text>
              </V21Card>
            ) : null}
            {caseThreadNode}
            {workerCandidateNode}
            {agenticVisibleTurns.length > 0 ? agenticVisibleTurns.map((turn) => (
              <ChatBubble key={turn.id} role={turn.role === 'customer' ? 'customer' : 'kael'} text={turn.text_content ?? ''} tokens={tokens} />
            )) : null}
            {analysisEvidenceNode}
            {agenticEstimateNode}
            {mode === 'normal' ? normalAssistantTurns.map((turn) => (
              <ChatBubble key={turn.id} role={turn.role} text={turn.text_content} tokens={tokens} />
            )) : null}
            {caseAssistantTurns.map((turn) => (
              <ChatBubble key={turn.id} role={turn.role} text={turn.text_content} tokens={tokens} />
            ))}
            {processLinesNode}
            {missingCaseWorkDeal && !hydratingCase ? <InactiveAgenticGate testID="customer-v21-case-work-inactive" /> : null}
          </ScrollView>

          {normalEvidenceNode}
          {composerVoiceNode}
          {composerMediaNode}
          {error ? <Text style={[rootStyles.errorText, { color: tokens.primary }]} testID="customer-v21-kael-error">{error}</Text> : null}
          {showComposer ? <View style={[rootStyles.composer, chatStyles.chatComposer, { backgroundColor: tokens.raised, borderColor: 'rgba(255,255,255,0.92)' }]}>
            <SourceCardSkin />
            <ChatComposerAura reduceTransparency={reduceTransparency} />
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Thêm ảnh hoặc video' : 'Add photo or video'}
              accessibilityRole="button"
              accessibilityState={{ disabled: composerBusy || !canUseComposerMedia }}
              disabled={composerBusy || !canUseComposerMedia}
              onPress={onPickMedia}
              style={[chatStyles.chatMediaButton, !canUseComposerMedia ? chatStyles.chatMediaButtonDisabled : null, { backgroundColor: tokens.service, borderColor: tokens.border }]}
              testID="customer-v21-kael-media-picker"
            >
              <ChatMediaCameraIcon color={tokens.primary} />
              {composerMediaDraftCount > 0 ? (
                <View style={[chatStyles.chatMediaBadge, { backgroundColor: tokens.primary }]} testID="customer-v21-kael-media-count">
                  <Text style={[chatStyles.chatMediaBadgeText, { color: tokens.primaryText }]}>{composerMediaDraftCount}</Text>
                </View>
              ) : null}
            </Pressable>
            <KaelTextField
              editable={!composerBusy}
              inputShellStyle={rootStyles.composerTextFieldShell}
              onChangeText={onDraftChange}
              placeholder={composerPlaceholder}
              placeholderTextColor={tokens.subtleText}
              shellStyle={rootStyles.composerTextFieldStack}
              style={[rootStyles.composerInput, textInputNoOutlineStyle, { color: tokens.text }]}
              testID="customer-v21-kael-input"
              value={draft}
            />
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Gửi tin nhắn cho Kael' : 'Send message to Kael'}
              accessibilityRole="button"
              accessibilityState={{ busy: composerBusy, disabled: composerBusy }}
              disabled={composerBusy}
              onPress={onSendMessage}
              style={[rootStyles.sendButton, { backgroundColor: tokens.primary }]}
              testID="customer-v21-kael-send"
            >
              {composerBusy ? <ActivityIndicator color={tokens.primaryText} /> : <Text style={[rootStyles.sendText, { color: tokens.primaryText }]}>↑</Text>}
            </Pressable>
          </View> : null}
          {showComposer ? (
            <Text style={[chatStyles.chatComposerDisclaimer, { color: tokens.muted }]} testID="customer-v21-kael-chat-disclaimer">
              {language === 'vi' ? 'Kael có thể mắc lỗi. Hãy kiểm tra các thông tin quan trọng.' : 'Kael can make mistakes. Check important information.'}
            </Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
