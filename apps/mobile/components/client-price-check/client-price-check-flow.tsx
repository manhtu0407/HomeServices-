import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  type GestureResponderEvent,
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
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg'
import { PROBLEM_CHIPS, type ServiceType } from '@home-services/shared'
import { Colors } from '@/constants/colors'

type PriceCheckUiStep = 'hub' | 'problem' | 'details' | 'clarification' | 'estimate'

type PriceCheckUiStatus =
  | 'idle'
  | 'editing'
  | 'loading'
  | 'needs_clarification'
  | 'estimate_ready'
  | 'baseline_fallback'
  | 'fallback'
  | 'error'

type PriceCheckDraft = {
  serviceType: ServiceType | null
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

type StepDefinition = {
  key: Exclude<PriceCheckUiStep, 'hub'>
  label: string
}

type ServiceOption = {
  type: ServiceType
  title: string
  subtitle: string
  microcopy: string
}

type ClarificationQuestion = {
  id: string
  question: string
  options: string[]
}

type MotionRole = 'service' | 'chip' | 'answer' | 'cta' | 'retry'

const theme = Colors.priceCheck
const minimumTouchTarget = 44
const compactHeroHeight = 96
const roomyHeroHeight = 128
const compactServiceCardHeight = 128

const PRICE_DISCLAIMER =
  'Đây là ước tính dựa trên thị trường. Giá thực tế sẽ được xác nhận bởi thợ trước khi bắt đầu.'

const FLOW_STEPS: StepDefinition[] = [
  { key: 'problem', label: 'Vấn đề' },
  { key: 'details', label: 'Mô tả' },
  { key: 'clarification', label: 'Hỏi thêm' },
  { key: 'estimate', label: 'Ước tính' },
]

const SERVICES: ServiceOption[] = [
  {
    type: 'electrical',
    title: 'Sửa điện',
    subtitle: 'Ổ cắm, đèn, cầu dao, thiết bị nhỏ',
    microcopy: 'Ưu tiên an toàn điện trong căn hộ.',
  },
  {
    type: 'plumbing',
    title: 'Sửa nước',
    subtitle: 'Rò rỉ, tắc nghẽn, vòi, áp nước',
    microcopy: 'Khoanh vùng nhanh vị trí rò/tắc.',
  },
]

const QUESTIONS: Record<ServiceType, ClarificationQuestion[]> = {
  electrical: [
    {
      id: 'breaker',
      question: 'Cầu dao có tự ngắt lại sau khi bật lên không?',
      options: ['Có, ngắt lại', 'Không', 'Chưa rõ'],
    },
    {
      id: 'burning',
      question: 'Có mùi khét hoặc vết cháy quanh ổ cắm không?',
      options: ['Có dấu hiệu', 'Không thấy', 'Cần gửi ảnh'],
    },
  ],
  plumbing: [
    {
      id: 'scope',
      question: 'Vấn đề xảy ra ở một vị trí hay nhiều vị trí?',
      options: ['Một vị trí', 'Nhiều vị trí', 'Chưa rõ'],
    },
    {
      id: 'leak',
      question: 'Nước rò liên tục hay chỉ khi mở vòi/xả nước?',
      options: ['Rò liên tục', 'Khi sử dụng', 'Chưa rõ'],
    },
  ],
}

const INITIAL_DRAFT: PriceCheckDraft = {
  serviceType: null,
  problemChips: [],
  description: '',
  photoUris: [],
  addressLabel: 'Chung cư The Sun, Quận 7',
  clarificationAnswers: {},
}

const ESTIMATE_FIXTURE: PriceCheckEstimateCard = {
  problemLabel: 'Rò rỉ ống dưới bồn rửa',
  complexity: 'medium',
  priceRangeLabel: '320.000 - 480.000đ',
  confidenceLabel: 'Khá chắc',
  reasons: [
    'Vấn đề thuộc nhóm rò rỉ nhỏ đến vừa.',
    'Thợ thường cần kiểm tra ron, đầu nối và đoạn ống dưới bồn.',
  ],
  advisory: 'Nếu nước rò liên tục, hãy khóa van nhánh trước khi thợ tới.',
  disclaimer: PRICE_DISCLAIMER,
  source: 'kael',
}

const FALLBACK_ESTIMATE: PriceCheckEstimateCard = {
  problemLabel: 'Chưa đủ dữ liệu an toàn',
  complexity: 'unknown',
  priceRangeLabel: 'Chưa thể ước tính',
  confidenceLabel: 'Cần xác nhận thêm',
  reasons: [
    'Thông tin hiện tại chưa đủ để đưa ra khoảng giá đáng tin cậy.',
    'Ứng dụng sẽ không tự tạo giá nếu baseline an toàn chưa có.',
  ],
  advisory: 'Thêm ảnh hoặc mô tả vị trí hư hỏng để kiểm tra lại.',
  disclaimer: PRICE_DISCLAIMER,
  source: 'baseline_fallback',
}

export function ClientPriceCheckFlow() {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const screenMotion = useRef(new Animated.Value(1)).current
  const pressMotion = useRef(new Animated.Value(0)).current
  const scenePressMotion = useRef(new Animated.Value(0)).current
  const [step, setStep] = useState<PriceCheckUiStep>('hub')
  const [status, setStatus] = useState<PriceCheckUiStatus>('idle')
  const [draft, setDraft] = useState<PriceCheckDraft>(INITIAL_DRAFT)

  const isCompact = width < 430
  const isShortScreen = height < 760
  const hubFirstViewport = step === 'hub' && (isCompact || isShortScreen)
  const serviceType = draft.serviceType ?? 'plumbing'
  const chips = useMemo(() => PROBLEM_CHIPS[serviceType], [serviceType])
  const questions = QUESTIONS[serviceType]
  const flowStepIndex = Math.max(
    0,
    FLOW_STEPS.findIndex((item) => item.key === step)
  )
  const isEstimateFallback =
    status === 'fallback' || status === 'baseline_fallback'
  const estimate = isEstimateFallback ? FALLBACK_ESTIMATE : ESTIMATE_FIXTURE
  const hasEnoughDescription = draft.description.trim().length >= 16
  const hasAnsweredQuestions = questions.every(
    (question) => draft.clarificationAnswers[question.id]
  )

  useEffect(() => {
    screenMotion.setValue(0)
    Animated.timing(screenMotion, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start()
  }, [screenMotion, step, status])

  const runPressMotion = () => {
    pressMotion.setValue(0)
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
    ]).start()
  }

  const runSceneMotion = () => {
    scenePressMotion.setValue(0)
    Animated.sequence([
      Animated.timing(scenePressMotion, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scenePressMotion, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start()
  }

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

  const scenePressScale = scenePressMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.985],
  })

  const startServiceFlow = (selectedServiceType: ServiceType) => {
    setDraft((current) => ({
      ...current,
      serviceType: selectedServiceType,
      problemChips: [],
      clarificationAnswers: {},
    }))
    setStep('problem')
    setStatus('editing')
  }

  const toggleChip = (chip: string) => {
    runPressMotion()
    setDraft((current) => {
      const exists = current.problemChips.includes(chip)
      const problemChips = exists
        ? current.problemChips.filter((item) => item !== chip)
        : [...current.problemChips, chip].slice(0, 3)

      return { ...current, problemChips }
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

  const resetDraft = () => {
    runPressMotion()
    setStep('hub')
    setStatus('idle')
    setDraft(INITIAL_DRAFT)
  }

  const retryPriceCheck = () => {
    runPressMotion()
    setStep('clarification')
    setStatus('loading')
  }

  const goBack = () => {
    runPressMotion()
    if (step === 'estimate') {
      setStep('clarification')
      setStatus('needs_clarification')
      return
    }
    if (step === 'clarification') {
      setStep('details')
      setStatus('editing')
      return
    }
    if (step === 'details') {
      setStep('problem')
      setStatus('editing')
      return
    }
    if (step === 'problem') {
      setStep('hub')
      setStatus('idle')
    }
  }

  const continueFlow = () => {
    runPressMotion()

    if (step === 'problem') {
      if (draft.problemChips.length === 0) {
        setStatus('error')
        return
      }
      setStep('details')
      setStatus('editing')
      return
    }

    if (step === 'details') {
      if (!hasEnoughDescription) {
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
      const hasUnclearAnswer = Object.values(draft.clarificationAnswers).some(
        (answer) => answer === 'Chưa rõ'
      )
      setStep('estimate')
      setStatus(hasUnclearAnswer ? 'baseline_fallback' : 'estimate_ready')
      return
    }

    if (step === 'estimate') {
      setStatus(isEstimateFallback ? 'fallback' : 'estimate_ready')
    }
  }

  const primaryDisabled =
    (step === 'problem' && draft.problemChips.length === 0) ||
    (step === 'clarification' &&
      status === 'needs_clarification' &&
      !hasAnsweredQuestions)

  return (
    <View style={styles.root} testID="production-price-check-flow">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + (hubFirstViewport ? 10 : 18),
            paddingBottom:
              insets.bottom + (step === 'hub' ? (hubFirstViewport ? 18 : 28) : 112),
          },
        ]}
      >
        {step === 'hub' ? (
          <Animated.View
            style={[styles.screenShell, screenStyle]}
            testID="services-hub-clean"
          >
            <HubStep
              addressLabel={draft.addressLabel}
              isCompact={isCompact}
              hubFirstViewport={hubFirstViewport}
              scenePressScale={scenePressScale}
              onServicePressIn={() => {
                runPressMotion()
                runSceneMotion()
              }}
              onSelectService={startServiceFlow}
            />
          </Animated.View>
        ) : (
          <>
            <FlowHeader
              step={step}
              draft={draft}
              activeStepIndex={flowStepIndex}
            />
            <Animated.View style={[styles.screenShell, screenStyle]}>
              {step === 'problem' ? (
                <ProblemStep
                  chips={chips}
                  draft={draft}
                  onToggleChip={toggleChip}
                  status={status}
                />
              ) : null}

              {step === 'details' ? (
                <DetailsStep
                  draft={draft}
                  status={status}
                  onDescriptionChange={(description) => {
                    setDraft((current) => ({ ...current, description }))
                    setStatus('editing')
                  }}
                />
              ) : null}

              {step === 'clarification' ? (
                <ClarificationStep
                  draft={draft}
                  questions={questions}
                  status={status}
                  onAnswer={answerQuestion}
                />
              ) : null}

              {step === 'estimate' ? (
                <EstimateStep
                  estimate={estimate}
                  draft={draft}
                  isFallback={isEstimateFallback}
                  onRetry={retryPriceCheck}
                />
              ) : null}
            </Animated.View>
          </>
        )}
      </ScrollView>

      {step !== 'hub' ? (
        <BottomActionBar
          activeStepIndex={flowStepIndex}
          primaryDisabled={primaryDisabled}
          primaryLabel={getPrimaryLabel(step, status)}
          secondaryLabel={step === 'problem' ? 'Dịch vụ' : 'Quay lại'}
          onPrimary={continueFlow}
          onSecondary={goBack}
          bottomInset={insets.bottom}
        />
      ) : null}
    </View>
  )
}

function HubStep({
  addressLabel,
  isCompact,
  hubFirstViewport,
  scenePressScale,
  onServicePressIn,
  onSelectService,
}: {
  addressLabel: string
  isCompact: boolean
  hubFirstViewport: boolean
  scenePressScale: Animated.AnimatedInterpolation<string | number>
  onServicePressIn: () => void
  onSelectService: (serviceType: ServiceType) => void
}) {
  return (
    <View style={[styles.hubShell, hubFirstViewport ? styles.hubShellCompact : null]}>
      <View style={styles.appBar}>
        <View style={styles.brandCluster}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>H</Text>
          </View>
          <View>
            <Text style={styles.appName}>HomeServices</Text>
            <Text numberOfLines={1} style={styles.appMeta}>Sửa chữa căn hộ</Text>
          </View>
        </View>
        <View style={styles.addressPill}>
          <Text style={styles.addressPillText}>Q.7</Text>
        </View>
      </View>

      <Animated.View
        style={[
          styles.heroCard,
          hubFirstViewport ? styles.heroCardCompact : null,
          { transform: [{ scale: scenePressScale }] },
        ]}
      >
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>Đặt lịch sửa chữa</Text>
          <Text numberOfLines={2} style={styles.heroTitle}>Cần sửa gì hôm nay?</Text>
          <Text numberOfLines={2} style={styles.heroText}>
            Chọn dịch vụ để xem khoảng giá trước khi tìm thợ.
          </Text>
        </View>
        <HomeServicesScene compact={hubFirstViewport || isCompact} />
      </Animated.View>

      <View style={[styles.addressCard, hubFirstViewport ? styles.addressCardCompact : null]}>
        <View style={styles.pinBubble}>
          <Text style={styles.pinText}>⌂</Text>
        </View>
        <View style={styles.addressCopy}>
          <Text style={styles.addressLabel}>Địa chỉ đang dùng</Text>
          <Text numberOfLines={1} style={styles.addressTitle}>{addressLabel}</Text>
        </View>
        <Text style={styles.addressAction}>Sửa</Text>
      </View>

      <View style={styles.hubSection}>
        <View style={styles.hubSectionHeader}>
          <Text style={styles.hubSectionTitle}>Dịch vụ phổ biến</Text>
          <Text style={styles.hubSectionAction}>2 nhóm</Text>
        </View>
        <View style={styles.hubServiceGrid}>
          {SERVICES.map((service) => (
            <MotionPressable
              key={service.type}
              motionRole="service"
              deferPressMs={150}
              onPressIn={onServicePressIn}
              onPress={() => onSelectService(service.type)}
              style={[
                styles.hubServiceCard,
                hubFirstViewport ? styles.hubServiceCardCompact : null,
              ]}
              pressedStyle={styles.hubServiceCardPressed}
              contentStyle={styles.hubServiceContent}
            >
              <View
                style={[
                  styles.hubServiceIcon,
                  hubFirstViewport ? styles.hubServiceIconCompact : null,
                  service.type === 'electrical'
                    ? styles.serviceIconElectric
                    : styles.serviceIconWater,
                ]}
              >
                {service.type === 'electrical' ? (
                  <ElectricalServiceIcon />
                ) : (
                  <PlumbingServiceIcon />
                )}
              </View>
              <Text numberOfLines={1} style={styles.hubServiceTitle}>{service.title}</Text>
              <Text numberOfLines={2} style={styles.hubServiceSubtitle}>{service.subtitle}</Text>
              <Text numberOfLines={hubFirstViewport ? 1 : 2} style={styles.hubServiceMicrocopy}>{service.microcopy}</Text>
            </MotionPressable>
          ))}
        </View>
      </View>

      <View style={styles.hubInfoRow}>
        <InfoTile title="Ước tính trước" text="Hiển thị khoảng giá, không phải giá cuối." />
        <InfoTile title="Không tự đặt" text="Chỉ tìm thợ sau khi bạn xác nhận." />
      </View>
    </View>
  )
}

function FlowHeader({
  step,
  draft,
  activeStepIndex,
}: {
  step: PriceCheckUiStep
  draft: PriceCheckDraft
  activeStepIndex: number
}) {
  return (
    <View style={styles.flowHeader}>
      <View style={styles.flowTopRow}>
        <View>
          <Text style={styles.flowEyebrow}>Kiểm tra giá</Text>
          <Text style={styles.flowTitle}>{flowTitle(step)}</Text>
        </View>
        <View style={styles.flowServiceBadge}>
          <Text style={styles.flowServiceText}>
            {draft.serviceType === 'electrical' ? 'Điện' : 'Nước'}
          </Text>
        </View>
      </View>
      <StepRail activeStepIndex={activeStepIndex} />
    </View>
  )
}

function StepRail({ activeStepIndex }: { activeStepIndex: number }) {
  return (
    <View style={styles.stepRail}>
      {FLOW_STEPS.map((item, index) => {
        const isActive = index === activeStepIndex
        const isDone = index < activeStepIndex

        return (
          <View key={item.key} style={styles.stepItem}>
            <View
              style={[
                styles.stepDot,
                isDone ? styles.stepDotDone : null,
                isActive ? styles.stepDotActive : null,
              ]}
            />
            <Text style={[styles.stepLabel, isActive ? styles.stepLabelActive : null]}>
              {item.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

function ProblemStep({
  chips,
  draft,
  status,
  onToggleChip,
}: {
  chips: readonly string[]
  draft: PriceCheckDraft
  status: PriceCheckUiStatus
  onToggleChip: (chip: string) => void
}) {
  const hasError = status === 'error'

  return (
    <View style={styles.sectionStack}>
      <SectionHeader
        eyebrow="A2"
        title="Chọn vấn đề gần nhất"
        text="Chọn tối đa 3 mục để giữ luồng gọn và giúp Kael hiểu đúng phạm vi."
      />
      <View style={styles.problemPanel}>
        <View style={styles.chipGrid}>
          {chips.map((chip) => {
            const selected = draft.problemChips.includes(chip)
            return (
              <MotionPressable
                key={chip}
                motionRole="chip"
                onPress={() => onToggleChip(chip)}
                style={[styles.problemChip, selected ? styles.problemChipSelected : null]}
                pressedStyle={styles.problemChipPressed}
                contentStyle={styles.problemChipContent}
              >
                <View style={[styles.chipIcon, selected ? styles.chipIconSelected : null]}>
                  <ProblemGlyph selected={selected} />
                </View>
                <Text
                  style={[
                    styles.problemChipText,
                    selected ? styles.problemChipTextSelected : null,
                  ]}
                >
                  {chip}
                </Text>
              </MotionPressable>
            )
          })}
        </View>
      </View>
      {hasError ? (
        <StateMessage
          tone="error"
          title="Cần chọn ít nhất một vấn đề"
          text="Việc chọn vấn đề giúp app không hỏi quá nhiều ở bước sau."
        />
      ) : null}
    </View>
  )
}

function DetailsStep({
  draft,
  status,
  onDescriptionChange,
}: {
  draft: PriceCheckDraft
  status: PriceCheckUiStatus
  onDescriptionChange: (description: string) => void
}) {
  const hasError = status === 'error'

  return (
    <View style={styles.sectionStack}>
      <SectionHeader
        eyebrow="A3"
        title="Mô tả hiện trạng"
        text="Nói rõ vị trí, thời điểm xảy ra và dấu hiệu nguy hiểm nếu có."
      />

      <View style={styles.summaryStrip}>
        <View style={styles.summaryIcon}>
          {draft.serviceType === 'electrical' ? (
            <ElectricalServiceIcon size={34} />
          ) : (
            <PlumbingServiceIcon size={34} />
          )}
        </View>
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryLabel}>Đang kiểm tra</Text>
          <Text style={styles.summaryTitle}>{draft.problemChips.join(', ')}</Text>
          <Text style={styles.summaryMeta}>{draft.addressLabel}</Text>
        </View>
      </View>

      <View style={styles.inputPanel}>
        <View style={styles.inputHeader}>
          <Text style={styles.inputLabel}>Mô tả cho Kael</Text>
          <Text style={styles.inputCount}>{draft.description.trim().length}/2000</Text>
        </View>
        <TextInput
          multiline
          value={draft.description}
          onChangeText={onDescriptionChange}
          placeholder="Ví dụ: nước rò dưới bồn rửa, chỉ chảy khi mở vòi..."
          placeholderTextColor={theme.muted}
          textAlignVertical="top"
          style={[styles.descriptionInput, hasError ? styles.descriptionInputError : null]}
        />
        {hasError ? (
          <StateMessage
            tone="error"
            title="Cần mô tả rõ hơn"
            text="Hãy thêm vị trí và dấu hiệu chính để ứng dụng không đưa ra ước tính thiếu an toàn."
          />
        ) : null}
      </View>

      <View style={styles.mediaPanel}>
        <Text style={styles.panelTitle}>Ảnh tham khảo</Text>
        <View style={styles.mediaRow}>
          <MediaSlot label="Vị trí" />
          <MediaSlot label="Cận cảnh" />
          <MediaSlot label="Toàn cảnh" />
        </View>
      </View>
    </View>
  )
}

function ClarificationStep({
  draft,
  questions,
  status,
  onAnswer,
}: {
  draft: PriceCheckDraft
  questions: ClarificationQuestion[]
  status: PriceCheckUiStatus
  onAnswer: (questionId: string, answer: string) => void
}) {
  if (status === 'loading') {
    return (
      <View style={styles.sectionStack}>
        <SectionHeader
          eyebrow="A4"
          title="Kael đang đọc tín hiệu"
          text="Ứng dụng đang kiểm tra mô tả, nhóm vấn đề và mức độ không chắc chắn trước khi hỏi thêm."
        />
        <StateReveal role="loading">
          <View style={styles.loadingCard}>
            <View style={styles.loadingIconRing}>
              <ActivityIndicator color={theme.forest} />
            </View>
            <Text style={styles.loadingTitle}>Đang chuẩn bị câu hỏi cần thiết</Text>
            <Text style={styles.loadingText}>
              Kael chỉ nên hỏi thêm khi câu trả lời có thể đổi độ phức tạp hoặc khoảng giá.
            </Text>
          </View>
        </StateReveal>
      </View>
    )
  }

  return (
    <View style={styles.sectionStack}>
      <SectionHeader
        eyebrow="A4"
        title="Xác nhận vài chi tiết"
        text="Câu hỏi ngắn, có mục đích rõ. Nếu chưa rõ, app sẽ chuyển sang trạng thái an toàn."
      />

      {questions.map((question, index) => (
        <View key={question.id} style={styles.questionCard}>
          <View style={styles.questionIndex}>
            <Text style={styles.questionIndexText}>{index + 1}</Text>
          </View>
          <View style={styles.questionBody}>
            <Text style={styles.questionText}>{question.question}</Text>
            <View style={styles.answerGrid}>
              {question.options.map((option) => {
                const selected = draft.clarificationAnswers[question.id] === option
                return (
                  <MotionPressable
                    key={option}
                    motionRole="answer"
                    onPress={() => onAnswer(question.id, option)}
                    style={[styles.answerChip, selected ? styles.answerChipSelected : null]}
                    pressedStyle={styles.answerChipPressed}
                    contentStyle={styles.answerChipContent}
                  >
                    <Text
                      style={[
                        styles.answerText,
                        selected ? styles.answerTextSelected : null,
                      ]}
                    >
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

function EstimateStep({
  estimate,
  draft,
  isFallback,
  onRetry,
}: {
  estimate: PriceCheckEstimateCard
  draft: PriceCheckDraft
  isFallback: boolean
  onRetry: () => void
}) {
  return (
    <View style={styles.sectionStack}>
      <SectionHeader
        eyebrow="A5"
        title={isFallback ? 'Chưa thể báo giá an toàn' : 'Ước tính minh bạch'}
        text={
          isFallback
            ? 'App ưu tiên nói rõ khi dữ liệu chưa đủ thay vì hiển thị một con số không đáng tin.'
            : 'Khoảng giá được trình bày như tham khảo, không phải giá cuối cùng.'
        }
      />

      <StateReveal role={isFallback ? 'fallback' : 'estimate'}>
        <View style={[styles.estimateCard, isFallback ? styles.fallbackCard : null]}>
          <View style={styles.estimateTop}>
            <View style={styles.estimateIcon}>
              <EstimateGlyph fallback={isFallback} />
            </View>
            <View style={styles.estimateHeading}>
              <Text style={styles.estimateLabel}>{draft.addressLabel}</Text>
              <Text style={styles.estimateProblem}>{estimate.problemLabel}</Text>
            </View>
          </View>

          <View style={styles.priceBand}>
            <Text style={styles.priceLabel}>
              {estimate.source === 'kael' ? 'Khoảng giá tham khảo' : 'Trạng thái an toàn'}
            </Text>
            <Text selectable style={[styles.priceValue, isFallback ? styles.priceValueMuted : null]}>
              {estimate.priceRangeLabel}
            </Text>
            <Text style={styles.priceMeta}>
              {estimate.confidenceLabel} · Độ phức tạp {complexityLabel(estimate.complexity)}
            </Text>
          </View>

          <View style={styles.reasonStack}>
            {estimate.reasons.map((reason) => (
              <View key={reason} style={styles.reasonRow}>
                <View style={styles.reasonBullet} />
                <Text style={styles.reasonText}>{reason}</Text>
              </View>
            ))}
          </View>

          {estimate.advisory ? (
            <StateMessage tone={isFallback ? 'warning' : 'success'} title="Lưu ý" text={estimate.advisory} />
          ) : null}

          <View style={styles.disclaimerBox}>
            <Text selectable style={styles.disclaimerText}>
              {estimate.disclaimer}
            </Text>
          </View>
        </View>
      </StateReveal>

      {isFallback ? (
        <MotionPressable
          motionRole="retry"
          onPress={onRetry}
          style={styles.retryInlineButton}
          pressedStyle={styles.retryInlineButtonPressed}
          contentStyle={styles.retryInlineContent}
        >
          <Text style={styles.retryInlineText}>Kiểm tra lại sau khi bổ sung thông tin</Text>
        </MotionPressable>
      ) : null}
    </View>
  )
}

function BottomActionBar({
  activeStepIndex,
  primaryDisabled,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  bottomInset,
}: {
  activeStepIndex: number
  primaryDisabled: boolean
  primaryLabel: string
  secondaryLabel: string
  onPrimary: () => void
  onSecondary: () => void
  bottomInset: number
}) {
  return (
    <View style={[styles.bottomBar, { paddingBottom: bottomInset + 14 }]}>
      <View style={styles.bottomProgressTrack}>
        <View style={[styles.bottomProgressFill, { width: `${((activeStepIndex + 1) / 4) * 100}%` }]} />
      </View>
      <View style={styles.actionRow}>
        <MotionPressable
          motionRole="cta"
          onPress={onSecondary}
          style={styles.secondaryButton}
          pressedStyle={styles.secondaryButtonPressed}
          contentStyle={styles.ctaContent}
        >
          <Text numberOfLines={1} style={styles.secondaryButtonText}>{secondaryLabel}</Text>
        </MotionPressable>
        <MotionPressable
          motionRole="cta"
          disabled={primaryDisabled}
          onPress={primaryDisabled ? undefined : onPrimary}
          style={[styles.primaryButton, primaryDisabled ? styles.primaryButtonDisabled : null]}
          pressedStyle={styles.primaryButtonPressed}
          contentStyle={styles.ctaContent}
        >
          <Text numberOfLines={2} style={styles.primaryButtonText}>{primaryLabel}</Text>
        </MotionPressable>
      </View>
    </View>
  )
}

function SectionHeader({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string
  title: string
  text: string
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionText}>{text}</Text>
    </View>
  )
}

function InfoTile({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.infoTile}>
      <Text style={styles.infoTitle}>{title}</Text>
      <Text style={styles.infoText}>{text}</Text>
    </View>
  )
}

function StateReveal({
  role,
  children,
}: {
  role: 'loading' | 'estimate' | 'fallback'
  children: ReactNode
}) {
  const stateMotion = useRef(new Animated.Value(0)).current

  useEffect(() => {
    stateMotion.setValue(0)
    Animated.parallel([
      Animated.timing(stateMotion, {
        toValue: 1,
        duration: role === 'loading' ? 260 : 320,
        useNativeDriver: true,
      }),
    ]).start()
  }, [role, stateMotion])

  const loadingRevealStyle = {
    opacity: stateMotion,
    transform: [
      {
        translateY: stateMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  }

  const stateAccentScale = stateMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 1],
  })

  const estimateRevealStyle = {
    opacity: stateMotion,
    transform: [
      {
        translateY: stateMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [24, 0],
        }),
      },
      {
        scale: stateMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [0.965, 1],
        }),
      },
    ],
  }

  return (
    <Animated.View
      style={[
        styles.stateRevealShell,
        role === 'loading' ? loadingRevealStyle : estimateRevealStyle,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.stateRevealAccent,
          role === 'fallback' ? styles.stateRevealAccentWarning : null,
          {
            opacity: stateMotion,
            transform: [{ scaleX: stateAccentScale }],
          },
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
  onPress?: () => void
  onPressIn?: (event: GestureResponderEvent) => void
  pressedStyle?: StyleProp<ViewStyle>
  style?: StyleProp<ViewStyle>
}) {
  const tapMotion = useRef(new Animated.Value(0)).current
  const pressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (pressTimeoutRef.current) {
        clearTimeout(pressTimeoutRef.current)
      }
    }
  }, [])

  const runTapMotion = () => {
    tapMotion.setValue(0)
    Animated.sequence([
      Animated.timing(tapMotion, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(tapMotion, {
        toValue: 0,
        duration: 360,
        useNativeDriver: true,
      }),
    ]).start()
  }

  const tapScale = tapMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [
      1,
      motionRole === 'service' ? 1.012 : motionRole === 'cta' ? 0.992 : 1.006,
    ],
  })
  const tapTranslateY = tapMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, motionRole === 'service' ? -2 : motionRole === 'cta' ? 1 : -1],
  })
  const tapInsetOpacity = tapMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [
      0,
      motionRole === 'service' ? 0.32 : motionRole === 'cta' ? 0.12 : 0.18,
    ],
  })
  const tapSweepTranslate = tapMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [motionRole === 'service' ? -76 : -28, motionRole === 'service' ? 260 : 92],
  })
  const sheenStyle =
    motionRole === 'cta'
      ? styles.chipActionSheenCta
      : motionRole === 'retry'
        ? styles.chipActionSheenRetry
        : styles.chipActionSheen

  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        if (!onPress) return
        if (pressTimeoutRef.current) {
          clearTimeout(pressTimeoutRef.current)
        }
        if (deferPressMs > 0) {
          pressTimeoutRef.current = setTimeout(() => {
            pressTimeoutRef.current = null
            onPress()
          }, deferPressMs)
          return
        }
        onPress()
      }}
      onPressIn={(event) => {
        runTapMotion()
        onPressIn?.(event)
      }}
      style={({ pressed }) => [
        style,
        pressed ? pressedStyle : null,
        disabled ? styles.motionPressableDisabled : null,
      ]}
    >
      <Animated.View
        style={[
          styles.motionPressableContent,
          contentStyle,
          { transform: [{ translateY: tapTranslateY }, { scale: tapScale }] },
        ]}
      >
        {children}
        {motionRole === 'service' ? (
          <>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.motionServiceInset,
                {
                  opacity: tapInsetOpacity,
                  transform: [{ scale: tapScale }],
                },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.serviceTileSweep,
                {
                  opacity: tapInsetOpacity,
                  transform: [{ translateX: tapSweepTranslate }, { rotate: '12deg' }],
                },
              ]}
            />
          </>
        ) : (
          <Animated.View
            pointerEvents="none"
            style={[
              sheenStyle,
              {
                opacity: tapInsetOpacity,
                transform: [{ translateX: tapSweepTranslate }],
              },
            ]}
          />
        )}
      </Animated.View>
    </Pressable>
  )
}

