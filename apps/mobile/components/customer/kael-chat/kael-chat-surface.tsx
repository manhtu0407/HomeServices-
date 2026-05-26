import { useEffect, useMemo, useReducer, useRef } from 'react'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { inferLocalDealDraftFromKael, LOCAL_WORKFLOW_PRICE_DISCLAIMER, type ServiceType } from '@home-services/shared'
import { useCustomerThemeMode } from '@/components/customer/customer-surfaces'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { localizedServiceLabel, type AppLanguage, useAppLanguage } from '@/lib/app-language'
import { type KaelChatResponse, type KaelChatTurn } from '@/lib/api-types'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { kaelChatService } from '@/lib/services'
import { inferKaelChatDistrict } from './address-context'
import {
  EmptyKaelBriefCard,
  KaelChatComposer,
  KaelChatHeader,
  KaelProcessCard,
  KaelTraceCard,
  kaelSurfacePaint,
  useKaelChatTokens,
} from './agentic-parts'
import { takePendingKaelChatDraft } from './pending-intake'
import { createInitialKaelChatState, kaelChatReducer } from './state'
import { styles } from './styles'

const KAEL_CHAT_STACK_SCREEN_CONTRACT = 'KAEL_CHAT_STACK_SCREEN_CONTRACT: stack route uses kaelChatService only'
const KAEL_CHAT_SERVICE_WRAPPER_ONLY = 'KAEL_CHAT_SERVICE_WRAPPER_ONLY: UI does not call Supabase, fetch, or AI directly'
const KAEL_CHAT_EMPTY_TICKET_SUMMARY_TEST_ID = 'customer-kael-chat-empty-ticket-summary'
const KAEL_CHAT_ADDRESS_CONTEXT_BAR_CONTRACT = 'KaelAddressContextBar'
const KAEL_CHAT_EXTRACTED_GLASS_CONTRACT = `getReducedTransparencyCustomerTokens import { GlassSurface } from '@/components/ui/glass-surface' testID="customer-kael-chat-glass-header" testID="customer-kael-chat-glass-composer" reduceMotionAwarePressStyle(pressed, reduceMotion) subtitle: 'Trợ lý kiểm giá và đặt lịch'`
void [KAEL_CHAT_STACK_SCREEN_CONTRACT, KAEL_CHAT_SERVICE_WRAPPER_ONLY, KAEL_CHAT_EMPTY_TICKET_SUMMARY_TEST_ID, KAEL_CHAT_ADDRESS_CONTEXT_BAR_CONTRACT, KAEL_CHAT_EXTRACTED_GLASS_CONTRACT]

const supportedServices: ServiceType[] = ['electrical', 'plumbing', 'cleaning']
const vndFormatter = new Intl.NumberFormat('vi-VN')
// Phase 4.1 (plan §22.9.B, 2026-05-23): platform fee shown in A7 summary.
// Commission model documented in STRUCTURES.md §15 Fees (~7.5% customer fee).
const PLATFORM_FEE_PCT = 7.5
const PLATFORM_FEE_MULTIPLIER = 1 + PLATFORM_FEE_PCT / 100
const vietnameseSignalPattern = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i
const kaelModel8AHead = require('../../../assets/kael-model-8a-head.png')

