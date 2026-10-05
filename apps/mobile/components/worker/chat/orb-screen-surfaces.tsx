import { useCallback, useMemo, useRef, useState } from 'react'
import { Pressable, Text as RNText, View, TextInput, type StyleProp, type TextProps, type ViewStyle , KeyboardAvoidingView, Platform } from 'react-native'
import { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, withDelay } from 'react-native-reanimated'
import { type LocalDeal } from '@nestscout/shared'
import { useFocusEffect } from 'expo-router'
import { useKaelComposerInputSizing } from '@/components/ui/kael-composer-input-height'
import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { GlassSurface } from '@/components/ui/glass-surface'
import { KaelSendStopGlyph } from '@/components/ui/kael-send-stop-glyph'
import { NormalChatGhostOverlay } from '@/components/ui/normal-chat-ghost-overlay'
import { LiquidControlButton } from '@/components/ui/liquid-back-button'
import { NormalChatStarterRail } from '@/components/ui/normal-chat-starter-rail'
import { useKaelComposerBottomInset } from '@/components/ui/use-kael-composer-bottom-inset'
import { EMPTY_NORMAL_CHAT_SUGGESTIONS, getNormalChatGhostSuffix } from '@/components/ui/normal-chat-composer-model'
import { motionDuration, motionTokens } from '@/components/ui/motion-tokens'
import { color, customerTheme } from '@/design/theme'
import { type AppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { useNormalChatSuggestions } from '@/lib/normal-chat-suggestions'
import { isWorkerActiveExecutionStatus } from '@/lib/frontend-workflow/helpers'
import { takePendingWorkerKaelDraft, type PendingWorkerKaelDraftScope } from '@/lib/pending-worker-kael-draft'
import { WorkerV5ScreenDefinition, WorkerV5ScreenId } from '../dock/types'
import { textByLanguage } from '../ui/format'
import { getWorkerV5ChatJobId } from '../ui/labels'
import { styles, workerV5KaelComposerWebTextInputNoOutline } from '../worker-v5-flow-styles'
import { WorkerV5KaelOrbCameraIcon } from './orb-camera-icon'
import { useWorkerV5KaelOrbChat } from './use-kael-orb-chat'
import { useWorkerKaelOrbPalette } from './orb-palette'
import { workerKaelChatService } from '@/lib/services'
import { canShowWorkerStaticNormalChatStarters, canUseWorkerV5KaelOrbSession } from './kael-orb-chat-model'
import { canUseWorkerV5PrivateKaelChat } from './use-worker-kael-orb-chat'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'


import { SafeAreaView, type Edge } from 'react-native-safe-area-context'

import { WorkerV5KaelOrbBody } from './body-surfaces'
import { WorkerV5KaelOrbNavigationSurface } from './orb-navigation-surface'
import { localizedServiceLabel } from '@/lib/app-language'


import { workerV5Icons, workerV5OpportunityServiceIcons } from '../ui/screen-icons'
import { workerV5JobsDestinationScreenId } from '../ui/screen-navigation'
import { useWorkerThemedStyles } from '../ui/worker-dark-styles'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>

// The bottom edge is padded by useKaelComposerBottomInset so the composer can sit near the device edge.
const KAEL_ORB_SAFE_AREA_EDGES: Edge[] = ['top', 'left', 'right']

function getWorkerV5KaelComposerArrowColor(normalComposer: boolean, canSubmit: boolean) {
  if (normalComposer) {
    if (canSubmit) return color.text.strong
    return customerTheme.lightLayer.muted
  }
  if (canSubmit) return color.text.inverse
  return color.text.muted
}

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

type WorkerV5KaelOrbMode = 'intake' | 'normal'

export function WorkerV5KaelOrbScreenSurface({
  deal,
  language,
  mode,
  onBack,
  navigateToScreen,
  profile,
  reduceMotion,
  reduceTransparency,
  screen,
  surfaceStyle,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  mode: WorkerV5KaelOrbMode
  onBack?: () => void
  navigateToScreen: (id: WorkerV5ScreenId) => void
  profile: WorkerV5Runtime['workerProfile']
  reduceMotion: boolean
  reduceTransparency: boolean
  screen: WorkerV5ScreenDefinition
  surfaceStyle: StyleProp<ViewStyle>
}) {
  const { session } = useAuth()
  const hasActiveExecutionCase = isWorkerActiveExecutionStatus(
    deal?.backendStatus ?? deal?.status ?? null,
  )
  const modeOptions = [
    {
      description: textByLanguage(language, 'Hỏi đáp và hỗ trợ nhanh', 'Quick questions and support'),
      label: 'Chat',
      value: 'normal' as const,
    },
    {
      description: hasActiveExecutionCase
        ? textByLanguage(language, 'Hỗ trợ theo công việc đang chạy', 'Support the active job')
        : textByLanguage(language, 'Lọc và chuẩn bị cơ hội phù hợp', 'Filter and prepare matching work'),
      label: hasActiveExecutionCase
        ? textByLanguage(language, 'Công việc', 'Work case')
        : 'Work',
      value: 'intake' as const,
    },
  ]
  const activeMode = modeOptions.find((item) => item.value === mode) ?? modeOptions[0]
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false)
  const [chatEntryKey, setChatEntryKey] = useState(0)
  const [composerActive, setComposerActive] = useState(false)
  const composerBottomInset = useKaelComposerBottomInset()
  const modeMenuOpacity = useSharedValue(reduceMotion ? 1 : 0)
  const modeMenuScaleX = useSharedValue(reduceMotion ? 1 : 0.92)
  const modeMenuScaleY = useSharedValue(reduceMotion ? 1 : 0.8)
  const modeMenuContentOpacity = useSharedValue(reduceMotion ? 1 : 0)
  const modeMenuContentTranslateY = useSharedValue(reduceMotion ? 0 : 8)
  const modeMenuTranslateY = useSharedValue(reduceMotion ? 0 : -4)
  const modeMenuTriggerScale = useSharedValue(1)

  const toggleModeMenu = () => {
    setSessionMenuOpen(false)
    if (!reduceMotion) {
      modeMenuTriggerScale.value = withSequence(
        withTiming(0.84, { duration: motionDuration(80, reduceMotion) }),
        withSpring(1, motionTokens.liquid.press),
      )
    }
    const nextOpen = !modeMenuOpen
    if (nextOpen) {
      modeMenuOpacity.value = reduceMotion ? 1 : 0
      modeMenuScaleX.value = reduceMotion ? 1 : 0.92
      modeMenuScaleY.value = reduceMotion ? 1 : 0.8
      modeMenuContentOpacity.value = reduceMotion ? 1 : 0
      modeMenuContentTranslateY.value = reduceMotion ? 0 : 8
      modeMenuTranslateY.value = reduceMotion ? 0 : -4
      if (reduceMotion) {
        modeMenuOpacity.value = 1
        modeMenuScaleX.value = 1
        modeMenuScaleY.value = 1
        modeMenuContentOpacity.value = 1
        modeMenuContentTranslateY.value = 0
        modeMenuTranslateY.value = 0
      } else {
        modeMenuOpacity.value = withTiming(1, { duration: motionDuration(120, reduceMotion) })
        modeMenuScaleX.value = withSpring(1, motionTokens.liquid.pill)
        modeMenuScaleY.value = withSpring(1, motionTokens.liquid.entrance)
        modeMenuTranslateY.value = withSpring(0, motionTokens.liquid.pill)
        modeMenuContentOpacity.value = withDelay(55, withTiming(1, { duration: motionDuration(130, reduceMotion) }))
        modeMenuContentTranslateY.value = withDelay(45, withSpring(0, motionTokens.liquid.entrance))
      }
    }
    setModeMenuOpen(nextOpen)
  }
  const animatedModeMenuStyle = useAnimatedStyle(() => ({
    opacity: modeMenuOpacity.value,
    transform: [
      { translateY: modeMenuTranslateY.value },
      { scaleX: modeMenuScaleX.value },
      { scaleY: modeMenuScaleY.value },
    ],
  }))
  const animatedModeMenuContentStyle = useAnimatedStyle(() => ({
    opacity: modeMenuContentOpacity.value,
    transform: [{ translateY: modeMenuContentTranslateY.value }],
  }))
  const animatedModeTriggerStyle = useAnimatedStyle(() => ({
    opacity: modeMenuTriggerScale.value,
  }))
  const orbChat = useWorkerV5KaelOrbChat(deal, language, mode)
  const lastWorkerChatTurn = orbChat.liveTurns[orbChat.liveTurns.length - 1]
  const suggestionSourceTurnId = lastWorkerChatTurn?.role === 'kael' ? lastWorkerChatTurn.id : null
  const activeSuggestionSessionId = orbChat.activeSessionId
  const fetchWorkerSuggestions = useCallback(async (input: { language: 'vi' | 'en'; source_turn_id: string }, signal: AbortSignal) => {
    if (!activeSuggestionSessionId) throw new Error('normal_chat_session_missing')
    const result = await workerKaelChatService.getSuggestions(activeSuggestionSessionId, input, signal)
    if (!result.success) throw new Error('normal_chat_suggestions_unavailable')
    return result.data
  }, [activeSuggestionSessionId])
  const normalChatSuggestions = useNormalChatSuggestions({
    accountId: session?.user.id,
    enabled: mode === 'normal'
      && !orbChat.busy
      && !orbChat.streamingReply
      && !orbChat.isLocalVisualAuditSession,
    fetcher: fetchWorkerSuggestions,
    language,
    role: 'worker',
    sessionId: activeSuggestionSessionId,
    sourceTurnId: suggestionSourceTurnId,
  })
  const hasJobIntakeScope = mode === 'intake' && canUseWorkerV5KaelOrbSession(deal)
  const pendingDraftScope: PendingWorkerKaelDraftScope = mode === 'normal'
    ? 'normal'
    : hasJobIntakeScope
      ? 'job'
      : 'opportunity'
  const resetToNewSession = orbChat.resetToNewSession
  const prepareKaelSurfaceFocus = useCallback(() => {
    setModeMenuOpen(false)
    setSessionMenuOpen(false)
    setComposerActive(false)
  }, [])
  const resetKaelSurface = useCallback(() => {
    setModeMenuOpen(false)
    setSessionMenuOpen(false)
    setComposerActive(false)
    setChatEntryKey((current) => current + 1)
    resetToNewSession()
  }, [resetToNewSession])
  useFocusEffect(prepareKaelSurfaceFocus)
  const switchMode = (nextMode: WorkerV5KaelOrbMode) => {
    resetKaelSurface()
    navigateToScreen(nextMode === 'normal' ? '3.1-kael-chat-normal' : '3.2-kael-job-intake')
  }
  const toggleSessionMenu = () => {
    setModeMenuOpen(false)
    const nextOpen = !sessionMenuOpen
    setSessionMenuOpen(nextOpen)
    if (nextOpen) void orbChat.refreshSessions()
  }
  const openNewSession = () => {
    setComposerActive(false)
    setChatEntryKey((current) => current + 1)
    resetToNewSession()
    void orbChat.startNewSession().then((created) => {
      if (created) setSessionMenuOpen(false)
    })
  }
  const openSession = (sessionId: string) => {
    setComposerActive(false)
    setSessionMenuOpen(false)
    void orbChat.openSession(sessionId)
  }
  const hasPrivateIntakeChat = mode !== 'intake' || !hasJobIntakeScope || canUseWorkerV5PrivateKaelChat(deal)
  const composer = useMemo(() => (
    !hasPrivateIntakeChat
      ? (
        <WorkerV5KaelIntakeReadinessActions
          language={language}
          navigateToScreen={navigateToScreen}
          profile={profile}
          reduceTransparency={reduceTransparency}
        />
      )
      : (
      <WorkerV5KaelOrbComposer
        busy={orbChat.busy}
        draftOwnerId={session?.user.id}
        draftScope={pendingDraftScope}
        key={`${session?.user.id ?? 'no-owner'}:${mode}:${pendingDraftScope}:${getWorkerV5ChatJobId(deal) ?? 'no-job'}:${orbChat.activeSessionId ?? 'draft'}:${chatEntryKey}`}
        language={language}
        mediaEnabled={hasJobIntakeScope || mode === 'normal'}
        mediaCount={orbChat.mediaCount}
        mode={mode}
        normalChatStarterAllowed={canShowWorkerStaticNormalChatStarters(mode, orbChat.liveTurns.length)}
        normalChatSuggestions={normalChatSuggestions?.status === 'ready' ? normalChatSuggestions.suggestions : []}
        onActivityChange={setComposerActive}
        onPickMedia={() => void orbChat.pickMedia()}
        onSend={orbChat.send}
        onStop={orbChat.stopMessage}
        reduceMotion={reduceMotion}
        reduceTransparency={reduceTransparency}
        sending={orbChat.sending}
        stopAvailable={orbChat.stopAvailable}
      />
      )
  ), [
    chatEntryKey,
    deal,
    hasPrivateIntakeChat,
    hasJobIntakeScope,
    language,
    mode,
    navigateToScreen,
    normalChatSuggestions,
    orbChat,
    pendingDraftScope,
    profile,
    reduceMotion,
    reduceTransparency,
    session?.user.id,
  ])

  return (
    <SafeAreaView edges={KAEL_ORB_SAFE_AREA_EDGES} style={[styles.safeArea, surfaceStyle, styles.kaelOrbCustomerSafeArea]} testID={`worker-v5-screen-${screen.id}`}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kaelOrbCustomerKeyboard}>
        <View
          style={[styles.kaelOrbCustomerChatFrame, { paddingBottom: composerBottomInset }, mode === 'intake' ? styles.kaelOrbCustomerChatFrameIntake : null]}
          testID="worker-v5-kael-customer-frame"
        >
          <WorkerV5KaelOrbNavigationSurface
            activeMode={activeMode}
            animatedModeMenuContentStyle={animatedModeMenuContentStyle}
            animatedModeMenuStyle={animatedModeMenuStyle}
            animatedModeTriggerStyle={animatedModeTriggerStyle}
            chat={orbChat}
            language={language}
            mode={mode}
            modeMenuOpen={modeMenuOpen}
            modeOptions={modeOptions}
            onBack={onBack ?? (() => navigateToScreen('2.1-opportunity-inbox'))}
            onOpenSession={openSession}
            onSelectMode={switchMode}
            onStartNewSession={openNewSession}
            onToggleModeMenu={toggleModeMenu}
            onToggleSessionMenu={toggleSessionMenu}
            reduceMotion={reduceMotion}
            reduceTransparency={reduceTransparency}
            sessionMenuOpen={sessionMenuOpen}
          />

          <WorkerV5KaelOrbBody
            activeSessionId={orbChat.activeSessionId}
            composer={composer}
            composerActive={composerActive}
            deal={deal}
            fallbackJobIcon={workerV5Icons.jobs}
            keepIntakeContextAccessible={!hasPrivateIntakeChat}
            language={language}
            liveError={orbChat.error}
            liveStatus={orbChat.reasoningReceipt.status !== 'idle' ? null : orbChat.busyLabel}
            liveTurns={orbChat.liveTurns}
            mode={mode}
            modeMenuOpen={modeMenuOpen || sessionMenuOpen}
            onOpenOpportunity={() => navigateToScreen(workerV5JobsDestinationScreenId(deal))}
            onStreamingReplySettled={orbChat.settleStreamingReply}
            onToggleReasoningReceipt={orbChat.toggleReasoningReceipt}
            reduceMotion={reduceMotion}
            reduceTransparency={reduceTransparency}
            reasoningReceipt={orbChat.reasoningReceipt}
            serviceIcons={workerV5OpportunityServiceIcons}
            streamingReply={orbChat.streamingReply}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function WorkerV5KaelIntakeReadinessActions({
  language,
  navigateToScreen,
  profile,
  reduceTransparency,
}: {
  language: AppLanguage
  navigateToScreen: (id: WorkerV5ScreenId) => void
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const opaqueCard = useWorkerThemedStyles(styles).opaqueCard
  const activeServices = profile?.active_service_types
    ?? profile?.selected_service_types
    ?? profile?.service_types
    ?? []
  const districtCount = profile?.districts?.length ?? 0
  const hasMatchingProfile = activeServices.length > 0 && districtCount > 0
  const activeServiceLabels = activeServices
    .map((service) => localizedServiceLabel(service, language))
    .join(', ')

  return (
    <View
      style={[styles.kaelIntakeReadinessCard, reduceTransparency && opaqueCard]}
      testID="worker-v5-kael-intake-readiness"
    >
      <Text style={styles.kaelIntakeReadinessTitle}>
        {hasMatchingProfile
          ? textByLanguage(language, 'Đang lọc theo hồ sơ của bạn', 'Matching from your profile')
          : textByLanguage(language, 'Tăng cơ hội phù hợp', 'Improve matching readiness')}
      </Text>
      <Text style={styles.kaelIntakeReadinessBody}>
        {hasMatchingProfile
          ? textByLanguage(
              language,
              `Kael đang lọc theo ${activeServiceLabels} và ${districtCount} khu vực đã lưu. Bạn vẫn là người quyết định nhận việc.`,
              `Kael is matching ${activeServiceLabels} across ${districtCount} saved areas. You still decide whether to accept.`,
            )
          : textByLanguage(
              language,
              'Kỹ năng và khu vực trong hồ sơ được dùng để lọc cơ hội. Kael chỉ tư vấn; bạn vẫn là người quyết định nhận việc.',
              'Profile skills and service areas are used to filter opportunities. Kael advises; you still decide whether to accept.',
            )}
      </Text>
      <KaelButton
        label={hasMatchingProfile
          ? textByLanguage(language, 'Chỉnh dịch vụ & khu vực', 'Edit services & area')
          : textByLanguage(language, 'Cập nhật kỹ năng & khu vực', 'Update skills & area')}
        onPress={() => navigateToScreen('5.3-skills-service-area')}
        showPrimaryGradient={false}
        style={styles.kaelIntakeReadinessButton}
        testID="worker-v5-kael-optimize-profile"
        variant="secondary"
      />
    </View>
  )
}

export function WorkerV5KaelOrbComposer({
  busy,
  draftOwnerId,
  draftScope,
  initialDraft = '',
  language,
  mediaEnabled = true,
  mediaCount,
  mode,
  normalChatStarterAllowed = false,
  normalChatSuggestions = EMPTY_NORMAL_CHAT_SUGGESTIONS,
  onActivityChange,
  onPickMedia,
  onSend,
  onStop,
  reduceMotion,
  reduceTransparency,
  sending = false,
  stopAvailable = false,
}: {
  busy: boolean
  draftOwnerId?: string | null
  draftScope?: PendingWorkerKaelDraftScope
  initialDraft?: string
  language: AppLanguage
  mediaEnabled?: boolean
  mediaCount: number
  mode: WorkerV5KaelOrbMode
  normalChatStarterAllowed?: boolean
  normalChatSuggestions?: { id: string; text: string }[]
  onActivityChange?: (active: boolean) => void
  onPickMedia: () => void
  onSend: (message: string) => Promise<boolean>
  onStop?: () => void
  reduceMotion: boolean
  reduceTransparency: boolean
  sending?: boolean
  stopAvailable?: boolean
}) {
  const [draft, setDraft] = useState(() => initialDraft || (
    draftScope
      ? takePendingWorkerKaelDraft(draftOwnerId, mode, draftScope)?.message ?? ''
      : ''
  ))
  const inputSizing = useKaelComposerInputSizing(draft)
  const palette = useWorkerKaelOrbPalette()
  const dark = palette.mode === 'dark'
  const focusedRef = useRef(false)
  const inputRef = useRef<TextInput>(null)
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)
  const [isComposing, setIsComposing] = useState(false)
  const trimmedDraft = draft.trim()
  const stopping = sending && stopAvailable && Boolean(onStop)
  const normalComposer = mode === 'normal'
  const canSubmit = !busy && (Boolean(trimmedDraft) || (normalComposer && mediaCount > 0))
  const mediaLabel = mode === 'normal'
    ? textByLanguage(language, 'Thêm ảnh cho Kael', 'Add photo for Kael')
    : textByLanguage(language, 'Thêm ảnh công việc cho Kael', 'Add work photo for Kael')
  const starterVisible = normalChatStarterAllowed && normalComposer && !busy && !draft.trim() && mediaCount === 0
  const ghost = normalComposer && !busy
    ? getNormalChatGhostSuffix(draft, normalChatSuggestions, selection, isComposing)
    : null
  const liveGhostContext = useRef({ draft, isComposing, selection, suggestions: normalChatSuggestions })
  liveGhostContext.current = { draft, isComposing, selection, suggestions: normalChatSuggestions }
  const acceptGhost = () => {
    const latest = liveGhostContext.current
    const currentGhost = getNormalChatGhostSuffix(latest.draft, latest.suggestions, latest.selection, latest.isComposing)
    if (!currentGhost || currentGhost.suggestionId !== ghost?.suggestionId) return
    updateDraft(latest.draft ? `${latest.draft}${currentGhost.text}` : currentGhost.text)
    setSelection(null)
    inputRef.current?.focus()
  }
  const inputTextStyle = [styles.kaelOrbComposerInput, normalComposer && styles.kaelOrbNormalComposerInput, inputSizing.inputStyle, workerV5KaelComposerWebTextInputNoOutline]

  const submitDraft = async () => {
    if ((!trimmedDraft && !(normalComposer && mediaCount > 0)) || busy) return
    const sent = await onSend(trimmedDraft)
    if (!sent) return
    setDraft('')
    onActivityChange?.(focusedRef.current)
  }

  const updateDraft = (nextDraft: string) => {
    setSelection(null)
    setDraft(nextDraft)
    onActivityChange?.(focusedRef.current || nextDraft.trim().length > 0)
  }

  const focusComposer = () => {
    focusedRef.current = true
    onActivityChange?.(true)
  }

  const blurComposer = () => {
    focusedRef.current = false
    onActivityChange?.(draft.trim().length > 0)
  }

  return (
    <View style={styles.kaelOrbComposerStack} testID="worker-v5-kael-orb-composer">
      {starterVisible ? (
        <NormalChatStarterRail
          actorRole="worker"
          colors={dark ? { opaqueBackground: palette.opaqueFill, opaqueBorder: palette.opaqueBorder, text: palette.ink } : undefined}
          language={language}
          mode={palette.mode}
          onSelect={(starterDraft) => {
            updateDraft(starterDraft)
            setSelection(null)
            inputRef.current?.focus()
          }}
          visible
        />
      ) : null}
      {ghost && !starterVisible ? (
        <Text style={[styles.kaelOrbSuggestionHint, dark ? { color: palette.muted } : null]} testID="worker-v5-kael-ghost-hint">
          {textByLanguage(language, 'Chạm chữ mờ để thêm vào tin nhắn.', 'Tap the faded text to add it to your message.')}
        </Text>
      ) : null}
      <GlassSurface
        backgroundColor={palette.composerFill}
        borderColor={dark || normalComposer ? palette.composerBorder : color.surface.stroke}
        material="liquid"
        mode={palette.mode}
        style={[
          styles.kaelOrbComposerCard,
          normalComposer && styles.kaelOrbNormalComposerCard,
          styles.kaelOrbComposerCardMultiline,
          reduceTransparency && [styles.opaqueCard, dark ? { backgroundColor: palette.opaqueFill } : null],
        ]}
        testID="worker-v5-kael-orb-composer-frame"
        variant="control"
      >
        {mediaEnabled ? <Pressable
          accessibilityLabel={mediaLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          hitSlop={3}
          onPress={onPickMedia}
          style={({ pressed }) => [
            styles.kaelOrbComposerCameraButton,
            {
              borderRadius: 22,
              height: 44,
              width: 44,
            },
            pressed && !reduceMotion ? { transform: [{ scale: 0.96 }] } : null,
          ]}
          testID="worker-v5-kael-orb-camera"
        >
          <WorkerV5KaelOrbCameraIcon color={busy ? palette.muted : palette.ink} size={27} />
          {mediaCount > 0 ? (
            <View style={styles.kaelOrbComposerCameraBadge} testID="worker-v5-kael-orb-camera-count">
              <Text style={styles.kaelOrbComposerCameraBadgeText}>{mediaCount}</Text>
            </View>
          ) : null}
        </Pressable> : null}
        <KaelTextField
          accessibilityLabel={textByLanguage(language, 'Nhắn Kael', 'Message Kael')}
          inputRef={inputRef}
          inputShellAdornment={ghost ? (
            <NormalChatGhostOverlay
              draft={draft}
              draftColor={dark ? palette.ink : color.kaelChatSend.idleForeground}
              language={language}
              onAccept={acceptGhost}
              suggestionColor={palette.muted}
              suffix={ghost.text}
              textStyle={inputTextStyle}
            />
          ) : undefined}
          inputShellStyle={styles.kaelOrbComposerInputShell}
          inputShellTestID="worker-v5-kael-orb-input-shell"
          multiline
          onChange={(event) => {
            const nativeEvent = event.nativeEvent as typeof event.nativeEvent & { composing?: boolean; isComposing?: boolean }
            setIsComposing(Boolean(nativeEvent.isComposing ?? nativeEvent.composing))
          }}
          onContentSizeChange={inputSizing.onContentSizeChange}
          onBlur={blurComposer}
          onChangeText={updateDraft}
          onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
          onFocus={focusComposer}
          onSubmitEditing={submitDraft}
          placeholder={ghost ? '' : textByLanguage(language, 'Nhập tin nhắn cho Kael...', 'Message Kael...')}
          placeholderTextColor={palette.muted}
          returnKeyType={inputSizing.returnKeyType}
          selectionColor={dark ? palette.accent : color.kaelChatSend.idleForeground}
          scrollEnabled={inputSizing.scrollEnabled}
          shellStyle={styles.kaelOrbComposerField}
          style={[...inputTextStyle, { color: ghost ? 'transparent' : palette.ink, zIndex: 1 }]}
          submitBehavior={inputSizing.submitBehavior}
          testID="worker-v5-kael-orb-input"
          value={draft}
        />
        {!stopping && canSubmit ? (
          // Ready to send: the header's liquid glass control. Empty and Stop keep their own states.
          <LiquidControlButton
            accessibilityLabel={textByLanguage(language, 'Gửi tin nhắn cho Kael', 'Send message to Kael')}
            accessibilityState={{ busy }}
            mode={palette.mode}
            onPress={submitDraft}
            size={44}
            style={styles.kaelOrbSendButton}
            testID="worker-v5-kael-orb-send"
          >
            <KaelSendStopGlyph
              arrowColor={palette.icon}
              reduceMotion={reduceMotion}
              stopColor={palette.icon}
              stopping={false}
              testIDPrefix="worker-v5-kael-orb"
            />
          </LiquidControlButton>
        ) : (
          <Pressable
            accessibilityLabel={stopping
              ? textByLanguage(language, 'Dừng phản hồi', 'Stop response')
              : textByLanguage(language, 'Gửi tin nhắn cho Kael', 'Send message to Kael')}
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: !stopping && !canSubmit }}
            disabled={!stopping && !canSubmit}
            onPress={stopping ? onStop : submitDraft}
            style={({ pressed }) => [
              styles.kaelOrbSendButton,
              {
                backgroundColor: normalComposer || dark
                  ? palette.sendIdle(sending).background
                  : stopping || canSubmit ? color.brand.primary : color.surface.soft,
                borderColor: dark ? palette.composerBorder : color.surface.stroke,
                borderRadius: 22,
                borderWidth: 1,
                height: 44,
                width: 44,
              },
              pressed && !reduceMotion ? { transform: [{ scale: 0.96 }] } : null,
            ]}
            testID="worker-v5-kael-orb-send"
          >
            <KaelSendStopGlyph
              arrowColor={normalComposer || dark
                ? palette.sendIdle(sending).foreground
                : getWorkerV5KaelComposerArrowColor(false, canSubmit)}
              reduceMotion={reduceMotion}
              stopColor={normalComposer || dark ? palette.sendIdle(sending).foreground : color.text.inverse}
              stopping={stopping}
              testIDPrefix="worker-v5-kael-orb"
            />
          </Pressable>
        )}
      </GlassSurface>
      <Text style={[styles.kaelOrbComposerDisclaimer, dark ? { color: palette.muted } : null]} testID="worker-v5-kael-orb-disclaimer">
        {textByLanguage(language, 'Kael có thể mắc lỗi. Hãy kiểm tra các thông tin quan trọng.', 'Kael can make mistakes. Check important information.')}
      </Text>
    </View>
  )
}