function StateMessage({
  tone,
  title,
  text,
}: {
  tone: 'info' | 'success' | 'warning' | 'error'
  title: string
  text: string
}) {
  return (
    <View
      style={[
        styles.stateMessage,
        tone === 'success' ? styles.stateMessageSuccess : null,
        tone === 'warning' ? styles.stateMessageWarning : null,
        tone === 'error' ? styles.stateMessageError : null,
      ]}
    >
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{text}</Text>
    </View>
  )
}

function MediaSlot({ label }: { label: string }) {
  return (
    <View style={styles.mediaSlot}>
      <View style={styles.mediaIcon}>
        <Svg width={30} height={30} viewBox="0 0 30 30" fill="none">
          <Rect x="7" y="8" width="16" height="14" rx="4" stroke={theme.forest} strokeWidth="2" />
          <Circle cx="12" cy="13" r="1.8" fill={theme.mintStrong} />
          <Path d="M9 20L14 16L18 19L21 16L23 18" stroke={theme.forest} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
      <Text style={styles.mediaSlotText}>{label}</Text>
    </View>
  )
}

function flowTitle(step: PriceCheckUiStep) {
  if (step === 'problem') return 'Chọn vấn đề'
  if (step === 'details') return 'Mô tả hiện trạng'
  if (step === 'clarification') return 'Kael hỏi thêm'
  if (step === 'estimate') return 'Ước tính giá'
  return 'Đặt lịch sửa chữa'
}

