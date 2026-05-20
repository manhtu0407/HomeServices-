import { type ReactNode, useEffect, useMemo, useReducer, useRef } from 'react'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import {
  LOCAL_WORKFLOW_PRICE_DISCLAIMER,
  extractDistrictLabel,
  extractKnownDistrictLabel,
  type LocalDealDraft,
  type LocalDealStatus,
  type ServiceType,
} from '@home-services/shared'
import { CustomerV4DockOverlay, useCustomerThemeMode } from '@/components/customer/customer-surfaces'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { GlassPressable } from '@/components/ui/glass-pressable'
import { ReduceMotionAwareEntranceView } from '@/components/ui/reduce-motion-aware-animation'
import { Colors } from '@/constants/colors'
import {
  appCopy,
  localizedProblemLabel,
  localizedProblemOptions,
  localizedServiceLabel,
  localizedStatusLabel,
  useAppLanguage,
  type AppLanguage,
} from '@/lib/app-language'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

const BOOKING_DECORATIVE_MOTION_ENABLED = false

type PriceCheckUiStep = 'form' | 'clarification' | 'estimate' | 'schedule' | 'confirm' | 'searching' | 'emptyWorker' | 'matched'
type PriceCheckUiStatus = 'editing' | 'loading' | 'needs_clarification' | 'estimate_ready' | 'baseline_fallback' | 'fallback' | 'error'

type MediaDraftItem = {
  id: string
  uri: string
  type: 'image' | 'video'
  fileName?: string
  mimeType?: string
  fileSizeBytes?: number
  durationMs?: number
}

type PriceCheckDraft = {
  serviceType: ServiceType | null
  problemChips: string[]
  description: string
  mediaItems: MediaDraftItem[]
  addressLabel: string
  clarificationAnswers: Record<string, string>
  timeChoice: 'now'
}

type PriceCheckEstimateCard = {
  problemLabel: string
  complexity: 'small' | 'medium' | 'large' | 'unknown'
  priceRangeLabel: string
  confidenceLabel: string
  advisory: string
  disclaimer: string
  source: 'kael' | 'baseline_fallback'
}

type ClarificationQuestion = {
  id: string
  question: string
  options: readonly {
    label: string
    value: string
  }[]
}

const theme = Colors.priceCheck
const BOOKING_V4_VISUAL_CONTRACT = 'BOOKING_V4_VISUAL_CONTRACT: production replaces old booking UI with prototype V4 flow'
const BOOKING_FORM_FIRST_CONTRACT = 'BOOKING_FORM_FIRST_CONTRACT: V4 form-first production price check'
const BOOKING_LAYER_SWITCH_V4 = 'BOOKING_LAYER_SWITCH_V4: glass mint/warm semantic layers'
const BOOKING_TYPE_RHYTHM = 'BOOKING_TYPE_RHYTHM: compact V4 typography'
const BOOKING_INTERACTION_MOTION_V4 = 'BOOKING_INTERACTION_MOTION_V4: tap and reveal only'
const PRICE_DISCLAIMER = LOCAL_WORKFLOW_PRICE_DISCLAIMER
const kaelModel8A = require('../../assets/kael-model-8a.png')
const bookingFrameHorizontalPadding = 16

const tokens = {
  canvas: '#F4FAF7',
  base: '#FFFDF8',
  raised: '#FFFFFF',
  glass: 'rgba(255,253,248,0.78)',
  glassSoft: 'rgba(255,255,255,0.58)',
  glassStrong: 'rgba(255,255,255,0.74)',
  glassWarm: 'rgba(255,253,246,0.68)',
  glassBorder: 'rgba(255,255,255,0.82)',
  glassHighlight: 'rgba(255,255,255,0.70)',
  glassShadow: '0 12px 30px rgba(13,70,65,0.09)',
  glassFloatShadow: '0 8px 20px rgba(13,70,65,0.07)',
  service: '#DCF3EC',
  water: '#E6F8F6',
  warm: '#FFF0DE',
  depth: '#EAF6F1',
  border: '#D2E8E1',
  borderStrong: '#A9D9CF',
  text: '#102B2D',
  muted: '#667D7A',
  subtle: '#829A95',
  primary: '#08786E',
  primaryDark: '#075F58',
  copper: '#BB743D',
}
let currentBookingThemeMode: 'light' | 'dark' = 'light'
const openHomePath = '/(customer)/home'
const openHistoryPath = '/(customer)/history'

const EMPTY_DRAFT: PriceCheckDraft = {
  serviceType: null,
  problemChips: [],
  description: '',
  mediaItems: [],
  addressLabel: '',
  clarificationAnswers: {},
  timeChoice: 'now',
}

const UNKNOWN_OPTION_VALUE = 'unknown'

