import { type Dispatch, type MutableRefObject, useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { inferLocalDealDraftFromKael, LOCAL_WORKFLOW_PRICE_DISCLAIMER, type LocalDeal, type ServiceType } from '@home-services/shared'
import { useCustomerThemeMode } from '@/components/customer/customer-theme'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { localizedServiceLabel, type AppLanguage, useAppLanguage } from '@/lib/app-language'
import { type KaelChatResponse } from '@/lib/api-types'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { uploadJobMediaDrafts, type LocalMediaUploadDraft } from '@/lib/media-upload'
import { kaelChatService } from '@/lib/services'
import {
  clearStableClientRequestId,
  stableClientRequestId,
  type PendingClientRequestId,
} from '@/lib/client-request-id'
import { useServiceWorkflow } from '@/lib/use-service-workflow'
import { inferKaelChatDistrict } from './address-district'
import {
  KaelChatComposer,
  type KaelChatArchiveItem,
  KaelChatHeader,
  useKaelChatTokens,
} from './agentic-parts'
import { takePendingKaelChatDraft } from './pending-intake'
import { createInitialKaelChatState, kaelChatReducer, type KaelChatAction, type KaelChatState } from './state'
import { styles } from './styles'
import { KaelChatThread, type KaelChatVisibility } from './thread'

const KAEL_CHAT_STACK_SCREEN_CONTRACT = 'KAEL_CHAT_STACK_SCREEN_CONTRACT: stack route uses kaelChatService only'
const KAEL_CHAT_SERVICE_WRAPPER_ONLY = 'KAEL_CHAT_SERVICE_WRAPPER_ONLY: UI does not call Supabase, fetch, or AI directly'
const KAEL_CHAT_EMPTY_TICKET_SUMMARY_TEST_ID = 'customer-kael-chat-empty-ticket-summary'
const KAEL_CHAT_ADDRESS_CONTEXT_BAR_CONTRACT = 'KaelAddressContextBar'
const KAEL_CHAT_EXTRACTED_GLASS_CONTRACT = `getReducedTransparencyCustomerTokens import { GlassSurface } from '@/components/ui/glass-surface' testID="customer-kael-chat-glass-header" testID="customer-kael-chat-glass-composer" reduceMotionAwarePressStyle(pressed, reduceMotion) subtitle: 'Trợ lý phân tích và điều phối'`
const CUSTOMER_KAEL_CHAT_WORKER_FRAME_PARITY = 'CUSTOMER_KAEL_CHAT_WORKER_FRAME_PARITY: customer-kael-worker-chatbox-parity customer-chat-reference-composer-tools customer-chat-reference-mode-pill'
void [KAEL_CHAT_STACK_SCREEN_CONTRACT, KAEL_CHAT_SERVICE_WRAPPER_ONLY, KAEL_CHAT_EMPTY_TICKET_SUMMARY_TEST_ID, KAEL_CHAT_ADDRESS_CONTEXT_BAR_CONTRACT, KAEL_CHAT_EXTRACTED_GLASS_CONTRACT, CUSTOMER_KAEL_CHAT_WORKER_FRAME_PARITY]

const KAEL_CHAT_FRAME_MAX_WIDTH = 680
const vietnameseSignalPattern = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i

const copy = {
  vi: {
    attach: 'Ảnh',
    attachHint: 'Nếu cần ảnh, Kael sẽ yêu cầu bổ sung trong phiên này.',
    archiveActiveMeta: 'Đang mở',
    archiveCurrentChat: 'Chat hiện tại',
    archiveDraftMeta: 'Chờ tạo phiên',
    archiveEmptyBody: 'Gửi mô tả thật để Kael tạo phiên.',
    archiveEmptySubtitle: 'Chưa có phiên',
    archiveEmptyTitle: 'Chưa có phiên lưu',
    archiveHistoryMeta: 'Xem hoạt động',
    archiveLoadingChat: 'Đang tải phiên',
    archiveNoService: 'Chưa chọn dịch vụ',
    archiveOpen: 'Mở phiên lưu',
    archivePendingIntake: 'Phiếu đang gửi',
    archiveServiceRequest: 'Phiên đặt dịch vụ',
    archiveTitle: 'Phiên Kael',
    activityOrchestrating: 'Đang điều phối',
    activityResearch: 'Đang nghiên cứu',
    activityThinking: 'Đang nghĩ',
    back: 'Đóng',
    composerPlaceholder: '',
    orchestrate: 'Kael điều phối',
    orchestrating: 'Đang điều phối',
    confirmed: 'Đã tạo yêu cầu. Kael đang tự điều phối thợ phù hợp.',
    emptyTicketBody: 'Phiếu sẽ hiện ở đây sau khi bạn gửi mô tả thật.',
    emptyTicketTitle: 'Phiếu Kael',
    errorNoService: 'Chọn một dịch vụ trước khi gửi mô tả.',
    errorUnknown: 'Kael chưa thể cập nhật phiên này. Vui lòng thử lại.',
    retryIntake: 'Thử gửi lại phiếu',
    retryOrchestration: 'Thử lại với Kael',
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
      orchestrate: 'Kael điều phối',
    },
    traceTitle: 'Kael đang kiểm tra',
    traceService: 'Phạm vi dịch vụ',
    traceMissing: 'Thông tin còn thiếu',
    traceDecision: 'Quyền quyết định',
    traceServiceEmpty: 'Chọn điện, nước hoặc vệ sinh để bắt đầu.',
    traceMissingEmpty: 'Gửi mô tả thật để Kael hỏi đúng phần còn thiếu.',
    traceMissingActive: 'Kael sẽ hỏi thêm ảnh, khu vực hoặc dấu hiệu an toàn khi cần.',
    traceMissingReady: 'Đủ thông tin để xem ước tính.',
    traceDecisionBody: 'Kael tự điều phối bằng quyết định đã kiểm theo chính sách; bạn có thể theo dõi, hủy hoặc khiếu nại.',
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
    briefSafetyBody: 'Kael chuẩn bị phiếu, ghi dấu vết kiểm tra và tự chuyển sang tìm thợ khi đủ dữ liệu.',
    welcome: 'Mình là Kael. Cậu cứ mô tả sự cố trong căn hộ, mình sẽ giúp gom thông tin, hỏi thêm khi cần và chuẩn bị bước điều phối.',
    labels: {
      advisory: 'Lưu ý',
      complexity: 'Mức độ',
      confidence: 'Độ tin cậy',
      problem: 'Vấn đề',
      service: 'Dịch vụ',
      status: 'Trạng thái',
      price: 'Khoảng giá',
      platformFee: 'Phí nền tảng',
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
      confirmed: 'Kael đang tìm thợ.',
      estimate_ready: 'Ước tính đã sẵn sàng để Kael điều phối.',
      unsupported: 'Kael chưa hỗ trợ yêu cầu này.',
    },
  },
  en: {
    attach: 'Photo',
    attachHint: 'If a photo is needed, Kael will ask for it in this session.',
    archiveActiveMeta: 'Open now',
    archiveCurrentChat: 'Current chat',
    archiveDraftMeta: 'Waiting for session',
    archiveEmptyBody: 'Send real details so Kael can create a session.',
    archiveEmptySubtitle: 'No session yet',
    archiveEmptyTitle: 'No saved session',
    archiveHistoryMeta: 'View activity',
    archiveLoadingChat: 'Loading session',
    archiveNoService: 'No service chosen',
    archiveOpen: 'Open saved sessions',
    archivePendingIntake: 'Sending ticket',
    archiveServiceRequest: 'Service session',
    archiveTitle: 'Kael sessions',
    activityOrchestrating: 'Orchestrating',
    activityResearch: 'Researching',
    activityThinking: 'Thinking',
    back: 'Close',
    composerPlaceholder: '',
    orchestrate: 'Kael orchestrates',
    orchestrating: 'Orchestrating',
    confirmed: 'Request created. Kael is orchestrating a suitable worker.',
    emptyTicketBody: 'The ticket appears here after you send real details.',
    emptyTicketTitle: 'Kael ticket',
    errorNoService: 'Choose a service before sending details.',
    errorUnknown: 'Kael could not update this session. Please try again.',
    retryIntake: 'Retry intake',
    retryOrchestration: 'Retry with Kael',
    estimateTitle: 'Kael estimate',
    estimateProblemFallback: 'Kael classified the issue.',
    addressPlaceholder: 'Example: District 7, building/apartment',
    estimateDisclaimerFallback: 'This is a Kael estimate from the current evidence. Kael may update it when new scope evidence is added.',
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
      orchestrate: 'Kael orchestrates',
    },
    traceTitle: 'Kael is checking',
    traceService: 'Service scope',
    traceMissing: 'Missing details',
    traceDecision: 'Decision right',
    traceServiceEmpty: 'Choose electrical, plumbing, or cleaning to start.',
    traceMissingEmpty: 'Send real details so Kael can ask for the right missing part.',
    traceMissingActive: 'Kael will ask for photo, area, or safety signs when needed.',
    traceMissingReady: 'Enough detail for an estimate.',
    traceDecisionBody: 'Kael orchestrates through a policy-checked decision; you can track, cancel, or appeal.',
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
    briefSafetyBody: 'Kael prepares the ticket, records the audit trail, and starts worker search once enough data exists.',
    welcome: 'I am Kael. Describe the issue at home and I will gather details, ask what is needed, and prepare orchestration.',
    labels: {
      advisory: 'Advisory',
      complexity: 'Complexity',
      confidence: 'Confidence',
      problem: 'Problem',
      service: 'Service',
      status: 'Status',
      price: 'Price range',
      platformFee: 'Platform fee',
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
      confirmed: 'Kael is finding a worker.',
      estimate_ready: 'Estimate is ready for Kael orchestration.',
      unsupported: 'Kael does not support this request yet.',
    },
  },
} as const

