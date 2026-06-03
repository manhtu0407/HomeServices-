import { type Dispatch, useEffect, useMemo, useState } from 'react'
import { Image } from 'expo-image'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { type ServiceType } from '@home-services/shared'
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import { type KaelChatResponse, type KaelChatTurn } from '@/lib/api-types'
import { useServiceWorkflow } from '@/lib/use-service-workflow'
import {
  EmptyKaelBriefCard,
  EstimateCard,
  EstimateInline,
  KaelIntakeReceiptCard,
  KaelPhaseContextCard,
  KaelProcessCard,
  KaelTraceCard,
  useKaelChatTokens,
} from './agentic-parts'
import { kaelSurfacePaint } from './paint'
import { type KaelChatAction, type KaelChatState } from './state'
import { styles } from './styles'

const kaelModel8AHead = require('../../../assets/kael-model-8a-head.png')
const supportedServices: ServiceType[] = ['electrical', 'plumbing', 'cleaning']
const vietnameseSignalPattern = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i
const LIVE_ACTIVITY_SWEEP_MS = 1400
const KAEL_REVEAL_FRAME_MS = 22
const KAEL_REVEAL_TARGET_FRAMES = 42

type KaelChatThreadText = Parameters<typeof KaelProcessCard>[0]['text'] & {
  activityOrchestrating: string
  activityResearch: string
  activityThinking: string
  history: string
  loading: string
  retryIntake: string
  retryOrchestration: string
  turnFallback: string
  welcome: string
}

export type KaelChatVisibility = {
  canStartOrchestration: boolean
  showBrief: boolean
  showEstimate: boolean
  showProcess: boolean
  showStarter: boolean
  showTrace: boolean
}

type KaelLifecyclePanel =
  | 'brief'
  | 'error'
  | 'estimate'
  | 'liveActivity'
  | 'loading'
  | 'orchestrationStarted'
  | 'pendingIntake'
  | 'phaseContext'
  | 'process'
  | 'starter'
  | 'trace'
  | null