function getPrimaryLabel(step: PriceCheckUiStep, status: PriceCheckUiStatus) {
  if (step === 'problem') return status === 'error' ? 'Chọn vấn đề' : 'Tiếp tục'
  if (step === 'details') return status === 'error' ? 'Mô tả thêm' : 'Gửi Kael đọc'
  if (step === 'clarification' && status === 'loading') return 'Xem câu hỏi'
  if (step === 'clarification') return 'Xem ước tính'
  if (status === 'fallback' || status === 'baseline_fallback') return 'Hoàn tất an toàn'
  return 'Hoàn tất kiểm tra giá'
}

function complexityLabel(complexity: PriceCheckEstimateCard['complexity']) {
  if (complexity === 'small') return 'nhỏ'
  if (complexity === 'medium') return 'trung bình'
  if (complexity === 'large') return 'lớn'
  return 'chưa rõ'
}

function HomeServicesScene({ compact }: { compact: boolean }) {
  return (
    <Svg
      width="100%"
      height={compact ? compactHeroHeight : roomyHeroHeight}
      viewBox="0 0 360 178"
      fill="none"
    >
      <Rect x="0" y="0" width="360" height="178" rx="28" fill="#E7FAF4" />
      <Path d="M0 128C70 92 116 114 172 82C226 51 280 40 360 52V178H0V128Z" fill="#D5F2E6" />
      <Path d="M244 39H313V127H244V39Z" fill="#F9FCF9" stroke={theme.lineStrong} strokeWidth="2" />
      <Path d="M258 58H275V76H258V58ZM284 58H301V76H284V58ZM258 88H275V106H258V88ZM284 88H301V106H284V88Z" fill="#BFECDD" />
      <Path d="M63 78H171V128H63V78Z" fill="#FFFFFF" stroke={theme.lineStrong} strokeWidth="2" />
      <Path d="M78 92H112V127H78V92ZM127 92H156V113H127V92Z" fill="#DDF8EF" />
      <Path d="M57 80L116 43L177 80H57Z" fill={theme.forest} opacity="0.88" />
      <Path d="M55 132H185" stroke={theme.forestDark} strokeWidth="6" strokeLinecap="round" opacity="0.16" />
      <Rect x="48" y="128" width="84" height="28" rx="14" fill={theme.forest} />
      <Circle cx="69" cy="157" r="10" fill={theme.ink} />
      <Circle cx="111" cy="157" r="10" fill={theme.ink} />
      <Path d="M61 128C66 112 78 105 93 105H123C137 105 148 116 150 128H61Z" fill={theme.aqua} />
      <Path d="M80 112H103V126H71C72 120 75 116 80 112Z" fill="#D9FBFF" />
      <Path d="M219 112C225 98 237 91 251 95C260 98 266 108 266 122V154H214V126C214 121 216 116 219 112Z" fill="#F8D7BC" />
      <Circle cx="244" cy="82" r="17" fill="#F8D7BC" />
      <Path d="M226 100C234 108 254 109 263 99V155H226V100Z" fill={theme.mintStrong} />
      <Path d="M226 120L206 139" stroke={theme.mintStrong} strokeWidth="8" strokeLinecap="round" />
      <Path d="M263 119L287 105" stroke={theme.mintStrong} strokeWidth="8" strokeLinecap="round" />
      <Path d="M287 105L300 114" stroke={theme.clay} strokeWidth="5" strokeLinecap="round" />
      <Ellipse cx="246" cy="65" rx="17" ry="9" fill={theme.ink} />
      <Circle cx="77" cy="43" r="9" fill={theme.mintStrong} opacity="0.7" />
      <Circle cx="322" cy="29" r="12" fill={theme.aqua} opacity="0.32" />
      <Path d="M22 49C52 30 77 22 110 26" stroke="#BEEFE4" strokeWidth="5" strokeLinecap="round" />
    </Svg>
  )
}

