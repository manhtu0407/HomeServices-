import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { PROBLEM_CHIPS, type ServiceType } from '@home-services/shared'
import { Colors } from '@/constants/colors'

type PriceCheckUiStep = 'form' | 'clarification' | 'estimate'

type PriceCheckUiStatus =
  | 'editing'
  | 'loading'
  | 'needs_clarification'
  | 'estimate_ready'
  | 'baseline_fallback'
  | 'fallback'
  | 'error'

type PriceCheckDraft = {
  serviceType: ServiceType
  problemChips: string[]
  description: string
  photoUris: string[]
  addressLabel: string
  clarificationAnswers: Record<string, string>
}

type PriceCheckEstimateCard = {
  problemLabel: string
  complexity: 'small' | 'medium' | 'large' | 'unknown'
  priceRangeLabel: string
  confidenceLabel: string
  reasons: string[]
  advisory?: string
  disclaimer: string
  source: 'kael' | 'baseline_fallback'
}

type ClarificationQuestion = {
  id: string
  question: string
  options: string[]
}

type ServiceOption = {
  type: ServiceType
  title: string
  subtitle: string
}

type MotionRole = 'service' | 'chip' | 'answer' | 'cta' | 'retry'

const theme = Colors.priceCheck
const BOOKING_FORM_FIRST_CONTRACT = 'BOOKING_FORM_FIRST_CONTRACT: A2-A5 form-first production price check'
const BOOKING_LAYER_SWITCH_V14 = 'BOOKING_LAYER_SWITCH_V14: booking uses V12 semantic material layers'
const BOOKING_TYPE_RHYTHM = 'BOOKING_TYPE_RHYTHM: lighter prototype-aligned weights'
const BOOKING_INTERACTION_MOTION_V14 = 'BOOKING_INTERACTION_MOTION_V14: distributed tap/focus/reveal motion'

const bookingLayerTokens = {
  canvas: theme.canvas,
  base: theme.surface,
  raised: '#FFFFFF',
  service: theme.surfaceMint,
  water: theme.surfaceAqua,
  warm: theme.surfaceCopper,
  depth: '#EAF6F1',
  border: theme.line,
  borderStrong: theme.lineStrong,
  text: theme.ink,
  muted: theme.slate,
  subtle: theme.muted,
  primary: theme.forest,
  primaryDark: theme.forestDark,
  copper: theme.clay,
}

const minimumTouchTarget = 44
const compactFormHeroHeight = 112
const compactServiceCardHeight = 114

const PRICE_DISCLAIMER =
  'Đây là ước tính dựa trên thị trường. Giá thực tế sẽ được xác nhận bởi thợ trước khi bắt đầu.'

const INITIAL_DRAFT: PriceCheckDraft = {
  serviceType: 'electrical',
  problemChips: [],
  description: '',
  photoUris: [],
  addressLabel: 'Chung cư tại TP.HCM',
  clarificationAnswers: {},
}

const SERVICES: ServiceOption[] = [
  {
    type: 'electrical',
    title: 'Sửa điện',
    subtitle: 'Ổ cắm, đèn, aptomat',
  },
  {
    type: 'plumbing',
    title: 'Sửa nước',
    subtitle: 'Rò rỉ, lavabo, toilet',
  },
]

const QUESTIONS: Record<ServiceType, ClarificationQuestion[]> = {
  electrical: [
    {
      id: 'breaker',
      question: 'Aptomat có tự ngắt lại không?',
      options: ['Có', 'Không', 'Chưa rõ'],
    },
    {
      id: 'burning',
      question: 'Có mùi khét hoặc vết cháy không?',
      options: ['Có dấu hiệu', 'Không thấy', 'Cần gửi ảnh'],
    },
  ],
  plumbing: [
    {
      id: 'scope',
      question: 'Rò/tắc ở một vị trí hay nhiều vị trí?',
      options: ['Một vị trí', 'Nhiều vị trí', 'Chưa rõ'],
    },
    {
      id: 'leak',
      question: 'Nước rò liên tục hay khi sử dụng?',
      options: ['Liên tục', 'Khi sử dụng', 'Chưa rõ'],
    },
  ],
}

const ESTIMATE_FIXTURE: PriceCheckEstimateCard = {
  problemLabel: 'Sự cố cần kiểm tra tại căn hộ',
  complexity: 'medium',
  priceRangeLabel: '320.000 - 480.000đ',
  confidenceLabel: 'Tham khảo',
  reasons: ['Nhóm vấn đề phổ biến trong căn hộ.', 'Thợ xác nhận lại trước khi làm.'],
  advisory: 'Nếu có mùi khét hoặc rò nước liên tục, hãy ngắt nguồn/khóa van trước.',
  disclaimer: PRICE_DISCLAIMER,
  source: 'kael',
}

const FALLBACK_ESTIMATE: PriceCheckEstimateCard = {
  problemLabel: 'Chưa đủ dữ liệu an toàn',
  complexity: 'unknown',
  priceRangeLabel: 'Chưa thể ước tính',
  confidenceLabel: 'Cần thêm thông tin',
  reasons: ['Mô tả hiện tại còn thiếu tín hiệu chính.', 'App không hiển thị giá khi baseline chưa đủ.'],
  advisory: 'Thêm ảnh hoặc chọn câu trả lời rõ hơn.',
  disclaimer: PRICE_DISCLAIMER,
  source: 'baseline_fallback',
}