type KaelChatSurfaceText = (typeof copy)[AppLanguage]
function usePendingIntakeSession({
  addressDistrict,
  addressDistrictRef,
  addressLabel,
  dispatch,
  language,
  pendingChatCreateClientRequestRef,
  pendingIntake,
  pendingIntakeRetryNonce,
  pendingIntakeSentRef,
  routeSessionId,
  selectedService,
  session,
  text,
}: {
  addressDistrict: string | null
  addressDistrictRef: MutableRefObject<string | null>
  addressLabel: string
  dispatch: Dispatch<KaelChatAction>
  language: AppLanguage
  pendingChatCreateClientRequestRef: MutableRefObject<PendingClientRequestId | null>
  pendingIntake: KaelChatState['pendingIntake']
  pendingIntakeRetryNonce: number
  pendingIntakeSentRef: MutableRefObject<string | null>
  routeSessionId?: string
  selectedService: ServiceType | null
  session: KaelChatResponse | null
  text: KaelChatSurfaceText
}) {
  useEffect(() => {
    if (!pendingIntake || routeSessionId || session) return
    const trimmed = pendingIntake.message.trim()
    if (!trimmed) return
    const createService = pendingIntake.serviceType ?? selectedService ?? inferLocalDealDraftFromKael(trimmed).serviceType
    if (!createService) {
      const missingServiceKey = `missing-service:${pendingIntake.clientRequestId ?? trimmed}`
      if (pendingIntakeSentRef.current !== missingServiceKey) {
        pendingIntakeSentRef.current = missingServiceKey
        dispatch({ type: 'showTransientError', error: text.errorNoService })
      }
      return
    }

    const addressPayload = (pendingIntake.addressLabel ?? addressLabel).trim()
    const payloadDistrict = pendingIntake.districtLabel ?? addressDistrict ?? inferKaelChatDistrict(trimmed) ?? addressDistrictRef.current
    const problemChips = pendingIntake.problemChips ?? []
    const requestFingerprint = JSON.stringify({
      service_type: createService,
      message: trimmed,
      problem_chips: problemChips,
      photo_urls: [],
      address_label: addressPayload,
      address_district: payloadDistrict ?? null,
      source: pendingIntake.source ?? 'booking',
    })
    const requestKey = pendingIntake.clientRequestId ?? requestFingerprint
    if (pendingIntakeSentRef.current === requestKey) return
    pendingIntakeSentRef.current = requestKey
    if (payloadDistrict) addressDistrictRef.current = payloadDistrict

    let cancelled = false
    dispatch({ type: 'sendStarted' })
    void kaelChatService.create({
      service_type: createService,
      message: trimmed,
      problem_chips: problemChips,
      photo_urls: [],
      client_request_id: pendingIntake.clientRequestId ?? stableClientRequestId(pendingChatCreateClientRequestRef, requestFingerprint),
      address_label: addressPayload || undefined,
      address_district: payloadDistrict ?? undefined,
    }).then((result) => {
      if (cancelled) return
      if (result.success) {
        if (!pendingIntake.clientRequestId) {
          clearStableClientRequestId(pendingChatCreateClientRequestRef, requestFingerprint)
        }
        dispatch({ type: 'sendSucceeded', session: result.data, clearDraft: false })
      } else {
        dispatch({ type: 'sendFailed', error: localizedKaelChatError(result.error, language) })
      }
    }).catch((unknownError: unknown) => {
      if (cancelled) return
      dispatch({
        type: 'sendFailed',
        error: localizedKaelChatError(errorMessage(unknownError, text.errorUnknown), language),
      })
    })

    return () => {
      cancelled = true
    }
  }, [addressDistrict, addressDistrictRef, addressLabel, dispatch, language, pendingChatCreateClientRequestRef, pendingIntake, pendingIntakeRetryNonce, pendingIntakeSentRef, routeSessionId, selectedService, session, text.errorNoService, text.errorUnknown])
}

