import { type Dispatch, useEffect, useRef, useState } from 'react'
import { Image } from 'expo-image'
import { ActivityIndicator, Pressable, Text, TextInput, View, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { LOCAL_WORKFLOW_PRICE_DISCLAIMER, PLATFORM_FEE_CUSTOMER, orderWorkflowPhaseSectionsForSummary, workflowAllowedActionsLabel, workflowArtifactModeLabel, workflowBlockedReasonLabel, workflowEventLabel, workflowSourceOfTruthLabel, type ServiceType, type WorkflowArtifactMode, type WorkflowPhaseContext } from '@home-services/shared'
import {
  getCustomerThemeTokens,
  getReducedTransparencyCustomerTokens,
  useCustomerThemeMode,
} from '@/components/customer/customer-theme'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { GlassSurface } from '@/components/ui/glass-surface'
import { reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import { type KaelChatResponse } from '@/lib/api-types'
import { inferKaelChatDistrict } from './address-district'
import { KaelAddressContextBar } from './address-context'
import { kaelSurfacePaint } from './paint'
import { type PendingKaelChatDraft } from './pending-intake'
import { type KaelChatAction } from './state'
import { styles } from './styles'

const kaelModel8AHead = require('../../../assets/kael-model-8a-head.png')
const ADDRESS_AUTO_HIDE_DELAY_MS = 1000

type KaelChatText = {
  addressPlaceholder: string
  agentStatus: string
  agentSteps: {
    missing: string
    orchestrate: string
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
  estimateDisclaimerFallback: string
  estimateProblemFallback: string
  estimateTitle: string
  cancellationBody: string
  complexity: {
    large: string
    medium: string
    small: string
  }
  orchestrate: string
  orchestrating: string
  labels: {
    advisory: string
    cancellationNote: string
    complexity: string
    confidence: string
    platformFee: string
    price: string
    problem: string
    service: string
    summaryTotal: string
  }
  loading: string
  mic: string
  micHint: string
  nextAction: {
    await_input: string
    confirmed: string
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
const vndFormatter = new Intl.NumberFormat('vi-VN')
const PLATFORM_FEE_MULTIPLIER = 1 + PLATFORM_FEE_CUSTOMER
const vietnameseSignalPattern = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i

export function useKaelChatTokens() {
  const themeMode = useCustomerThemeMode()
  const { reduceTransparency } = useGlassAccessibility()
  const tokens = getCustomerThemeTokens(themeMode)
  return reduceTransparency ? getReducedTransparencyCustomerTokens(tokens) : tokens
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
  const addressProgress = useSharedValue(hasAddress || hasComposerIntent ? 1 : 0)
  const addressHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addressVisible = addressLifted || addressFocused || hasAddress || hasComposerIntent
  const addressSlotStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + addressProgress.value * 0.5,
    transform: [{ translateY: 34 - addressProgress.value * 34 }],
  }))

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
    addressProgress.value = withTiming(addressVisible ? 1 : 0, { duration: reduceMotion ? 1 : 220 })
  }, [addressProgress, addressVisible, reduceMotion])

  useEffect(() => {
    if (!addressLifted || addressFocused || hasAddress || hasComposerIntent) return undefined
    const timer = setTimeout(() => {
      setAddressLifted(false)
    }, ADDRESS_AUTO_HIDE_DELAY_MS)
    addressHideTimerRef.current = timer
    return () => {
      clearTimeout(timer)
      if (addressHideTimerRef.current === timer) {
        addressHideTimerRef.current = null
      }
    }
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
        <Animated.View pointerEvents={addressVisible ? 'auto' : 'none'} style={[styles.addressLiftSlot, { height: addressVisible ? 56 : 5 }, addressSlotStyle]}>
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
  ticketMode,
  text,
}: {
  estimate: NonNullable<KaelChatResponse['session']['estimate']> | null
  loading: boolean
  ticketMode: WorkflowArtifactMode
  text: KaelChatText
}) {
  const tokens = useKaelChatTokens()
  const status = loading ? text.loading : estimate ? text.nextAction.estimate_ready : text.agentStatus
  const visibleSteps = processStepCount(ticketMode)
  const steps = [
    ['01', text.agentSteps.read],
    ['02', text.agentSteps.missing],
    ['03', text.agentSteps.orchestrate],
  ] as const

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
        {steps.slice(0, visibleSteps).map(([stepId, title]) => (
          <ProcessStepCard index={stepId} key={stepId} title={title} />
        ))}
      </View>
    </View>
  )
}