export function ClientPriceCheckFlow() {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const screenMotion = useRef(new Animated.Value(1)).current
  const pressMotion = useRef(new Animated.Value(0)).current
  const fieldFocusMotion = useRef(new Animated.Value(0)).current
  const [step, setStep] = useState<PriceCheckUiStep>('form')
  const [status, setStatus] = useState<PriceCheckUiStatus>('editing')
  const [draft, setDraft] = useState<PriceCheckDraft>(INITIAL_DRAFT)

  const isCompact = width < 390
  const isShortScreen = height < 760
  const formFirstViewport = step === 'form' && (isCompact || isShortScreen)
  const questions = QUESTIONS[draft.serviceType]
  const chips = useMemo(() => PROBLEM_CHIPS[draft.serviceType], [draft.serviceType])
  const answeredQuestions = questions.filter((question) => draft.clarificationAnswers[question.id]).length
  const hasEnoughDescription = draft.description.trim().length >= 16
  const formComplete = draft.problemChips.length > 0 && hasEnoughDescription
  const clarificationComplete = answeredQuestions === questions.length
  const isEstimateFallback = status === 'baseline_fallback' || status === 'fallback'
  const estimate = isEstimateFallback ? FALLBACK_ESTIMATE : ESTIMATE_FIXTURE

  useEffect(() => {
    screenMotion.setValue(0)
    Animated.timing(screenMotion, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
    }).start()
  }, [screenMotion, step, status])

  const runPressMotion = () => {
    pressMotion.setValue(0)
    Animated.parallel([
      Animated.sequence([
        Animated.timing(pressMotion, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(pressMotion, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]),
    ]).start()
  }

  const runFieldFocusMotion = () => {
    fieldFocusMotion.setValue(0)
    Animated.sequence([
      Animated.timing(fieldFocusMotion, {
        toValue: 1,
        duration: 150,
        useNativeDriver: false,
      }),
      Animated.timing(fieldFocusMotion, {
        toValue: 0,
        duration: 260,
        useNativeDriver: false,
      }),
    ]).start()
  }

  const startServiceFlow = (serviceType: ServiceType) => {
    runPressMotion()
    setDraft((current) => ({
      ...current,
      serviceType,
      problemChips: current.serviceType === serviceType ? current.problemChips : [],
      clarificationAnswers: {},
    }))
    setStatus('editing')
  }

  const toggleChip = (chip: string) => {
    runPressMotion()
    setDraft((current) => {
      const selected = current.problemChips.includes(chip)
      return {
        ...current,
        problemChips: selected
          ? current.problemChips.filter((item) => item !== chip)
          : [...current.problemChips, chip].slice(0, 3),
      }
    })
    setStatus('editing')
  }

  const answerQuestion = (questionId: string, answer: string) => {
    runPressMotion()
    setDraft((current) => ({
      ...current,
      clarificationAnswers: {
        ...current.clarificationAnswers,
        [questionId]: answer,
      },
    }))
    setStatus('needs_clarification')
  }

  const resetFlow = () => {
    runPressMotion()
    setDraft(INITIAL_DRAFT)
    setStep('form')
    setStatus('editing')
  }

  const retryPriceCheck = () => {
    runPressMotion()
    setStep('form')
    setStatus('editing')
  }

  const continueFlow = () => {
    runPressMotion()

    if (step === 'form') {
      if (!formComplete) {
        setStatus('error')
        return
      }
      setStep('clarification')
      setStatus('loading')
      return
    }

    if (step === 'clarification' && status === 'loading') {
      setStatus('needs_clarification')
      return
    }

    if (step === 'clarification') {
      if (!clarificationComplete) return

      const unclear = Object.values(draft.clarificationAnswers).some((answer) => answer === 'Chưa rõ')
      setStep('estimate')
      setStatus(unclear ? 'baseline_fallback' : 'estimate_ready')
      return
    }

    if (step === 'estimate') {
      setStatus(isEstimateFallback ? 'fallback' : 'estimate_ready')
    }
  }

  const goBack = () => {
    runPressMotion()
    if (step === 'estimate') {
      setStep('clarification')
      setStatus('needs_clarification')
      return
    }
    if (step === 'clarification') {
      setStep('form')
      setStatus('editing')
    }
  }

  const primaryDisabled =
    (step === 'form' && !formComplete) ||
    (step === 'clarification' && status !== 'loading' && !clarificationComplete)

  const screenStyle = {
    opacity: screenMotion,
    transform: [
      {
        translateY: screenMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0],
        }),
      },
    ],
  }

  return (
    <View
      accessibilityLabel={`${BOOKING_FORM_FIRST_CONTRACT}; ${BOOKING_LAYER_SWITCH_V14}; ${BOOKING_TYPE_RHYTHM}; ${BOOKING_INTERACTION_MOTION_V14}`}
      style={styles.root}
      testID="production-price-check-flow"
    >
      <View style={styles.hiddenMarker} testID="booking-layer-semantic-switch" />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 14,
            paddingBottom: insets.bottom + 118,
          },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <BookingTopBar />

        <Animated.View style={[styles.motionSurface, screenStyle]}>
          {step === 'form' ? (
            <BookingFormSurface
              chips={chips}
              draft={draft}
              fieldFocusMotion={fieldFocusMotion}
              formFirstViewport={formFirstViewport}
              isCompact={isCompact}
              status={status}
              onDescriptionChange={(description) => {
                setDraft((current) => ({ ...current, description }))
                setStatus('editing')
              }}
              onFieldFocus={runFieldFocusMotion}
              onSelectService={startServiceFlow}
              onToggleChip={toggleChip}
            />
          ) : null}

          {step === 'clarification' ? (
            status === 'loading' ? (
              <StateReveal role="loading">
                <KaelLoadingPanel />
              </StateReveal>
            ) : (
              <KaelQuestionSheet
                draft={draft}
                questions={questions}
                onAnswer={answerQuestion}
              />
            )
          ) : null}

          {step === 'estimate' ? (
            <StateReveal role={isEstimateFallback ? 'fallback' : 'estimate'}>
              <KaelEstimatePanel
                draft={draft}
                estimate={estimate}
                isFallback={isEstimateFallback}
                onRetry={retryPriceCheck}
              />
            </StateReveal>
          ) : null}
        </Animated.View>
      </ScrollView>

      <BookingBottomDock
        bottomInset={insets.bottom}
        primaryDisabled={primaryDisabled}
        primaryLabel={primaryLabel(step, status)}
        progress={progressForStep(step, status)}
        secondaryLabel={step === 'form' ? 'Làm lại' : 'Quay lại'}
        onPrimary={continueFlow}
        onSecondary={step === 'form' ? resetFlow : goBack}
      />
    </View>
  )
}