const bookingCopy = {
  vi: {
    nav: {
      back: 'Quay lại',
      locationFallback: appCopy.vi.common.chooseArea,
    },
    header: {
      badge: 'KIỂM GIÁ',
      title: 'Kiểm giá',
    },
    trust: {
      describe: 'Mô tả',
      estimate: 'Ước tính',
      confirm: 'Xác nhận',
      match: 'Tìm thợ',
    },
    form: {
      address: 'Khu vực',
      addressEntered: 'Đã nhập',
      addressRequired: 'Bắt buộc',
      addressPlaceholder: 'Ví dụ: Quận 7, TP.HCM',
      clarifyFallback: 'Kael sẽ hỏi thêm khi cần.',
      clarifyMeta: 'Khi cần',
      clarifyTitle: 'Kael hỏi thêm',
      description: 'Mô tả',
      descriptionAccessibility: 'Mô tả vấn đề',
      descriptionPlaceholder: 'Mô tả dấu hiệu, vị trí, thời điểm xảy ra...',
      problem: 'Vấn đề',
      problemMeta: 'Chọn',
      serviceFirst: 'Chọn dịch vụ trước.',
      unsupportedService: 'Chỉ hỗ trợ điện, nước, vệ sinh.',
    },
    media: {
      accessibilityAdd: 'Thêm ảnh hoặc video',
      add: 'Thêm ảnh/video',
      remove: 'Gỡ',
      removeImage: 'Gỡ ảnh',
      removeVideo: 'Gỡ video',
      title: 'Ảnh / video',
      video: 'Video',
      optional: 'Tùy chọn',
    },
    questions: {
      electrical: [
        {
          id: 'scope',
          question: 'Sự cố điện ở một vị trí hay nhiều vị trí?',
          options: [
            { value: 'single', label: 'Một vị trí' },
            { value: 'multiple', label: 'Nhiều vị trí' },
            { value: UNKNOWN_OPTION_VALUE, label: appCopy.vi.common.unknown },
          ],
        },
        {
          id: 'breaker',
          question: 'Aptomat hoặc công tắc có dấu hiệu bất thường không?',
          options: [
            { value: 'yes', label: 'Có' },
            { value: 'no', label: 'Không' },
            { value: UNKNOWN_OPTION_VALUE, label: appCopy.vi.common.unknown },
          ],
        },
      ],
      plumbing: [
        {
          id: 'scope',
          question: 'Rò/tắc ở một vị trí hay nhiều vị trí?',
          options: [
            { value: 'single', label: 'Một vị trí' },
            { value: 'multiple', label: 'Nhiều vị trí' },
            { value: UNKNOWN_OPTION_VALUE, label: appCopy.vi.common.unknown },
          ],
        },
        {
          id: 'leak',
          question: 'Nước rò liên tục hay khi sử dụng?',
          options: [
            { value: 'continuous', label: 'Liên tục' },
            { value: 'in_use', label: 'Khi dùng' },
            { value: UNKNOWN_OPTION_VALUE, label: appCopy.vi.common.unknown },
          ],
        },
      ],
      cleaning: [
        {
          id: 'scope',
          question: 'Khu vực cần dọn là một phòng hay cả nhà?',
          options: [
            { value: 'single_room', label: 'Một phòng' },
            { value: 'whole_home', label: 'Cả nhà' },
            { value: UNKNOWN_OPTION_VALUE, label: appCopy.vi.common.unknown },
          ],
        },
        {
          id: 'condition',
          question: 'Tình trạng cần vệ sinh ở mức nào?',
          options: [
            { value: 'standard', label: 'Dọn thường' },
            { value: 'deep', label: 'Tổng vệ sinh' },
            { value: 'post_repair', label: 'Sau sửa chữa' },
          ],
        },
      ],
    },
    clarification: {
      remaining: (count: number) => `Trả lời thêm ${count} câu để xem ước tính.`,
    },
    estimate: {
      default: {
        problemLabel: 'Kael kiểm tra trước khi gửi thợ',
        complexity: 'unknown',
        priceRangeLabel: 'Chờ Kael ước tính',
        confidenceLabel: 'Đang chờ dữ liệu',
        advisory: 'Thêm ảnh/khu vực để sát hơn.',
      },
      fallback: {
        problemLabel: 'Chưa đủ dữ liệu an toàn',
        complexity: 'unknown',
        priceRangeLabel: 'Cần thêm thông tin',
        confidenceLabel: 'Cần làm rõ',
        advisory: 'Thêm ảnh hoặc trả lời câu hỏi.',
      },
      kicker: 'KHUNG ƯỚC TÍNH',
      complexity: 'Độ phức tạp',
      advisory: 'Gợi ý',
      priceDisclaimer: PRICE_DISCLAIMER,
      remoteConfidence: 'Kael ước tính',
      systemConfirm: 'Chờ hệ thống xác nhận',
    },
    complexity: {
      large: 'Lớn',
      medium: 'Trung bình',
      small: 'Nhỏ',
      unknown: appCopy.vi.common.unknown,
    },
    schedule: {
      title: 'Thời gian',
      nowTitle: 'Ngay bây giờ',
      nowText: 'Tìm thợ gần nhất',
    },
    confirm: {
      accessibilityNotification: 'Bật cập nhật từ Kael',
      address: 'Địa chỉ',
      confirmTitle: 'Xác nhận tìm thợ',
      described: 'Đã mô tả',
      notificationText: 'Nhận cập nhật ghép thợ.',
      platformFee: 'Phí nền tảng',
      price: 'Ước giá',
      problem: 'Vấn đề',
      required: 'Bắt buộc',
      service: 'Dịch vụ',
      time: 'Thời gian',
    },
    search: {
      title: 'Đang tìm thợ phù hợp',
      text: 'Địa chỉ chi tiết chỉ mở khi thợ nhận.',
      states: ['Đang tìm', 'Thử thợ khác', 'Không có thợ', 'Đã ghép'],
    },
    emptyWorker: {
      title: 'Chưa có thợ phù hợp',
      text: 'Thử lại hoặc chỉnh yêu cầu.',
    },
    matched: {
      title: 'Thợ đã nhận',
      text: 'Theo dõi trạng thái trong Hoạt động.',
    },
    actions: {
      back: 'Quay lại',
      cancel: 'Hủy yêu cầu',
      confirmSearch: 'Gửi yêu cầu',
      continue: 'Tiếp tục',
      editRequest: 'Chỉnh yêu cầu',
      goHome: 'Về trang chủ',
      inspect: 'Để Kael kiểm tra',
      keep: 'Giữ lại',
      openHistory: 'Xem hoạt động',
      retry: 'Thử lại',
      reset: 'Sửa lại',
      reviewConfirm: 'Xem xác nhận',
      reviewEstimate: 'Xem ước tính',
      schedule: 'Chọn thời gian',
      status: 'Trạng thái',
      talk: 'Trò chuyện',
    },
    alerts: {
      cancelBody: 'Yêu cầu sẽ đóng.',
      cancelBroadcastBody: 'Yêu cầu tìm thợ sẽ dừng. Địa chỉ vẫn ẩn.',
      cancelTitle: 'Hủy yêu cầu?',
      mediaPermission: 'Cần quyền thư viện ảnh/video để thêm bằng chứng.',
      mediaUpload: 'Không thể tải ảnh/video lên. Bạn vẫn có thể tiếp tục và bổ sung sau.',
      notificationGate: 'Bật cập nhật để nhận tin ghép thợ.',
    },
    validation: {
      addressDistrict: 'Địa chỉ cần có quận TP.HCM rõ ràng.',
      addressRequired: 'Nhập khu vực hoặc địa chỉ tổng quát.',
      descriptionRequired: 'Mô tả cần đủ rõ để Kael tóm tắt.',
      problemRequired: 'Chọn ít nhất một vấn đề cần xử lý.',
      serviceRequired: 'Chọn dịch vụ điện, nước hoặc vệ sinh.',
    },
  },
  en: {
    nav: {
      back: 'Back',
      locationFallback: appCopy.en.common.chooseArea,
    },
    header: {
      badge: 'PRICE CHECK',
      title: 'Price check',
    },
    trust: {
      describe: 'Describe',
      estimate: 'Estimate',
      confirm: 'Confirm',
      match: 'Find worker',
    },
    form: {
      address: 'Area',
      addressEntered: 'Entered',
      addressRequired: 'Required',
      addressPlaceholder: 'Example: District 7, HCMC',
      clarifyFallback: 'Kael will ask when needed.',
      clarifyMeta: 'If needed',
      clarifyTitle: 'Kael follow-up',
      description: 'Description',
      descriptionAccessibility: 'Problem description',
      descriptionPlaceholder: 'Describe signs, location, and when it happens...',
      problem: 'Problem',
      problemMeta: 'Choose',
      serviceFirst: 'Choose a service first.',
      unsupportedService: 'Electrical, plumbing, and cleaning only.',
    },
    media: {
      accessibilityAdd: 'Add photo or video',
      add: 'Add media',
      remove: 'Remove',
      removeImage: 'Remove image',
      removeVideo: 'Remove video',
      title: 'Photo / video',
      video: 'Video',
      optional: 'Optional',
    },
    questions: {
      electrical: [
        {
          id: 'scope',
          question: 'Is the electrical issue in one area or multiple areas?',
          options: [
            { value: 'single', label: 'One area' },
            { value: 'multiple', label: 'Multiple areas' },
            { value: UNKNOWN_OPTION_VALUE, label: appCopy.en.common.unknown },
          ],
        },
        {
          id: 'breaker',
          question: 'Does the breaker or switch look unusual?',
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
            { value: UNKNOWN_OPTION_VALUE, label: appCopy.en.common.unknown },
          ],
        },
      ],
      plumbing: [
        {
          id: 'scope',
          question: 'Is the leak or clog in one area or multiple areas?',
          options: [
            { value: 'single', label: 'One area' },
            { value: 'multiple', label: 'Multiple areas' },
            { value: UNKNOWN_OPTION_VALUE, label: appCopy.en.common.unknown },
          ],
        },
        {
          id: 'leak',
          question: 'Does water leak continuously or only during use?',
          options: [
            { value: 'continuous', label: 'Continuously' },
            { value: 'in_use', label: 'During use' },
            { value: UNKNOWN_OPTION_VALUE, label: appCopy.en.common.unknown },
          ],
        },
      ],
      cleaning: [
        {
          id: 'scope',
          question: 'Is the cleaning area one room or the whole home?',
          options: [
            { value: 'single_room', label: 'One room' },
            { value: 'whole_home', label: 'Whole home' },
            { value: UNKNOWN_OPTION_VALUE, label: appCopy.en.common.unknown },
          ],
        },
        {
          id: 'condition',
          question: 'How intensive is the cleaning need?',
          options: [
            { value: 'standard', label: 'Standard cleaning' },
            { value: 'deep', label: 'Deep cleaning' },
            { value: 'post_repair', label: 'After repair work' },
          ],
        },
      ],
    },
    clarification: {
      remaining: (count: number) => `${count} more answer${count === 1 ? '' : 's'} to view the estimate.`,
    },
    estimate: {
      default: {
        problemLabel: 'Kael reviews before dispatch',
        complexity: 'unknown',
        priceRangeLabel: 'Waiting for Kael estimate',
        confidenceLabel: 'Waiting for data',
        advisory: 'Add media/area for accuracy.',
      },
      fallback: {
        problemLabel: 'Not enough safe data yet',
        complexity: 'unknown',
        priceRangeLabel: 'More information needed',
        confidenceLabel: 'Needs clarification',
        advisory: 'Add media or answer follow-ups.',
      },
      kicker: 'ESTIMATE RANGE',
      complexity: 'Complexity',
      advisory: 'Guidance',
      priceDisclaimer: 'This is an initial estimate. The final price will be confirmed by the worker before work starts.',
      remoteConfidence: 'Kael estimate',
      systemConfirm: 'Waiting for system confirmation',
    },
    complexity: {
      large: 'Large',
      medium: 'Medium',
      small: 'Small',
      unknown: appCopy.en.common.unknown,
    },
    schedule: {
      title: 'Time',
      nowTitle: 'Now',
      nowText: 'Find the nearest worker',
    },
    confirm: {
      accessibilityNotification: 'Enable Kael updates',
      address: 'Address',
      confirmTitle: 'Confirm worker search',
      described: 'Described',
      notificationText: 'Receive worker-match updates.',
      platformFee: 'Platform fee',
      price: 'Estimate',
      problem: 'Problem',
      required: 'Required',
      service: 'Service',
      time: 'Time',
    },
    search: {
      title: 'Finding a suitable worker',
      text: 'Detailed address opens only after acceptance.',
      states: ['Searching', 'Trying another', 'No worker', 'Matched'],
    },
    emptyWorker: {
      title: 'No suitable worker yet',
      text: 'Retry or edit the request.',
    },
    matched: {
      title: 'Worker accepted',
      text: 'Track the status in Activity.',
    },
    actions: {
      back: 'Back',
      cancel: 'Cancel request',
      confirmSearch: 'Send request',
      continue: 'Continue',
      editRequest: 'Edit request',
      goHome: 'Go home',
      inspect: 'Let Kael check',
      keep: 'Keep',
      openHistory: 'View activity',
      retry: 'Retry',
      reset: 'Reset',
      reviewConfirm: 'Review confirmation',
      reviewEstimate: 'View estimate',
      schedule: 'Choose time',
      status: 'Status',
      talk: 'Chat',
    },
    alerts: {
      cancelBody: 'The request will close.',
      cancelBroadcastBody: 'Worker search will stop. Address stays hidden.',
      cancelTitle: 'Cancel request?',
      mediaPermission: 'Photo/video library permission is needed to add evidence.',
      mediaUpload: 'Unable to upload media. You can continue and add it later.',
      notificationGate: 'Enable worker-match updates.',
    },
    validation: {
      addressDistrict: 'The address needs a clear HCMC district.',
      addressRequired: 'Enter an area or general address.',
      descriptionRequired: 'Add enough detail for Kael to summarize the issue.',
      problemRequired: 'Choose at least one problem to handle.',
      serviceRequired: 'Choose electrical, plumbing, or cleaning service.',
    },
  },
} as const

type BookingCopy = (typeof bookingCopy)[AppLanguage]
type EstimateTemplate = {
  problemLabel: string
  complexity: PriceCheckEstimateCard['complexity']
  priceRangeLabel: string
  confidenceLabel: string
  advisory: string
}

function estimateTemplate(template: EstimateTemplate, source: PriceCheckEstimateCard['source'], copy: BookingCopy): PriceCheckEstimateCard {
  return {
    ...template,
    disclaimer: copy.estimate.priceDisclaimer,
    source,
  }
}

type PriceCheckUiState = {
  step: PriceCheckUiStep
  status: PriceCheckUiStatus
  draft: PriceCheckDraft
  manualErrorMessage: string | null
  notificationGateAccepted: boolean
}

type PriceCheckUiPatch = Partial<PriceCheckUiState> | ((current: PriceCheckUiState) => Partial<PriceCheckUiState>)

function priceCheckUiReducer(current: PriceCheckUiState, patch: PriceCheckUiPatch): PriceCheckUiState {
  const nextPatch = typeof patch === 'function' ? patch(current) : patch
  return { ...current, ...nextPatch }
}