export function KaelPhaseContextCard({
  language,
  phaseContext,
}: {
  language: AppLanguage
  phaseContext: WorkflowPhaseContext
}) {
  const tokens = useKaelChatTokens()
  const visibleSections = orderWorkflowPhaseSectionsForSummary(phaseContext, phaseContext.sections.filter((section) => section.visible && section.role !== 'worker'))
  const primarySection = visibleSections.find((section) => section.id === phaseContext.primaryArtifact?.id) ?? visibleSections[0] ?? null
  const primaryArtifact = primarySection?.title[language] ?? localizedArtifactFallback(language)
  const blocked = phaseContext.blockedReason ? workflowBlockedReasonLabel(phaseContext.blockedReason, language) : workflowAllowedActionsLabel(phaseContext.allowedActions, language)
  const nextEvent = phaseContext.nextExpectedEvent ? workflowEventLabel(phaseContext.nextExpectedEvent, language) : localizedDoneEvent(language)
  const sectionSummary = workflowSectionSummary(visibleSections, language)

  return (
    <View style={[styles.traceCard, { backgroundColor: tokens.raised, borderColor: tokens.border }, kaelSurfacePaint(tokens, 'trace')]} testID="customer-kael-chat-phase-context">
      <Text style={[styles.traceTitle, { color: tokens.primary }]} numberOfLines={1}>
        {phaseContext.title[language]}
      </Text>
      <Text style={[styles.bodyText, { color: tokens.text }]} numberOfLines={3}>
        {phaseContext.intent[language]}
      </Text>
      <View style={styles.briefGrid}>
        <BriefField label={language === 'en' ? 'Source' : 'Nguồn'} value={workflowSourceOfTruthLabel(phaseContext.sourceOfTruth, language)} />
        <BriefField label={language === 'en' ? 'Artifact' : 'Dấu mốc'} value={primaryArtifact} />
        <BriefField label={language === 'en' ? 'Next' : 'Tiếp theo'} value={nextEvent} />
        <BriefField label={language === 'en' ? 'Gate' : 'Cổng'} value={blocked} />
        <BriefField label={language === 'en' ? 'Live sections' : 'Mục đang sống'} value={sectionSummary} wide />
      </View>
    </View>
  )
}

