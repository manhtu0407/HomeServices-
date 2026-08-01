import { useCallback, useRef, useState , useEffect } from 'react'
import { Pressable, Text as RNText, View, type StyleProp, type TextProps, type ViewStyle , KeyboardAvoidingView, Platform, type PressableStateCallbackType } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming , withDelay } from 'react-native-reanimated'
import { type LocalDeal } from '@nestscout/shared'
import { useFocusEffect } from 'expo-router'
import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { motionDuration, motionTokens } from '@/components/ui/motion-tokens'
import { color } from '@/design/theme'
import { type AppLanguage } from '@/lib/app-language'
import { isWorkerActiveExecutionStatus } from '@/lib/frontend-workflow/helpers'
import { WorkerV5ScreenDefinition, WorkerV5ScreenId } from '../dock/types'
import { WorkerV5CustomerCaseWideMintAura, WorkerV5CustomerZipMintAura, WorkerV5SourceCardSkin , WorkerV5CustomerFulfillmentCanvasAura, WorkerV5KaelChatScreenAura } from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import { getWorkerV5ChatJobId } from '../ui/labels'
import { styles } from '../worker-v5-flow-styles'
import { WorkerV5KaelOrbCameraIcon } from './orb-surfaces'
import { useWorkerV5KaelOrbChat } from './use-kael-orb-chat'
import { canUseWorkerV5PrivateKaelChat } from './use-worker-kael-orb-chat'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'


import { SafeAreaView } from 'react-native-safe-area-context'
import { WorkerV5BackArrowIcon } from '../ui/primitives-surfaces'

import { WorkerV5KaelOrbBody } from './body-surfaces'
import { WorkerV5KaelSessionMenu, WorkerV5KaelSessionPlusIcon } from './session-menu'
import { localizedServiceLabel } from '@/lib/app-language'


import { workerV5Icons, workerV5OpportunityServiceIcons } from '../ui/screen-icons'
import { workerV5JobsDestinationScreenId } from '../ui/screen-navigation'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

type WorkerV5KaelOrbMode = 'intake' | 'normal'