function useClientPriceCheckController() {
  const { replace } = useRouter()
  const language = useAppLanguage()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { actions, dispatch, selectors, state: workflowState } = useFrontendWorkflow()
  const copy = bookingCopy[language]
  const frameWidth = Math.min(width, 430)
  const [{ step, status, draft, manualErrorMessage, notificationGateAccepted }, patchUiState] = useReducer(
    priceCheckUiReducer,
    null,
    (): PriceCheckUiState => ({
      step: initialStepFromWorkflow(selectors.currentStatus),
      status: 'editing',
      draft: draftFromWorkflow(workflowState.deal?.draft),
      manualErrorMessage: null,
      notificationGateAccepted: false,
    }),
  )
  const workflowDraftKey = useMemo(() => workflowDraftSyncKey(workflowState.deal), [workflowState.deal])
  const syncedWorkflowDraftKeyRef = useRef(workflowDraftKey)
  const skipNextWorkflowDraftSyncRef = useRef(false)
  const setStep = (nextStep: PriceCheckUiStep) => patchUiState({ step: nextStep })
  const setStatus = (nextStatus: PriceCheckUiStatus | ((current: PriceCheckUiStatus) => PriceCheckUiStatus)) => {
    patchUiState((current) => ({
      status: typeof nextStatus === 'function' ? nextStatus(current.status) : nextStatus,
    }))
  }
  const setDraft = (nextDraft: PriceCheckDraft) => patchUiState({ draft: nextDraft })
  const setManualErrorMessage = (nextMessage: string | null) => patchUiState({ manualErrorMessage: nextMessage })
  const questions = draft.serviceType ? copy.questions[draft.serviceType] : []
  const chips = useMemo(() => (draft.serviceType ? localizedProblemOptions(draft.serviceType, language) : []), [draft.serviceType, language])
  const answeredQuestions = questions.filter((question) => draft.clarificationAnswers[question.id]).length
  const clarificationComplete = answeredQuestions === questions.length
  const isEstimateFallback = status === 'baseline_fallback' || status === 'fallback' || workflowState.deal?.estimate?.fallbackUsed === true
  const estimate = workflowState.deal?.estimate
    ? {
        problemLabel: workflowState.deal.estimate.problemLabel,
        complexity: workflowState.deal.estimate.complexity,
        priceRangeLabel: workflowState.deal.estimate.priceRangeLabel,
        confidenceLabel: workflowState.deal.estimate.confidenceLabel,
        advisory: workflowState.deal.estimate.advisory,
        disclaimer: workflowState.deal.estimate.disclaimer,
        source: 'kael' as const,
      }
    : isEstimateFallback
      ? estimateTemplate(copy.estimate.fallback, 'baseline_fallback', copy)
      : estimateTemplate(copy.estimate.default, 'kael', copy)
  const displayEstimate = localizeEstimateForDisplay(estimate, draft, copy, language)
  const validationMessage = getDraftValidationMessage(draft, copy)
  const isDraftValid = validationMessage === null
  const canCancelFromSearching =
    step === 'searching' && selectors.customerSearchState === 'searching' && selectors.canCustomerCancelDeal

  useEffect(() => {
    if (selectors.customerSearchState === 'no_worker') {
      patchUiState((current) => ({
        step: 'emptyWorker',
        status: current.status === 'loading' ? 'fallback' : current.status,
      }))
    }
    if (selectors.customerSearchState === 'matched' || selectors.customerSearchState === 'active' || selectors.customerSearchState === 'completed') {
      patchUiState({ step: 'matched' })
    }
  }, [selectors.customerSearchState])

  useEffect(() => {
    if (selectors.currentStatus !== 'draft' || step !== 'emptyWorker') return
    patchUiState({
      draft: draftFromWorkflow(workflowState.deal?.draft),
      step: 'form',
      status: 'editing',
    })
  }, [selectors.currentStatus, step, workflowState.deal?.draft])

  useEffect(() => {
    if (syncedWorkflowDraftKeyRef.current === workflowDraftKey) return
    syncedWorkflowDraftKeyRef.current = workflowDraftKey

    if (skipNextWorkflowDraftSyncRef.current) {
      skipNextWorkflowDraftSyncRef.current = false
      return
    }

    patchUiState({
      draft: draftFromWorkflow(workflowState.deal?.draft),
      step: initialStepFromWorkflow(selectors.currentStatus),
      status: 'editing',
    })
  }, [selectors.currentStatus, workflowDraftKey, workflowState.deal?.draft])

  const commitDraft = (nextDraft: PriceCheckDraft) => {
    setDraft(nextDraft)
    setManualErrorMessage(null)
    skipNextWorkflowDraftSyncRef.current = true
    dispatch({ type: 'update_booking_draft', patch: draftToWorkflowPatch(nextDraft) })
  }

  const pickMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      setManualErrorMessage(copy.alerts.mediaPermission)
      setStatus('error')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.82,
      selectionLimit: 5,
      videoMaxDuration: 60,
    })

    if (result.canceled) return

    const nextItems: MediaDraftItem[] = result.assets.map((asset, index) => ({
      id: `${Date.now()}-${index}-${asset.assetId ?? asset.uri}`,
      uri: asset.uri,
      type: asset.type === 'video' ? 'video' : 'image',
      fileName: asset.fileName ?? asset.uri.split('/').pop(),
      mimeType: asset.mimeType ?? undefined,
      fileSizeBytes: asset.fileSize ?? undefined,
      durationMs: asset.duration ?? undefined,
    }))

    commitDraft({
      ...draft,
      mediaItems: [...draft.mediaItems, ...nextItems].slice(0, 5),
    })
    setManualErrorMessage(null)
    setStatus('editing')
  }

  const removeMedia = (id: string) => {
    commitDraft({
      ...draft,
      mediaItems: draft.mediaItems.filter((item) => item.id !== id),
    })
  }

  const continueFlow = async () => {
    if (step === 'form') {
      if (!isDraftValid) {
        setStatus('error')
        return
      }
      dispatch({ type: 'update_booking_draft', patch: draftToWorkflowPatch(draft) })
      setStep('clarification')
      setStatus('needs_clarification')
      return
    }
    if (step === 'clarification') {
      if (!isDraftValid) {
        setStep('form')
        setStatus('error')
        return
      }
      if (!clarificationComplete) return
      const unclear = Object.values(draft.clarificationAnswers).some((answer) => answer === UNKNOWN_OPTION_VALUE)
      const workflowDraft = draftToWorkflowDraft(draft)
      dispatch({ type: 'update_booking_draft', patch: draftToWorkflowPatch(draft) })
      setStatus('loading')
      const created = await actions.createRemoteJobFromDraft(workflowDraft, draft.mediaItems)
      if (!created) {
        setStatus('error')
        return
      }
      if (created.mediaError) setManualErrorMessage(copy.alerts.mediaUpload)
      setStep('estimate')
      setStatus(unclear ? 'baseline_fallback' : 'estimate_ready')
      return
    }
    if (step === 'estimate') {
      setStep('schedule')
      return
    }
    if (step === 'schedule') {
      setStep('confirm')
      return
    }
    if (step === 'confirm') {
      if (!notificationGateAccepted) {
        setManualErrorMessage(copy.alerts.notificationGate)
        setStatus('error')
        return
      }
      if (!selectors.canConfirmCustomerSearch) {
        setStatus('error')
        return
      }
      setStatus('loading')
      const confirmed = await actions.confirmRemoteSearch()
      if (!confirmed) {
        setStatus('error')
        return
      }
      setStep('searching')
      setStatus('loading')
      return
    }
    if (step === 'searching') {
      if (selectors.customerSearchState === 'no_worker') {
        setStep('emptyWorker')
        setStatus('fallback')
        return
      }
      if (selectors.customerSearchState === 'matched' || selectors.customerSearchState === 'active' || selectors.customerSearchState === 'completed') {
        setStep('matched')
        return
      }
      return
    }
    if (step === 'matched') {
      replace(openHistoryPath)
      return
    }
    if (step === 'emptyWorker') {
      const retried = await actions.confirmRemoteSearch()
      if (!retried) {
        setStatus('error')
        return
      }
      setStep('searching')
      setStatus('loading')
    }
  }

  const goBack = () => {
    if (step === 'form') return
    if (step === 'clarification') setStep('form')
    if (step === 'estimate') setStep('clarification')
    if (step === 'schedule') setStep('estimate')
    if (step === 'confirm') setStep('schedule')
    if (step === 'searching' || step === 'matched') replace(openHomePath)
  }

  const editAfterNoWorker = () => {
    setStatus('loading')
    void actions.cancelRemoteJob().then((cancelled) => {
      if (!cancelled) {
        setStatus('error')
        return
      }
      dispatch({ type: 'reopen_booking_draft' })
      setStep('form')
      setStatus('editing')
    })
  }

  const confirmCancelCurrentSearch = () => {
    if (!canCancelFromSearching) {
      goBack()
      return
    }

    Alert.alert(
      copy.alerts.cancelTitle,
      selectors.hasLocalBroadcast
        ? copy.alerts.cancelBroadcastBody
        : copy.alerts.cancelBody,
      [
        { text: copy.actions.keep, style: 'cancel' },
        {
          text: copy.actions.cancel,
          style: 'destructive',
          onPress: () => {
            void actions.cancelRemoteJob().then((cancelled) => {
              if (!cancelled) {
                setStatus('error')
                return
              }
              setStatus('fallback')
              replace(openHistoryPath)
            })
          },
        },
      ],
    )
  }

  const secondaryAction = () => {
    if (step === 'form') {
      setDraft(EMPTY_DRAFT)
      dispatch({ type: 'reset_workflow' })
      return
    }
    if (step === 'emptyWorker') {
      editAfterNoWorker()
      return
    }
    if (canCancelFromSearching) {
      confirmCancelCurrentSearch()
      return
    }
    goBack()
  }

  let currentStepContent: ReactNode = null
  switch (step) {
    case 'form':
      currentStepContent = (
        <BookingFormSurface
          chips={chips}
          copy={copy}
          draft={draft}
          language={language}
          previewQuestions={questions}
          unsupportedServiceLabel={workflowState.deal?.draft.unsupportedServiceLabel ?? null}
          validationMessage={status === 'error' ? manualErrorMessage ?? validationMessage : null}
          onAddressChange={(addressLabel) => commitDraft({ ...draft, addressLabel })}
          onDescriptionChange={(description) => commitDraft({ ...draft, description })}
          onPickMedia={pickMedia}
          onRemoveMedia={removeMedia}
          onSelectService={(serviceType) =>
            commitDraft({ ...draft, serviceType, clarificationAnswers: {}, problemChips: [] })
          }
          onToggleChip={(chip) =>
            commitDraft({
              ...draft,
              problemChips: draft.problemChips.includes(chip)
                ? draft.problemChips.filter((item) => item !== chip)
                : [...draft.problemChips, chip].slice(0, 3),
            })
          }
        />
      )
      break
    case 'clarification':
      currentStepContent = <ClarificationPanel copy={copy} draft={draft} questions={questions} onAnswer={(questionId, answer) => commitDraft({ ...draft, clarificationAnswers: { ...draft.clarificationAnswers, [questionId]: answer } })} />
      break
    case 'estimate':
      currentStepContent = <><TrustRail active="estimate" copy={copy} /><EstimatePanel copy={copy} estimate={displayEstimate} isFallback={isEstimateFallback} /></>
      break
    case 'schedule':
      currentStepContent = <SchedulePanel copy={copy} draft={draft} onSelect={() => commitDraft({ ...draft, timeChoice: 'now' })} />
      break
    case 'confirm':
      currentStepContent = (
        <ConfirmPanel
          copy={copy}
          draft={draft}
          estimate={displayEstimate}
          language={language}
          notificationGateAccepted={notificationGateAccepted}
          onToggleNotificationGate={() => patchUiState({ notificationGateAccepted: !notificationGateAccepted, manualErrorMessage: null })}
        />
      )
      break
    case 'searching':
      currentStepContent = selectors.customerSearchState === 'no_worker' ? <EmptyWorkerPanel copy={copy} /> : selectors.customerSearchState === 'matched' || selectors.customerSearchState === 'active' || selectors.customerSearchState === 'completed' ? <WorkerMatchedPanel copy={copy} language={language} status={selectors.currentStatus} /> : <SearchingWorkerPanel copy={copy} />
      break
    case 'emptyWorker':
      currentStepContent = <EmptyWorkerPanel copy={copy} />
      break
    case 'matched':
      currentStepContent = <WorkerMatchedPanel copy={copy} language={language} status={selectors.currentStatus} />
      break
  }

  return {
    canCancelFromSearching,
    clarificationComplete,
    continueFlow,
    copy,
    currentStepContent,
    draft,
    frameWidth,
    insets,
    replace,
    secondaryAction,
    status,
    step,
  }
}