function processStepCount(ticketMode: WorkflowArtifactMode) {
  if (ticketMode === 'basic' || ticketMode === 'partial') return 1
  if (ticketMode === 'loading') return 2
  return 3
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

export function KaelIntakeReceiptCard({ intake, language }: { intake: PendingKaelChatDraft; language: AppLanguage }) {
  const tokens = useKaelChatTokens()
  const serviceValue = intake.serviceType ? localizedServiceLabel(intake.serviceType, language) : (language === 'en' ? 'Needs service' : 'Cần chọn dịch vụ')
  const addressValue = intake.addressLabel?.trim() || intake.districtLabel?.trim() || (language === 'en' ? 'Needs area' : 'Cần khu vực')
  const sourceValue = intake.source === 'kael'
    ? language === 'en' ? 'Kael chat' : 'Tin nhắn Kael'
    : language === 'en' ? 'Booking form' : 'Phiếu đặt'
  const mediaCount = intake.mediaCount ?? intake.photoDrafts?.length ?? 0
  const mediaValue = language === 'en'
    ? mediaCount > 0 ? `${mediaCount} selected for ticket evidence` : 'No media selected'
    : mediaCount > 0 ? `${mediaCount} ảnh/video đã chọn cho bằng chứng phiếu` : 'Chưa có ảnh/video'
  const title = language === 'en' ? 'Kael received the intake' : 'Kael đã nhận thông tin'
  const body = language === 'en'
    ? 'Kael is analyzing the service, area, and description from the booking form. Selected media attaches after Kael creates the job evidence.'
    : 'Kael đang phân tích dịch vụ, khu vực và mô tả từ phiếu bạn vừa điền. Ảnh/video đã chọn sẽ đính kèm sau khi Kael tạo bằng chứng công việc.'

  return (
    <View style={[styles.emptyTicketCard, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }, kaelSurfacePaint(tokens, 'brief')]} testID="customer-kael-chat-intake-receipt">
      <Text style={[styles.emptyTicketPill, { backgroundColor: tokens.service, borderColor: tokens.border, color: tokens.primary }, kaelSurfacePaint(tokens, 'pill')]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[styles.bodyText, { color: tokens.text }]} numberOfLines={3}>
        {body}
      </Text>
      <View style={styles.briefGrid}>
        <BriefField label={language === 'en' ? 'Service' : 'Dịch vụ'} value={serviceValue} />
        <BriefField label={language === 'en' ? 'Area' : 'Khu vực'} value={addressValue} />
        <BriefField label={language === 'en' ? 'Source' : 'Nguồn'} value={sourceValue} />
        <BriefField label={language === 'en' ? 'Media' : 'Ảnh/video'} value={mediaValue} />
        <BriefField label={language === 'en' ? 'Description' : 'Mô tả'} value={intake.message} wide />
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

function localizedArtifactFallback(language: AppLanguage) {
  return language === 'en' ? 'No live artifact yet' : 'Chưa có dấu mốc sống'
}

function localizedDoneEvent(language: AppLanguage) {
  return language === 'en' ? 'No next event' : 'Không có sự kiện kế tiếp'
}

function workflowSectionSummary(sections: WorkflowPhaseContext['sections'], language: AppLanguage) {
  const labels = sections.slice(0, 4).map((section) => {
    const mode = section.mode ? workflowArtifactModeLabel(section.mode, language) : workflowSourceOfTruthLabel(section.sourceOfTruth, language)
    return `${section.title[language]} · ${mode}`
  })
  if (sections.length > 4) {
    labels.push(language === 'en' ? `+${sections.length - 4} more` : `+${sections.length - 4} mục nữa`)
  }
  return labels.length > 0 ? labels.join('\n') : (language === 'en' ? 'No visible section yet' : 'Chưa có mục hiển thị')
}

export function EstimateInline({
  estimate,
  language,
  text,
}: {
  estimate: NonNullable<KaelChatResponse['session']['estimate']>
  language: AppLanguage
  text: KaelChatText
}) {
  const tokens = useKaelChatTokens()

  return (
    <View style={[styles.inlineEstimate, { borderColor: tokens.border }]}>
      <Text style={[styles.inlineEstimateText, { color: tokens.muted }]}>
        {text.labels.price}: {formatPriceRange(estimate.price_min, estimate.price_max)}
      </Text>
    </View>
  )
}

export function EstimateCard({
  canStartOrchestration,
  estimate,
  language,
  onStartOrchestration,
  orchestrating,
  orchestrationStarted,
  text,
}: {
  canStartOrchestration: boolean
  estimate: NonNullable<KaelChatResponse['session']['estimate']>
  language: AppLanguage
  onStartOrchestration: () => void
  orchestrating: boolean
  orchestrationStarted: boolean
  text: KaelChatText
}) {
  const tokens = useKaelChatTokens()
  const problem = localizedGeneratedText(estimate.problem_summary || estimate.problem_category, language, text.estimateProblemFallback)
  const advisory = localizedOptionalGeneratedText(estimate.advisory, language)
  const disclaimer = language === 'vi'
    ? LOCAL_WORKFLOW_PRICE_DISCLAIMER
    : localizedGeneratedText(estimate.disclaimer, language, text.estimateDisclaimerFallback)
  const orchestrationBusy = orchestrating
  const actionLabel = orchestrationBusy
    ? text.orchestrating
    : orchestrationStarted
      ? text.nextAction.confirmed
      : canStartOrchestration
        ? text.nextAction.estimate_ready
        : text.nextAction.await_input

  return (
    <View style={[styles.estimateCard, { backgroundColor: tokens.raised, borderColor: tokens.borderStrong }]} testID="customer-kael-chat-estimate-card">
      <View style={styles.estimateHeader}>
        <Text style={[styles.sectionTitle, { color: tokens.text }]}>{text.estimateTitle}</Text>
        <Text style={[styles.statusPill, { color: tokens.primary, borderColor: tokens.border, backgroundColor: tokens.service }]}>{text.nextAction.estimate_ready}</Text>
      </View>
      <InfoRow label={text.labels.service} value={localizedServiceLabel(estimate.service_type, language)} />
      <InfoRow label={text.labels.problem} value={problem} />
      <InfoRow label={text.labels.price} value={formatPriceRange(estimate.price_min, estimate.price_max)} />
      <InfoRow label={text.labels.complexity} value={text.complexity[estimate.complexity]} />
      <InfoRow label={text.labels.confidence} value={`${Math.round(estimate.confidence * 100)}%`} />
      {advisory ? <InfoRow label={text.labels.advisory} value={advisory} /> : null}
      <InfoRow label={text.labels.platformFee} value={formatPlatformFee(language)} />
      <InfoRow
        label={text.labels.summaryTotal}
        value={formatPriceRange(
          Math.round(estimate.price_min * PLATFORM_FEE_MULTIPLIER),
          Math.round(estimate.price_max * PLATFORM_FEE_MULTIPLIER),
        )}
      />
      <InfoRow label={text.labels.cancellationNote} value={text.cancellationBody} />
      <Text style={[styles.disclaimer, { color: tokens.muted }]} testID="customer-kael-chat-price-disclaimer">
        {disclaimer}
      </Text>
      <Pressable accessibilityRole="button" accessibilityState={{ busy: orchestrationBusy, disabled: true }} disabled onPress={onStartOrchestration} style={[styles.primaryButton, { backgroundColor: tokens.disabled }]} testID="customer-kael-chat-orchestration">
        <Text style={[styles.primaryButtonText, { color: tokens.subtleText }]}>{actionLabel}</Text>
      </Pressable>
    </View>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const tokens = useKaelChatTokens()
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: tokens.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.infoValue, { color: tokens.text }]} numberOfLines={3}>
        {value}
      </Text>
    </View>
  )
}

function formatPriceRange(min: number, max: number) {
  return `${vndFormatter.format(min)}đ - ${vndFormatter.format(max)}đ`
}

function formatPlatformFee(language: AppLanguage) {
  const value = PLATFORM_FEE_CUSTOMER * 100
  return language === 'vi' ? `~${String(value).replace('.', ',')}%` : `~${value}%`
}

function localizedGeneratedText(value: string, language: AppLanguage, fallback: string) {
  const trimmed = value.trim()
  if (trimmed.length === 0) return fallback
  if (language === 'en' && vietnameseSignalPattern.test(trimmed)) return fallback
  if (language === 'vi' && /^[\x00-\x7F]*$/.test(trimmed)) return fallback
  return trimmed
}

function localizedOptionalGeneratedText(value: string | null | undefined, language: AppLanguage) {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (language === 'en' && vietnameseSignalPattern.test(trimmed)) return null
  if (language === 'vi' && /^[\x00-\x7F]*$/.test(trimmed)) return null
  return trimmed
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