function BookingTopBar() {
  return (
    <View style={styles.topBar}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>H</Text>
        </View>
        <View style={styles.brandCopy}>
          <Text style={styles.appName} numberOfLines={1}>
            HomeServices
          </Text>
          <Text style={styles.appMeta} numberOfLines={1}>
            Đặt lịch sửa chữa
          </Text>
        </View>
      </View>
      <View style={styles.scopePill}>
        <Text style={styles.scopePillText} numberOfLines={1}>
          Điện / nước
        </Text>
      </View>
    </View>
  )
}

function BookingFormSurface({
  chips,
  draft,
  fieldFocusMotion,
  formFirstViewport,
  isCompact,
  status,
  onDescriptionChange,
  onFieldFocus,
  onSelectService,
  onToggleChip,
}: {
  chips: readonly string[]
  draft: PriceCheckDraft
  fieldFocusMotion: Animated.Value
  formFirstViewport: boolean
  isCompact: boolean
  status: PriceCheckUiStatus
  onDescriptionChange: (description: string) => void
  onFieldFocus: () => void
  onSelectService: (serviceType: ServiceType) => void
  onToggleChip: (chip: string) => void
}) {
  return (
    <View
      style={[styles.bookingFormShell, formFirstViewport ? styles.bookingFormCompact : null]}
      testID="booking-form-first-shell"
    >
      <View
        style={[
          styles.formHero,
          formFirstViewport ? styles.formHeroCompact : null,
          { minHeight: formFirstViewport ? compactFormHeroHeight : 142 },
        ]}
      >
        <View style={styles.formHeroDepthLayer} />
        <View style={styles.bookingCompactCopy}>
          <Text style={styles.formEyebrow} numberOfLines={1}>
            AI Price Check
          </Text>
          <Text style={styles.formTitle} numberOfLines={2}>
            Kiểm giá trước khi sửa
          </Text>
          <Text style={styles.formSubtitle} numberOfLines={2}>
            Chọn nhóm việc, mô tả ngắn.
          </Text>
        </View>
        <View style={styles.formHeroGlyph}>
          <ServiceGlyph type={draft.serviceType} />
        </View>
      </View>

      <View style={styles.contextStrip}>
        <MiniSignal label="Địa chỉ" value={draft.addressLabel} />
        <MiniSignal label="Scope" value={draft.serviceType === 'electrical' ? 'Điện' : 'Nước'} />
      </View>

      <FormServiceSegment
        selectedService={draft.serviceType}
        compact={isCompact}
        onSelectService={onSelectService}
      />

      <ProblemChipField
        chips={chips}
        selectedChips={draft.problemChips}
        hasError={status === 'error' && draft.problemChips.length === 0}
        onToggleChip={onToggleChip}
      />

      <DescriptionField
        description={draft.description}
        fieldFocusMotion={fieldFocusMotion}
        hasError={status === 'error' && !draft.description.trim()}
        onChangeDescription={onDescriptionChange}
        onFocus={onFieldFocus}
      />

      <EvidenceDraftSlots photoCount={draft.photoUris.length} />
    </View>
  )
}

function FormServiceSegment({
  selectedService,
  compact,
  onSelectService,
}: {
  selectedService: ServiceType
  compact: boolean
  onSelectService: (serviceType: ServiceType) => void
}) {
  return (
    <View style={styles.serviceSegment}>
      {SERVICES.map((service) => {
        const active = selectedService === service.type
        return (
          <MotionPressable
            key={service.type}
            motionRole="service"
            deferPressMs={120}
            onPress={() => onSelectService(service.type)}
            style={[
              styles.formServiceCard,
              compact ? styles.formServiceCardCompact : null,
              active ? styles.formServiceCardActive : null,
              service.type === 'plumbing' && active ? styles.formServiceCardWater : null,
            ]}
            pressedStyle={styles.formServiceCardPressed}
            contentStyle={styles.formServiceContent}
          >
            <View style={[styles.serviceIconPlate, service.type === 'plumbing' ? styles.serviceIconPlateWater : null]}>
              <ServiceGlyph type={service.type} />
            </View>
            <Text style={styles.serviceTitle} numberOfLines={1}>
              {service.title}
            </Text>
            <Text style={styles.serviceSubtitle} numberOfLines={2}>
              {service.subtitle}
            </Text>
          </MotionPressable>
        )
      })}
    </View>
  )
}

function ProblemChipField({
  chips,
  selectedChips,
  hasError,
  onToggleChip,
}: {
  chips: readonly string[]
  selectedChips: string[]
  hasError: boolean
  onToggleChip: (chip: string) => void
}) {
  return (
    <View style={styles.bookingFormCard}>
      <FieldHeader title="Vấn đề" meta={selectedChips.length > 0 ? `${selectedChips.length}/3` : 'Chọn'} />
      <View style={styles.chipGrid}>
        {chips.slice(0, 6).map((chip) => {
          const active = selectedChips.includes(chip)
          return (
            <MotionPressable
              key={chip}
              motionRole="chip"
              onPress={() => onToggleChip(chip)}
              style={[styles.problemChip, active ? styles.problemChipActive : null]}
              pressedStyle={styles.problemChipPressed}
              contentStyle={styles.problemChipContent}
            >
              <View style={[styles.chipDot, active ? styles.chipDotActive : null]} />
              <Text style={[styles.problemChipText, active ? styles.problemChipTextActive : null]} numberOfLines={1}>
                {chip}
              </Text>
            </MotionPressable>
          )
        })}
      </View>
      {hasError ? <Text style={styles.inlineError}>Chọn ít nhất một vấn đề.</Text> : null}
    </View>
  )
}