export function ClientPriceCheckFlow() {
  const customerThemeMode = useCustomerThemeMode()
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  currentBookingThemeMode = customerThemeMode === 'dark' ? 'dark' : 'light'
  const {
    canCancelFromSearching,
    clarificationComplete,
    continueFlow,
    copy,
    currentStepContent,
    draft,
    frameWidth,
    insets,
    replace,
    secondaryAction,
    status,
    step,
  } = useClientPriceCheckController()

  return (
    <View style={styles.root} testID="production-price-check-flow">
      <View style={styles.hiddenMarker} testID="booking-layer-semantic-switch" />
      {reduceTransparency ? null : <BookingBackdrop />}
      {reduceMotion || reduceTransparency ? null : <BookingAmbientGlassField />}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            alignSelf: 'center',
            maxWidth: 430,
            paddingBottom: Math.max(insets.bottom + 220, 220),
            paddingTop: insets.top + 36,
            width: Math.max(0, frameWidth - bookingFrameHorizontalPadding * 2),
          },
        ]}
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.bookingTopRow}>
          <Pressable accessibilityLabel={copy.nav.back} accessibilityRole="button" onPress={() => replace(openHomePath)} style={[styles.bookingMiniButton, reduceTransparency ? styles.bookingOpaqueControl : null]}>
            <ChevronGlyph />
          </Pressable>
          <View style={[styles.bookingLocationPill, reduceTransparency ? styles.bookingOpaqueControl : null]}>
            <ElectricalGlyph />
            <Text style={styles.bookingLocationText} numberOfLines={1}>{draft.addressLabel || copy.nav.locationFallback}</Text>
          </View>
        </View>
        <ReduceMotionAwareEntranceView delayMs={60} distanceY={18} testID="customer-booking-sheet-motion">
          <View style={[styles.bookingSheet, reduceTransparency ? styles.bookingOpaqueSheet : null]}>
            <SubtleGlassHighlight />
            <View style={styles.sheetHandle} />
            <BookingHeader copy={copy} />
            <View testID="booking-current-step-only">{currentStepContent}</View>
            <SheetActions
              disabled={step === 'clarification' && !clarificationComplete}
              onPrimary={continueFlow}
              onSecondary={secondaryAction}
              primaryLabel={primaryLabel(step, status, copy)}
              progress={progressForStep(step, status)}
              secondaryLabel={secondaryLabelForStep(step, canCancelFromSearching, copy)}
              secondaryTestID={canCancelFromSearching ? 'customer-booking-cancel-local-deal' : undefined}
            />
          </View>
        </ReduceMotionAwareEntranceView>
      </ScrollView>
      <CustomerV4DockOverlay active="booking" />
    </View>
  )
}

function BookingHeader({ copy }: { copy: BookingCopy }) {
  const { reduceTransparency } = useGlassAccessibility()

  return (
    <View style={styles.bookingTitle}>
      <View>
        <Text style={styles.flowBadge} numberOfLines={1}>
          {copy.header.badge}
        </Text>
        <Text style={styles.pageTitle} numberOfLines={1}>
          {copy.header.title}
        </Text>
      </View>
      <View style={[styles.kaelHeaderMascot, reduceTransparency ? styles.bookingOpaqueControl : null]}>
        <SubtleGlassHighlight />
        <Image contentFit="contain" source={kaelModel8A} style={styles.kaelHeaderImage} />
      </View>
    </View>
  )
}

function BookingBackdrop() {
  const glowStyle = {
    opacity: 0.28,
    transform: [{ translateX: -75 }, { scale: 1 }],
  }
  const pinStyle = {
    transform: [{ translateX: -9 }, { scale: 1 }],
  }

  return (
    <View pointerEvents="none" style={styles.bookingBackdrop}>
      <View style={[styles.backdropGlow, glowStyle]} />
      <View style={[styles.backdropLine, styles.backdropLineOne]} />
      <View style={[styles.backdropLine, styles.backdropLineTwo]} />
      <View style={[styles.backdropRoom, styles.backdropRoomOne]} />
      <View style={[styles.backdropRoom, styles.backdropRoomTwo]} />
      <View style={[styles.backdropPin, pinStyle]} />
    </View>
  )
}

function BookingAmbientGlassField() {
  const lineStyle = {
    opacity: 0.12,
    transform: [{ rotate: '-12deg' }],
  }

  return (
    <View pointerEvents="none" style={styles.bookingAmbientField} testID="booking-section-glass-field">
      <View style={styles.bookingAmbientMintWash} />
      <View style={styles.bookingAmbientWarmWash} />
      <View style={[styles.bookingAmbientLine, lineStyle]} />
    </View>
  )
}

function SubtleGlassHighlight() {
  const { reduceTransparency } = useGlassAccessibility()
  if (reduceTransparency) return null
  return <View pointerEvents="none" style={styles.glassTopHighlight} />
}