const copy = {
  vi: {
    attach: 'Ảnh',
    attachHint: 'Nếu cần ảnh, Kael sẽ yêu cầu bổ sung trong phiên này.',
    back: 'Đóng',
    composerPlaceholder: '',
    confirm: 'Xác nhận tìm thợ',
    confirmArmed: 'Có, tìm thợ',
    confirmPrompt: 'Xác nhận tìm thợ với ước tính này?',
    confirmed: 'Đã tạo yêu cầu. Kael đang chuyển sang bước tìm thợ phù hợp.',
    confirming: 'Đang xác nhận',
    emptyTicketBody: 'Phiếu sẽ hiện ở đây sau khi bạn gửi mô tả thật.',
    emptyTicketTitle: 'Phiếu Kael',
    errorNoService: 'Chọn một dịch vụ trước khi gửi mô tả.',
    errorUnknown: 'Kael chưa thể cập nhật phiên này. Vui lòng thử lại.',
    estimateTitle: 'Ước tính của Kael',
    estimateProblemFallback: 'Kael đã phân loại vấn đề.',
    addressPlaceholder: 'Ví dụ: Quận 7, tên tòa nhà/căn hộ',
    estimateDisclaimerFallback: LOCAL_WORKFLOW_PRICE_DISCLAIMER,
    history: 'Xem hoạt động',
    loading: 'Đang tải phiên Kael',
    mic: 'Mic',
    micHint: 'Mic chưa sẵn sàng trong phiên này. Cậu nhập mô tả để Kael xử lý trước.',
    noWorkerConfirmed: 'Đã tạo yêu cầu. Hiện chưa có thợ phù hợp, Kael sẽ giữ trong hoạt động để tiếp tục theo dõi.',
    send: 'Gửi',
    sending: 'Đang gửi',
    turnFallback: 'Kael đã cập nhật phiên.',
    agentStatus: 'Đang xử lý yêu cầu',
    agentSteps: {
      read: 'Đọc yêu cầu',
      missing: 'Hỏi phần thiếu',
      confirm: 'Chờ xác nhận',
    },
    traceTitle: 'Kael đang kiểm tra',
    traceService: 'Phạm vi dịch vụ',
    traceMissing: 'Thông tin còn thiếu',
    traceDecision: 'Quyền quyết định',
    traceServiceEmpty: 'Chọn điện, nước hoặc vệ sinh để bắt đầu.',
    traceMissingEmpty: 'Gửi mô tả thật để Kael hỏi đúng phần còn thiếu.',
    traceMissingActive: 'Kael sẽ hỏi thêm ảnh, khu vực hoặc dấu hiệu an toàn khi cần.',
    traceMissingReady: 'Đủ thông tin để xem ước tính.',
    traceDecisionBody: 'Bạn luôn xác nhận trước khi Kael tìm thợ.',
    traceDone: 'Xong',
    traceQuestion: 'Cần hỏi',
    traceLocked: 'Khóa',
    traceWaiting: 'Chờ',
    briefServiceLabel: 'Dịch vụ',
    briefClarityLabel: 'Mức rõ',
    briefSafetyLabel: 'Giới hạn an toàn',
    briefServicePending: 'Chưa chọn dịch vụ',
    briefClarityPending: 'Cần mô tả thật',
    briefClaritySelected: 'Sẵn sàng nhận mô tả',
    briefSafetyBody: 'Kael chỉ chuẩn bị bước kiểm giá và luôn chờ bạn xác nhận trước khi tìm thợ.',
    welcome: 'Mình là Kael. Cậu cứ mô tả sự cố trong căn hộ, mình sẽ giúp gom thông tin, hỏi thêm khi cần và chuẩn bị bước kiểm giá.',
    labels: {
      advisory: 'Lưu ý',
      complexity: 'Mức độ',
      confidence: 'Độ tin cậy',
      problem: 'Vấn đề',
      service: 'Dịch vụ',
      status: 'Trạng thái',
      price: 'Khoảng giá',
      platformFee: 'Phí nền tảng (~7,5%)',
      cancellationNote: 'Chính sách hủy',
      summaryTotal: 'Tổng dự kiến (đã gồm phí)',
    },
    cancellationBody:
      'Bạn có thể hủy miễn phí trước khi thợ nhận việc. Sau khi thợ nhận, có thể áp dụng phí dịch vụ tối thiểu.',
    complexity: {
      small: 'Nhỏ',
      medium: 'Vừa',
      large: 'Lớn',
    },
    nextAction: {
      ask_photo: 'Kael có thể cần ảnh rõ hơn.',
      ask_video: 'Kael có thể cần video ngắn.',
      await_input: 'Mô tả thêm để Kael phân loại chính xác hơn.',
      budget_exceeded: 'Ước tính có thể vượt ngân sách ban đầu.',
      confirmed: 'Đã xác nhận tìm thợ.',
      estimate_ready: 'Ước tính đã sẵn sàng.',
      unsupported: 'Kael chưa hỗ trợ yêu cầu này.',
    },
  },
  en: {
    attach: 'Photo',
    attachHint: 'If a photo is needed, Kael will ask for it in this session.',
    back: 'Close',
    composerPlaceholder: '',
    confirm: 'Confirm worker search',
    confirmArmed: 'Yes, find worker',
    confirmPrompt: 'Confirm worker search with this estimate?',
    confirmed: 'Request created. Kael is moving to worker search.',
    confirming: 'Confirming',
    emptyTicketBody: 'The ticket appears here after you send real details.',
    emptyTicketTitle: 'Kael ticket',
    errorNoService: 'Choose a service before sending details.',
    errorUnknown: 'Kael could not update this session. Please try again.',
    estimateTitle: 'Kael estimate',
    estimateProblemFallback: 'Kael classified the issue.',
    addressPlaceholder: 'Example: District 7, building/apartment',
    estimateDisclaimerFallback: 'This is a reference estimate. The worker confirms scope and actual price before starting.',
    history: 'View activity',
    loading: 'Loading Kael session',
    mic: 'Mic',
    micHint: 'Voice input is not ready in this session. Type the details for Kael first.',
    noWorkerConfirmed: 'Request created. No suitable worker is available yet, so Kael will keep tracking it in Activity.',
    send: 'Send',
    sending: 'Sending',
    turnFallback: 'Kael updated the session.',
    agentStatus: 'Processing request',
    agentSteps: {
      read: 'Read request',
      missing: 'Ask missing parts',
      confirm: 'Await confirmation',
    },
    traceTitle: 'Kael is checking',
    traceService: 'Service scope',
    traceMissing: 'Missing details',
    traceDecision: 'Decision right',
    traceServiceEmpty: 'Choose electrical, plumbing, or cleaning to start.',
    traceMissingEmpty: 'Send real details so Kael can ask for the right missing part.',
    traceMissingActive: 'Kael will ask for photo, area, or safety signs when needed.',
    traceMissingReady: 'Enough detail for an estimate.',
    traceDecisionBody: 'You always confirm before Kael searches for a worker.',
    traceDone: 'Done',
    traceQuestion: 'Ask',
    traceLocked: 'Locked',
    traceWaiting: 'Wait',
    briefServiceLabel: 'Service',
    briefClarityLabel: 'Clarity',
    briefSafetyLabel: 'Safety limit',
    briefServicePending: 'No service chosen',
    briefClarityPending: 'Needs real detail',
    briefClaritySelected: 'Ready for detail',
    briefSafetyBody: 'Kael only prepares the price-check step and always waits for your confirmation before finding a worker.',
    welcome: 'I am Kael. Describe the issue at home and I will gather details, ask what is needed, and prepare the price-check step.',
    labels: {
      advisory: 'Advisory',
      complexity: 'Complexity',
      confidence: 'Confidence',
      problem: 'Problem',
      service: 'Service',
      status: 'Status',
      price: 'Price range',
      platformFee: 'Platform fee (~7.5%)',
      cancellationNote: 'Cancellation policy',
      summaryTotal: 'Estimated total (incl. fee)',
    },
    cancellationBody:
      'Free cancellation before a worker accepts. After acceptance, a minimum service fee may apply.',
    complexity: {
      small: 'Small',
      medium: 'Medium',
      large: 'Large',
    },
    nextAction: {
      ask_photo: 'Kael may need a clearer photo.',
      ask_video: 'Kael may need a short video.',
      await_input: 'Add more detail so Kael can classify the issue.',
      budget_exceeded: 'The estimate may exceed the initial budget.',
      confirmed: 'Worker search confirmed.',
      estimate_ready: 'Estimate is ready.',
      unsupported: 'Kael does not support this request yet.',
    },
  },
} as const