function DescriptionField({
  description,
  fieldFocusMotion,
  hasError,
  onChangeDescription,
  onFocus,
}: {
  description: string
  fieldFocusMotion: Animated.Value
  hasError: boolean
  onChangeDescription: (description: string) => void
  onFocus: () => void
}) {
  const borderColor = fieldFocusMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [hasError ? theme.danger : bookingLayerTokens.border, bookingLayerTokens.primary],
  })

  return (
    <View style={styles.bookingFormCard} testID="booking-form-field-focus">
      <FieldHeader title="Mô tả" meta={`${description.trim().length}/160`} />
      <Animated.View style={[styles.textAreaFrame, { borderColor }]}>
        <TextInput
          multiline
          onChangeText={onChangeDescription}
          onFocus={onFocus}
          placeholder="Ví dụ: ổ cắm bếp nóng, có mùi khét..."
          placeholderTextColor={theme.muted}
          style={styles.descriptionInput}
          textAlignVertical="top"
          value={description}
        />
      </Animated.View>
      {hasError ? <Text style={styles.inlineError}>Thêm vị trí và dấu hiệu chính.</Text> : null}
    </View>
  )
}

function EvidenceDraftSlots({ photoCount }: { photoCount: number }) {
  return (
    <View style={styles.bookingFormCard}>
      <FieldHeader title="Ảnh" meta={photoCount > 0 ? `${photoCount}` : 'Tùy chọn'} />
      <View style={styles.mediaRow}>
        {[0, 1, 2].map((index) => (
          <View key={index} style={styles.mediaSlot}>
            <View style={styles.mediaIconDot}>
              <CameraGlyph />
            </View>
            <Text style={styles.mediaSlotText} numberOfLines={1}>
              {index === 0 ? 'Hiện trạng' : 'Thêm'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function KaelLoadingPanel() {
  return (
    <View style={styles.loadingCard}>
      <View style={styles.loadingIconRing}>
        <ActivityIndicator color={theme.forest} />
      </View>
      <Text style={styles.loadingTitle} numberOfLines={2}>
        Kael đang đọc mô tả
      </Text>
      <Text style={styles.loadingText} numberOfLines={2}>
        Chuẩn bị câu hỏi cần thiết.
      </Text>
    </View>
  )
}

function KaelQuestionSheet({
  draft,
  questions,
  onAnswer,
}: {
  draft: PriceCheckDraft
  questions: ClarificationQuestion[]
  onAnswer: (questionId: string, answer: string) => void
}) {
  return (
    <View style={styles.questionSheet}>
      <View style={styles.summaryStrip}>
        <View style={styles.summaryIcon}>
          <ServiceGlyph type={draft.serviceType} />
        </View>
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryLabel} numberOfLines={1}>
            Kael hỏi thêm
          </Text>
          <Text style={styles.summaryTitle} numberOfLines={1}>
            {draft.problemChips[0] ?? 'Vấn đề đã chọn'}
          </Text>
        </View>
      </View>

      {questions.map((question, index) => (
        <View key={question.id} style={styles.questionCard}>
          <View style={styles.questionIndex}>
            <Text style={styles.questionIndexText}>{index + 1}</Text>
          </View>
          <View style={styles.questionBody}>
            <Text style={styles.questionText} numberOfLines={2}>
              {question.question}
            </Text>
            <View style={styles.answerGrid}>
              {question.options.map((option) => {
                const active = draft.clarificationAnswers[question.id] === option
                return (
                  <MotionPressable
                    key={option}
                    motionRole="answer"
                    onPress={() => onAnswer(question.id, option)}
                    style={[styles.answerChip, active ? styles.answerChipActive : null]}
                    pressedStyle={styles.answerChipPressed}
                    contentStyle={styles.answerChipContent}
                  >
                    <Text style={[styles.answerText, active ? styles.answerTextActive : null]} numberOfLines={1}>
                      {option}
                    </Text>
                  </MotionPressable>
                )
              })}
            </View>
          </View>
        </View>
      ))}
    </View>
  )
}

function KaelEstimatePanel({
  draft,
  estimate,
  isFallback,
  onRetry,
}: {
  draft: PriceCheckDraft
  estimate: PriceCheckEstimateCard
  isFallback: boolean
  onRetry: () => void
}) {
  return (
    <View style={[styles.estimateCard, isFallback ? styles.fallbackCard : null]}>
      <View style={styles.estimateTop}>
        <View style={styles.estimateIcon}>
          <ServiceGlyph type={draft.serviceType} />
        </View>
        <View style={styles.estimateHeading}>
          <Text style={styles.estimateLabel} numberOfLines={1}>
            {draft.addressLabel}
          </Text>
          <Text style={styles.estimateProblem} numberOfLines={2}>
            {estimate.problemLabel}
          </Text>
        </View>
      </View>

      <View style={styles.priceBand}>
        <Text style={styles.priceLabel} numberOfLines={1}>
          {estimate.source === 'kael' ? 'Khoảng giá tham khảo' : 'Trạng thái'}
        </Text>
        <Text style={[styles.priceValue, isFallback ? styles.priceValueMuted : null]} numberOfLines={2}>
          {estimate.priceRangeLabel}
        </Text>
        <Text style={styles.priceMeta} numberOfLines={1}>
          {estimate.confidenceLabel} · {complexityLabel(estimate.complexity)}
        </Text>
      </View>

      <View style={styles.reasonStack}>
        {estimate.reasons.map((reason) => (
          <View key={reason} style={styles.reasonRow}>
            <View style={styles.reasonBullet} />
            <Text style={styles.reasonText} numberOfLines={2}>
              {reason}
            </Text>
          </View>
        ))}
      </View>

      {estimate.advisory ? (
        <View style={styles.advisoryBox}>
          <Text style={styles.advisoryText} numberOfLines={2}>
            {estimate.advisory}
          </Text>
        </View>
      ) : null}

      <View style={styles.disclaimerBox}>
        <Text selectable style={styles.disclaimerText}>
          {estimate.disclaimer}
        </Text>
      </View>

      {isFallback ? (
        <MotionPressable
          motionRole="retry"
          onPress={onRetry}
          style={styles.retryInlineButton}
          pressedStyle={styles.retryInlineButtonPressed}
          contentStyle={styles.retryInlineContent}
        >
          <Text style={styles.retryInlineText} numberOfLines={1}>
            Sửa mô tả
          </Text>
        </MotionPressable>
      ) : null}
    </View>
  )
}

function BookingBottomDock({
  bottomInset,
  primaryDisabled,
  primaryLabel,
  progress,
  secondaryLabel,
  onPrimary,
  onSecondary,
}: {
  bottomInset: number
  primaryDisabled: boolean
  primaryLabel: string
  progress: number
  secondaryLabel: string
  onPrimary: () => void
  onSecondary: () => void
}) {
  return (
    <View style={[styles.bottomBar, { paddingBottom: Math.max(bottomInset + 10, 18) }]}>
      <View style={styles.bottomProgressTrack}>
        <View style={[styles.bottomProgressFill, { width: `${progress}%` }]} />
      </View>
      <View style={styles.actionRow}>
        <MotionPressable
          motionRole="retry"
          onPress={onSecondary}
          style={styles.secondaryButton}
          pressedStyle={styles.secondaryButtonPressed}
          contentStyle={styles.ctaContent}
        >
          <Text style={styles.secondaryButtonText} numberOfLines={1}>
            {secondaryLabel}
          </Text>
        </MotionPressable>
        <MotionPressable
          disabled={primaryDisabled}
          motionRole="cta"
          onPress={onPrimary}
          style={[styles.primaryButton, primaryDisabled ? styles.primaryButtonDisabled : null]}
          pressedStyle={primaryDisabled ? null : styles.primaryButtonPressed}
          contentStyle={styles.ctaContent}
        >
          <Text style={styles.primaryButtonText} numberOfLines={1}>
            {primaryLabel}
          </Text>
        </MotionPressable>
      </View>
    </View>
  )
}

function FieldHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <View style={styles.fieldHeader}>
      <Text style={styles.fieldTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.fieldMeta} numberOfLines={1}>
        {meta}
      </Text>
    </View>
  )
}

function MiniSignal({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniSignal}>
      <Text style={styles.miniSignalLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.miniSignalValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

function StateReveal({
  children,
  role,
}: {
  children: ReactNode
  role: 'loading' | 'estimate' | 'fallback'
}) {
  const stateMotion = useRef(new Animated.Value(0)).current

  useEffect(() => {
    stateMotion.setValue(0)
    Animated.parallel([
      Animated.timing(stateMotion, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start()
  }, [stateMotion, role])

  const loadingRevealStyle = {
    opacity: stateMotion,
    transform: [
      {
        translateY: stateMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        }),
      },
    ],
  }

  const estimateRevealStyle = {
    opacity: stateMotion,
    transform: [
      {
        scale: stateMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [0.985, 1],
        }),
      },
    ],
  }

  const stateAccentScale = stateMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 1],
  })

  return (
    <Animated.View
      style={[
        styles.stateRevealShell,
        role === 'loading' ? loadingRevealStyle : estimateRevealStyle,
      ]}
    >
      <Animated.View
        style={[
          styles.stateRevealAccent,
          role === 'fallback' ? styles.stateRevealAccentWarning : null,
          { transform: [{ scaleX: stateAccentScale }] },
        ]}
      />
      {children}
    </Animated.View>
  )
}

function MotionPressable({
  children,
  contentStyle,
  deferPressMs = 0,
  disabled,
  motionRole,
  onPress,
  onPressIn,
  pressedStyle,
  style,
}: {
  children: ReactNode
  contentStyle?: StyleProp<ViewStyle>
  deferPressMs?: number
  disabled?: boolean
  motionRole: MotionRole
  onPress: () => void
  onPressIn?: () => void
  pressedStyle?: StyleProp<ViewStyle>
  style: StyleProp<ViewStyle>
}) {
  const tapMotion = useRef(new Animated.Value(0)).current
  const pressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runTapMotion = () => {
    if (disabled) return
    tapMotion.setValue(0)
    Animated.sequence([
      Animated.timing(tapMotion, {
        toValue: 1,
        duration: 105,
        useNativeDriver: true,
      }),
      Animated.timing(tapMotion, {
        toValue: 0,
        duration: 210,
        useNativeDriver: true,
      }),
    ]).start()
  }

  const tapScale = tapMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, motionRole === 'cta' ? 0.99 : 0.985],
  })
  const tapTranslateY = tapMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, motionRole === 'cta' ? 0 : -1],
  })
  const tapSweepTranslate = tapMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [-80, 140],
  })

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => {
        if (disabled) return
        if (deferPressMs > 0) {
          pressTimeoutRef.current = setTimeout(onPress, deferPressMs)
          return
        }
        onPress()
      }}
      onPressIn={() => {
        clearTimeout(pressTimeoutRef.current ?? undefined)
        runTapMotion()
        onPressIn?.()
      }}
      style={styles.motionPressable}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            style,
            pressed && !disabled ? pressedStyle : null,
            disabled ? styles.motionPressableDisabled : null,
            {
              transform: [{ scale: tapScale }, { translateY: tapTranslateY }],
            },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              motionRole === 'service' ? styles.motionServiceInset : styles.chipActionSheen,
              motionRole === 'cta' ? styles.chipActionSheenCta : null,
              motionRole === 'retry' ? styles.chipActionSheenRetry : null,
              { transform: [{ translateX: tapSweepTranslate }] },
            ]}
          />
          <View style={contentStyle}>{children}</View>
          {motionRole === 'service' ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.serviceTileSweep, { transform: [{ translateX: tapSweepTranslate }, { rotate: '12deg' }] }]}
            />
          ) : null}
        </Animated.View>
      )}
    </Pressable>
  )
}