export function KaelChatThread({
  addressDistrict,
  dispatch,
  error,
  estimate,
  historyTarget,
  language,
  loading,
  onStartOrchestration,
  onRetryPendingIntake,
  onOpenHistory,
  orchestrating,
  orchestrationMessage,
  pendingIntake,
  selectedService,
  sending,
  session,
  text,
  tokens,
  turns,
  visibility,
  workflow,
  reduceMotion = false,
}: {
  addressDistrict: string | null
  dispatch: Dispatch<KaelChatAction>
  error: string | null
  estimate: NonNullable<KaelChatResponse['session']['estimate']> | null
  historyTarget: string
  language: AppLanguage
  loading: boolean
  onStartOrchestration: () => Promise<void>
  onRetryPendingIntake: () => void
  onOpenHistory: (target: string) => void
  orchestrating: boolean
  orchestrationMessage: string | null
  pendingIntake: KaelChatState['pendingIntake']
  selectedService: ServiceType | null
  sending: boolean
  session: KaelChatResponse | null
  text: KaelChatThreadText
  tokens: ReturnType<typeof useKaelChatTokens>
  turns: KaelChatTurn[]
  visibility: KaelChatVisibility
  workflow: ReturnType<typeof useServiceWorkflow>
  reduceMotion?: boolean
}) {
  const canRetryPendingIntake = Boolean(pendingIntake && !session && !visibility.canStartOrchestration)
  const latestKaelTurnId = useMemo(() => latestAssistantTurnId(turns), [turns])
  const liveActivityLabel = resolveKaelLiveActivityLabel({
    orchestrating,
    pendingIntake,
    selectedService,
    sending,
    session,
    text,
  })
  const lifecyclePanel = resolveKaelLifecyclePanel({
    error,
    estimate,
    liveActivityLabel,
    loading,
    orchestrationMessage,
    pendingIntake,
    session,
    visibility,
    workflow,
  })

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.threadScroll}>
      <View style={styles.hiddenMarker} testID="customer-kael-chat-service-picker" />
      <View style={styles.turnList} testID="customer-kael-chat-history">
        {lifecyclePanel === 'starter' ? <KaelChatStarter dispatch={dispatch} language={language} selectedService={selectedService} text={text} tokens={tokens} /> : null}
        {turns.map((turn) => <ChatTurn key={turn.id} language={language} reduceMotion={reduceMotion} reveal={turn.id === latestKaelTurnId && turn.role !== 'customer'} text={text} turn={turn} />)}
        {lifecyclePanel === 'loading' ? (
          <View style={[styles.stateCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID="customer-kael-chat-loading">
            <ActivityIndicator color={tokens.primary} />
            <Text style={[styles.bodyText, { color: tokens.muted }]}>{text.loading}</Text>
          </View>
        ) : null}
        {lifecyclePanel === 'liveActivity' && liveActivityLabel ? <KaelLiveActivityIndicator label={liveActivityLabel} reduceMotion={reduceMotion} tokens={tokens} /> : null}
        {lifecyclePanel === 'orchestrationStarted' && orchestrationMessage ? (
          <View style={[styles.stateCard, styles.orchestrationStartedCard, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }, kaelSurfacePaint(tokens, 'phaseContext')]} testID="customer-kael-chat-orchestration-started">
            <View style={[styles.orchestrationStartedAura, { backgroundColor: tokens.aqua }]} testID="customer-kael-chat-orchestration-mint-aura" />
            <View style={[styles.orchestrationStartedEdge, { backgroundColor: tokens.glassHighlight }]} />
            <Text style={[styles.sectionTitle, { color: tokens.text }]}>{orchestrationMessage}</Text>
            <Pressable accessibilityRole="button" onPress={() => onOpenHistory(historyTarget)} style={({ pressed }) => [styles.primaryButton, styles.orchestrationStartedButton, { backgroundColor: tokens.primary }, kaelSurfacePaint(tokens, 'send'), pressed ? styles.pressed : null]} testID="customer-kael-chat-history-action">
              <Text style={[styles.primaryButtonText, { color: tokens.primaryText }]}>{text.history}</Text>
            </Pressable>
          </View>
        ) : null}
        {lifecyclePanel === 'pendingIntake' && pendingIntake ? <KaelIntakeReceiptCard intake={pendingIntake} language={language} /> : null}
        {lifecyclePanel === 'estimate' && estimate ? (
          <EstimateCard canStartOrchestration={visibility.canStartOrchestration} estimate={estimate} language={language} onStartOrchestration={onStartOrchestration} orchestrating={orchestrating} orchestrationStarted={session?.session.next_action === 'confirmed'} text={text} />
        ) : null}
        {lifecyclePanel === 'brief' ? <EmptyKaelBriefCard language={language} selectedService={selectedService} text={text} /> : null}
        {lifecyclePanel === 'process' ? <KaelProcessCard estimate={estimate} loading={loading} ticketMode={workflow.artifacts.process_ticket.mode} text={text} /> : null}
        {lifecyclePanel === 'trace' ? (
          <KaelTraceCard addressDistrict={addressDistrict} estimate={estimate} language={language} selectedService={selectedService} session={session} text={text} />
        ) : null}
        {lifecyclePanel === 'phaseContext' ? <KaelPhaseContextCard language={language} phaseContext={workflow.phaseContext} /> : null}
        {lifecyclePanel === 'error' && error ? (
          <View style={[styles.errorCard, { backgroundColor: tokens.warm, borderColor: tokens.copper }]} testID="customer-kael-chat-error">
            <Text style={[styles.errorText, { color: tokens.text }]}>{error}</Text>
            {visibility.canStartOrchestration && !orchestrationMessage ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ busy: orchestrating, disabled: orchestrating }}
                disabled={orchestrating}
                onPress={() => void onStartOrchestration()}
                style={({ pressed }) => [styles.secondaryButton, { borderColor: tokens.copper }, pressed ? styles.pressed : null]}
                testID="customer-kael-chat-orchestration-retry"
              >
                <Text style={[styles.secondaryButtonText, { color: tokens.text }]}>{text.retryOrchestration}</Text>
              </Pressable>
            ) : null}
            {!visibility.canStartOrchestration && canRetryPendingIntake ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ busy: sending, disabled: sending }}
                disabled={sending}
                onPress={onRetryPendingIntake}
                style={({ pressed }) => [styles.secondaryButton, { borderColor: tokens.copper }, pressed ? styles.pressed : null]}
                testID="customer-kael-chat-intake-retry"
              >
                <Text style={[styles.secondaryButtonText, { color: tokens.text }]}>{text.retryIntake}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </ScrollView>
  )
}