function ElectricalServiceIcon({ size = 42 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 44 44" fill="none">
      <Rect x="11" y="7" width="22" height="30" rx="8" stroke={theme.forest} strokeWidth="2.4" />
      <Line x1="18" y1="20" x2="18" y2="25" stroke={theme.forest} strokeWidth="2.4" strokeLinecap="round" />
      <Line x1="26" y1="20" x2="26" y2="25" stroke={theme.forest} strokeWidth="2.4" strokeLinecap="round" />
      <Path d="M28 8L35 4M31 13L38 10" stroke={theme.clay} strokeWidth="2.4" strokeLinecap="round" />
      <Circle cx="22" cy="31" r="2.5" fill={theme.aqua} />
    </Svg>
  )
}

function PlumbingServiceIcon({ size = 42 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 44 44" fill="none">
      <Path d="M10 13H27C31.4 13 35 16.6 35 21V24" stroke={theme.forest} strokeWidth="5" strokeLinecap="round" />
      <Path d="M17 13V25C17 29.4 20.6 33 25 33H29" stroke={theme.forest} strokeWidth="5" strokeLinecap="round" />
      <Path d="M33 25C35 27.5 36 29.3 36 31.2C36 34 33.8 36 31.5 36C29.1 36 27 34 27 31.2C27 29.3 28.1 27.4 30 25H33Z" fill={theme.aqua} />
      <Circle cx="10" cy="13" r="3.2" fill={theme.mintStrong} />
    </Svg>
  )
}