function ServiceGlyph({ type }: { type: ServiceType }) {
  return type === 'electrical' ? <ElectricalGlyph /> : <PlumbingGlyph />
}

function ElectricalGlyph() {
  return (
    <Svg width={34} height={34} viewBox="0 0 34 34" fill="none">
      <Rect x={8} y={6} width={18} height={22} rx={5} stroke={theme.forest} strokeWidth={2} />
      <Path d="M13 13h8M13 18h8" stroke={theme.forestDark} strokeWidth={2} strokeLinecap="round" />
      <Path d="m18 10-3.5 8H18l-2 6 5-9h-3l2-5Z" fill={theme.clay} opacity={0.9} />
    </Svg>
  )
}

function PlumbingGlyph() {
  return (
    <Svg width={34} height={34} viewBox="0 0 34 34" fill="none">
      <Path d="M8 13h12c3.4 0 6 2.6 6 6v4" stroke={theme.forest} strokeWidth={2} strokeLinecap="round" />
      <Path d="M7 25c3.8-2.4 7 2.4 11 0 2.5-1.5 5-1.4 8 0" stroke={theme.aqua} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={8.5} cy={13} r={3.5} fill={theme.surfaceAqua} stroke={theme.lineStrong} />
    </Svg>
  )
}

function CameraGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path d="M5.5 7.2 7 5h6l1.5 2.2h1.2c.9 0 1.6.7 1.6 1.6v5.8c0 .9-.7 1.6-1.6 1.6H4.3c-.9 0-1.6-.7-1.6-1.6V8.8c0-.9.7-1.6 1.6-1.6h1.2Z" stroke={theme.forest} strokeWidth={1.6} strokeLinejoin="round" />
      <Circle cx={10} cy={11.5} r={2.4} stroke={theme.clay} strokeWidth={1.6} />
    </Svg>
  )
}