export function KaelChatSurface() {
  const { replace } = useRouter()
  const params = useLocalSearchParams()
  const language = useAppLanguage()
  const text = copy[language]
  const { actions, state: frontendWorkflowState } = useFrontendWorkflow()
  const themeMode = useCustomerThemeMode()
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const tokens = useKaelChatTokens()
  const { width } = useWindowDimensions()
  const frameWidth = Math.min(width, KAEL_CHAT_FRAME_MAX_WIDTH)
  const routeService = useMemo(() => parseServiceType(firstParam(params.serviceType)), [params.serviceType])
  const routeSessionId = useMemo(() => firstParam(params.sessionId), [params.sessionId])
  const [state, dispatch] = useReducer(kaelChatReducer, routeService, createInitialKaelChatState)
  const [pendingIntakeRetryNonce, bumpPendingIntakeRetryNonce] = useReducer((value: number) => value + 1, 0)
  const addressDistrictRef = useRef<string | null>(null)
  const pendingChatCreateClientRequestRef = useRef<PendingClientRequestId | null>(null)
  const pendingIntakeSentRef = useRef<string | null>(null)
  const autoConfirmSessionRef = useRef<string | null>(null)
  const pendingMediaUploadJobRef = useRef<string | null>(null)
  const {
    addressLabel,
    composerPhotoDrafts,
    orchestrationMessage,
    orchestrating,
    draft,
    error,
    loading,
    pendingIntake,
    selectedService,
    sending,
    session,
  } = state
  const estimate = session?.session.estimate ?? session?.turns.find((turn) => turn.estimate)?.estimate ?? null
  const turns = session?.turns ?? []
  const historyTarget = session?.session.job_id ? `/(customer)/history?job_id=${encodeURIComponent(session.session.job_id)}` : '/(customer)/history'
  const archiveItems = useMemo(
    () => buildKaelChatArchiveItems({
      deal: frontendWorkflowState.deal,
      historyTarget,
      language,
      pendingIntake,
      routeSessionId,
      selectedService,
      session,
      text,
    }),
    [frontendWorkflowState.deal, historyTarget, language, pendingIntake, routeSessionId, selectedService, session, text],
  )
  const addressDistrict = useMemo(() => inferKaelChatDistrict(addressLabel), [addressLabel])
  const hasDraft = draft.trim().length > 0
  const hasInteraction = Boolean(routeSessionId || session || selectedService || hasDraft || pendingIntake || addressLabel.trim() || error || loading)
  const hasPendingIntakeOnly = Boolean(pendingIntake && !routeSessionId && !session)
  const hasKaelSessionContext = Boolean(routeSessionId || session || turns.length > 0)
  const showStarter = hasInteraction && turns.length === 0 && !loading && !session
  const chatWorkflowStatus = session?.session.status === 'confirmed' ? 'broadcasting' : null
  const workflow = useServiceWorkflow({
    status: chatWorkflowStatus,
    hasAiNotes: hasPendingIntakeOnly ? false : turns.length > 0,
    hasCustomerInput: hasPendingIntakeOnly ? false : hasKaelSessionContext,
    hasPendingIntake: hasPendingIntakeOnly,
    hasEstimate: Boolean(estimate),
    isLoading: hasPendingIntakeOnly ? false : loading,
    optimistic: orchestrating ? 'starting_matching' : null,
  })
  const showProcess = workflow.artifacts.process_ticket.visible
  const showTrace = workflow.artifacts.ai_diagnosis.visible
  const showBrief = Boolean(session && !estimate && workflow.artifacts.process_ticket.mode === 'partial')
  const showEstimate = Boolean(estimate && workflow.artifacts.estimate.visible)
  const canStartOrchestration = Boolean(estimate && session?.session.next_action === 'estimate_ready')
  const threadVisibility: KaelChatVisibility = { canStartOrchestration, showBrief, showEstimate, showProcess, showStarter, showTrace }

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
      intake: pendingDraft,
    })
  }, [routeSessionId])

  usePendingIntakeSession({
    addressDistrict,
    addressDistrictRef,
    addressLabel,
    dispatch,
    language,
    pendingChatCreateClientRequestRef,
    pendingIntake,
    pendingIntakeRetryNonce,
    pendingIntakeSentRef,
    routeSessionId,
    selectedService,
    session,
    text,
  })

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
      let result: Awaited<ReturnType<typeof kaelChatService.create>>
      if (session) {
        result = await kaelChatService.sendTurn(session.session.id, { message: trimmed, photo_urls: [], ...addressFields })
      } else {
        const requestFingerprint = firstTurnClientRequestFingerprint(
          createService as ServiceType,
          trimmed,
          addressPayload,
          payloadDistrict,
        )
        result = await kaelChatService.create({
          service_type: createService as ServiceType,
          message: trimmed,
          problem_chips: [],
          photo_urls: [],
          // X2 (Plan.md §27.5 — 2026-05-29): idempotent first-turn POST.
          // Reuses existing session if a retry happens.
          client_request_id: stableClientRequestId(
            pendingChatCreateClientRequestRef,
            requestFingerprint,
          ),
          ...addressFields,
        })
        if (result.success) {
          clearStableClientRequestId(
            pendingChatCreateClientRequestRef,
            requestFingerprint,
          )
        }
      }

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

  const startKaelOrchestration = useCallback(async () => {
    if (!session || !estimate || orchestrating) return
    dispatch({ type: 'orchestrationStarted' })

    try {
      const result = await kaelChatService.confirm(session.session.id)
      if (result.success) {
        const confirmationFallback = result.data.broadcast_sent ? text.confirmed : text.noWorkerConfirmed
        dispatch({
          type: 'orchestrationSucceeded',
          message: localizedGeneratedText(result.data.message || confirmationFallback, language, confirmationFallback),
          jobId: result.data.job_id,
        })
        const pendingPhotos = mergeKaelChatMediaDrafts(pendingIntake?.photoDrafts ?? [], composerPhotoDrafts)
        if (pendingPhotos.length > 0 && pendingMediaUploadJobRef.current !== result.data.job_id) {
          pendingMediaUploadJobRef.current = result.data.job_id
          const uploaded = await uploadJobMediaDrafts(result.data.job_id, pendingPhotos, 'before')
          if (!uploaded.success) {
            dispatch({ type: 'showTransientError', error: localizedKaelChatError(uploaded.error, language) })
          } else {
            dispatch({ type: 'composerPhotosUploaded' })
          }
        }
        await actions.hydrateRemoteJobById(result.data.job_id)
      } else {
        dispatch({ type: 'orchestrationFailed', error: localizedKaelChatError(result.error, language) })
      }
    } catch (unknownError: unknown) {
      dispatch({
        type: 'orchestrationFailed',
        error: localizedKaelChatError(errorMessage(unknownError, text.errorUnknown), language),
      })
    }
  }, [actions, composerPhotoDrafts, estimate, language, orchestrating, pendingIntake, session, text.confirmed, text.errorUnknown, text.noWorkerConfirmed])

  const retryPendingIntake = useCallback(() => {
    pendingIntakeSentRef.current = null
    bumpPendingIntakeRetryNonce()
  }, [])

  useEffect(() => {
    if (!session || !estimate || orchestrating || orchestrationMessage) return
    if (session.session.job_id || session.session.next_action !== 'estimate_ready') return
    const requestKey = `${session.session.id}:${session.session.estimate_ready_at ?? 'estimate_ready'}`
    if (autoConfirmSessionRef.current === requestKey) return
    autoConfirmSessionRef.current = requestKey
    void startKaelOrchestration()
  }, [estimate, orchestrating, orchestrationMessage, session, startKaelOrchestration])

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.canvas }]} testID="customer-kael-chat-stack-screen">
      <View style={[styles.chatFrame, { width: frameWidth }]}>
        <View style={styles.hiddenMarker} testID="customer-kael-chat-fullscreen-no-bottom-dock" />
        <View style={styles.hiddenMarker} testID="customer-kael-worker-chatbox-parity" />
        {reduceTransparency ? null : (
          <View pointerEvents="none" style={styles.chatAmbientField} testID="customer-kael-chat-liquid-wash">
            <View style={[styles.chatAmbientMint, { backgroundColor: tokens.aqua }]} />
            <View style={[styles.chatAmbientWarm, { backgroundColor: tokens.copper }]} />
            <View style={[styles.chatAmbientSweep, { backgroundColor: tokens.glassHighlight }]} />
          </View>
        )}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.keyboard, styles.chatShell]}>
          <KaelChatHeader
            archiveItems={archiveItems}
            onBack={() => replace('/(customer)/home')}
            onOpenArchiveItem={(item) => {
              if (item.targetPath) replace(item.targetPath)
            }}
            reduceMotion={reduceMotion}
            text={text}
            tokens={tokens}
          />

          <KaelChatThread
            addressDistrict={addressDistrict}
            dispatch={dispatch}
            error={error}
            estimate={estimate}
            historyTarget={historyTarget}
            language={language}
            loading={loading}
            onStartOrchestration={startKaelOrchestration}
            onRetryPendingIntake={retryPendingIntake}
            onOpenHistory={(target) => replace(target)}
            orchestrating={orchestrating}
            orchestrationMessage={orchestrationMessage}
            pendingIntake={pendingIntake}
            reduceMotion={reduceMotion}
            selectedService={selectedService}
            sending={sending}
            session={session}
            text={text}
            tokens={tokens}
            turns={turns}
            visibility={threadVisibility}
            workflow={workflow}
          />

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