function ChevronGlyph() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="m14.5 6.5-5 5.5 5 5.5" stroke={tokens.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function TrustRail({ active, copy }: { active: 'describe' | 'estimate' | 'confirm' | 'match'; copy: BookingCopy }) {
  const steps = [
    ['describe', copy.trust.describe],
    ['estimate', copy.trust.estimate],
    ['confirm', copy.trust.confirm],
    ['match', copy.trust.match],
  ] as const
  const activeIndex = Math.max(steps.findIndex(([key]) => key === active), 0)
  return (
    <View style={styles.trustRail}>
      <SubtleGlassHighlight />
      {steps.map(([key, label], index) => {
        const isActive = index === activeIndex
        const isDone = index < activeIndex
        return (
          <View key={key} style={styles.trustStep}>
            <View style={[styles.trustDot, isActive || isDone ? styles.trustDotActive : null]} />
            <Text style={[styles.trustLabel, isActive || isDone ? styles.trustLabelActive : null]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

function BookingFormSurface({
  chips,
  copy,
  draft,
  language,
  previewQuestions,
  unsupportedServiceLabel,
  validationMessage,
  onAddressChange,
  onDescriptionChange,
  onPickMedia,
  onRemoveMedia,
  onSelectService,
  onToggleChip,
}: {
  chips: ReadonlyArray<{ label: string; value: string }>
  copy: BookingCopy
  draft: PriceCheckDraft
  language: AppLanguage
  previewQuestions: readonly ClarificationQuestion[]
  unsupportedServiceLabel: string | null
  validationMessage: string | null
  onAddressChange: (addressLabel: string) => void
  onDescriptionChange: (description: string) => void
  onPickMedia: () => void
  onRemoveMedia: (id: string) => void
  onSelectService: (serviceType: ServiceType) => void
  onToggleChip: (chip: string) => void
}) {
  return (
    <View style={styles.formStack} testID="booking-form-first-shell">
      <View style={styles.segmented}>
        <Segment label={localizedServiceLabel('electrical', language)} active={draft.serviceType === 'electrical'} onPress={() => onSelectService('electrical')} />
        <Segment label={localizedServiceLabel('plumbing', language)} active={draft.serviceType === 'plumbing'} onPress={() => onSelectService('plumbing')} />
        <Segment label={localizedServiceLabel('cleaning', language)} active={draft.serviceType === 'cleaning'} onPress={() => onSelectService('cleaning')} />
      </View>
      {unsupportedServiceLabel ? <Text style={styles.validationText}>{copy.form.unsupportedService}</Text> : null}
      <SoftField title={copy.form.problem} meta={copy.form.problemMeta}>
        <View style={styles.pillRow}>
          {chips.length > 0 ? (
            chips.slice(0, 6).map((chip) => (
              <Chip key={chip.value} active={draft.problemChips.includes(chip.value)} label={chip.label} onPress={() => onToggleChip(chip.value)} />
            ))
          ) : (
            <Text style={styles.panelText}>{copy.form.serviceFirst}</Text>
          )}
        </View>
      </SoftField>
      <SoftField title={copy.form.description} meta={`${draft.description.trim().length}/160`}>
        <TextInput
          accessibilityLabel={copy.form.descriptionAccessibility}
          multiline
          maxLength={160}
          onChangeText={onDescriptionChange}
          placeholder={copy.form.descriptionPlaceholder}
          placeholderTextColor={tokens.subtle}
          style={styles.descriptionInput}
          textAlignVertical="top"
          value={draft.description}
          testID="booking-form-field-focus"
        />
      </SoftField>
      <SoftField title={copy.form.address} meta={draft.addressLabel.trim() ? copy.form.addressEntered : copy.form.addressRequired}>
        <TextInput
          accessibilityLabel={copy.form.address}
          maxLength={96}
          onChangeText={onAddressChange}
          placeholder={copy.form.addressPlaceholder}
          placeholderTextColor={tokens.subtle}
          style={styles.singleLineInput}
          value={draft.addressLabel}
          testID="booking-address-field"
        />
      </SoftField>
      {validationMessage ? <Text style={styles.validationText}>{validationMessage}</Text> : null}
      <EvidenceDraftSlots copy={copy} mediaItems={draft.mediaItems} onPickMedia={onPickMedia} onRemoveMedia={onRemoveMedia} />
      <View style={styles.clarifyCard}>
        <View style={styles.cardMetaRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {copy.form.clarifyTitle}
          </Text>
          <Text style={styles.statusText} numberOfLines={1}>
            {copy.form.clarifyMeta}
          </Text>
        </View>
        {(previewQuestions.length > 0 ? previewQuestions : [{ id: 'service', question: copy.form.clarifyFallback, options: [] }]).map((question) => (
          <Text key={question.id} style={styles.clarifyItem} numberOfLines={2}>
            {question.question}
          </Text>
        ))}
      </View>
    </View>
  )
}

function ClarificationPanel({ copy, draft, questions, onAnswer }: { copy: BookingCopy; draft: PriceCheckDraft; questions: readonly ClarificationQuestion[]; onAnswer: (questionId: string, answer: string) => void }) {
  const answeredQuestions = questions.filter((question) => draft.clarificationAnswers[question.id]).length
  const remainingQuestions = questions.length - answeredQuestions

  return (
    <View style={styles.formStack}>
      {questions.map((question, index) => (
        <View key={question.id} style={styles.flowCard}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {index + 1}. {question.question}
          </Text>
          <View style={styles.pillRow}>
            {question.options.map((option) => (
              <Chip key={option.value} active={draft.clarificationAnswers[question.id] === option.value} label={option.label} onPress={() => onAnswer(question.id, option.value)} />
            ))}
          </View>
        </View>
      ))}
      {remainingQuestions > 0 ? (
        <Text style={styles.validationText} testID="booking-clarification-required">
          {copy.clarification.remaining(remainingQuestions)}
        </Text>
      ) : null}
    </View>
  )
}

function EstimatePanel({ copy, estimate, isFallback }: { copy: BookingCopy; estimate: PriceCheckEstimateCard; isFallback: boolean }) {
  return (
    <View style={[styles.estimateCard, isFallback ? styles.warningCard : null]}>
      <SubtleGlassHighlight />
      <View style={styles.cardMetaRow}>
        <Text style={styles.kicker} numberOfLines={1}>
          {copy.estimate.kicker}
        </Text>
        <Text style={styles.statusText} numberOfLines={1}>
          {estimate.confidenceLabel}
        </Text>
      </View>
      <View style={styles.priceRange}>
        <Text style={styles.priceValue} numberOfLines={2}>
          {estimate.priceRangeLabel}
        </Text>
        <Text style={styles.priceMeta} numberOfLines={2}>
          {complexityLabel(estimate.complexity, copy)} · {estimate.problemLabel}
        </Text>
      </View>
      <View style={styles.summaryGrid}>
        <SummaryCell label={copy.estimate.complexity} value={complexityLabel(estimate.complexity, copy)} />
        <SummaryCell label={copy.estimate.advisory} value={estimate.advisory} />
      </View>
      <Text selectable style={styles.disclaimerText}>
        {estimate.disclaimer}
      </Text>
    </View>
  )
}

function SchedulePanel({ copy, draft, onSelect }: { copy: BookingCopy; draft: PriceCheckDraft; onSelect: (choice: PriceCheckDraft['timeChoice']) => void }) {
  return (
    <View style={styles.flowCard}>
      <Text style={styles.cardTitle}>{copy.schedule.title}</Text>
      <View style={styles.twoCol}>
        <ChoiceCard active={draft.timeChoice === 'now'} title={copy.schedule.nowTitle} text={copy.schedule.nowText} onPress={() => onSelect('now')} />
      </View>
    </View>
  )
}

function ConfirmPanel({
  copy,
  draft,
  estimate,
  language,
  notificationGateAccepted,
  onToggleNotificationGate,
}: {
  copy: BookingCopy
  draft: PriceCheckDraft
  estimate: PriceCheckEstimateCard
  language: AppLanguage
  notificationGateAccepted: boolean
  onToggleNotificationGate: () => void
}) {
  return (
    <View style={styles.flowCard}>
      <View style={styles.cardMetaRow}>
        <Text style={styles.cardTitle}>{copy.confirm.confirmTitle}</Text>
        <Text style={styles.statusText}>{copy.confirm.required}</Text>
      </View>
      <View style={styles.summaryGrid}>
        <SummaryCell label={copy.confirm.service} value={localizedServiceLabel(draft.serviceType, language)} />
        <SummaryCell label={copy.confirm.problem} value={draft.problemChips[0] ? localizedProblemLabel(draft.problemChips[0], draft.serviceType, language) : copy.confirm.described} />
        <SummaryCell label={copy.confirm.address} value={draft.addressLabel} />
        <SummaryCell label={copy.confirm.time} value={copy.schedule.nowTitle} />
        <SummaryCell label={copy.confirm.price} value={estimate.priceRangeLabel} />
        <SummaryCell label={copy.confirm.platformFee} value={copy.estimate.systemConfirm} />
      </View>
      <Pressable
        accessibilityLabel={copy.confirm.accessibilityNotification}
        accessibilityRole="switch"
        accessibilityState={{ checked: notificationGateAccepted }}
        onPress={onToggleNotificationGate}
        style={[styles.notificationGate, notificationGateAccepted ? styles.notificationGateActive : null]}
        testID="customer-notification-permission-gate"
      >
        <View style={[styles.notificationGateDot, notificationGateAccepted ? styles.notificationGateDotActive : null]} />
        <Text style={styles.notificationGateText}>
          {copy.confirm.notificationText}
        </Text>
      </Pressable>
      <Text selectable style={styles.disclaimerText}>
        {copy.estimate.priceDisclaimer}
      </Text>
    </View>
  )
}

function SearchingWorkerPanel({ copy }: { copy: BookingCopy }) {
  return (
    <View accessibilityLabel={copy.search.title} style={styles.loadingCard}>
      <ActivityIndicator color={tokens.primary} />
      <Text style={styles.loadingTitle}>{copy.search.title}</Text>
      <Text style={styles.loadingText}>{copy.search.text}</Text>
      <View style={styles.stateGrid}>
        {copy.search.states.map((state, index) => (
          <View key={state} style={styles.stateItem}>
            <View style={[styles.stateDot, index === 0 ? styles.stateDotActive : null]} />
            <Text style={styles.stateText} numberOfLines={1}>
              {state}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function EmptyWorkerPanel({ copy }: { copy: BookingCopy }) {
  return (
    <View accessibilityLabel={copy.emptyWorker.title} style={styles.warningCard} testID="customer-no-fake-worker-data">
      <Text style={styles.cardTitle}>{copy.emptyWorker.title}</Text>
      <Text style={styles.panelText}>{copy.emptyWorker.text}</Text>
    </View>
  )
}

function WorkerMatchedPanel({ copy, language, status }: { copy: BookingCopy; language: AppLanguage; status: LocalDealStatus | null }) {
  return (
    <View style={styles.flowCard} testID="customer-no-fake-worker-data">
      <Text style={styles.cardTitle}>{copy.matched.title}</Text>
      <View style={styles.workerRow}>
        <View style={styles.workerAvatar}><DocumentGlyph /></View>
        <View style={styles.workerCopy}>
          <Text style={styles.workerName}>{localizedStatusLabel(status, language)}</Text>
          <Text style={styles.panelText}>{copy.matched.text}</Text>
        </View>
      </View>
    </View>
  )
}

function EvidenceDraftSlots({ copy, mediaItems, onPickMedia, onRemoveMedia }: { copy: BookingCopy; mediaItems: MediaDraftItem[]; onPickMedia: () => void; onRemoveMedia: (id: string) => void }) {
  return (
    <SoftField title={copy.media.title} meta={mediaItems.length > 0 ? `${mediaItems.length}/5` : copy.media.optional} testID="client-media-local-only">
      <View style={styles.mediaGrid}>
        {mediaItems.map((item) => (
          <Pressable
            accessibilityLabel={`${item.type === 'image' ? copy.media.removeImage : copy.media.removeVideo}${item.fileName ? ` ${item.fileName}` : ''}`}
            key={item.id}
            accessibilityRole="button"
            onPress={() => onRemoveMedia(item.id)}
            style={styles.mediaTile}
          >
            {item.type === 'image' ? <Image source={{ uri: item.uri }} style={styles.mediaPreview} contentFit="cover" /> : <Text style={styles.mediaText}>{copy.media.video}</Text>}
            <Text style={styles.mediaText} numberOfLines={1}>
              {copy.media.remove}
            </Text>
          </Pressable>
        ))}
        {mediaItems.length < 5 ? (
          <Pressable accessibilityLabel={copy.media.accessibilityAdd} accessibilityRole="button" onPress={onPickMedia} style={styles.mediaTile}>
            <CameraGlyph />
            <Text style={styles.mediaText} numberOfLines={2}>
              {copy.media.add}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </SoftField>
  )
}

function SheetActions({
  disabled = false,
  onPrimary,
  onSecondary,
  primaryLabel,
  progress,
  secondaryLabel,
  secondaryTestID,
}: {
  disabled?: boolean
  onPrimary: () => void
  onSecondary: () => void
  primaryLabel: string
  progress: number
  secondaryLabel: string
  secondaryTestID?: string
}) {
  const { reduceTransparency } = useGlassAccessibility()

  return (
    <View style={[styles.sheetActions, reduceTransparency ? styles.bookingOpaqueControl : null]}>
      <SubtleGlassHighlight />
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
      <View style={styles.actionRow}>
        <GlassPressable
          accessibilityLabel={secondaryLabel}
          accessibilityRole="button"
          mode={currentBookingThemeMode}
          onPress={onSecondary}
          style={styles.secondaryButton}
          testID={secondaryTestID}
          variant="control"
        >
          <Text adjustsFontSizeToFit minimumFontScale={0.84} style={styles.secondaryButtonText} numberOfLines={1}>{secondaryLabel}</Text>
        </GlassPressable>
        <GlassPressable
          accessibilityLabel={primaryLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          active
          disabled={disabled}
          mode={currentBookingThemeMode}
          onPress={onPrimary}
          style={[styles.primaryButton, disabled ? styles.primaryButtonDisabled : null]}
          variant="control"
        >
          <Text adjustsFontSizeToFit minimumFontScale={0.84} style={[styles.primaryButtonText, disabled ? styles.primaryButtonDisabledText : null]} numberOfLines={1}>{primaryLabel}</Text>
        </GlassPressable>
      </View>
    </View>
  )
}

function SoftField({ children, meta, testID, title }: { children: ReactNode; meta?: string; testID?: string; title: string }) {
  return (
    <View style={styles.softField} testID={testID}>
      <View style={styles.cardMetaRow}>
        <Text style={styles.fieldTitle}>{title}</Text>
        {meta ? <Text style={styles.statusText}>{meta}</Text> : null}
      </View>
      {children}
    </View>
  )
}

function Segment({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <GlassPressable
      accessibilityLabel={label}
      accessibilityRole="tab"
      active={active}
      mode={currentBookingThemeMode}
      onPress={onPress}
      style={[styles.segment, active ? styles.segmentActive : null]}
      variant="control"
    >
      <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={[styles.segmentText, active ? styles.segmentTextActive : null]}>
        {label}
      </Text>
    </GlassPressable>
  )
}

function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <GlassPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      active={active}
      mode={currentBookingThemeMode}
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : null]}
      variant="control"
    >
      <Text adjustsFontSizeToFit minimumFontScale={0.84} style={[styles.chipText, active ? styles.chipTextActive : null]} numberOfLines={1}>{label}</Text>
    </GlassPressable>
  )
}

function ChoiceCard({ active, disabled = false, onPress, text, title }: { active: boolean; disabled?: boolean; onPress: () => void; text: string; title: string }) {
  return (
    <GlassPressable
      accessibilityLabel={`${title}. ${text}`}
      accessibilityRole="button"
      active={active}
      disabled={disabled}
      mode={currentBookingThemeMode}
      onPress={onPress}
      style={[styles.choiceCard, active ? styles.choiceCardActive : null, disabled ? styles.disabledChoiceCard : null]}
      variant="subtle"
    >
      <Text style={[styles.choiceTitle, active ? styles.choiceTextActive : null]}>{title}</Text>
      <Text style={[styles.choiceText, active ? styles.choiceTextActive : null]}>{text}</Text>
    </GlassPressable>
  )
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={2}>{value}</Text>
    </View>
  )
}

function initialStepFromWorkflow(status: LocalDealStatus | null): PriceCheckUiStep {
  if (status === 'awaiting_customer_confirm') return 'confirm'
  if (status === 'broadcasting') return 'searching'
  if (status === 'worker_matched' || status === 'worker_on_way' || status === 'arrived' || status === 'inspecting' || status === 'repairing' || status === 'completed_by_worker' || status === 'confirmed_by_customer') {
    return 'matched'
  }
  return 'form'
}

function draftFromWorkflow(draft?: LocalDealDraft): PriceCheckDraft {
  if (!draft) return EMPTY_DRAFT
  return {
    serviceType: draft.serviceType,
    problemChips: draft.problemChips,
    description: draft.description,
    mediaItems: [],
    addressLabel: draft.addressLabel,
    clarificationAnswers: {},
    timeChoice: 'now',
  }
}

function draftToWorkflowPatch(draft: PriceCheckDraft) {
  return {
    serviceType: draft.serviceType,
    problemChips: draft.problemChips,
    description: draft.description,
    addressLabel: draft.addressLabel,
    mediaCount: draft.mediaItems.length,
  }
}

function draftToWorkflowDraft(draft: PriceCheckDraft): LocalDealDraft {
  const districtLabel = extractDistrictLabel(draft.addressLabel)
  return {
    serviceType: draft.serviceType,
    problemChips: draft.problemChips,
    description: draft.description,
    mediaCount: draft.mediaItems.length,
    addressLabel: draft.addressLabel,
    districtLabel,
    timeChoice: 'now',
    source: 'booking',
    needsServiceChoice: draft.serviceType === null,
    inferredProblemLabel: draft.problemChips[0] ?? null,
    unsupportedServiceLabel: null,
  }
}

function workflowDraftSyncKey(deal: { draft: LocalDealDraft } | null) {
  if (!deal) return 'none'
  return [
    deal.draft.source,
    deal.draft.serviceType ?? 'none',
    deal.draft.problemChips.join('|'),
    deal.draft.description,
    deal.draft.addressLabel,
    deal.draft.mediaCount,
  ].join('::')
}

function localizeEstimateForDisplay(estimate: PriceCheckEstimateCard, draft: PriceCheckDraft, copy: BookingCopy, language: AppLanguage): PriceCheckEstimateCard {
  const fallback = estimate.source === 'baseline_fallback'
  const template = fallback ? copy.estimate.fallback : copy.estimate.default
  const selectedProblemLabel = draft.problemChips[0]
    ? localizedProblemLabel(draft.problemChips[0], draft.serviceType, language)
    : null
  const knownPlaceholderPrice = estimate.priceRangeLabel === bookingCopy.vi.estimate.default.priceRangeLabel
    || estimate.priceRangeLabel === bookingCopy.vi.estimate.fallback.priceRangeLabel
    || estimate.priceRangeLabel === bookingCopy.en.estimate.default.priceRangeLabel
    || estimate.priceRangeLabel === bookingCopy.en.estimate.fallback.priceRangeLabel
  const knownConfidence = estimate.confidenceLabel === bookingCopy.vi.estimate.default.confidenceLabel
    || estimate.confidenceLabel === bookingCopy.vi.estimate.fallback.confidenceLabel
    || estimate.confidenceLabel === bookingCopy.vi.estimate.remoteConfidence
    || estimate.confidenceLabel === bookingCopy.en.estimate.default.confidenceLabel
    || estimate.confidenceLabel === bookingCopy.en.estimate.fallback.confidenceLabel
    || estimate.confidenceLabel === bookingCopy.en.estimate.remoteConfidence
  const advisoryLooksForeign = language === 'en'
    || estimate.advisory === bookingCopy.vi.estimate.default.advisory
    || estimate.advisory === bookingCopy.vi.estimate.fallback.advisory
    || (language === 'vi' && !/[^\x00-\x7F]/.test(estimate.advisory))

  return {
    ...estimate,
    advisory: advisoryLooksForeign ? template.advisory : estimate.advisory,
    confidenceLabel: knownConfidence
      ? estimate.source === 'kael' && workflowPriceLooksReady(estimate.priceRangeLabel)
        ? copy.estimate.remoteConfidence
        : template.confidenceLabel
      : estimate.confidenceLabel,
    disclaimer: copy.estimate.priceDisclaimer,
    priceRangeLabel: knownPlaceholderPrice ? template.priceRangeLabel : estimate.priceRangeLabel,
    problemLabel: selectedProblemLabel ?? template.problemLabel,
  }
}

function workflowPriceLooksReady(priceRangeLabel: string) {
  return /\d/.test(priceRangeLabel)
}

function primaryLabel(step: PriceCheckUiStep, status: PriceCheckUiStatus, copy: BookingCopy) {
  if (step === 'form') return copy.actions.inspect
  if (step === 'clarification') return copy.actions.reviewEstimate
  if (step === 'estimate') return copy.actions.schedule
  if (step === 'schedule') return copy.actions.reviewConfirm
  if (step === 'confirm') return copy.actions.confirmSearch
  if (step === 'searching') return copy.actions.status
  if (step === 'emptyWorker') return copy.actions.retry
  if (step === 'matched') return copy.actions.openHistory
  return status === 'estimate_ready' ? copy.actions.talk : copy.actions.continue
}

function secondaryLabelForStep(step: PriceCheckUiStep, canCancelFromSearching: boolean, copy: BookingCopy) {
  if (step === 'form') return copy.actions.reset
  if (step === 'emptyWorker') return copy.actions.editRequest
  if (canCancelFromSearching) return copy.actions.cancel
  if (step === 'searching' || step === 'matched') return copy.actions.goHome
  return copy.actions.back
}

function progressForStep(step: PriceCheckUiStep, status: PriceCheckUiStatus) {
  if (step === 'form') return 34
  if (step === 'clarification') return 72
  if (step === 'estimate') return status === 'baseline_fallback' ? 78 : 82
  if (step === 'schedule') return 88
  if (step === 'confirm') return 94
  return 100
}

function getDraftValidationMessage(draft: PriceCheckDraft, copy: BookingCopy) {
  if (!draft.serviceType) return copy.validation.serviceRequired
  if (draft.problemChips.length === 0) return copy.validation.problemRequired
  if (draft.description.trim().length < 12) return copy.validation.descriptionRequired
  if (draft.addressLabel.trim().length < 4) return copy.validation.addressRequired
  if (!extractKnownDistrictLabel(draft.addressLabel)) return copy.validation.addressDistrict
  return null
}

function complexityLabel(complexity: PriceCheckEstimateCard['complexity'], copy: BookingCopy) {
  return copy.complexity[complexity]
}

function ElectricalGlyph() {
  return (
    <Svg width={30} height={30} viewBox="0 0 30 30" fill="none">
      <Rect x={8} y={6} width={14} height={18} rx={4} stroke={tokens.primary} strokeWidth={1.9} />
      <Path d="M13 12h5M13 16h5" stroke={tokens.primaryDark} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="m16 9-3 7h3l-2 5 5-8h-3l2-4Z" fill={tokens.copper} opacity={0.9} />
    </Svg>
  )
}

function PlumbingGlyph() {
  return (
    <Svg width={30} height={30} viewBox="0 0 30 30" fill="none">
      <Path d="M7 12h11c3 0 5 2 5 5v4" stroke={tokens.primary} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M6 23c3.4-2.1 6.4 2.1 10 0 2.2-1.3 4.4-1.3 7 0" stroke={theme.aqua} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  )
}

function DocumentGlyph() {
  return (
    <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
      <Rect x={7} y={5.5} width={11} height={14} rx={3} stroke={tokens.primary} strokeWidth={1.8} />
      <Path d="M10 10h5M10 14h3.5" stroke={tokens.copper} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  )
}

function CameraGlyph() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M7 8.2 8.4 6h7.2L17 8.2h1.3c.9 0 1.7.8 1.7 1.7v6.4c0 .9-.8 1.7-1.7 1.7H5.7c-.9 0-1.7-.8-1.7-1.7V9.9c0-.9.8-1.7 1.7-1.7H7Z" stroke={tokens.primary} strokeWidth={1.8} />
      <Circle cx={12} cy={13} r={2.6} stroke={tokens.copper} strokeWidth={1.8} />
    </Svg>
  )
}

const lightStyles = StyleSheet.create({
  root: {
    backgroundColor: tokens.canvas,
    flex: 1,
    experimental_backgroundImage:
      'radial-gradient(circle at 50% 12%, rgba(142,231,217,0.42), transparent 30%), radial-gradient(circle at 88% 18%, rgba(255,184,102,0.14), transparent 22%), radial-gradient(circle at 8% 82%, rgba(183,246,231,0.24), transparent 26%), linear-gradient(180deg, #f2fbf7 0%, #fff9ee 100%)',
  },
  hiddenMarker: {
    height: 0,
    width: 0,
  },
  scrollContent: {
    gap: 12,
    paddingHorizontal: bookingFrameHorizontalPadding,
  },
  bookingBackdrop: {
    bottom: 0,
    left: 0,
    opacity: 0.62,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  bookingAmbientField: {
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 0,
  },
  bookingAmbientMintWash: {
    backgroundColor: theme.aqua,
    borderRadius: 34,
    height: 188,
    opacity: 0.15,
    position: 'absolute',
    right: -92,
    top: 214,
    transform: [{ rotate: '-8deg' }],
    width: 216,
  },
  bookingAmbientWarmWash: {
    backgroundColor: tokens.copper,
    borderRadius: 30,
    bottom: 155,
    height: 124,
    left: -72,
    opacity: 0.08,
    position: 'absolute',
    transform: [{ rotate: '12deg' }],
    width: 176,
  },
  bookingAmbientLine: {
    backgroundColor: tokens.borderStrong,
    height: 1,
    left: -34,
    opacity: 0.14,
    position: 'absolute',
    top: 330,
    width: 360,
  },
  backdropGlow: {
    backgroundColor: theme.aqua,
    borderRadius: 999,
    height: 150,
    left: '50%',
    opacity: 0.24,
    position: 'absolute',
    top: 116,
    transform: [{ translateX: -75 }],
    width: 150,
  },
  backdropLine: {
    backgroundColor: tokens.borderStrong,
    height: 1,
    opacity: 0.28,
    position: 'absolute',
    width: 300,
  },
  backdropLineOne: {
    top: 96,
    transform: [{ rotate: '-12deg' }],
  },
  backdropLineTwo: {
    right: -55,
    top: 215,
    transform: [{ rotate: '23deg' }],
  },
  backdropRoom: {
    borderColor: tokens.borderStrong,
    borderRadius: 22,
    borderWidth: 2,
    opacity: 0.28,
    position: 'absolute',
  },
  backdropRoomOne: {
    height: 128,
    left: 42,
    top: 138,
    width: 152,
  },
  backdropRoomTwo: {
    height: 120,
    right: 34,
    top: 198,
    width: 134,
  },
  backdropPin: {
    backgroundColor: tokens.primary,
    borderColor: tokens.glassBorder,
    borderRadius: 999,
    borderWidth: 3,
    height: 18,
    left: '50%',
    position: 'absolute',
    top: 188,
    transform: [{ translateX: -9 }],
    width: 18,
  },
  bookingSheet: {
    backgroundColor: tokens.glassWarm,
    borderColor: tokens.glassBorder,
    borderRadius: 30,
    borderWidth: 1,
    boxShadow: tokens.glassShadow,
    experimental_backgroundImage:
      'radial-gradient(circle at 90% 8%, rgba(255,184,102,0.15), transparent 22%), radial-gradient(circle at 12% 86%, rgba(183,246,231,0.30), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.54), rgba(222,248,242,0.56))',
    gap: 12,
    overflow: 'hidden',
    padding: 14,
  },
  bookingOpaqueSheet: {
    backgroundColor: 'rgba(255,253,248,0.98)',
    borderColor: tokens.borderStrong,
    boxShadow: 'none',
    experimental_backgroundImage: 'none',
  },
  bookingOpaqueControl: {
    backgroundColor: 'rgba(255,253,248,0.98)',
    borderColor: tokens.border,
    boxShadow: 'none',
  },
  bookingTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  bookingMiniButton: {
    alignItems: 'center',
    backgroundColor: tokens.glassStrong,
    borderColor: tokens.glassBorder,
    borderRadius: 18,
    borderWidth: 1,
    boxShadow: 'none',
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  bookingLocationPill: {
    alignItems: 'center',
    backgroundColor: tokens.glassStrong,
    borderColor: tokens.glassBorder,
    borderRadius: 18,
    borderWidth: 1,
    boxShadow: 'none',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 48,
    overflow: 'hidden',
    paddingHorizontal: 10,
  },
  bookingLocationText: {
    color: tokens.text,
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
  },
  glassTopHighlight: {
    backgroundColor: tokens.glassHighlight,
    height: 1,
    left: 16,
    opacity: 0.78,
    position: 'absolute',
    right: 16,
    top: 0,
    zIndex: 0,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: 'rgba(16,43,45,0.16)',
    borderRadius: 999,
    height: 4,
    width: 44,
  },
  bookingTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  flowBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(8,120,110,0.11)',
    borderRadius: 999,
    color: tokens.primary,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  pageTitle: {
    color: tokens.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 27,
    marginTop: 6,
  },
  headerIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderColor: tokens.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  kaelHeaderMascot: {
    alignItems: 'center',
    backgroundColor: tokens.glassStrong,
    borderColor: tokens.glassBorder,
    borderRadius: 20,
    borderWidth: 1,
    boxShadow: tokens.glassFloatShadow,
    height: 56,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    width: 56,
  },
  kaelHeaderImage: {
    height: 60,
    width: 58,
  },
  formStack: {
    gap: 11,
  },
  segmented: {
    backgroundColor: tokens.glassSoft,
    borderColor: tokens.glassBorder,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    padding: 5,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 4,
  },
  segmentActive: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    boxShadow: 'none',
  },
  segmentText: {
    color: tokens.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
  },
  segmentTextActive: {
    color: tokens.primary,
  },
  softField: {
    backgroundColor: tokens.base,
    borderColor: tokens.border,
    borderRadius: 21,
    borderWidth: 1,
    boxShadow: 'none',
    gap: 9,
    overflow: 'hidden',
    padding: 12,
  },
  cardMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  fieldTitle: {
    color: tokens.text,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
  },
  statusText: {
    color: tokens.primary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  trustRail: {
    alignItems: 'center',
    backgroundColor: tokens.glassSoft,
    borderColor: tokens.glassBorder,
    borderRadius: 18,
    borderWidth: 1,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.42)',
    flexDirection: 'row',
    gap: 7,
    overflow: 'hidden',
    padding: 8,
  },
  trustStep: {
    alignItems: 'center',
    flex: 1,
    gap: 5,
  },
  trustDot: {
    backgroundColor: 'rgba(8,120,110,0.12)',
    borderRadius: 999,
    height: 7,
    width: '100%',
  },
  trustDotActive: {
    backgroundColor: tokens.primary,
    boxShadow: 'none',
  },
  trustLabel: {
    color: tokens.subtle,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0,
    textAlign: 'center',
  },
  trustLabelActive: {
    color: tokens.primaryDark,
  },
  chip: {
    backgroundColor: 'rgba(236,251,247,0.72)',
    borderColor: 'rgba(8,120,110,0.08)',
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  chipActive: {
    backgroundColor: tokens.primary,
    boxShadow: 'none',
  },
  chipText: {
    color: tokens.primaryDark,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  descriptionInput: {
    backgroundColor: 'rgba(245,251,248,0.68)',
    borderColor: 'rgba(255,255,255,0.66)',
    borderRadius: 18,
    borderWidth: 1,
    color: tokens.text,
    fontSize: 13,
    letterSpacing: 0,
    lineHeight: 18,
    minHeight: 84,
    padding: 11,
  },
  singleLineInput: {
    backgroundColor: 'rgba(245,251,248,0.68)',
    borderColor: 'rgba(255,255,255,0.66)',
    borderRadius: 18,
    borderWidth: 1,
    color: tokens.text,
    fontSize: 13,
    fontWeight: '600',
    minHeight: 46,
    paddingHorizontal: 11,
  },
  validationText: {
    color: '#B64B40',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mediaTile: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.50)',
    borderColor: tokens.glassBorder,
    borderRadius: 18,
    borderStyle: 'dashed',
    borderWidth: 1,
    flex: 1,
    gap: 7,
    minHeight: 72,
    minWidth: '46%',
    padding: 11,
  },
  mediaPreview: {
    borderRadius: 12,
    height: 46,
    width: '100%',
  },
  mediaText: {
    color: tokens.primaryDark,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
  },
  clarifyCard: {
    backgroundColor: tokens.service,
    borderColor: tokens.border,
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    overflow: 'hidden',
    padding: 13,
  },
  clarifyItem: {
    backgroundColor: 'rgba(255,253,248,0.92)',
    borderColor: tokens.border,
    borderRadius: 17,
    borderWidth: 1,
    color: tokens.text,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 16,
    padding: 10,
  },
  flowCard: {
    backgroundColor: tokens.base,
    borderColor: tokens.border,
    borderRadius: 22,
    borderWidth: 1,
    boxShadow: 'none',
    gap: 12,
    overflow: 'hidden',
    padding: 13,
  },
  cardTitle: {
    color: tokens.text,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0,
  },
  kicker: {
    color: tokens.primary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
  },
  estimateCard: {
    backgroundColor: tokens.glassSoft,
    borderColor: tokens.glassBorder,
    borderRadius: 22,
    borderWidth: 1,
    boxShadow: tokens.glassFloatShadow,
    experimental_backgroundImage:
      'radial-gradient(circle at 92% 12%, rgba(255,184,102,0.14), transparent 22%), radial-gradient(circle at 10% 88%, rgba(183,246,231,0.30), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.52), rgba(225,249,244,0.42))',
    gap: 12,
    overflow: 'hidden',
    padding: 13,
  },
  warningCard: {
    backgroundColor: tokens.glassWarm,
    borderColor: tokens.glassBorder,
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    overflow: 'hidden',
    padding: 13,
  },
  priceRange: {
    backgroundColor: tokens.warm,
    borderColor: tokens.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
    padding: 13,
  },
  priceValue: {
    color: tokens.primaryDark,
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: 0,
  },
  priceMeta: {
    color: tokens.muted,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryCell: {
    backgroundColor: 'rgba(255,255,255,0.56)',
    borderColor: tokens.glassBorder,
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 5,
    minHeight: 66,
    padding: 11,
  },
  summaryLabel: {
    color: tokens.muted,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0,
  },
  summaryValue: {
    color: tokens.text,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0,
  },
  disclaimerText: {
    color: tokens.muted,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 18,
  },
  notificationGate: {
    alignItems: 'center',
    backgroundColor: 'rgba(245,251,248,0.68)',
    borderColor: tokens.glassBorder,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  notificationGateActive: {
    backgroundColor: 'rgba(220,243,236,0.78)',
    borderColor: tokens.borderStrong,
  },
  notificationGateDot: {
    borderColor: tokens.borderStrong,
    borderRadius: 9,
    borderWidth: 1,
    height: 18,
    width: 18,
  },
  notificationGateDotActive: {
    backgroundColor: tokens.primary,
    borderColor: tokens.primary,
  },
  notificationGateText: {
    color: tokens.text,
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 16,
  },
  twoCol: {
    flexDirection: 'row',
    gap: 10,
  },
  choiceCard: {
    backgroundColor: 'rgba(234,246,241,0.62)',
    borderColor: tokens.glassBorder,
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    minHeight: 86,
    padding: 13,
  },
  choiceCardActive: {
    backgroundColor: tokens.primary,
    borderColor: tokens.primary,
  },
  disabledChoiceCard: {
    opacity: 0.52,
  },
  choiceTitle: {
    color: tokens.text,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0,
  },
  choiceText: {
    color: tokens.muted,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 18,
  },
  choiceTextActive: {
    color: '#FFFFFF',
  },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: tokens.service,
    borderColor: tokens.border,
    borderRadius: 28,
    borderWidth: 1,
    gap: 12,
    justifyContent: 'center',
    minHeight: 252,
    overflow: 'hidden',
    padding: 24,
  },
  loadingTitle: {
    color: tokens.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center',
  },
  loadingText: {
    color: tokens.muted,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 19,
    textAlign: 'center',
  },
  stateGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  stateItem: {
    alignItems: 'center',
    flex: 1,
    gap: 7,
  },
  stateDot: {
    backgroundColor: tokens.borderStrong,
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  stateDotActive: {
    backgroundColor: tokens.primary,
  },
  stateText: {
    color: tokens.muted,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0,
    textAlign: 'center',
  },
  panelText: {
    color: tokens.muted,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 19,
  },
  workerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  workerAvatar: {
    alignItems: 'center',
    backgroundColor: tokens.service,
    borderRadius: 20,
    height: 56,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 56,
  },
  workerImage: {
    height: 56,
    width: 56,
  },
  workerCopy: {
    flex: 1,
    gap: 4,
  },
  workerName: {
    color: tokens.text,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0,
  },
  sheetActions: {
    backgroundColor: tokens.glassStrong,
    borderColor: tokens.glassBorder,
    borderRadius: 20,
    borderWidth: 1,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.62)',
    gap: 12,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  progressTrack: {
    backgroundColor: tokens.border,
    borderRadius: 999,
    height: 5,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: tokens.primary,
    borderRadius: 999,
    height: 5,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: tokens.base,
    borderColor: tokens.border,
    borderRadius: 18,
    borderWidth: 1,
    flex: 0.82,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: tokens.muted,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: tokens.primary,
    borderRadius: 18,
    boxShadow: '0 7px 16px rgba(12,117,108,0.12)',
    flex: 1.45,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 16,
  },
  primaryButtonDisabled: {
    backgroundColor: tokens.border,
    boxShadow: 'none',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0,
    textAlign: 'center',
  },
  primaryButtonDisabledText: {
    color: tokens.muted,
  },
} as any)

const darkStyleOverrides = StyleSheet.create({
  root: {
    backgroundColor: '#071312',
    experimental_backgroundImage:
      'radial-gradient(circle at 50% 12%, rgba(105,222,198,0.16), transparent 30%), radial-gradient(circle at 88% 18%, rgba(224,160,107,0.10), transparent 22%), linear-gradient(180deg, #071312 0%, #141B18 100%)',
  },
  bookingBackdrop: {
    opacity: 0.36,
  },
  bookingAmbientMintWash: {
    backgroundColor: 'rgba(105,222,198,0.45)',
  },
  bookingAmbientWarmWash: {
    backgroundColor: 'rgba(224,160,107,0.36)',
  },
  bookingAmbientLine: {
    backgroundColor: 'rgba(105,222,198,0.32)',
  },
  backdropGlow: {
    backgroundColor: 'rgba(105,222,198,0.50)',
  },
  backdropLine: {
    backgroundColor: 'rgba(105,222,198,0.24)',
  },
  backdropRoom: {
    borderColor: 'rgba(105,222,198,0.30)',
  },
  backdropPin: {
    backgroundColor: '#69DEC6',
    borderColor: 'rgba(255,255,255,0.14)',
  },
  bookingSheet: {
    backgroundColor: 'rgba(16,32,31,0.82)',
    borderColor: 'rgba(255,255,255,0.12)',
    boxShadow: '0 8px 20px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.08)',
    experimental_backgroundImage:
      'radial-gradient(circle at 90% 8%, rgba(224,160,107,0.13), transparent 22%), radial-gradient(circle at 12% 86%, rgba(105,222,198,0.14), transparent 34%), linear-gradient(145deg, rgba(22,43,40,0.86), rgba(12,26,25,0.78))',
  },
  bookingOpaqueSheet: {
    backgroundColor: 'rgba(18,39,36,0.98)',
    borderColor: 'rgba(255,255,255,0.16)',
    boxShadow: 'none',
    experimental_backgroundImage: 'none',
  },
  bookingOpaqueControl: {
    backgroundColor: 'rgba(18,39,36,0.96)',
    borderColor: 'rgba(255,255,255,0.14)',
    boxShadow: 'none',
  },
  bookingMiniButton: {
    backgroundColor: 'rgba(22,43,40,0.82)',
    borderColor: 'rgba(255,255,255,0.12)',
    boxShadow: 'none',
  },
  bookingLocationPill: {
    backgroundColor: 'rgba(22,43,40,0.82)',
    borderColor: 'rgba(255,255,255,0.12)',
    boxShadow: 'none',
  },
  bookingLocationText: {
    color: '#E8F8F2',
  },
  glassTopHighlight: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  sheetHandle: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  flowBadge: {
    backgroundColor: 'rgba(105,222,198,0.16)',
    color: '#69DEC6',
  },
  pageTitle: {
    color: '#E8F8F2',
  },
  headerIcon: {
    backgroundColor: 'rgba(22,43,40,0.72)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  kaelHeaderMascot: {
    backgroundColor: 'rgba(22,43,40,0.82)',
    borderColor: 'rgba(255,255,255,0.12)',
    boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
  },
  segmented: {
    backgroundColor: 'rgba(22,43,40,0.72)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  segmentActive: {
    backgroundColor: 'rgba(105,222,198,0.16)',
    boxShadow: 'none',
  },
  segmentText: {
    color: '#8FB0AA',
  },
  segmentTextActive: {
    color: '#69DEC6',
  },
  softField: {
    backgroundColor: 'rgba(22,43,40,0.72)',
    borderColor: 'rgba(255,255,255,0.12)',
    boxShadow: 'none',
  },
  fieldTitle: {
    color: '#E8F8F2',
  },
  statusText: {
    color: '#69DEC6',
  },
  trustRail: {
    backgroundColor: 'rgba(22,43,40,0.72)',
    borderColor: 'rgba(255,255,255,0.12)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
  },
  trustDot: {
    backgroundColor: 'rgba(105,222,198,0.16)',
  },
  trustDotActive: {
    backgroundColor: '#69DEC6',
    boxShadow: 'none',
  },
  trustLabel: {
    color: '#8FB0AA',
  },
  trustLabelActive: {
    color: '#CFF7EE',
  },
  chip: {
    backgroundColor: 'rgba(105,222,198,0.11)',
    borderColor: 'rgba(105,222,198,0.16)',
  },
  chipActive: {
    backgroundColor: '#08786E',
    boxShadow: 'none',
  },
  chipText: {
    color: '#CFF7EE',
  },
  descriptionInput: {
    backgroundColor: 'rgba(7,19,18,0.42)',
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#E8F8F2',
  },
  singleLineInput: {
    backgroundColor: 'rgba(7,19,18,0.42)',
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#E8F8F2',
  },
  validationText: {
    color: '#F0A69C',
  },
  mediaTile: {
    backgroundColor: 'rgba(7,19,18,0.42)',
    borderColor: 'rgba(105,222,198,0.18)',
  },
  mediaText: {
    color: '#CFF7EE',
  },
  clarifyCard: {
    backgroundColor: 'rgba(23,59,53,0.58)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  clarifyItem: {
    backgroundColor: 'rgba(105,222,198,0.10)',
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#E8F8F2',
  },
  flowCard: {
    backgroundColor: 'rgba(12,26,25,0.92)',
    borderColor: 'rgba(255,255,255,0.12)',
    boxShadow: 'none',
  },
  cardTitle: {
    color: '#E8F8F2',
  },
  kicker: {
    color: '#69DEC6',
  },
  estimateCard: {
    backgroundColor: 'rgba(22,43,40,0.72)',
    borderColor: 'rgba(255,255,255,0.12)',
    boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
    experimental_backgroundImage:
      'radial-gradient(circle at 92% 12%, rgba(224,160,107,0.11), transparent 22%), radial-gradient(circle at 10% 88%, rgba(105,222,198,0.13), transparent 34%), linear-gradient(145deg, rgba(22,43,40,0.78), rgba(12,26,25,0.68))',
  },
  warningCard: {
    backgroundColor: 'rgba(74,47,31,0.46)',
    borderColor: 'rgba(224,160,107,0.22)',
  },
  priceRange: {
    backgroundColor: 'rgba(74,47,31,0.34)',
    borderColor: 'rgba(224,160,107,0.24)',
  },
  priceValue: {
    color: '#CFF7EE',
  },
  priceMeta: {
    color: '#A9C4BE',
  },
  summaryCell: {
    backgroundColor: 'rgba(7,19,18,0.42)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  summaryLabel: {
    color: '#A9C4BE',
  },
  summaryValue: {
    color: '#E8F8F2',
  },
  disclaimerText: {
    color: '#A9C4BE',
  },
  notificationGate: {
    backgroundColor: 'rgba(7,19,18,0.42)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  notificationGateActive: {
    backgroundColor: 'rgba(105,222,198,0.13)',
    borderColor: 'rgba(105,222,198,0.32)',
  },
  notificationGateDot: {
    borderColor: 'rgba(105,222,198,0.38)',
  },
  notificationGateDotActive: {
    backgroundColor: '#69DEC6',
    borderColor: '#69DEC6',
  },
  notificationGateText: {
    color: '#E8F8F2',
  },
  choiceCard: {
    backgroundColor: 'rgba(7,19,18,0.42)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  choiceCardActive: {
    backgroundColor: '#08786E',
    borderColor: '#69DEC6',
  },
  choiceTitle: {
    color: '#E8F8F2',
  },
  choiceText: {
    color: '#A9C4BE',
  },
  loadingCard: {
    backgroundColor: 'rgba(23,59,53,0.58)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  loadingTitle: {
    color: '#E8F8F2',
  },
  loadingText: {
    color: '#A9C4BE',
  },
  stateDot: {
    backgroundColor: 'rgba(105,222,198,0.24)',
  },
  stateText: {
    color: '#A9C4BE',
  },
  panelText: {
    color: '#A9C4BE',
  },
  workerAvatar: {
    backgroundColor: 'rgba(105,222,198,0.14)',
  },
  workerName: {
    color: '#E8F8F2',
  },
  sheetActions: {
    backgroundColor: 'rgba(22,43,40,0.84)',
    borderColor: 'rgba(255,255,255,0.12)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
  },
  progressTrack: {
    backgroundColor: 'rgba(105,222,198,0.18)',
  },
  secondaryButton: {
    backgroundColor: 'rgba(7,19,18,0.42)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  secondaryButtonText: {
    color: '#A9C4BE',
  },
  primaryButtonDisabled: {
    backgroundColor: 'rgba(105,222,198,0.16)',
  },
  primaryButtonDisabledText: {
    color: '#8FB0AA',
  },
} as any)

const styles = new Proxy(lightStyles, {
  get(target, property: string | symbol) {
    const base = target[property as keyof typeof lightStyles]
    if (currentBookingThemeMode !== 'dark') return base
    const darkOverride = darkStyleOverrides[property as keyof typeof darkStyleOverrides]
    return darkOverride ? [base, darkOverride] : base
  },
}) as typeof lightStyles