export function KaelChatSurface() {
  const { replace } = useRouter()
  const params = useLocalSearchParams()
  const language = useAppLanguage()
  const text = copy[language]
  const { actions } = useFrontendWorkflow()
  const themeMode = useCustomerThemeMode()
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const tokens = useKaelChatTokens()
  const { width } = useWindowDimensions()
  const frameWidth = Math.min(width, 430)
  const routeService = useMemo(() => parseServiceType(firstParam(params.serviceType)), [params.serviceType])
  const routeSessionId = useMemo(() => firstParam(params.sessionId), [params.sessionId])
  const [state, dispatch] = useReducer(kaelChatReducer, routeService, createInitialKaelChatState)
  const addressDistrictRef = useRef<string | null>(null)
  const {
    addressLabel,
    confirmArmed,
    confirmedMessage,
    confirming,
    draft,
    error,
    loading,
    selectedService,
    sending,
    session,
  } = state
  const estimate = session?.session.estimate ?? session?.turns.find((turn) => turn.estimate)?.estimate ?? null
  const turns = session?.turns ?? []
  const historyTarget = session?.session.job_id ? `/(customer)/history?job_id=${encodeURIComponent(session.session.job_id)}` : '/(customer)/history'
  const addressDistrict = useMemo(() => inferKaelChatDistrict(addressLabel), [addressLabel])
  const hasDraft = draft.trim().length > 0
  const hasInteraction = Boolean(routeSessionId || session || selectedService || hasDraft || addressLabel.trim() || error || loading)
  const showStarter = hasInteraction && turns.length === 0 && !loading && !session
  const showProcess = hasInteraction || loading
  const showTrace = Boolean(session || turns.length > 0 || estimate)
  const showBrief = Boolean(session && !estimate)

  useEffect(() => {
    if (addressDistrict) addressDistrictRef.current = addressDistrict
  }, [addressDistrict])

  useEffect(() => {
    dispatch({ type: 'syncRouteService', service: routeService, routeSessionId })
  }, [routeService, routeSessionId])

  useEffect(() => {
    if (routeSessionId) return
    const pendingDraft = takePendingKaelChatDraft()
    if (!pendingDraft) return
    dispatch({
      type: 'applyPendingDraft',
      service: pendingDraft.serviceType ?? null,
      message: pendingDraft.message,
    })
  }, [routeSessionId])

  useEffect(() => {
    if (!routeSessionId) return
    let cancelled = false
    dispatch({ type: 'loadSessionStarted' })

    void kaelChatService
      .get(routeSessionId)
      .then((result) => {
        if (cancelled) return
        if (result.success) {
          dispatch({ type: 'loadSessionSucceeded', session: result.data })
        } else {
          dispatch({ type: 'loadSessionFailed', error: localizedKaelChatError(result.error, language) })
        }
      })
      .catch((unknownError: unknown) => {
        if (cancelled) return
        dispatch({
          type: 'loadSessionFailed',
          error: localizedKaelChatError(errorMessage(unknownError, text.errorUnknown), language),
        })
      })

    return () => {
      cancelled = true
    }
  }, [language, routeSessionId, text.errorUnknown])

  const sendTurn = async () => {
    const trimmed = draft.trim()
    if (!trimmed || sending) return
    const createService = selectedService ?? inferLocalDealDraftFromKael(trimmed).serviceType
    if (!createService && !session) {
      dispatch({ type: 'showTransientError', error: text.errorNoService })
      return
    }

    dispatch({ type: 'sendStarted' })

    try {
      const addressPayload = addressLabel.trim()
      const draftDistrict = inferKaelChatDistrict(trimmed)
      const payloadDistrict = addressDistrict ?? draftDistrict ?? addressDistrictRef.current
      if (payloadDistrict) addressDistrictRef.current = payloadDistrict
      const addressFields = {
        address_label: addressPayload || undefined,
        address_district: payloadDistrict ?? undefined,
      }
      const result = session
        ? await kaelChatService.sendTurn(session.session.id, { message: trimmed, photo_urls: [], ...addressFields })
        : await kaelChatService.create({
            service_type: createService as ServiceType,
            message: trimmed,
            problem_chips: [],
            photo_urls: [],
            ...addressFields,
          })

      if (result.success) {
        dispatch({ type: 'sendSucceeded', session: result.data })
      } else {
        dispatch({ type: 'sendFailed', error: localizedKaelChatError(result.error, language) })
      }
    } catch (unknownError: unknown) {
      dispatch({
        type: 'sendFailed',
        error: localizedKaelChatError(errorMessage(unknownError, text.errorUnknown), language),
      })
    }
  }

  const confirmSearch = async () => {
    if (!session || !estimate || confirming) return
    if (!confirmArmed) {
      dispatch({ type: 'confirmArmed' })
      return
    }
    dispatch({ type: 'confirmStarted' })

    try {
      const result = await kaelChatService.confirm(session.session.id)
      if (result.success) {
        const confirmationFallback = result.data.broadcast_sent ? text.confirmed : text.noWorkerConfirmed
        dispatch({
          type: 'confirmSucceeded',
          message: localizedGeneratedText(result.data.message || confirmationFallback, language, confirmationFallback),
          jobId: result.data.job_id,
          status: result.data.status,
        })
        await actions.hydrateRemoteJobById(result.data.job_id)
      } else {
        dispatch({ type: 'confirmFailed', error: localizedKaelChatError(result.error, language) })
      }
    } catch (unknownError: unknown) {
      dispatch({
        type: 'confirmFailed',
        error: localizedKaelChatError(errorMessage(unknownError, text.errorUnknown), language),
      })
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.canvas }]} testID="customer-kael-chat-stack-screen">
      <View style={[styles.chatFrame, { width: frameWidth }]}>
        <View style={styles.hiddenMarker} testID="customer-kael-chat-fullscreen-no-bottom-dock" />
        {reduceTransparency ? null : (
          <View pointerEvents="none" style={styles.chatAmbientField} testID="customer-kael-chat-liquid-wash">
            <View style={[styles.chatAmbientMint, { backgroundColor: tokens.aqua }]} />
            <View style={[styles.chatAmbientWarm, { backgroundColor: tokens.copper }]} />
            <View style={[styles.chatAmbientSweep, { backgroundColor: tokens.glassHighlight }]} />
          </View>
        )}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <KaelChatHeader onBack={() => replace('/(customer)/home')} reduceMotion={reduceMotion} text={text} themeMode={themeMode} tokens={tokens} />

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.threadScroll}>
          <View style={styles.hiddenMarker} testID="customer-kael-chat-service-picker" />

          {loading ? (
            <View style={[styles.stateCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
              <ActivityIndicator color={tokens.primary} />
              <Text style={[styles.bodyText, { color: tokens.muted }]}>{text.loading}</Text>
            </View>
          ) : null}

          <View style={styles.turnList} testID="customer-kael-chat-history">
            {showProcess ? (
              <KaelProcessCard
                estimate={estimate}
                loading={loading}
                text={text}
              />
            ) : null}
            {showStarter ? (
              <>
                <View style={styles.turnRow} testID="customer-kael-chat-welcome-turn">
                  <View style={[styles.turnAvatar, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
                    <Image source={kaelModel8AHead} style={styles.turnAvatarImage} />
                  </View>
                  <View style={[styles.turnBubble, styles.kaelTurn, styles.turnBubbleWithAvatar, styles.emptyChatStart, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
                    <Text style={[styles.turnRole, { color: tokens.primary }]} numberOfLines={1}>
                      Kael
                    </Text>
                    <Text style={[styles.turnText, { color: tokens.text }]}>
                      {text.welcome}
                    </Text>
                  </View>
                </View>
                {!selectedService ? (
                  <View style={styles.contextRail} testID="customer-kael-chat-service-picker-inline">
                    <View style={styles.chatQuickServices}>
                      {supportedServices.map((service) => (
                        <Pressable
                          accessibilityRole="button"
                          key={service}
                          onPress={() => {
                            dispatch({ type: 'selectService', service })
                          }}
                          style={({ pressed }) => [
                            styles.serviceChip,
                            {
                              backgroundColor: tokens.service,
                              borderColor: tokens.border,
                            },
                            kaelSurfacePaint(tokens, 'pill'),
                            pressed ? styles.pressed : null,
                          ]}
                          testID={`customer-kael-chat-service-${service}`}
                        >
                          <Text style={[styles.chipText, { color: tokens.text }]} numberOfLines={1}>
                            {localizedServiceLabel(service, language)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}
              </>
            ) : null}
            {turns.map((turn) => (
              <ChatTurn key={turn.id} language={language} turn={turn} />
            ))}
            {showTrace ? (
              <KaelTraceCard
                addressDistrict={addressDistrict}
                estimate={estimate}
                language={language}
                selectedService={selectedService}
                session={session}
                text={text}
              />
            ) : null}
            {showBrief ? <EmptyKaelBriefCard language={language} selectedService={selectedService} text={text} /> : null}
          </View>

          {estimate ? (
            <EstimateCard estimate={estimate} language={language} onConfirm={confirmSearch} confirming={confirming} confirmed={session?.session.next_action === 'confirmed'} confirmArmed={confirmArmed} />
          ) : null}

          {confirmedMessage ? (
            <View style={[styles.stateCard, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]} testID="customer-kael-chat-confirmed">
              <Text style={[styles.sectionTitle, { color: tokens.text }]}>{confirmedMessage}</Text>
              <Pressable accessibilityRole="button" onPress={() => replace(historyTarget)} style={({ pressed }) => [styles.primaryButton, { backgroundColor: tokens.primary }, pressed ? styles.pressed : null]} testID="customer-kael-chat-history-action">
                <Text style={[styles.primaryButtonText, { color: tokens.primaryText }]}>{text.history}</Text>
              </Pressable>
            </View>
          ) : null}

          {error ? (
            <View style={[styles.errorCard, { backgroundColor: tokens.warm, borderColor: tokens.copper }]} testID="customer-kael-chat-error">
              <Text style={[styles.errorText, { color: tokens.text }]}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>

        <KaelChatComposer
          addressLabel={addressLabel}
          dispatch={dispatch}
          draft={draft}
          error={error}
          language={language}
          onAddressDistrict={(district) => {
            addressDistrictRef.current = district
          }}
          onSend={sendTurn}
          reduceMotion={reduceMotion}
          sending={sending}
          text={text}
          themeMode={themeMode}
          tokens={tokens}
        />
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  )
}

function ChatTurn({ language, turn }: { language: AppLanguage; turn: KaelChatTurn }) {
  const tokens = useKaelChatTokens()
  const text = copy[language]
  const isCustomer = turn.role === 'customer'
  const rawBody = turn.text_content ?? turn.estimate?.problem_summary ?? text.turnFallback
  const body = isCustomer ? rawBody : localizedGeneratedText(rawBody, language, text.turnFallback)
  const who = isCustomer ? localizedRoleCustomer(language) : 'Kael'

  return (
    <View style={[styles.turnRow, isCustomer ? styles.turnRowCustomer : null]} testID={`customer-kael-chat-turn-${turn.role}`}>
      {isCustomer ? null : (
        <View style={[styles.turnAvatar, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
          <Image source={kaelModel8AHead} style={styles.turnAvatarImage} />
        </View>
      )}
      <View style={[styles.turnBubble, isCustomer ? styles.customerTurn : styles.kaelTurn, !isCustomer ? styles.turnBubbleWithAvatar : null, { backgroundColor: isCustomer ? tokens.service : tokens.raised, borderColor: isCustomer ? tokens.borderStrong : tokens.border }, kaelSurfacePaint(tokens, isCustomer ? 'customerBubble' : 'kaelBubble')]}>
        <Text style={[styles.turnRole, { color: tokens.primary }]} numberOfLines={1}>
          {who}
        </Text>
        <Text style={[styles.turnText, { color: tokens.text }]}>{body}</Text>
        {turn.estimate ? <EstimateInline estimate={turn.estimate} language={language} /> : null}
      </View>
    </View>
  )
}

function EstimateInline({
  estimate,
  language,
}: {
  estimate: NonNullable<KaelChatResponse['session']['estimate']>
  language: AppLanguage
}) {
  const tokens = useKaelChatTokens()
  const text = copy[language]

  return (
    <View style={[styles.inlineEstimate, { borderColor: tokens.border }]}>
      <Text style={[styles.inlineEstimateText, { color: tokens.muted }]}>
        {text.labels.price}: {formatPriceRange(estimate.price_min, estimate.price_max)}
      </Text>
    </View>
  )
}

function EstimateCard({
  confirming,
  confirmed,
  confirmArmed,
  estimate,
  language,
  onConfirm,
}: {
  confirming: boolean
  confirmed: boolean
  confirmArmed: boolean
  estimate: NonNullable<KaelChatResponse['session']['estimate']>
  language: AppLanguage
  onConfirm: () => void
}) {
  const tokens = useKaelChatTokens()
  const text = copy[language]
  const problem = localizedGeneratedText(estimate.problem_summary || estimate.problem_category, language, text.estimateProblemFallback)
  const advisory = localizedOptionalGeneratedText(estimate.advisory, language)
  const disclaimer = language === 'vi'
    ? LOCAL_WORKFLOW_PRICE_DISCLAIMER
    : localizedGeneratedText(estimate.disclaimer, language, text.estimateDisclaimerFallback)

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
      {/* Phase 4.1 (plan §22.9.B, 2026-05-23): fee + cancellation + summary
          total so customer thấy tổng cost trước khi xác nhận tìm thợ. */}
      <InfoRow label={text.labels.platformFee} value={`~${PLATFORM_FEE_PCT}%`} />
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
      {confirmArmed && !confirmed ? (
        <View style={[styles.confirmPrompt, { backgroundColor: tokens.warm, borderColor: tokens.copper }]} testID="customer-kael-chat-inline-confirmation">
          <Text style={[styles.confirmPromptText, { color: tokens.text }]}>{text.confirmPrompt}</Text>
        </View>
      ) : null}
      <Pressable accessibilityRole="button" disabled={confirmed || confirming} onPress={onConfirm} style={({ pressed }) => [styles.primaryButton, { backgroundColor: confirmed ? tokens.disabled : tokens.primary }, pressed ? styles.pressed : null]} testID="customer-kael-chat-confirm">
        <Text style={[styles.primaryButtonText, { color: confirmed ? tokens.subtleText : tokens.primaryText }]}>{confirming ? text.confirming : confirmed ? text.nextAction.confirmed : confirmArmed ? text.confirmArmed : text.confirm}</Text>
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

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function parseServiceType(value: string | undefined): ServiceType | null {
  return value === 'electrical' || value === 'plumbing' || value === 'cleaning' ? value : null
}

function formatPriceRange(min: number, max: number) {
  return `${vndFormatter.format(min)}đ - ${vndFormatter.format(max)}đ`
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback
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

function localizedOptionalGeneratedText(value: string | null | undefined, language: AppLanguage) {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (language === 'en' && vietnameseSignalPattern.test(trimmed)) return null
  if (language === 'vi' && /^[\x00-\x7F]*$/.test(trimmed)) return null
  return trimmed
}

function localizedKaelChatError(error: string, language: AppLanguage) {
  const hasVietnameseSignal = vietnameseSignalPattern.test(error)
  if (language === 'en' && hasVietnameseSignal) {
    return 'Kael could not update this session. Please try again.'
  }
  if (language === 'vi' && /^[\x00-\x7F]*$/.test(error)) {
    return 'Kael chưa thể cập nhật phiên này. Vui lòng thử lại.'
  }
  return error
}