function buildKaelChatArchiveItems({
  deal,
  historyTarget,
  language,
  pendingIntake,
  routeSessionId,
  selectedService,
  session,
  text,
}: {
  deal: LocalDeal | null
  historyTarget: string
  language: AppLanguage
  pendingIntake: KaelChatState['pendingIntake']
  routeSessionId: string | undefined
  selectedService: ServiceType | null
  session: KaelChatResponse | null
  text: KaelChatSurfaceText
}): KaelChatArchiveItem[] {
  const items: KaelChatArchiveItem[] = []

  if (session) {
    items.push({
      id: `chat:${session.session.id}`,
      meta: text.archiveActiveMeta,
      subtitle: localizedServiceLabel(session.session.service_type, language),
      title: text.archiveCurrentChat,
    })
  } else if (routeSessionId) {
    items.push({
      id: `chat:${routeSessionId}`,
      meta: text.loading,
      subtitle: selectedService ? localizedServiceLabel(selectedService, language) : text.archiveNoService,
      title: text.archiveLoadingChat,
    })
  }

  const serviceRequestJobId = session?.session.job_id ?? deal?.broadcast?.jobId ?? null
  if (session?.session.job_id || deal) {
    const serviceType = deal?.draft.serviceType ?? session?.session.service_type ?? selectedService
    items.push({
      id: `request:${serviceRequestJobId ?? deal?.id ?? 'current'}`,
      meta: text.archiveHistoryMeta,
      subtitle: serviceType ? localizedServiceLabel(serviceType, language) : text.archiveNoService,
      targetPath: serviceRequestJobId ? `/(customer)/history?job_id=${encodeURIComponent(serviceRequestJobId)}` : historyTarget,
      title: text.archiveServiceRequest,
    })
  }

  if (pendingIntake && !session) {
    items.push({
      id: `pending:${pendingIntake.clientRequestId ?? pendingIntake.source}:${pendingIntake.serviceType ?? 'service'}:${pendingIntake.mediaCount}`,
      meta: text.archiveDraftMeta,
      subtitle: pendingIntake.serviceType ? localizedServiceLabel(pendingIntake.serviceType, language) : text.archiveNoService,
      title: text.archivePendingIntake,
    })
  }

  return items
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function mergeKaelChatMediaDrafts(...groups: LocalMediaUploadDraft[][]) {
  const seenUris = new Set<string>()
  const merged: LocalMediaUploadDraft[] = []
  for (const group of groups) {
    for (const draft of group) {
      if (seenUris.has(draft.uri)) continue
      seenUris.add(draft.uri)
      merged.push(draft)
      if (merged.length >= 5) return merged
    }
  }
  return merged
}

function firstTurnClientRequestFingerprint(
  serviceType: ServiceType,
  message: string,
  addressLabel: string,
  addressDistrict: string | null | undefined,
): string {
  return JSON.stringify({
    service_type: serviceType,
    message,
    problem_chips: [],
    photo_urls: [],
    address_label: addressLabel,
    address_district: addressDistrict ?? null,
  })
}

function parseServiceType(value: string | undefined): ServiceType | null {
  return value === 'electrical' || value === 'plumbing' || value === 'cleaning' ? value : null
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback
}

function localizedGeneratedText(value: string, language: AppLanguage, fallback: string) {
  const trimmed = value.trim()
  if (trimmed.length === 0) return fallback
  if (language === 'en' && vietnameseSignalPattern.test(trimmed)) return fallback
  if (language === 'vi' && /^[\x00-\x7F]*$/.test(trimmed)) return fallback
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
