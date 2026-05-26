import { type Dispatch, useEffect, useRef, useState } from 'react'
import { Image } from 'expo-image'
import { ActivityIndicator, Animated, Pressable, Text, TextInput, View, type ViewStyle } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { type ServiceType } from '@home-services/shared'
import {
  getCustomerThemeTokens,
  getReducedTransparencyCustomerTokens,
  useCustomerThemeMode,
} from '@/components/customer/customer-surfaces'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { GlassSurface } from '@/components/ui/glass-surface'
import { reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import { type KaelChatResponse } from '@/lib/api-types'
import { inferKaelChatDistrict, KaelAddressContextBar } from './address-context'
import { type KaelChatAction } from './state'
import { styles } from './styles'

const kaelModel8AHead = require('../../../assets/kael-model-8a-head.png')
const ADDRESS_AUTO_HIDE_DELAY_MS = 1000

type KaelChatText = {
  addressPlaceholder: string
  agentStatus: string
  agentSteps: {
    confirm: string
    missing: string
    read: string
  }
  attach: string
  attachHint: string
  back: string
  briefClarityLabel: string
  briefClarityPending: string
  briefClaritySelected: string
  briefSafetyBody: string
  briefSafetyLabel: string
  briefServiceLabel: string
  briefServicePending: string
  composerPlaceholder: string
  emptyTicketBody: string
  emptyTicketTitle: string
  errorNoService: string
  loading: string
  mic: string
  micHint: string
  nextAction: {
    estimate_ready: string
  }
  send: string
  sending: string
  traceDecision: string
  traceDecisionBody: string
  traceDone: string
  traceLocked: string
  traceMissing: string
  traceMissingActive: string
  traceMissingEmpty: string
  traceMissingReady: string
  traceQuestion: string
  traceService: string
  traceServiceEmpty: string
  traceTitle: string
  traceWaiting: string
}

type KaelChatTokens = ReturnType<typeof useKaelChatTokens>
type KaelPaintTone =
  | 'agent'
  | 'avatar'
  | 'brief'
  | 'composer'
  | 'customerBubble'
  | 'field'
  | 'header'
  | 'icon'
  | 'index'
  | 'kaelBubble'
  | 'pill'
  | 'send'
  | 'status'
  | 'step'
  | 'trace'

export function useKaelChatTokens() {
  const themeMode = useCustomerThemeMode()
  const { reduceTransparency } = useGlassAccessibility()
  const tokens = getCustomerThemeTokens(themeMode)
  return reduceTransparency ? getReducedTransparencyCustomerTokens(tokens) : tokens
}

export function kaelSurfacePaint(tokens: KaelChatTokens, tone: KaelPaintTone): ViewStyle | null {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.glassShadow === 'none'
  if (reduceTransparency) return { boxShadow: 'none' } as ViewStyle
  const dark = tokens.mode === 'dark'
  const lightShadow = tone === 'agent' || tone === 'brief'
    ? '0 15px 36px rgba(16,74,66,0.11), inset 0 1px 0 rgba(255,255,255,0.88)'
    : tone === 'header'
      ? '0 15px 36px rgba(16,74,66,0.12), inset 0 1px 0 rgba(255,255,255,0.92)'
      : tone === 'composer'
        ? '0 18px 40px rgba(16,74,66,0.12), inset 0 1px 0 rgba(255,255,255,0.92)'
        : tone === 'kaelBubble' || tone === 'customerBubble' || tone === 'trace'
          ? '0 8px 18px rgba(16,74,66,0.09), inset 0 1px 0 rgba(255,255,255,0.74)'
          : tone === 'send'
            ? '0 10px 22px rgba(8,139,124,0.22), inset 0 1px 0 rgba(255,255,255,0.22)'
            : '0 6px 14px rgba(16,74,66,0.06), inset 0 1px 0 rgba(255,255,255,0.72)'
  const darkShadow = tone === 'agent' || tone === 'brief' || tone === 'composer' || tone === 'header'
    ? '0 16px 34px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.10)'
    : '0 8px 18px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.08)'
  const lightGradients: Record<KaelPaintTone, string> = {
    agent: 'radial-gradient(circle at 92% 0%, rgba(156,238,221,0.82), transparent 32%), radial-gradient(circle at 4% 100%, rgba(255,245,229,0.76), transparent 36%), linear-gradient(145deg, rgba(255,253,248,0.98), rgba(224,249,243,0.93))',
    avatar: 'linear-gradient(145deg, rgba(255,253,248,0.98), rgba(232,252,247,0.78))',
    brief: 'radial-gradient(circle at 95% 10%, rgba(255,227,183,0.62), transparent 35%), linear-gradient(150deg, rgba(217,251,242,0.92), rgba(255,246,231,0.76))',
    composer: 'linear-gradient(135deg, rgba(255,253,248,0.98), rgba(239,255,250,0.94))',
    customerBubble: 'linear-gradient(135deg, rgba(193,249,237,0.98), rgba(239,255,250,0.94))',
    field: 'linear-gradient(145deg, rgba(255,253,248,0.92), rgba(239,255,250,0.72))',
    header: 'radial-gradient(circle at 88% 16%, rgba(156,238,221,0.74), transparent 32%), linear-gradient(135deg, rgba(255,253,248,0.98), rgba(226,250,244,0.98))',
    icon: 'linear-gradient(145deg, rgba(217,251,242,0.95), rgba(255,253,248,0.82))',
    index: 'linear-gradient(145deg, rgba(193,249,237,0.94), rgba(255,253,248,0.80))',
    kaelBubble: 'linear-gradient(145deg, rgba(255,253,248,0.98), rgba(255,249,239,0.92))',
    pill: 'linear-gradient(135deg, rgba(217,251,242,0.95), rgba(255,253,248,0.82))',
    send: 'linear-gradient(145deg, #10A594, #078B7C)',
    status: 'linear-gradient(135deg, rgba(217,251,242,0.96), rgba(255,253,248,0.80))',
    step: 'linear-gradient(145deg, rgba(255,253,248,0.86), rgba(232,252,247,0.78))',
    trace: 'linear-gradient(145deg, rgba(255,253,248,0.94), rgba(236,252,247,0.82))',
  }
  const darkGradients: Record<KaelPaintTone, string> = {
    agent: 'radial-gradient(circle at 92% 0%, rgba(105,222,198,0.20), transparent 34%), radial-gradient(circle at 4% 100%, rgba(224,160,107,0.14), transparent 38%), linear-gradient(145deg, rgba(22,43,40,0.98), rgba(17,59,53,0.92))',
    avatar: 'linear-gradient(145deg, rgba(31,62,57,0.98), rgba(17,45,41,0.92))',
    brief: 'radial-gradient(circle at 95% 10%, rgba(224,160,107,0.18), transparent 35%), linear-gradient(150deg, rgba(23,59,53,0.96), rgba(59,41,27,0.72))',
    composer: 'linear-gradient(135deg, rgba(22,43,40,0.98), rgba(17,50,45,0.94))',
    customerBubble: 'linear-gradient(135deg, rgba(28,78,69,0.96), rgba(22,54,49,0.94))',
    field: 'linear-gradient(145deg, rgba(22,43,40,0.96), rgba(18,48,43,0.82))',
    header: 'radial-gradient(circle at 88% 16%, rgba(105,222,198,0.18), transparent 30%), linear-gradient(135deg, rgba(21,43,40,0.98), rgba(18,48,43,0.94))',
    icon: 'linear-gradient(145deg, rgba(31,62,57,0.98), rgba(17,45,41,0.92))',
    index: 'linear-gradient(145deg, rgba(31,82,72,0.96), rgba(18,48,43,0.86))',
    kaelBubble: 'linear-gradient(145deg, rgba(22,43,40,0.98), rgba(40,34,28,0.88))',
    pill: 'linear-gradient(135deg, rgba(26,66,59,0.98), rgba(18,45,41,0.88))',
    send: 'linear-gradient(145deg, #69DEC6, #10A594)',
    status: 'linear-gradient(135deg, rgba(26,66,59,0.98), rgba(22,43,40,0.84))',
    step: 'linear-gradient(145deg, rgba(24,50,46,0.98), rgba(19,57,51,0.78))',
    trace: 'linear-gradient(145deg, rgba(22,43,40,0.96), rgba(17,54,49,0.82))',
  }
  const borderColor = dark
    ? tone === 'brief' || tone === 'agent' ? 'rgba(105,222,198,0.28)' : 'rgba(105,222,198,0.20)'
    : tone === 'brief' || tone === 'agent' || tone === 'composer' || tone === 'header'
      ? 'rgba(8,139,124,0.30)'
      : 'rgba(8,139,124,0.22)'
  const backgroundImage = dark ? darkGradients[tone] : lightGradients[tone]

  return {
    backgroundImage,
    borderColor,
    boxShadow: dark ? darkShadow : lightShadow,
    experimental_backgroundImage: backgroundImage,
  } as ViewStyle
}

function kaelStatePaint(tokens: KaelChatTokens, tone: 'done' | 'locked' | 'question' | 'waiting'): ViewStyle {
  const dark = tokens.mode === 'dark'
  if (tone === 'done') {
    return {
      backgroundColor: dark ? 'rgba(26,66,59,0.94)' : 'rgba(217,251,242,0.92)',
      borderColor: dark ? 'rgba(105,222,198,0.28)' : 'rgba(8,139,124,0.30)',
      color: dark ? '#69DEC6' : '#078B7C',
    } as ViewStyle
  }
  if (tone === 'question') {
    return {
      backgroundColor: dark ? 'rgba(75,52,32,0.90)' : 'rgba(255,246,231,0.94)',
      borderColor: dark ? 'rgba(224,160,107,0.30)' : 'rgba(202,148,67,0.34)',
      color: dark ? '#E0A06B' : '#9B6718',
    } as ViewStyle
  }
  return {
    backgroundColor: dark ? 'rgba(29,61,57,0.90)' : 'rgba(205,241,240,0.88)',
    borderColor: dark ? 'rgba(105,222,198,0.24)' : 'rgba(36,118,109,0.30)',
    color: dark ? '#9AB6B0' : '#24766D',
  } as ViewStyle
}

export function KaelChatHeader({
  onBack,
  reduceMotion,
  text,
  themeMode,
  tokens,
}: {
  onBack: () => void
  reduceMotion: boolean
  text: KaelChatText
  themeMode: ReturnType<typeof useCustomerThemeMode>
  tokens: ReturnType<typeof useKaelChatTokens>
}) {
  const headerBackdrop = tokens.mode === 'dark' ? 'rgba(18,48,43,0.96)' : 'rgba(238,253,249,0.96)'
  const headerBorder = tokens.mode === 'dark' ? 'rgba(105,222,198,0.26)' : 'rgba(8,139,124,0.30)'

  return (
    <GlassSurface backgroundColor={headerBackdrop} borderColor={headerBorder} mode={themeMode} style={[styles.headerGlass, kaelSurfacePaint(tokens, 'header')]} testID="customer-kael-chat-glass-header" variant="hero">
      <View style={[styles.header, styles.headerMinimal]}>
        <Pressable accessibilityLabel={text.back} accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.closeButton, { borderColor: tokens.border, backgroundColor: tokens.raised }, kaelSurfacePaint(tokens, 'icon'), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="customer-kael-chat-close">
          <ChatBackIcon color={tokens.primary} />
        </Pressable>
        <View style={styles.headerSpacer} />
      </View>
    </GlassSurface>
  )
}

export function KaelChatComposer({
  addressLabel,
  dispatch,
  draft,
  error,
  language,
  onAddressDistrict,
  onSend,
  reduceMotion,
  sending,
  text,
  themeMode,
  tokens,
}: {
  addressLabel: string
  dispatch: Dispatch<KaelChatAction>
  draft: string
  error: string | null
  language: AppLanguage
  onAddressDistrict: (district: string) => void
  onSend: () => Promise<void>
  reduceMotion: boolean
  sending: boolean
  text: KaelChatText
  themeMode: ReturnType<typeof useCustomerThemeMode>
  tokens: ReturnType<typeof useKaelChatTokens>
}) {
  const canSend = draft.trim().length > 0
  const hasAddress = addressLabel.trim().length > 0
  const hasComposerIntent = draft.trim().length > 0
  const [addressLifted, setAddressLifted] = useState(false)
  const [addressFocused, setAddressFocused] = useState(false)
  const addressProgress = useRef(new Animated.Value(hasAddress || hasComposerIntent ? 1 : 0)).current
  const addressHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addressVisible = addressLifted || addressFocused || hasAddress || hasComposerIntent
  const addressSlotHeight = addressProgress.interpolate({ inputRange: [0, 1], outputRange: [5, 56] })
  const addressSlotOpacity = addressProgress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] })
  const addressSlotLift = addressProgress.interpolate({ inputRange: [0, 1], outputRange: [34, 0] })

  const clearAddressHideTimer = () => {
    if (!addressHideTimerRef.current) return
    clearTimeout(addressHideTimerRef.current)
    addressHideTimerRef.current = null
  }

  const revealAddress = () => {
    clearAddressHideTimer()
    setAddressLifted(true)
  }

  useEffect(() => {
    Animated.timing(addressProgress, {
      duration: reduceMotion ? 1 : 220,
      toValue: addressVisible ? 1 : 0,
      useNativeDriver: false,
    }).start()
  }, [addressProgress, addressVisible, reduceMotion])

  useEffect(() => {
    if (!addressLifted || addressFocused || hasAddress || hasComposerIntent) return undefined
    addressHideTimerRef.current = setTimeout(() => {
      setAddressLifted(false)
    }, ADDRESS_AUTO_HIDE_DELAY_MS)
    return clearAddressHideTimer
  }, [addressFocused, addressLifted, hasAddress, hasComposerIntent])

  return (
    <GlassSurface borderColor={tokens.borderStrong} mode={themeMode} style={[styles.composerGlass, kaelSurfacePaint(tokens, 'composer')]} testID="customer-kael-chat-glass-composer" variant="sheet">
      <View style={styles.addressLiftFrame}>
        {addressVisible ? null : (
          <Pressable accessibilityLabel={text.addressPlaceholder} accessibilityRole="button" hitSlop={12} onPress={revealAddress} onPressIn={revealAddress} style={({ pressed }) => [styles.addressRevealHandle, reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="customer-kael-chat-address-reveal">
            <View style={[styles.addressRevealCue, { backgroundColor: tokens.service, borderColor: tokens.border }, kaelSurfacePaint(tokens, 'icon')]}>
              <ChatChevronUpIcon color={tokens.primary} />
            </View>
          </Pressable>
        )}
        <Animated.View pointerEvents={addressVisible ? 'auto' : 'none'} style={[styles.addressLiftSlot, { height: addressSlotHeight, opacity: addressSlotOpacity, transform: [{ translateY: addressSlotLift }] }]}>
          <KaelAddressContextBar
            addressLabel={addressLabel}
            language={language}
            onBlur={() => setAddressFocused(false)}
            onChangeText={(value) => {
              const nextDistrict = inferKaelChatDistrict(value)
              if (nextDistrict) onAddressDistrict(nextDistrict)
              dispatch({ type: 'setAddress', value })
            }}
            onFocus={() => {
              setAddressFocused(true)
              revealAddress()
            }}
            placeholder={text.addressPlaceholder}
            tokens={tokens}
          />
        </Animated.View>
      </View>
      <View style={styles.composer}>
        <Pressable accessibilityLabel={text.attach} accessibilityRole="button" onPress={() => dispatch({ type: 'showTransientError', error: text.attachHint })} style={({ pressed }) => [styles.attachButton, { borderColor: tokens.border, backgroundColor: tokens.service }, kaelSurfacePaint(tokens, 'icon'), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="customer-kael-chat-attach">
          <ChatPlusIcon color={tokens.primary} />
        </Pressable>
        <Pressable accessibilityLabel={text.mic} accessibilityRole="button" onPress={() => dispatch({ type: 'showTransientError', error: text.micHint })} style={({ pressed }) => [styles.micButton, { borderColor: tokens.border, backgroundColor: tokens.service }, kaelSurfacePaint(tokens, 'icon'), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="customer-kael-chat-mic">
          <ChatMicIcon color={tokens.primary} />
        </Pressable>
        <TextInput
          multiline
          onChangeText={(value) => {
            dispatch({
              type: 'setDraft',
              value,
              clearTransientError: error === text.errorNoService || error === text.attachHint,
            })
          }}
          placeholder={text.composerPlaceholder}
          placeholderTextColor={tokens.subtleText}
          onFocus={revealAddress}
          selectionColor={tokens.primary}
          style={[styles.input, styles.inputInvisibleFocus, { caretColor: tokens.primary, color: tokens.text } as any]}
          testID="customer-kael-chat-input"
          value={draft}
        />
        <Pressable accessibilityLabel={sending ? text.sending : text.send} accessibilityRole="button" disabled={sending || !canSend} onPress={onSend} style={({ pressed }) => [styles.sendButton, { backgroundColor: canSend ? tokens.primary : tokens.disabled }, canSend ? kaelSurfacePaint(tokens, 'send') : null, reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="customer-kael-chat-send">
          {sending ? <ActivityIndicator color={tokens.primaryText} size="small" /> : <ChatSendIcon color={canSend ? tokens.primaryText : tokens.subtleText} />}
        </Pressable>
      </View>
    </GlassSurface>
  )
}

export function KaelProcessCard({
  estimate,
  loading,
  text,
}: {
  estimate: NonNullable<KaelChatResponse['session']['estimate']> | null
  loading: boolean
  text: KaelChatText
}) {
  const tokens = useKaelChatTokens()
  const status = loading ? text.loading : estimate ? text.nextAction.estimate_ready : text.agentStatus

  return (
    <View style={[styles.agentFocusCard, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }, kaelSurfacePaint(tokens, 'agent')]} testID="customer-kael-agentic-process">
      <View style={styles.agentHead}>
        <View style={[styles.agentAvatar, { backgroundColor: tokens.raised, borderColor: tokens.border }, kaelSurfacePaint(tokens, 'avatar')]}>
          <Image source={kaelModel8AHead} style={styles.agentAvatarImage} />
        </View>
        <View style={[styles.agentStatusRail, { backgroundColor: tokens.raised, borderColor: tokens.border }, kaelSurfacePaint(tokens, 'status')]}>
          <View style={[styles.agentStatusAccent, { backgroundColor: tokens.primary }]} />
          <Text style={[styles.agentStatusText, { color: tokens.text }]} numberOfLines={1}>
            {status}
          </Text>
        </View>
      </View>
      <View style={styles.agentSteps}>
        <ProcessStepCard index="01" title={text.agentSteps.read} />
        <ProcessStepCard index="02" title={text.agentSteps.missing} />
        <ProcessStepCard index="03" title={text.agentSteps.confirm} />
      </View>
    </View>
  )
}

export function KaelTraceCard({
  addressDistrict,
  estimate,
  language,
  selectedService,
  session,
  text,
}: {
  addressDistrict: string | null
  estimate: NonNullable<KaelChatResponse['session']['estimate']> | null
  language: AppLanguage
  selectedService: ServiceType | null
  session: KaelChatResponse | null
  text: KaelChatText
}) {
  const tokens = useKaelChatTokens()
  const activeService = session?.session.service_type ?? selectedService
  const hasInput = Boolean(session?.turns.length)
  const missingBody = estimate
    ? text.traceMissingReady
    : hasInput || addressDistrict
      ? text.traceMissingActive
      : text.traceMissingEmpty

  return (
    <View style={[styles.traceCard, { backgroundColor: tokens.raised, borderColor: tokens.border }, kaelSurfacePaint(tokens, 'trace')]} testID="customer-kael-agentic-trace">
      <Text style={[styles.traceTitle, { color: tokens.primary }]} numberOfLines={1}>
        {text.traceTitle}
      </Text>
      <TraceRow
        body={activeService ? localizedServiceLabel(activeService, language) : text.traceServiceEmpty}
        index="1"
        label={text.traceService}
        state={activeService ? text.traceDone : text.traceWaiting}
        tone={activeService ? 'done' : 'waiting'}
      />
      <TraceRow
        body={missingBody}
        index="2"
        label={text.traceMissing}
        state={estimate ? text.traceDone : text.traceQuestion}
        tone={estimate ? 'done' : 'question'}
      />
      <TraceRow
        body={text.traceDecisionBody}
        index="3"
        label={text.traceDecision}
        state={text.traceLocked}
        tone="locked"
      />
    </View>
  )
}

export function EmptyKaelBriefCard({ language, selectedService, text }: { language: AppLanguage; selectedService: ServiceType | null; text: KaelChatText }) {
  const tokens = useKaelChatTokens()
  const serviceValue = selectedService ? localizedServiceLabel(selectedService, language) : text.briefServicePending
  const clarityValue = selectedService ? text.briefClaritySelected : text.briefClarityPending

  return (
    <View style={[styles.emptyTicketCard, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }, kaelSurfacePaint(tokens, 'brief')]} testID="customer-kael-chat-empty-ticket-summary">
      <Text style={[styles.emptyTicketPill, { backgroundColor: tokens.service, borderColor: tokens.border, color: tokens.primary }, kaelSurfacePaint(tokens, 'pill')]} numberOfLines={1}>
        {text.emptyTicketTitle}
      </Text>
      <Text style={[styles.bodyText, { color: tokens.text }]}>
        {text.emptyTicketBody}
      </Text>
      <View style={styles.briefGrid}>
        <BriefField label={text.briefServiceLabel} value={serviceValue} />
        <BriefField label={text.briefClarityLabel} value={clarityValue} />
        <BriefField label={text.briefSafetyLabel} value={text.briefSafetyBody} wide />
      </View>
    </View>
  )
}

function BriefField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  const tokens = useKaelChatTokens()

  return (
    <View style={[styles.briefField, wide ? styles.briefFieldWide : null, { backgroundColor: tokens.raised, borderColor: tokens.border }, kaelSurfacePaint(tokens, 'field')]}>
      <Text style={[styles.briefFieldLabel, { color: tokens.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.briefFieldValue, { color: tokens.text }]} numberOfLines={wide ? 3 : 2}>
        {value}
      </Text>
    </View>
  )
}

function ProcessStepCard({ index, title }: { index: string; title: string }) {
  const tokens = useKaelChatTokens()

  return (
    <View style={[styles.agentStepCard, { backgroundColor: tokens.raised, borderColor: tokens.border }, kaelSurfacePaint(tokens, 'step')]}>
      <Text style={[styles.agentStepIndex, { color: tokens.primary }]}>{index}</Text>
      <Text style={[styles.agentStepTitle, { color: tokens.text }]} numberOfLines={2}>
        {title}
      </Text>
    </View>
  )
}

function TraceRow({
  body,
  index,
  label,
  state,
  tone,
}: {
  body: string
  index: string
  label: string
  state: string
  tone: 'done' | 'locked' | 'question' | 'waiting'
}) {
  const tokens = useKaelChatTokens()
  const isWarm = tone === 'question'
  const isLocked = tone === 'locked'
  const stateSurface = {
    backgroundColor: tone === 'done' ? tokens.service : isWarm ? tokens.warm : isLocked ? tokens.ghost : tokens.raised,
    borderColor: tone === 'done' ? tokens.borderStrong : isWarm ? tokens.copper : tokens.border,
    color: tone === 'done' ? tokens.primary : isWarm ? tokens.copper : isLocked ? tokens.muted : tokens.muted,
  }

  return (
    <View style={styles.traceRow}>
      <Text style={[styles.traceIndex, { backgroundColor: tokens.service, borderColor: tokens.border, color: tokens.primary }, kaelSurfacePaint(tokens, 'index')]}>{index}</Text>
      <View style={styles.traceCopy}>
        <Text style={[styles.traceLabel, { color: tokens.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.traceBody, { color: tokens.muted }]} numberOfLines={2}>
          {body}
        </Text>
      </View>
      <Text style={[styles.traceState, stateSurface, kaelStatePaint(tokens, tone)]} numberOfLines={1}>
        {state}
      </Text>
    </View>
  )
}

function ChatBackIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18 9 12l6-6" stroke={color} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function ChatPlusIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  )
}

function ChatMicIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3.5a3.3 3.3 0 0 0-3.3 3.3v4.4a3.3 3.3 0 0 0 6.6 0V6.8A3.3 3.3 0 0 0 12 3.5Z" stroke={color} strokeWidth={2} />
      <Path d="M5.7 10.7a6.3 6.3 0 0 0 12.6 0M12 17v3.5M9.2 20.5h5.6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function ChatChevronUpIcon({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
      <Path d="m3.5 8 3.5-3.5L10.5 8" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function ChatSendIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M22 2 11 13" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="m22 2-7 20-4-9-9-4 20-7Z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}