export function WorkerV5KaelOrbScreenSurface({
  deal,
  language,
  mode,
  navigateToScreen,
  profile,
  reduceMotion,
  reduceTransparency,
  screen,
  surfaceStyle,
  workerJobsHydrated,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  mode: WorkerV5KaelOrbMode
  navigateToScreen: (id: WorkerV5ScreenId) => void
  profile: WorkerV5Runtime['workerProfile']
  reduceMotion: boolean
  reduceTransparency: boolean
  screen: WorkerV5ScreenDefinition
  surfaceStyle: StyleProp<ViewStyle>
  workerJobsHydrated: boolean
}) {
  const hasActiveExecutionCase = isWorkerActiveExecutionStatus(
    deal?.backendStatus ?? deal?.status ?? null,
  )
  const modeOptions = [
    {
      description: textByLanguage(language, 'Hỏi đáp và hỗ trợ nhanh', 'Quick questions and support'),
      label: textByLanguage(language, 'Chat thường', 'Normal chat'),
      value: 'normal' as const,
    },
    {
      description: hasActiveExecutionCase
        ? textByLanguage(language, 'Hỗ trợ theo công việc đang chạy', 'Support the active job')
        : textByLanguage(language, 'Lọc và chuẩn bị cơ hội phù hợp', 'Filter and prepare matching work'),
      label: hasActiveExecutionCase
        ? textByLanguage(language, 'Công việc', 'Work case')
        : textByLanguage(language, 'Nhận việc', 'Job intake'),
      value: 'intake' as const,
    },
  ]
  const activeMode = modeOptions.find((item) => item.value === mode) ?? modeOptions[0]
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false)
  const [chatEntryKey, setChatEntryKey] = useState(0)
  const [composerActive, setComposerActive] = useState(false)
  const modeMenuOpacity = useSharedValue(reduceMotion ? 1 : 0)
  const modeMenuScaleX = useSharedValue(reduceMotion ? 1 : 0.92)
  const modeMenuScaleY = useSharedValue(reduceMotion ? 1 : 0.8)
  const modeMenuContentOpacity = useSharedValue(reduceMotion ? 1 : 0)
  const modeMenuContentTranslateY = useSharedValue(reduceMotion ? 0 : 8)
  const modeMenuSheenOpacity = useSharedValue(0)
  const modeMenuSheenX = useSharedValue(-92)
  const modeMenuTranslateY = useSharedValue(reduceMotion ? 0 : -4)
  const modeMenuTriggerScale = useSharedValue(1)

  const toggleModeMenu = () => {
    setSessionMenuOpen(false)
    if (!reduceMotion) {
      modeMenuTriggerScale.value = withSequence(
        withTiming(0.985, { duration: motionDuration(70, reduceMotion) }),
        withSpring(1, motionTokens.liquid.press),
      )
    }
    if (!modeMenuOpen) {
      modeMenuOpacity.value = reduceMotion ? 1 : 0
      modeMenuScaleX.value = reduceMotion ? 1 : 0.92
      modeMenuScaleY.value = reduceMotion ? 1 : 0.8
      modeMenuContentOpacity.value = reduceMotion ? 1 : 0
      modeMenuContentTranslateY.value = reduceMotion ? 0 : 8
      modeMenuSheenOpacity.value = 0
      modeMenuSheenX.value = -92
      modeMenuTranslateY.value = reduceMotion ? 0 : -4
    }
    setModeMenuOpen((current) => !current)
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
  const animatedModeMenuSheenStyle = useAnimatedStyle(() => ({
    opacity: modeMenuSheenOpacity.value,
    transform: [
      { translateX: modeMenuSheenX.value },
      { rotate: '-10deg' },
    ],
  }))
  const animatedModeTriggerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: modeMenuTriggerScale.value }],
  }))
  const orbChat = useWorkerV5KaelOrbChat(deal, language, mode, workerJobsHydrated)
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
  const hasPrivateIntakeChat = mode !== 'intake' || canUseWorkerV5PrivateKaelChat(deal)
  const composer = !hasPrivateIntakeChat
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
        key={`${mode}:${getWorkerV5ChatJobId(deal) ?? 'no-job'}:${orbChat.activeSessionId ?? 'draft'}:${chatEntryKey}`}
        language={language}
        mediaCount={orbChat.mediaCount}
        mode={mode}
        onActivityChange={setComposerActive}
        onPickMedia={() => void orbChat.pickMedia()}
        onSend={(message) => void orbChat.send(message)}
        reduceTransparency={reduceTransparency}
      />
    )

  useEffect(() => {
    if (!modeMenuOpen) return
    if (reduceMotion) {
      modeMenuOpacity.value = 1
      modeMenuScaleX.value = 1
      modeMenuScaleY.value = 1
      modeMenuContentOpacity.value = 1
      modeMenuContentTranslateY.value = 0
      modeMenuSheenOpacity.value = 0
      modeMenuTranslateY.value = 0
      return
    }

    modeMenuOpacity.value = withTiming(1, { duration: motionDuration(120, reduceMotion) })
    modeMenuScaleX.value = withSpring(1, motionTokens.liquid.pill)
    modeMenuScaleY.value = withSpring(1, motionTokens.liquid.entrance)
    modeMenuTranslateY.value = withSpring(0, motionTokens.liquid.pill)
    modeMenuContentOpacity.value = withDelay(55, withTiming(1, { duration: motionDuration(130, reduceMotion) }))
    modeMenuContentTranslateY.value = withDelay(45, withSpring(0, motionTokens.liquid.entrance))
    if (!reduceTransparency) {
      modeMenuSheenOpacity.value = withSequence(
        withTiming(0.58, { duration: motionDuration(90, reduceMotion) }),
        withDelay(170, withTiming(0, { duration: motionDuration(180, reduceMotion) })),
      )
      modeMenuSheenX.value = withTiming(96, { duration: motionDuration(340, reduceMotion) })
    }
  }, [modeMenuContentOpacity, modeMenuContentTranslateY, modeMenuOpen, modeMenuOpacity, modeMenuScaleX, modeMenuScaleY, modeMenuSheenOpacity, modeMenuSheenX, modeMenuTranslateY, reduceMotion, reduceTransparency])

  return (
    <SafeAreaView style={[styles.safeArea, surfaceStyle, styles.kaelOrbCustomerSafeArea]} testID={`worker-v5-screen-${screen.id}`}>
      <WorkerV5CustomerFulfillmentCanvasAura
        reduceTransparency={reduceTransparency}
        scope="KaelOrbCustomerPage"
        testID="worker-v5-kael-orb-background-mint-aura"
      />
      <WorkerV5KaelChatScreenAura
        reduceTransparency={reduceTransparency}
        scope={mode === 'intake' ? 'KaelJobIntake' : 'KaelChatNormal'}
        testID={mode === 'intake' ? 'worker-v5-kael-job-intake-screen-mint-aura' : 'worker-v5-kael-chat-screen-mint-aura'}
      />
      {!reduceTransparency ? (
        <WorkerV5CustomerZipMintAura
          scope="KaelOrbCustomerPageFine"
          style={styles.kaelOrbPageZipAura}
          testID="worker-v5-kael-orb-page-zip-mint-aura"
        />
      ) : null}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kaelOrbCustomerKeyboard}>
        <View
          style={[styles.kaelOrbCustomerChatFrame, mode === 'intake' ? styles.kaelOrbCustomerChatFrameIntake : null]}
          testID="worker-v5-kael-customer-frame"
        >
          <View style={[styles.kaelOrbCustomerTopBar, reduceTransparency && styles.opaqueCard]} testID="worker-v5-kael-source-header">
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Quay lại' : 'Back'}
              accessibilityRole="button"
              onPress={() => navigateToScreen('2.1-opportunity-inbox')}
              style={({ pressed }) => [styles.kaelOrbCustomerTopControl, pressed ? styles.pressed : null]}
              testID="worker-v5-back"
            >
              <WorkerV5BackArrowIcon />
            </Pressable>
            <View style={styles.kaelOrbCustomerTopSpacer} />
            <View
              style={[
                styles.kaelOrbCustomerHeaderActions,
                modeMenuOpen || sessionMenuOpen ? styles.kaelOrbCustomerHeaderActionsOpen : null,
              ]}
              testID="worker-v5-kael-header-actions"
            >
              <Pressable
                accessibilityLabel={textByLanguage(language, 'Quản lý các phiên Kael', 'Manage Kael conversations')}
                accessibilityRole="button"
                accessibilityState={{ expanded: sessionMenuOpen }}
                onPress={toggleSessionMenu}
                style={({ pressed }) => [
                  styles.kaelOrbCustomerSessionTrigger,
                  sessionMenuOpen ? styles.kaelOrbCustomerSessionTriggerOpen : null,
                  pressed ? (reduceMotion ? styles.kaelOrbCustomerSessionTriggerPressedReduced : styles.pressed) : null,
                ]}
                testID="worker-v5-kael-session-toggle"
              >
                <WorkerV5KaelSessionPlusIcon />
              </Pressable>
              <AnimatedPressable
                accessibilityLabel={textByLanguage(
                  language,
                  `Chế độ Kael: ${activeMode.label}. Nhấn để đổi chế độ`,
                  `Kael mode: ${activeMode.label}. Press to switch mode`,
                )}
                accessibilityRole="button"
                accessibilityState={{ expanded: modeMenuOpen }}
                onPress={toggleModeMenu}
                style={({ pressed }: PressableStateCallbackType) => [
                  styles.kaelOrbCustomerModeTrigger,
                  modeMenuOpen ? styles.kaelOrbCustomerModeTriggerOpen : null,
                  animatedModeTriggerStyle,
                  pressed ? styles.pressed : null,
                ]}
                testID="worker-v5-kael-mode-toggle"
              >
                <Text
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                  numberOfLines={1}
                  style={styles.kaelOrbCustomerModeTriggerText}
                  testID="worker-v5-kael-active-mode"
                >
                  {activeMode.label}
                </Text>
              </AnimatedPressable>
            </View>
          </View>

          {modeMenuOpen ? (
            <Animated.View style={[styles.kaelOrbCustomerModeMenu, reduceTransparency && styles.opaqueCard, animatedModeMenuStyle]} testID="worker-v5-kael-mode-menu">
              {!reduceTransparency ? (
                <>
                  <WorkerV5SourceCardSkin testID="worker-v5-kael-mode-menu-skin" />
                  <WorkerV5CustomerCaseWideMintAura scope="KaelOrbModeMenu" style={styles.kaelOrbCustomerModeMenuAura} testID="worker-v5-kael-mode-menu-mint-aura" />
                  <View pointerEvents="none" style={styles.kaelOrbCustomerModeMenuTopLight} testID="worker-v5-kael-mode-menu-top-light" />
                  <View pointerEvents="none" style={styles.kaelOrbCustomerModeMenuInnerShadow} testID="worker-v5-kael-mode-menu-inner-shadow" />
                  {!reduceMotion ? <Animated.View pointerEvents="none" style={[styles.kaelOrbCustomerModeMenuSheen, animatedModeMenuSheenStyle]} testID="worker-v5-kael-mode-menu-sheen" /> : null}
                </>
              ) : null}
              <Animated.View style={[styles.kaelOrbCustomerModeMenuOptions, animatedModeMenuContentStyle]} testID="worker-v5-kael-mode-menu-options">
                {modeOptions.map((item) => {
                  const selected = mode === item.value
                  return (
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      key={item.value}
                      onPress={() => switchMode(item.value)}
                      style={({ pressed }) => [
                        styles.kaelOrbCustomerModeMenuOption,
                        selected ? styles.kaelOrbCustomerModeMenuOptionActive : null,
                        pressed ? styles.pressed : null,
                      ]}
                      testID={`worker-v5-kael-mode-menu-${item.value}`}
                    >
                      <View style={styles.kaelOrbCustomerModeMenuCopy}>
                        <Text style={[styles.kaelOrbCustomerModeMenuText, selected ? styles.kaelOrbCustomerModeMenuTextActive : null]}>{item.label}</Text>
                        <Text style={styles.kaelOrbCustomerModeMenuDescription}>{item.description}</Text>
                      </View>
                      {selected ? <Text style={styles.kaelOrbCustomerModeMenuCheck}>{'✓'}</Text> : null}
                    </Pressable>
                  )
                })}
              </Animated.View>
            </Animated.View>
          ) : null}

          {sessionMenuOpen ? (
            <WorkerV5KaelSessionMenu
              activeSessionId={orbChat.activeSessionId}
              canCreate={orbChat.canCreateSession}
              error={orbChat.sessionsError}
              language={language}
              loading={orbChat.sessionsLoading}
              mode={mode}
              onArchive={orbChat.archiveSession}
              onCreate={openNewSession}
              onPin={orbChat.setSessionPinned}
              onRename={orbChat.renameSession}
              onSelect={openSession}
              pendingSessionIds={orbChat.pendingSessionIds}
              reduceMotion={reduceMotion}
              reduceTransparency={reduceTransparency}
              sessions={orbChat.sessions}
            />
          ) : null}

          <WorkerV5KaelOrbBody
            activeSessionId={orbChat.activeSessionId}
            composer={composer}
            composerActive={composerActive}
            deal={deal}
            fallbackJobIcon={workerV5Icons.jobs}
            keepIntakeContextAccessible={!hasPrivateIntakeChat}
            language={language}
            liveError={orbChat.error}
            liveStatus={orbChat.busyLabel}
            liveTurns={orbChat.liveTurns}
            mode={mode}
            modeMenuOpen={modeMenuOpen || sessionMenuOpen}
            onOpenOpportunity={() => navigateToScreen(workerV5JobsDestinationScreenId(deal))}
            reduceMotion={reduceMotion}
            reduceTransparency={reduceTransparency}
            serviceIcons={workerV5OpportunityServiceIcons}
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
      style={[styles.kaelIntakeReadinessCard, reduceTransparency && styles.opaqueCard]}
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
  language,
  mediaCount,
  mode,
  onActivityChange,
  onPickMedia,
  onSend,
  reduceTransparency,
}: {
  busy: boolean
  language: AppLanguage
  mediaCount: number
  mode: WorkerV5KaelOrbMode
  onActivityChange?: (active: boolean) => void
  onPickMedia: () => void
  onSend: (message: string) => void
  reduceTransparency: boolean
}) {
  const [draft, setDraft] = useState('')
  const focusedRef = useRef(false)
  const trimmedDraft = draft.trim()
  const mediaLabel = mode === 'normal'
    ? textByLanguage(language, 'Thêm ảnh cho Kael', 'Add photo for Kael')
    : textByLanguage(language, 'Thêm ảnh công việc cho Kael', 'Add work photo for Kael')

  const submitDraft = () => {
    if (!trimmedDraft || busy) return
    setDraft('')
    onActivityChange?.(focusedRef.current)
    onSend(trimmedDraft)
  }

  const updateDraft = (nextDraft: string) => {
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
      <View style={[styles.kaelOrbComposerCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-kael-orb-composer-frame">
        {!reduceTransparency ? (
          <>
            <WorkerV5SourceCardSkin testID="worker-v5-kael-orb-composer-skin" />
            <WorkerV5CustomerCaseWideMintAura scope="KaelOrbComposerWide" style={styles.kaelOrbComposerAura} testID="worker-v5-kael-orb-composer-mint-aura" />
          </>
        ) : null}
        <Pressable
          accessibilityLabel={mediaLabel}
          accessibilityRole="button"
          disabled={busy}
          onPress={onPickMedia}
          style={({ pressed }) => [
            styles.kaelOrbComposerCameraButton,
            pressed ? styles.pressed : null,
          ]}
          testID="worker-v5-kael-orb-camera"
        >
          <WorkerV5KaelOrbCameraIcon color={color.brand.primaryDark} />
          {mediaCount > 0 ? (
            <View style={styles.kaelOrbComposerCameraBadge} testID="worker-v5-kael-orb-camera-count">
              <Text style={styles.kaelOrbComposerCameraBadgeText}>{mediaCount}</Text>
            </View>
          ) : null}
        </Pressable>
        <KaelTextField
          accessibilityLabel={textByLanguage(language, 'Nhắn Kael', 'Message Kael')}
          inputShellStyle={styles.kaelOrbComposerInputShell}
          inputShellTestID="worker-v5-kael-orb-input-shell"
          onBlur={blurComposer}
          onChangeText={updateDraft}
          onFocus={focusComposer}
          onSubmitEditing={submitDraft}
          placeholder={textByLanguage(language, 'Nhập tin nhắn cho Kael...', 'Message Kael...')}
          placeholderTextColor={color.text.muted}
          returnKeyType="send"
          shellStyle={styles.kaelOrbComposerField}
          style={styles.kaelOrbComposerInput}
          testID="worker-v5-kael-orb-input"
          value={draft}
        />
        <Pressable
          accessibilityLabel={textByLanguage(language, 'Gửi tin nhắn cho Kael', 'Send message to Kael')}
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy || !trimmedDraft }}
          disabled={busy || !trimmedDraft}
          onPress={submitDraft}
          style={({ pressed }) => [
            styles.kaelOrbSendButton,
            busy || !trimmedDraft ? styles.jobRoomSendDisabled : null,
            pressed && trimmedDraft ? styles.pressed : null,
          ]}
          testID="worker-v5-kael-orb-send"
        >
          <Text style={styles.kaelOrbSendText}>↑</Text>
        </Pressable>
      </View>
      <Text style={styles.kaelOrbComposerDisclaimer} testID="worker-v5-kael-orb-disclaimer">
        {textByLanguage(language, 'Kael có thể mắc lỗi. Hãy kiểm tra các thông tin quan trọng.', 'Kael can make mistakes. Check important information.')}
      </Text>
    </View>
  )
}