function KaelChatStarter({
  dispatch,
  language,
  selectedService,
  text,
  tokens,
}: {
  dispatch: Dispatch<KaelChatAction>
  language: AppLanguage
  selectedService: ServiceType | null
  text: KaelChatThreadText
  tokens: ReturnType<typeof useKaelChatTokens>
}) {
  return (
    <>
      <View style={styles.turnRow} testID="customer-kael-chat-welcome-turn">
        <View style={[styles.turnAvatar, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
          <Image source={kaelModel8AHead} style={styles.turnAvatarImage} />
        </View>
        <View style={[styles.turnBubble, styles.kaelTurn, styles.turnBubbleWithAvatar, styles.emptyChatStart, { backgroundColor: tokens.raised, borderColor: tokens.borderStrong }, kaelSurfacePaint(tokens, 'kaelIntroBubble')]}>
          <Text style={[styles.turnRole, { color: tokens.primary }]} numberOfLines={1}>Kael</Text>
          <Text style={[styles.turnText, { color: tokens.text }]}>{text.welcome}</Text>
        </View>
      </View>
      {!selectedService ? (
        <View style={styles.contextRail} testID="customer-kael-chat-service-picker-inline">
          <View style={styles.chatQuickServices}>
            {supportedServices.map((service) => (
              <Pressable
                accessibilityRole="button"
                key={service}
                onPress={() => dispatch({ type: 'selectService', service })}
                style={({ pressed }) => [
                  styles.serviceChip,
                  { backgroundColor: tokens.service, borderColor: tokens.border },
                  kaelSurfacePaint(tokens, 'pill'),
                  pressed ? styles.pressed : null,
                ]}
                testID={`customer-kael-chat-service-${service}`}
              >
                <Text style={[styles.chipText, { color: tokens.text }]} numberOfLines={1}>{localizedServiceLabel(service, language)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </>
  )
}

function KaelLiveActivityIndicator({
  label,
  reduceMotion,
  tokens,
}: {
  label: string
  reduceMotion: boolean
  tokens: ReturnType<typeof useKaelChatTokens>
}) {
  const sweep = useSharedValue(0)

  useEffect(() => {
    if (reduceMotion) {
      sweep.value = 0
      return
    }
    sweep.value = 0
    sweep.value = withRepeat(
      withTiming(1, { duration: LIVE_ACTIVITY_SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    )
  }, [reduceMotion, sweep])

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 1 : 0.55 + Math.sin(sweep.value * Math.PI) * 0.38,
  }))
  const sheenStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0 : 0.26 + Math.sin(sweep.value * Math.PI) * 0.30,
    transform: [{ translateX: -44 + sweep.value * 168 }],
  }))

  return (
    <View accessibilityLabel={label} accessibilityLiveRegion="polite" accessible style={styles.turnRow} testID="customer-kael-chat-live-activity">
      <View style={[styles.turnAvatar, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
        <Image source={kaelModel8AHead} style={styles.turnAvatarImage} />
      </View>
      <View style={[styles.liveActivityBubble, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }, kaelSurfacePaint(tokens, 'status')]}>
        {reduceMotion ? null : <Animated.View pointerEvents="none" style={[styles.liveActivitySheen, { backgroundColor: tokens.glassHighlight }, sheenStyle]} />}
        <Animated.Text style={[styles.liveActivityText, { color: tokens.text }, pulseStyle]} testID="customer-kael-chat-live-activity-label">
          {label}
        </Animated.Text>
      </View>
    </View>
  )
}

function ChatTurn({
  language,
  reduceMotion,
  reveal,
  text,
  turn,
}: {
  language: AppLanguage
  reduceMotion: boolean
  reveal: boolean
  text: KaelChatThreadText
  turn: KaelChatTurn
}) {
  const tokens = useKaelChatTokens()
  const isCustomer = turn.role === 'customer'
  const rawBody = turn.text_content ?? turn.estimate?.problem_summary ?? text.turnFallback
  const body = isCustomer ? rawBody : localizedGeneratedText(rawBody, language, text.turnFallback)
  const visibleBody = useProgressiveKaelText(body, reveal && !isCustomer, reduceMotion)
  const who = isCustomer ? localizedRoleCustomer(language) : 'Kael'

  return (
    <View style={[styles.turnRow, isCustomer ? styles.turnRowCustomer : null]} testID={`customer-kael-chat-turn-${turn.role}`}>
      {isCustomer ? null : (
        <View style={[styles.turnAvatar, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
          <Image source={kaelModel8AHead} style={styles.turnAvatarImage} />
        </View>
      )}
      <View style={[styles.turnBubble, isCustomer ? styles.customerTurn : styles.kaelTurn, !isCustomer ? styles.turnBubbleWithAvatar : null, { backgroundColor: isCustomer ? tokens.service : tokens.raised, borderColor: isCustomer ? tokens.borderStrong : tokens.border }, kaelSurfacePaint(tokens, isCustomer ? 'customerBubble' : 'kaelBubble')]}>
        <Text style={[styles.turnRole, { color: tokens.primary }]} numberOfLines={1}>{who}</Text>
        <Text accessibilityLabel={body} style={[styles.turnText, { color: tokens.text }]} testID={`customer-kael-chat-turn-body-${turn.id}`}>{visibleBody || ' '}</Text>
        {turn.estimate ? <EstimateInline estimate={turn.estimate} language={language} text={text} /> : null}
      </View>
    </View>
  )
}

function useProgressiveKaelText(value: string, enabled: boolean, reduceMotion: boolean) {
  const [visible, setVisible] = useState(() => (enabled && !reduceMotion ? '' : value))

  useEffect(() => {
    if (!enabled || reduceMotion) {
      setVisible(value)
      return
    }

    const glyphs = Array.from(value)
    if (glyphs.length <= 2) {
      setVisible(value)
      return
    }

    let visibleCount = 0
    const glyphStep = Math.max(1, Math.ceil(glyphs.length / KAEL_REVEAL_TARGET_FRAMES))
    setVisible('')

    const interval = setInterval(() => {
      visibleCount = Math.min(glyphs.length, visibleCount + glyphStep)
      setVisible(glyphs.slice(0, visibleCount).join(''))
      if (visibleCount >= glyphs.length) clearInterval(interval)
    }, KAEL_REVEAL_FRAME_MS)

    return () => clearInterval(interval)
  }, [enabled, reduceMotion, value])

  return visible
}

function latestAssistantTurnId(turns: KaelChatTurn[]) {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]
    if (turn && turn.role !== 'customer') return turn.id
  }
  return null
}

function resolveKaelLiveActivityLabel({
  orchestrating,
  pendingIntake,
  selectedService,
  sending,
  session,
  text,
}: {
  orchestrating: boolean
  pendingIntake: KaelChatState['pendingIntake']
  selectedService: ServiceType | null
  sending: boolean
  session: KaelChatResponse | null
  text: KaelChatThreadText
}) {
  if (orchestrating) return text.activityOrchestrating
  if (!sending) return null
  const hasServiceContext = Boolean(selectedService || pendingIntake?.serviceType || session?.session.service_type)
  return hasServiceContext ? text.activityResearch : text.activityThinking
}

function resolveKaelLifecyclePanel({
  error,
  estimate,
  liveActivityLabel,
  loading,
  orchestrationMessage,
  pendingIntake,
  session,
  visibility,
  workflow,
}: {
  error: string | null
  estimate: NonNullable<KaelChatResponse['session']['estimate']> | null
  liveActivityLabel: string | null
  loading: boolean
  orchestrationMessage: string | null
  pendingIntake: KaelChatState['pendingIntake']
  session: KaelChatResponse | null
  visibility: KaelChatVisibility
  workflow: ReturnType<typeof useServiceWorkflow>
}): KaelLifecyclePanel {
  if (loading) return 'loading'
  if (error) return 'error'
  if (liveActivityLabel) return 'liveActivity'
  if (orchestrationMessage) return 'orchestrationStarted'
  if (pendingIntake && !session) return 'pendingIntake'
  if (visibility.showEstimate && estimate) return 'estimate'
  if (visibility.showBrief) return 'brief'
  if (visibility.showProcess) return 'process'
  if (visibility.showTrace) return 'trace'
  if (visibility.showStarter) return 'starter'
  return session && workflow.phaseContext.primaryArtifact ? 'phaseContext' : null
}

function localizedRoleCustomer(language: AppLanguage) {
  return language === 'en' ? 'You' : 'Bạn'
}

function localizedGeneratedText(value: string, language: AppLanguage, fallback: string) {
  const trimmed = value.trim()
  if (trimmed.length === 0) return fallback
  if (language === 'en' && vietnameseSignalPattern.test(trimmed)) return fallback
  if (language === 'vi' && /^[\x00-\x7F]*$/.test(trimmed)) return fallback
  return trimmed
}