function primaryLabel(step: PriceCheckUiStep, status: PriceCheckUiStatus) {
  if (step === 'form') return 'Để Kael kiểm tra'
  if (step === 'clarification' && status === 'loading') return 'Xem câu hỏi'
  if (step === 'clarification') return 'Xem ước tính'
  return 'Xác nhận sau'
}

function progressForStep(step: PriceCheckUiStep, status: PriceCheckUiStatus) {
  if (step === 'form') return 34
  if (step === 'clarification' && status === 'loading') return 56
  if (step === 'clarification') return 72
  return 100
}

function complexityLabel(complexity: PriceCheckEstimateCard['complexity']) {
  if (complexity === 'small') return 'Nhỏ'
  if (complexity === 'medium') return 'Trung bình'
  if (complexity === 'large') return 'Lớn'
  return 'Chưa rõ'
}

const textBase = {
  letterSpacing: 0,
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: bookingLayerTokens.canvas,
    flex: 1,
  },
  hiddenMarker: {
    height: 0,
    width: 0,
  },
  scrollContent: {
    gap: 16,
    paddingHorizontal: 18,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  brandMark: {
    alignItems: 'center',
    backgroundColor: bookingLayerTokens.primary,
    borderRadius: 15,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  brandMarkText: {
    ...textBase,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  brandCopy: {
    gap: 2,
  },
  appName: {
    ...textBase,
    color: bookingLayerTokens.text,
    fontSize: 18,
    fontWeight: '700',
  },
  appMeta: {
    ...textBase,
    color: bookingLayerTokens.muted,
    fontSize: 12,
    fontWeight: '500',
  },
  scopePill: {
    backgroundColor: bookingLayerTokens.service,
    borderColor: bookingLayerTokens.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  scopePillText: {
    ...textBase,
    color: bookingLayerTokens.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  motionSurface: {
    gap: 16,
  },
  bookingFormShell: {
    gap: 14,
  },
  bookingFormCompact: {
    gap: 11,
  },
  formHero: {
    backgroundColor: theme.surfaceJade,
    borderColor: bookingLayerTokens.borderStrong,
    borderRadius: 28,
    borderWidth: 1,
    boxShadow: '0 18px 42px rgba(12, 117, 108, 0.08)',
    justifyContent: 'space-between',
    overflow: 'hidden',
    padding: 17,
  },
  formHeroCompact: {
    borderRadius: 24,
    padding: 14,
  },
  formHeroDepthLayer: {
    backgroundColor: bookingLayerTokens.warm,
    borderColor: theme.claySoft,
    borderRadius: 24,
    borderWidth: 1,
    height: 58,
    opacity: 0.75,
    position: 'absolute',
    right: -8,
    top: 12,
    width: 92,
  },
  bookingCompactCopy: {
    maxWidth: 250,
  },
  formEyebrow: {
    ...textBase,
    color: bookingLayerTokens.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  formTitle: {
    ...textBase,
    color: bookingLayerTokens.text,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 33,
    marginTop: 5,
  },
  formSubtitle: {
    ...textBase,
    color: bookingLayerTokens.muted,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    marginTop: 7,
  },
  formHeroGlyph: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: bookingLayerTokens.raised,
    borderColor: bookingLayerTokens.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  contextStrip: {
    flexDirection: 'row',
    gap: 10,
  },
  miniSignal: {
    backgroundColor: bookingLayerTokens.base,
    borderColor: bookingLayerTokens.border,
    borderRadius: 19,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  miniSignalLabel: {
    ...textBase,
    color: bookingLayerTokens.subtle,
    fontSize: 11,
    fontWeight: '700',
  },
  miniSignalValue: {
    ...textBase,
    color: bookingLayerTokens.text,
    fontSize: 13,
    fontWeight: '700',
  },
  serviceSegment: {
    flexDirection: 'row',
    gap: 10,
  },
  formServiceCard: {
    backgroundColor: bookingLayerTokens.base,
    borderColor: bookingLayerTokens.border,
    borderRadius: 24,
    borderWidth: 1,
    flex: 1,
    minHeight: 136,
    overflow: 'hidden',
    padding: 13,
  },
  formServiceCardCompact: {
    borderRadius: 21,
    minHeight: compactServiceCardHeight,
    padding: 11,
  },
  formServiceCardActive: {
    backgroundColor: bookingLayerTokens.service,
    borderColor: bookingLayerTokens.borderStrong,
  },
  formServiceCardWater: {
    backgroundColor: bookingLayerTokens.water,
  },
  formServiceCardPressed: {
    borderColor: bookingLayerTokens.primary,
  },
  formServiceContent: {
    flex: 1,
    gap: 7,
  },
  serviceIconPlate: {
    alignItems: 'center',
    backgroundColor: bookingLayerTokens.raised,
    borderRadius: 18,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  serviceIconPlateWater: {
    backgroundColor: '#F6FEFD',
  },
  serviceTitle: {
    ...textBase,
    color: bookingLayerTokens.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  serviceSubtitle: {
    ...textBase,
    color: bookingLayerTokens.muted,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  bookingFormCard: {
    backgroundColor: bookingLayerTokens.base,
    borderColor: bookingLayerTokens.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  fieldHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  fieldTitle: {
    ...textBase,
    color: bookingLayerTokens.text,
    fontSize: 15,
    fontWeight: '700',
  },
  fieldMeta: {
    ...textBase,
    color: bookingLayerTokens.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  problemChip: {
    backgroundColor: bookingLayerTokens.depth,
    borderColor: bookingLayerTokens.border,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: minimumTouchTarget,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  problemChipPressed: {
    borderColor: bookingLayerTokens.primary,
  },
  problemChipActive: {
    backgroundColor: bookingLayerTokens.primary,
    borderColor: bookingLayerTokens.primary,
  },
  problemChipContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  chipDot: {
    backgroundColor: bookingLayerTokens.borderStrong,
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  chipDotActive: {
    backgroundColor: '#FFFFFF',
  },
  problemChipText: {
    ...textBase,
    color: bookingLayerTokens.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  problemChipTextActive: {
    color: '#FFFFFF',
  },
  textAreaFrame: {
    backgroundColor: bookingLayerTokens.depth,
    borderRadius: 20,
    borderWidth: 1,
  },
  descriptionInput: {
    ...textBase,
    color: bookingLayerTokens.text,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 21,
    minHeight: 116,
    padding: 13,
  },
  inlineError: {
    ...textBase,
    color: theme.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  mediaRow: {
    flexDirection: 'row',
    gap: 9,
  },
  mediaSlot: {
    alignItems: 'center',
    backgroundColor: bookingLayerTokens.depth,
    borderColor: bookingLayerTokens.border,
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 7,
    minHeight: 78,
    justifyContent: 'center',
    padding: 8,
  },
  mediaIconDot: {
    alignItems: 'center',
    backgroundColor: bookingLayerTokens.raised,
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  mediaSlotText: {
    ...textBase,
    color: bookingLayerTokens.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  questionSheet: {
    gap: 13,
  },
  summaryStrip: {
    alignItems: 'center',
    backgroundColor: bookingLayerTokens.service,
    borderColor: bookingLayerTokens.borderStrong,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    padding: 13,
  },
  summaryIcon: {
    alignItems: 'center',
    backgroundColor: bookingLayerTokens.raised,
    borderRadius: 18,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  summaryCopy: {
    flex: 1,
    gap: 3,
  },
  summaryLabel: {
    ...textBase,
    color: bookingLayerTokens.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  summaryTitle: {
    ...textBase,
    color: bookingLayerTokens.text,
    fontSize: 16,
    fontWeight: '700',
  },
  questionCard: {
    backgroundColor: bookingLayerTokens.base,
    borderColor: bookingLayerTokens.border,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    padding: 14,
  },
  questionIndex: {
    alignItems: 'center',
    backgroundColor: bookingLayerTokens.service,
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  questionIndexText: {
    ...textBase,
    color: bookingLayerTokens.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  questionBody: {
    flex: 1,
    gap: 11,
  },
  questionText: {
    ...textBase,
    color: bookingLayerTokens.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  answerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  answerChip: {
    backgroundColor: bookingLayerTokens.depth,
    borderColor: bookingLayerTokens.border,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: minimumTouchTarget,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  answerChipPressed: {
    borderColor: bookingLayerTokens.primary,
  },
  answerChipActive: {
    backgroundColor: bookingLayerTokens.primary,
    borderColor: bookingLayerTokens.primary,
  },
  answerChipContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerText: {
    ...textBase,
    color: bookingLayerTokens.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  answerTextActive: {
    color: '#FFFFFF',
  },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: bookingLayerTokens.service,
    borderColor: bookingLayerTokens.borderStrong,
    borderRadius: 28,
    borderWidth: 1,
    gap: 12,
    justifyContent: 'center',
    minHeight: 252,
    padding: 24,
  },
  loadingIconRing: {
    alignItems: 'center',
    backgroundColor: bookingLayerTokens.raised,
    borderRadius: 999,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  loadingTitle: {
    ...textBase,
    color: bookingLayerTokens.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  loadingText: {
    ...textBase,
    color: bookingLayerTokens.muted,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
    textAlign: 'center',
  },
  estimateCard: {
    backgroundColor: bookingLayerTokens.base,
    borderColor: bookingLayerTokens.borderStrong,
    borderRadius: 30,
    borderWidth: 1,
    boxShadow: '0 20px 44px rgba(12, 117, 108, 0.09)',
    gap: 15,
    padding: 18,
  },
  fallbackCard: {
    backgroundColor: bookingLayerTokens.warm,
    borderColor: theme.claySoft,
  },
  estimateTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  estimateIcon: {
    alignItems: 'center',
    backgroundColor: bookingLayerTokens.service,
    borderRadius: 22,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  estimateHeading: {
    flex: 1,
    gap: 4,
  },
  estimateLabel: {
    ...textBase,
    color: bookingLayerTokens.subtle,
    fontSize: 12,
    fontWeight: '700',
  },
  estimateProblem: {
    ...textBase,
    color: bookingLayerTokens.text,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  priceBand: {
    backgroundColor: bookingLayerTokens.warm,
    borderColor: bookingLayerTokens.border,
    borderRadius: 23,
    borderWidth: 1,
    gap: 4,
    padding: 15,
  },
  priceLabel: {
    ...textBase,
    color: bookingLayerTokens.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  priceValue: {
    ...textBase,
    color: bookingLayerTokens.primaryDark,
    fontSize: 29,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  priceValueMuted: {
    color: bookingLayerTokens.copper,
    fontSize: 24,
  },
  priceMeta: {
    ...textBase,
    color: bookingLayerTokens.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  reasonStack: {
    gap: 9,
  },
  reasonRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  reasonBullet: {
    backgroundColor: bookingLayerTokens.primary,
    borderRadius: 999,
    height: 7,
    marginTop: 7,
    width: 7,
  },
  reasonText: {
    ...textBase,
    color: bookingLayerTokens.muted,
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },
  advisoryBox: {
    backgroundColor: bookingLayerTokens.depth,
    borderColor: bookingLayerTokens.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
  },
  advisoryText: {
    ...textBase,
    color: bookingLayerTokens.text,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  disclaimerBox: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderColor: bookingLayerTokens.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
  },
  disclaimerText: {
    ...textBase,
    color: bookingLayerTokens.muted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  retryInlineButton: {
    alignItems: 'center',
    backgroundColor: bookingLayerTokens.raised,
    borderColor: theme.claySoft,
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: minimumTouchTarget,
    overflow: 'hidden',
    paddingHorizontal: 14,
  },
  retryInlineButtonPressed: {
    backgroundColor: bookingLayerTokens.warm,
  },
  retryInlineContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryInlineText: {
    ...textBase,
    color: bookingLayerTokens.copper,
    fontSize: 14,
    fontWeight: '700',
  },
  stateRevealShell: {
    overflow: 'hidden',
    position: 'relative',
  },
  stateRevealAccent: {
    backgroundColor: bookingLayerTokens.primary,
    borderRadius: 999,
    height: 4,
    left: 22,
    position: 'absolute',
    right: 22,
    top: 0,
    zIndex: 2,
  },
  stateRevealAccentWarning: {
    backgroundColor: bookingLayerTokens.copper,
  },
  bottomBar: {
    backgroundColor: 'rgba(248, 252, 250, 0.96)',
    borderColor: bookingLayerTokens.border,
    borderTopWidth: 1,
    bottom: 0,
    gap: 12,
    left: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    position: 'absolute',
    right: 0,
  },
  bottomProgressTrack: {
    backgroundColor: bookingLayerTokens.border,
    borderRadius: 999,
    height: 5,
    overflow: 'hidden',
  },
  bottomProgressFill: {
    backgroundColor: bookingLayerTokens.primary,
    borderRadius: 999,
    height: 5,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: bookingLayerTokens.base,
    borderColor: bookingLayerTokens.border,
    borderRadius: 18,
    borderWidth: 1,
    flex: 0.82,
    justifyContent: 'center',
    minHeight: 54,
    overflow: 'hidden',
    paddingHorizontal: 14,
  },
  secondaryButtonPressed: {
    backgroundColor: bookingLayerTokens.service,
    borderColor: bookingLayerTokens.borderStrong,
  },
  secondaryButtonText: {
    ...textBase,
    color: bookingLayerTokens.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: bookingLayerTokens.primary,
    borderRadius: 18,
    boxShadow: '0 10px 22px rgba(12, 117, 108, 0.18)',
    flex: 1.45,
    justifyContent: 'center',
    minHeight: 54,
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  primaryButtonPressed: {
    backgroundColor: bookingLayerTokens.primaryDark,
  },
  primaryButtonDisabled: {
    backgroundColor: bookingLayerTokens.borderStrong,
    boxShadow: '0 0 0 rgba(0,0,0,0)',
  },
  primaryButtonText: {
    ...textBase,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  ctaContent: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  motionPressable: {
    minHeight: minimumTouchTarget,
  },
  motionPressableDisabled: {
    opacity: 0.72,
  },
  motionServiceInset: {
    borderColor: 'rgba(23, 169, 149, 0.38)',
    borderRadius: 20,
    borderWidth: 1.5,
    bottom: 8,
    left: 8,
    position: 'absolute',
    right: 8,
    top: 8,
  },
  serviceTileSweep: {
    backgroundColor: 'rgba(255, 253, 248, 0.72)',
    bottom: -36,
    position: 'absolute',
    top: -36,
    width: 44,
  },
  chipActionSheen: {
    backgroundColor: 'rgba(23, 169, 149, 0.36)',
    borderRadius: 999,
    bottom: 6,
    height: 2,
    left: 10,
    position: 'absolute',
    width: 56,
  },
  chipActionSheenCta: {
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
    bottom: 7,
    left: 18,
    width: 80,
  },
  chipActionSheenRetry: {
    backgroundColor: 'rgba(184, 111, 50, 0.34)',
    bottom: 7,
    left: 16,
    width: 72,
  },
})