function ProblemGlyph({ selected }: { selected: boolean }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path
        d="M5 7H12C14.2 7 16 8.8 16 11V13"
        stroke={selected ? '#FFFFFF' : theme.forest}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <Circle cx="5" cy="7" r="2" fill={selected ? '#FFFFFF' : theme.mintStrong} />
    </Svg>
  )
}

function EstimateGlyph({ fallback }: { fallback: boolean }) {
  return (
    <Svg width={42} height={42} viewBox="0 0 42 42" fill="none">
      <Circle cx="21" cy="21" r="17" stroke={fallback ? theme.clay : theme.forest} strokeWidth="2.4" />
      <Path
        d="M13 22L18.5 27.5L30 15"
        stroke={fallback ? theme.clay : theme.forest}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="31" cy="11" r="3" fill={fallback ? theme.claySoft : theme.mint} />
    </Svg>
  )
}

const textBase = {
  fontFamily: 'Aptos, Inter, Manrope, System',
  letterSpacing: 0,
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.canvas,
  },
  scrollContent: {
    gap: 18,
    paddingHorizontal: 18,
  },
  screenShell: {
    gap: 16,
  },
  hubShell: {
    gap: 18,
  },
  hubShellCompact: {
    gap: 12,
  },
  appBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  brandCluster: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  brandMark: {
    alignItems: 'center',
    backgroundColor: theme.forest,
    borderRadius: 16,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  brandMarkText: {
    ...textBase,
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
  },
  appName: {
    ...textBase,
    color: theme.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  appMeta: {
    ...textBase,
    color: theme.slate,
    fontSize: 12,
    fontWeight: '500',
  },
  addressPill: {
    backgroundColor: theme.surfaceJade,
    borderColor: theme.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addressPillText: {
    ...textBase,
    color: theme.forest,
    fontSize: 12,
    fontWeight: '800',
  },
  heroCard: {
    backgroundColor: theme.surfaceMint,
    borderColor: theme.lineStrong,
    borderRadius: 30,
    borderWidth: 1,
    boxShadow: '0 20px 48px rgba(12, 117, 108, 0.09)',
    gap: 14,
    overflow: 'hidden',
    padding: 18,
  },
  heroCardCompact: {
    borderRadius: 24,
    gap: 8,
    padding: 13,
  },
  heroCopy: {
    gap: 7,
  },
  eyebrow: {
    ...textBase,
    color: theme.forest,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  heroTitle: {
    ...textBase,
    color: theme.ink,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
  },
  heroText: {
    ...textBase,
    color: theme.slate,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 21,
  },
  addressCard: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.line,
    borderRadius: 24,
    borderWidth: 1,
    boxShadow: '0 10px 28px rgba(12, 117, 108, 0.045)',
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  addressCardCompact: {
    borderRadius: 20,
    padding: 11,
  },
  pinBubble: {
    alignItems: 'center',
    backgroundColor: theme.surfaceCopper,
    borderRadius: 16,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  pinText: {
    color: theme.clay,
    fontSize: 18,
    fontWeight: '900',
  },
  addressCopy: {
    flex: 1,
    gap: 2,
  },
  addressLabel: {
    ...textBase,
    color: theme.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  addressTitle: {
    ...textBase,
    color: theme.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  addressAction: {
    ...textBase,
    color: theme.forest,
    fontSize: 13,
    fontWeight: '800',
  },
  hubSection: {
    gap: 12,
  },
  hubSectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  hubSectionTitle: {
    ...textBase,
    color: theme.ink,
    fontSize: 19,
    fontWeight: '800',
  },
  hubSectionAction: {
    ...textBase,
    color: theme.forest,
    fontSize: 13,
    fontWeight: '800',
  },
  hubServiceGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  hubServiceCard: {
    backgroundColor: theme.surface,
    borderColor: theme.line,
    borderRadius: 26,
    borderWidth: 1,
    boxShadow: '0 12px 30px rgba(12, 117, 108, 0.055)',
    flex: 1,
    minHeight: 158,
    padding: 15,
  },
  hubServiceCardCompact: {
    borderRadius: 22,
    minHeight: compactServiceCardHeight,
    padding: 12,
  },
  hubServiceCardPressed: {
    borderColor: theme.lineStrong,
    boxShadow: '0 14px 34px rgba(12, 117, 108, 0.075)',
  },
  hubServiceContent: {
    alignItems: 'flex-start',
    flex: 1,
    gap: 8,
  },
  hubServiceIcon: {
    alignItems: 'center',
    borderRadius: 22,
    height: 62,
    justifyContent: 'center',
    width: 62,
  },
  hubServiceIconCompact: {
    borderRadius: 18,
    height: 50,
    width: 50,
  },
  serviceIconElectric: {
    backgroundColor: theme.surfaceAqua,
  },
  serviceIconWater: {
    backgroundColor: theme.surfaceJade,
  },
  hubServiceTitle: {
    ...textBase,
    color: theme.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  hubServiceSubtitle: {
    ...textBase,
    color: theme.slate,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  hubServiceMicrocopy: {
    ...textBase,
    color: theme.muted,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 16,
  },
  hubInfoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  infoTile: {
    backgroundColor: theme.canvasWarm,
    borderColor: theme.line,
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    padding: 13,
  },
  infoTitle: {
    ...textBase,
    color: theme.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  infoText: {
    ...textBase,
    color: theme.slate,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
  stateRevealShell: {
    overflow: 'hidden',
    position: 'relative',
  },
  stateRevealAccent: {
    backgroundColor: theme.mintStrong,
    borderRadius: 999,
    height: 4,
    left: 22,
    position: 'absolute',
    right: 22,
    top: 0,
    zIndex: 2,
  },
  stateRevealAccentWarning: {
    backgroundColor: theme.clay,
  },
  flowHeader: {
    gap: 14,
  },
  flowTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  flowEyebrow: {
    ...textBase,
    color: theme.forest,
    fontSize: 12,
    fontWeight: '900',
  },
  flowTitle: {
    ...textBase,
    color: theme.ink,
    fontSize: 24,
    fontWeight: '800',
  },
  flowServiceBadge: {
    backgroundColor: theme.surfaceMint,
    borderColor: theme.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  flowServiceText: {
    ...textBase,
    color: theme.forest,
    fontSize: 12,
    fontWeight: '800',
  },
  stepRail: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.line,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 10,
  },
  stepItem: {
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  stepDot: {
    backgroundColor: theme.line,
    borderRadius: 999,
    height: 6,
    width: '100%',
  },
  stepDotDone: {
    backgroundColor: theme.mintStrong,
  },
  stepDotActive: {
    backgroundColor: theme.forest,
  },
  stepLabel: {
    ...textBase,
    color: theme.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  stepLabelActive: {
    color: theme.forest,
  },
  sectionStack: {
    gap: 16,
  },
  sectionHeader: {
    gap: 7,
  },
  sectionEyebrow: {
    ...textBase,
    color: theme.forest,
    fontSize: 12,
    fontWeight: '900',
  },
  sectionTitle: {
    ...textBase,
    color: theme.ink,
    fontSize: 23,
    fontWeight: '800',
    lineHeight: 30,
  },
  sectionText: {
    ...textBase,
    color: theme.slate,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 21,
  },
  problemPanel: {
    backgroundColor: theme.surface,
    borderColor: theme.line,
    borderRadius: 26,
    borderWidth: 1,
    padding: 15,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  problemChip: {
    alignItems: 'center',
    backgroundColor: theme.canvas,
    borderColor: theme.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: minimumTouchTarget,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  problemChipPressed: {
    borderColor: theme.lineStrong,
  },
  problemChipSelected: {
    backgroundColor: theme.forest,
    borderColor: theme.forest,
  },
  problemChipContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  chipIcon: {
    alignItems: 'center',
    backgroundColor: theme.surfaceMint,
    borderRadius: 10,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  chipIconSelected: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  problemChipText: {
    ...textBase,
    color: theme.slate,
    fontSize: 14,
    fontWeight: '700',
  },
  problemChipTextSelected: {
    color: '#FFFFFF',
  },
  summaryStrip: {
    alignItems: 'center',
    backgroundColor: theme.surfaceMint,
    borderColor: theme.lineStrong,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  summaryIcon: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 20,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  summaryCopy: {
    flex: 1,
    gap: 3,
  },
  summaryLabel: {
    ...textBase,
    color: theme.forest,
    fontSize: 12,
    fontWeight: '800',
  },
  summaryTitle: {
    ...textBase,
    color: theme.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  summaryMeta: {
    ...textBase,
    color: theme.slate,
    fontSize: 12,
    fontWeight: '600',
  },
  inputPanel: {
    backgroundColor: theme.surface,
    borderColor: theme.line,
    borderRadius: 26,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  inputHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inputLabel: {
    ...textBase,
    color: theme.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  inputCount: {
    ...textBase,
    color: theme.muted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  descriptionInput: {
    ...textBase,
    backgroundColor: theme.canvas,
    borderColor: theme.line,
    borderRadius: 20,
    borderWidth: 1,
    color: theme.ink,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    minHeight: 130,
    padding: 14,
  },
  descriptionInputError: {
    borderColor: theme.danger,
  },
  mediaPanel: {
    backgroundColor: theme.surface,
    borderColor: theme.line,
    borderRadius: 26,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  panelTitle: {
    ...textBase,
    color: theme.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  mediaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  mediaSlot: {
    alignItems: 'center',
    backgroundColor: theme.canvas,
    borderColor: theme.line,
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    minHeight: 90,
    justifyContent: 'center',
    padding: 10,
  },
  mediaIcon: {
    alignItems: 'center',
    backgroundColor: theme.surfaceMint,
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  mediaSlotText: {
    ...textBase,
    color: theme.slate,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: theme.surfaceMint,
    borderColor: theme.lineStrong,
    borderRadius: 28,
    borderWidth: 1,
    gap: 12,
    justifyContent: 'center',
    minHeight: 240,
    padding: 24,
  },
  loadingIconRing: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 999,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  loadingTitle: {
    ...textBase,
    color: theme.ink,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  loadingText: {
    ...textBase,
    color: theme.slate,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 21,
    maxWidth: 340,
    textAlign: 'center',
  },
  questionCard: {
    backgroundColor: theme.surface,
    borderColor: theme.line,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  questionIndex: {
    alignItems: 'center',
    backgroundColor: theme.surfaceMint,
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  questionIndexText: {
    ...textBase,
    color: theme.forest,
    fontSize: 13,
    fontWeight: '900',
  },
  questionBody: {
    flex: 1,
    gap: 12,
  },
  questionText: {
    ...textBase,
    color: theme.ink,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
  },
  answerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  answerChip: {
    backgroundColor: theme.canvas,
    borderColor: theme.line,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: minimumTouchTarget,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  answerChipPressed: {
    borderColor: theme.lineStrong,
  },
  answerChipSelected: {
    backgroundColor: theme.forest,
    borderColor: theme.forest,
  },
  answerChipContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerText: {
    ...textBase,
    color: theme.slate,
    fontSize: 13,
    fontWeight: '700',
  },
  answerTextSelected: {
    color: '#FFFFFF',
  },
  estimateCard: {
    backgroundColor: theme.surface,
    borderColor: theme.lineStrong,
    borderRadius: 30,
    borderWidth: 1,
    boxShadow: '0 20px 44px rgba(12, 117, 108, 0.1)',
    gap: 16,
    padding: 18,
  },
  fallbackCard: {
    backgroundColor: theme.surfaceCopper,
    borderColor: theme.claySoft,
  },
  estimateTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  estimateIcon: {
    alignItems: 'center',
    backgroundColor: theme.surfaceMint,
    borderRadius: 24,
    height: 62,
    justifyContent: 'center',
    width: 62,
  },
  estimateHeading: {
    flex: 1,
    gap: 4,
  },
  estimateLabel: {
    ...textBase,
    color: theme.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  estimateProblem: {
    ...textBase,
    color: theme.ink,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  priceBand: {
    backgroundColor: theme.canvasWarm,
    borderColor: theme.line,
    borderRadius: 24,
    borderWidth: 1,
    gap: 4,
    padding: 16,
  },
  priceLabel: {
    ...textBase,
    color: theme.slate,
    fontSize: 12,
    fontWeight: '800',
  },
  priceValue: {
    ...textBase,
    color: theme.forestDark,
    fontSize: 30,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  priceValueMuted: {
    color: theme.clay,
    fontSize: 25,
  },
  priceMeta: {
    ...textBase,
    color: theme.slate,
    fontSize: 13,
    fontWeight: '700',
  },
  reasonStack: {
    gap: 10,
  },
  reasonRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  reasonBullet: {
    backgroundColor: theme.mintStrong,
    borderRadius: 999,
    height: 7,
    marginTop: 7,
    width: 7,
  },
  reasonText: {
    ...textBase,
    color: theme.slate,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
  },
  disclaimerBox: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderColor: theme.line,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
  },
  disclaimerText: {
    ...textBase,
    color: theme.slate,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  retryInlineButton: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.claySoft,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: minimumTouchTarget,
    paddingHorizontal: 14,
  },
  retryInlineButtonPressed: {
    backgroundColor: theme.surfaceCopper,
  },
  retryInlineContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryInlineText: {
    ...textBase,
    color: theme.clay,
    fontSize: 14,
    fontWeight: '800',
  },
  stateMessage: {
    backgroundColor: theme.surfaceAqua,
    borderColor: theme.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  stateMessageSuccess: {
    backgroundColor: theme.surfaceMint,
  },
  stateMessageWarning: {
    backgroundColor: theme.surfaceCopper,
    borderColor: theme.claySoft,
  },
  stateMessageError: {
    backgroundColor: '#FFF0EF',
    borderColor: '#F0B5AF',
  },
  stateTitle: {
    ...textBase,
    color: theme.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  stateText: {
    ...textBase,
    color: theme.slate,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },
  bottomBar: {
    backgroundColor: 'rgba(248, 252, 250, 0.94)',
    borderColor: theme.line,
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
    backgroundColor: theme.line,
    borderRadius: 999,
    height: 5,
    overflow: 'hidden',
  },
  bottomProgressFill: {
    backgroundColor: theme.forest,
    borderRadius: 999,
    height: 5,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.line,
    borderRadius: 18,
    borderWidth: 1,
    flex: 0.8,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 14,
  },
  secondaryButtonPressed: {
    backgroundColor: theme.surfaceMint,
    borderColor: theme.lineStrong,
  },
  secondaryButtonText: {
    ...textBase,
    color: theme.slate,
    fontSize: 15,
    fontWeight: '800',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: theme.forest,
    borderRadius: 18,
    boxShadow: '0 10px 22px rgba(12, 117, 108, 0.2)',
    flex: 1.4,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 16,
  },
  primaryButtonPressed: {
    backgroundColor: theme.forestDark,
  },
  primaryButtonDisabled: {
    backgroundColor: theme.lineStrong,
    boxShadow: '0 0 0 rgba(0,0,0,0)',
  },
  primaryButtonText: {
    ...textBase,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  ctaContent: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  motionPressableContent: {
    overflow: 'hidden',
    position: 'relative',
  },
  motionPressableDisabled: {
    opacity: 0.72,
  },
  motionServiceInset: {
    borderColor: 'rgba(50, 191, 168, 0.42)',
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
    width: 48,
  },
  chipActionSheen: {
    backgroundColor: 'rgba(50, 191, 168, 0.42)',
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
    height: 2,
    left: 16,
    width: 72,
  },
  chipActionSheenRetry: {
    backgroundColor: 'rgba(184, 111, 50, 0.34)',
    bottom: 7,
    height: 2,
    left: 16,
    width: 72,
  },
})
