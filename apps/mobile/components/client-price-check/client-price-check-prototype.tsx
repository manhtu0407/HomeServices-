import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import Reanimated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'
import { PROBLEM_CHIPS, type ServiceType } from '@home-services/shared'

type FlowStep = 'service' | 'details' | 'clarification' | 'estimate'
type DemoState = FlowStep | 'loading' | 'fallback'
type MotionMode = 'lift' | 'trace' | 'wave'

type StepDefinition = {
  key: FlowStep
  title: string
  shortTitle: string
  caption: string
}

type ServiceOption = {
  type: ServiceType
  title: string
  subtitle: string
  tone: 'aqua' | 'mint'
}

type InfoIcon = 'problem' | 'reason' | 'safety'

const MOTION_MODES: Array<{ key: MotionMode; label: string; caption: string }> = [
  { key: 'lift', label: 'Lift mềm', caption: 'nâng + glow' },
  { key: 'trace', label: 'Viền chạy', caption: 'icon/category' },
  { key: 'wave', label: 'Sóng mint', caption: 'fill/reveal' },
]

const DISCLAIMER =
  'Đây là ước tính dựa trên thị trường. Giá thực tế sẽ được xác nhận bởi thợ trước khi bắt đầu.'

const STEPS: StepDefinition[] = [
  {
    key: 'service',
    title: 'Bạn cần sửa gì?',
    shortTitle: 'Dịch vụ',
    caption: 'Chọn nhóm vấn đề để Kael giới hạn đúng phạm vi điện hoặc nước.',
  },
  {
    key: 'details',
    title: 'Mô tả hiện trạng',
    shortTitle: 'Mô tả',
    caption: 'Thêm dấu hiệu chính và ảnh tham khảo để giảm khoảng giá mơ hồ.',
  },
  {
    key: 'clarification',
    title: 'Kael hỏi thêm',
    shortTitle: 'Hỏi thêm',
    caption: 'Chỉ hỏi những điểm làm thay đổi độ phức tạp hoặc mức giá.',
  },
  {
    key: 'estimate',
    title: 'Ước tính minh bạch',
    shortTitle: 'Ước tính',
    caption: 'Hiển thị khoảng giá, độ tin cậy và lưu ý an toàn trước khi đặt thợ.',
  },
]

const REVIEW_STATES: Array<{ key: DemoState; label: string }> = [
  { key: 'service', label: 'Dịch vụ' },
  { key: 'details', label: 'Mô tả' },
  { key: 'clarification', label: 'Hỏi thêm' },
  { key: 'loading', label: 'Loading' },
  { key: 'estimate', label: 'Ước tính' },
  { key: 'fallback', label: 'Fallback' },
]

const SERVICES: ServiceOption[] = [
  {
    type: 'electrical',
    title: 'Sửa điện',
    subtitle: 'Ổ cắm, đèn, cầu dao, thiết bị nhỏ',
    tone: 'aqua',
  },
  {
    type: 'plumbing',
    title: 'Sửa nước',
    subtitle: 'Rò rỉ, tắc nghẽn, vòi, áp nước',
    tone: 'mint',
  },
]

const QUESTIONS = [
  {
    label: 'Ổ cắm bị nóng khi nào?',
    options: ['Liên tục', 'Khi cắm thiết bị', 'Chưa rõ'],
  },
  {
    label: 'Có dấu cháy hoặc mùi khét không?',
    options: ['Có', 'Không', 'Cần gửi ảnh'],
  },
]

const estimateFixture = {
  problem: 'Ổ cắm phòng khách có dấu cháy nhẹ và mặt che bị lỏng',
  range: '280.000 - 420.000đ',
  confidence: 'Khá chắc',
  complexity: 'Trung bình',
  reason: 'Kael thấy dấu hiệu tiếp xúc điện không ổn định, cần thợ kiểm tra dây và mặt ổ.',
  advisory: 'Nếu còn mùi khét, hãy ngắt cầu dao khu vực đó trước khi thợ tới.',
}

export function ClientPriceCheckPrototype() {
  const { width } = useWindowDimensions()
  const washPulse = useRef(new Animated.Value(0)).current
  const screenMotion = useRef(new Animated.Value(1)).current
  const ctaPulse = useRef(new Animated.Value(0)).current
  const selectionPulse = useRef(new Animated.Value(0)).current
  const interactionPulse = useRef(new Animated.Value(0)).current
  const [step, setStep] = useState<FlowStep>('service')
  const [demoState, setDemoState] = useState<DemoState>('service')
  const [serviceType, setServiceType] = useState<ServiceType>('electrical')
  const [selectedChips, setSelectedChips] = useState<string[]>([
    PROBLEM_CHIPS.electrical[2],
  ])
  const [description, setDescription] = useState(
    'Ổ cắm phòng khách hơi lỏng, cắm quạt thì nghe tiếng lẹt xẹt và có mùi khét nhẹ.'
  )
  const [answers, setAnswers] = useState<Record<number, string>>({
    0: 'Khi cắm thiết bị',
  })

  const activeStepIndex = STEPS.findIndex((item) => item.key === step)
  const activeStep = STEPS[activeStepIndex]
  const chips = useMemo(() => PROBLEM_CHIPS[serviceType], [serviceType])
  const isWideViewport = width >= 520
  const flowTitle =
    demoState === 'loading'
      ? 'Kael đang xử lý'
      : demoState === 'fallback'
        ? 'Trạng thái không khả dụng'
        : activeStep.title
  const flowCaption =
    demoState === 'loading'
      ? 'Mô phỏng trạng thái chờ khi Kael đọc mô tả và baseline giá an toàn.'
      : demoState === 'fallback'
        ? 'Màn này kiểm tra cách app nói rõ khi chưa đủ dữ liệu để báo giá.'
        : activeStep.caption

  useEffect(() => {
    screenMotion.setValue(0)
    Animated.timing(screenMotion, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start()
    runCtaMotion()
  }, [demoState, screenMotion, step])

  const washOpacity = washPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.34, 0.62],
  })

  const edgeOpacity = washPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.16, 0.42],
  })

  const screenTranslate = screenMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 0],
  })

  const ctaScale = ctaPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.012],
  })

  const ctaGlow = ctaPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1],
  })

  function runInteractionMotion() {
    interactionPulse.stopAnimation()
    selectionPulse.stopAnimation()
    washPulse.stopAnimation()
    interactionPulse.setValue(0)
    selectionPulse.setValue(0)
    washPulse.setValue(0)
    Animated.parallel([
      Animated.sequence([
        Animated.timing(interactionPulse, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(interactionPulse, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(selectionPulse, {
          toValue: 1,
          duration: 230,
          useNativeDriver: true,
        }),
        Animated.timing(selectionPulse, {
          toValue: 0,
          duration: 380,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(washPulse, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(washPulse, {
          toValue: 0,
          duration: 460,
          useNativeDriver: true,
        }),
      ]),
    ]).start()
  }

  function runCtaMotion() {
    ctaPulse.stopAnimation()
    ctaPulse.setValue(0)
    Animated.sequence([
      Animated.timing(ctaPulse, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(ctaPulse, {
        toValue: 0,
        duration: 240,
        useNativeDriver: true,
      }),
    ]).start()
  }

  function selectService(nextService: ServiceType) {
    setServiceType(nextService)
    setSelectedChips([PROBLEM_CHIPS[nextService][0]])
    runInteractionMotion()
  }

  function toggleChip(chip: string) {
    setSelectedChips((current) => {
      if (current.includes(chip)) {
        const next = current.filter((item) => item !== chip)
        runInteractionMotion()
        return next.length > 0 ? next : current
      }

      runInteractionMotion()
      return [...current, chip]
    })
  }

  function showState(nextState: DemoState) {
    runInteractionMotion()
    setDemoState(nextState)
    if (nextState !== 'loading' && nextState !== 'fallback') {
      setStep(nextState)
    }
  }

  function goNext() {
    if (step === 'service') {
      runInteractionMotion()
      setStep('details')
      setDemoState('details')
      return
    }

    if (step === 'details') {
      runInteractionMotion()
      setDemoState('loading')
      setTimeout(() => {
        setStep('clarification')
        setDemoState('clarification')
      }, 520)
      return
    }

    if (step === 'clarification') {
      runInteractionMotion()
      setStep('estimate')
      setDemoState('estimate')
    }
  }

  function goBack() {
    if (step === 'estimate') {
      runInteractionMotion()
      setStep('clarification')
      setDemoState('clarification')
      return
    }

    if (step === 'clarification') {
      runInteractionMotion()
      setStep('details')
      setDemoState('details')
      return
    }

    if (step === 'details') {
      runInteractionMotion()
      setStep('service')
      setDemoState('service')
    }
  }

  return (
    <View style={[styles.shell, isWideViewport && styles.shellWide]}>
      <View pointerEvents="none" style={styles.backgroundLayer}>
        <Animated.View style={[styles.backgroundWash, { opacity: washOpacity }]} />
        <View style={styles.backgroundMintField} />
        <View style={styles.backgroundWarmField} />
        <View style={styles.backgroundJadeThread} />
        <View style={styles.backgroundCopperThread} />
        <View style={styles.backgroundSoftBand} />
        <Animated.View style={[styles.backgroundEdge, { opacity: edgeOpacity }]} />
      </View>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={styles.screen}
        contentContainerStyle={styles.content}
      >
        <View style={styles.appHeader}>
          <View>
            <Text style={styles.prototypeNote}>Prototype UI · Dữ liệu mẫu</Text>
            <Text style={styles.pageTitle}>Kiểm tra giá</Text>
          </View>
          <View style={styles.fixtureBadge}>
            <Text style={styles.fixtureBadgeText}>Fixture</Text>
          </View>
        </View>

        <View style={styles.contextStrip}>
          <View style={styles.contextMaterialRail} />
          <View style={styles.contextColumn}>
            <Text style={styles.contextLabel}>Kael Price Check</Text>
            <Text style={styles.contextValue}>Căn hộ TP.HCM · điện/nước</Text>
          </View>
          <View style={styles.scopePill}>
            <Text style={styles.scopePillText}>Không tạo booking</Text>
          </View>
        </View>

        <View style={styles.prototypeScope}>
          <Text style={styles.prototypeScopeText}>
            Flow này chỉ dùng fixture local, chưa gọi backend, chưa ghi Supabase và
            chưa broadcast tìm thợ.
          </Text>
        </View>

        <ColorSignaturePanel />

        <MotionShowcase />

        <View style={styles.stepper} testID="multi-step-price-check">
          {STEPS.map((item, index) => {
            const isDone = index < activeStepIndex
            const isActive = item.key === step
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                onPress={() => showState(item.key)}
                style={styles.stepItem}
              >
                <View
                  style={[
                    styles.stepDot,
                    isDone && styles.stepDotDone,
                    isActive && styles.stepDotActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.stepDotText,
                      (isDone || isActive) && styles.stepDotTextActive,
                    ]}
                  >
                    {index + 1}
                  </Text>
                </View>
                <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>
                  {item.shortTitle}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <View style={styles.demoControl}>
          <Text style={styles.demoControlLabel}>Xem trạng thái</Text>
          <View style={styles.reviewRail}>
          {REVIEW_STATES.map((item) => {
            const active = item.key === demoState
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                onPress={() => showState(item.key)}
                style={({ pressed }) => [
                  styles.reviewChip,
                  active && styles.reviewChipActive,
                  pressed && styles.pressed,
                  pressed && styles.pressMotionSoft,
                ]}
              >
                <Text style={[styles.reviewChipText, active && styles.reviewChipTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            )
          })}
          </View>
        </View>

        <View style={styles.flowHeader}>
          <Text style={styles.flowTitle}>{flowTitle}</Text>
          <Text style={styles.flowCaption}>{flowCaption}</Text>
        </View>

        <Animated.View
          style={[
            styles.motionSurface,
            {
              opacity: screenMotion,
              transform: [{ translateY: screenTranslate }],
            },
          ]}
        >
          {demoState === 'loading' ? (
            <LoadingScreen />
          ) : demoState === 'fallback' ? (
            <FallbackScreen />
          ) : step === 'service' ? (
            <ServiceScreen
              serviceType={serviceType}
              selectedChips={selectedChips}
              chips={chips}
              selectionPulse={selectionPulse}
              interactionPulse={interactionPulse}
              onSelectService={selectService}
              onToggleChip={toggleChip}
            />
          ) : step === 'details' ? (
            <DetailsScreen description={description} onChangeDescription={setDescription} />
          ) : step === 'clarification' ? (
            <ClarificationScreen answers={answers} setAnswers={setAnswers} />
          ) : (
            <EstimateScreen />
          )}
        </Animated.View>

        <View style={styles.footerSpace} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable
          accessibilityRole="button"
          disabled={step === 'service' || demoState === 'loading'}
          onPress={goBack}
          style={({ pressed }) => [
            styles.backButton,
            (step === 'service' || demoState === 'loading') && styles.buttonDisabled,
            pressed && styles.pressed,
            pressed && styles.pressMotionSoft,
          ]}
        >
          <Text style={styles.backButtonText}>Quay lại</Text>
        </Pressable>
        <Animated.View
          style={[
            styles.nextButtonMotion,
            {
              opacity: ctaGlow,
              transform: [{ scale: ctaScale }],
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            disabled={step === 'estimate' || demoState === 'fallback'}
            onPress={goNext}
            style={({ pressed }) => [
              styles.nextButton,
              (step === 'estimate' || demoState === 'fallback') && styles.buttonDisabled,
              pressed && styles.pressed,
              pressed && styles.pressMotion,
            ]}
          >
            <Text style={styles.nextButtonText}>
              {step === 'details' ? 'Để Kael phân tích' : 'Tiếp tục'}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  )
}

function ColorSignaturePanel() {
  return (
    <View style={styles.colorSignaturePanel} testID="color-signature-v11">
      <View style={styles.colorSignatureAccent} />
      <View style={styles.colorSignatureDepthRail}>
        <View style={[styles.colorSignatureDepthSegment, styles.colorSignatureDepthMint]} />
        <View style={[styles.colorSignatureDepthSegment, styles.colorSignatureDepthTeal]} />
        <View style={[styles.colorSignatureDepthSegment, styles.colorSignatureDepthCopper]} />
      </View>
      <View style={styles.colorSignatureHeader}>
        <View>
          <Text style={styles.colorSignatureKicker}>V11 Color material</Text>
          <Text style={styles.colorSignatureTitle}>Lớp màu có nền, lõi, cạnh và điểm tiền</Text>
        </View>
        <View style={styles.colorSignalStack}>
          <View style={[styles.colorSignalDot, styles.colorSignalDotMint]} />
          <View style={[styles.colorSignalDot, styles.colorSignalDotTeal]} />
          <View style={[styles.colorSignalDot, styles.colorSignalDotCopper]} />
        </View>
      </View>
      <View style={styles.colorMaterialStack} pointerEvents="none">
        <View style={[styles.colorMaterialLayer, styles.colorMaterialLayerBase]} />
        <View style={[styles.colorMaterialLayer, styles.colorMaterialLayerCore]} />
        <View style={[styles.colorMaterialLayer, styles.colorMaterialLayerPrice]} />
        <View style={styles.colorMaterialNeedle} />
      </View>
      <View style={styles.colorSwatchRow}>
        <View style={[styles.colorSwatch, styles.colorSwatchTrust]}>
          <Text style={styles.colorSwatchLabel}>Nền</Text>
          <Text style={styles.colorSwatchValue}>mist xanh ấm</Text>
        </View>
        <View style={[styles.colorSwatch, styles.colorSwatchAction]}>
          <Text style={styles.colorSwatchLabel}>Hành động</Text>
          <Text style={styles.colorSwatchValue}>jade/deep mint</Text>
        </View>
        <View style={[styles.colorSwatch, styles.colorSwatchMoney]}>
          <Text style={styles.colorSwatchLabel}>Giá</Text>
          <Text style={styles.colorSwatchValue}>copper dịu</Text>
        </View>
      </View>
      <View style={styles.colorRoleRow}>
        <View style={[styles.colorRolePill, styles.colorRoleElectric]}>
          <Text style={styles.colorRoleText}>Điện · warm</Text>
        </View>
        <View style={[styles.colorRolePill, styles.colorRoleWater]}>
          <Text style={styles.colorRoleText}>Nước · aqua</Text>
        </View>
        <View style={[styles.colorRolePill, styles.colorRoleEstimate]}>
          <Text style={styles.colorRoleText}>Ước tính · copper</Text>
        </View>
      </View>
    </View>
  )
}

function MotionShowcase() {
  const [selectedService, setSelectedService] = useState<ServiceType>('electrical')
  const [chipActive, setChipActive] = useState(true)
  const [revealKey, setRevealKey] = useState(0)
  const [motionKey, setMotionKey] = useState(0)
  const [motionMode, setMotionMode] = useState<MotionMode>('lift')

  const runInteraction = () => setMotionKey((current) => current + 1)
  const runReplay = () => {
    setChipActive((current) => !current)
    setRevealKey((current) => current + 1)
    setMotionKey((current) => current + 1)
  }

  return (
    <View style={styles.motionLab} testID="motion-lab-v8">
      <View style={styles.motionLabHeader}>
        <View>
          <Text style={styles.motionLabKicker}>V8 Motion theo tương tác</Text>
          <Text style={styles.motionLabTitle}>Chạm vào đâu, phần đó chuyển động</Text>
          <Text style={styles.motionLabSubtitle}>Không auto-loop; mỗi nhịp chỉ chạy khi người dùng hover/touch/tap.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={runReplay}
          style={({ pressed }) => [styles.replayButton, pressed && styles.pressMotionSoft]}
        >
          <Text style={styles.replayButtonText}>Chạy thử</Text>
        </Pressable>
      </View>

      <MotionModeSelector
        selected={motionMode}
        onSelect={(mode) => {
          setMotionMode(mode)
          runReplay()
        }}
      />

      <DistributedMotionRail runKey={motionKey} motionMode={motionMode} onInteract={runInteraction} />

      <View style={styles.motionServiceGrid}>
        <MotionServiceCard
          active={selectedService === 'electrical'}
          serviceType="electrical"
          title="Sửa điện"
          motionMode={motionMode}
          onInteract={runInteraction}
          onPress={() => {
            setSelectedService('electrical')
            setRevealKey((current) => current + 1)
            setMotionKey((current) => current + 1)
          }}
        />
        <MotionServiceCard
          active={selectedService === 'plumbing'}
          serviceType="plumbing"
          title="Sửa nước"
          motionMode={motionMode}
          onInteract={runInteraction}
          onPress={() => {
            setSelectedService('plumbing')
            setRevealKey((current) => current + 1)
            setMotionKey((current) => current + 1)
          }}
        />
      </View>

      <MotionChip
        active={chipActive}
        label={selectedService === 'electrical' ? 'Ổ cắm nóng' : 'Ống rò rỉ'}
        serviceType={selectedService}
        motionMode={motionMode}
        onInteract={runInteraction}
        onPress={() => {
          setChipActive((current) => !current)
          setMotionKey((current) => current + 1)
        }}
      />

      <MotionDetailCard
        serviceType={selectedService}
        runKey={motionKey}
        motionMode={motionMode}
        onInteract={runInteraction}
      />
      <KaelScanCard runKey={motionKey} motionMode={motionMode} onInteract={runInteraction} />
      <EstimateRevealCard runKey={revealKey + motionKey} motionMode={motionMode} onInteract={runInteraction} />
    </View>
  )
}

function MotionModeSelector({
  selected,
  onSelect,
}: {
  selected: MotionMode
  onSelect: (mode: MotionMode) => void
}) {
  return (
    <View style={styles.motionModeRow}>
      {MOTION_MODES.map((mode) => {
        const active = selected === mode.key
        return (
          <Pressable
            key={mode.key}
            accessibilityRole="button"
            onPress={() => onSelect(mode.key)}
            style={({ pressed }) => [
              styles.motionModePill,
              active && styles.motionModePillActive,
              pressed && styles.pressMotionSoft,
            ]}
          >
            <View style={[styles.motionModeDot, active && styles.motionModeDotActive]} />
            <Text style={[styles.motionModeLabel, active && styles.motionModeLabelActive]}>{mode.label}</Text>
            <Text style={[styles.motionModeCaption, active && styles.motionModeCaptionActive]}>{mode.caption}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function DistributedMotionRail({
  runKey,
  motionMode,
  onInteract,
}: {
  runKey: number
  motionMode: MotionMode
  onInteract: () => void
}) {
  const steps = [
    { label: 'Dịch vụ', tone: 'mint' },
    { label: 'Vấn đề', tone: 'teal' },
    { label: 'Mô tả', tone: 'aqua' },
    { label: 'Ước tính', tone: 'clay' },
  ] as const

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Chạy nhịp chuyển động được dàn đều"
      onHoverIn={onInteract}
      onPress={onInteract}
      style={({ pressed }) => [styles.rhythmRail, pressed && styles.pressMotionSoft]}
    >
      {steps.map((step, index) => (
        <RhythmStep
          key={step.label}
          index={index}
          label={step.label}
          tone={step.tone}
          runKey={runKey}
          motionMode={motionMode}
        />
      ))}
    </Pressable>
  )
}

function RhythmStep({
  label,
  index,
  tone,
  runKey,
  motionMode,
}: {
  label: string
  index: number
  tone: 'mint' | 'teal' | 'aqua' | 'clay'
  runKey: number
  motionMode: MotionMode
}) {
  const progress = useSharedValue(0)

  useEffect(() => {
    if (runKey === 0) return
    progress.value = 0
    progress.value = withDelay(
      index * 90,
      withSequence(
        withTiming(1, { duration: motionMode === 'trace' ? 460 : 540, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: motionMode === 'wave' ? 680 : 520, easing: Easing.inOut(Easing.cubic) })
      )
    )
  }, [index, motionMode, progress, runKey])

  const activeColor =
    tone === 'mint'
      ? palette.mintStrong
      : tone === 'teal'
        ? palette.teal
        : tone === 'aqua'
          ? palette.aqua
          : '#F1C9A8'
  const dotColor =
    tone === 'clay' ? palette.clay : tone === 'aqua' ? palette.tealStrong : palette.mintInk

  const stepStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ['rgba(255, 255, 255, 0.7)', motionMode === 'wave' ? palette.mintBright : activeColor]
    ),
    borderColor: interpolateColor(progress.value, [0, 1], [palette.border, dotColor]),
    transform: [
      { translateY: motionMode === 'lift' ? -3 * progress.value : 0 },
      { scale: 1 + (motionMode === 'trace' ? 0.025 : 0.012) * progress.value },
    ],
  }))

  const fillStyle = useAnimatedStyle(() => ({
    opacity: 0.18 + progress.value * 0.4,
    transform: [{ translateX: -44 + progress.value * 92 }, { rotate: '12deg' }],
  }))

  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.56 + progress.value * 0.44,
    transform: [{ scale: 0.86 + progress.value * 0.22 }],
  }))

  return (
    <Reanimated.View style={[styles.rhythmStep, stepStyle]}>
      <Reanimated.View pointerEvents="none" style={[styles.rhythmStepFill, fillStyle]} />
      <Reanimated.View style={[styles.rhythmStepDot, { backgroundColor: dotColor }, dotStyle]} />
      <Text style={styles.rhythmStepLabel}>{label}</Text>
    </Reanimated.View>
  )
}

function MotionServiceCard({
  active,
  serviceType,
  title,
  motionMode,
  onInteract,
  onPress,
}: {
  active: boolean
  serviceType: ServiceType
  title: string
  motionMode: MotionMode
  onInteract: () => void
  onPress: () => void
}) {
  const progress = useSharedValue(active ? 1 : 0)
  const action = useSharedValue(0)
  const touch = useSharedValue(0)
  const mounted = useRef(false)

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    })

    if (mounted.current && active) {
      action.value = 0
      action.value = withSequence(
        withTiming(1, { duration: motionMode === 'trace' ? 320 : 240, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 460, easing: Easing.out(Easing.cubic) })
      )
    }
    mounted.current = true
  }, [active, action, motionMode, progress])

  const startInteraction = () => {
    onInteract()
    touch.value = withTiming(1, { duration: 170, easing: Easing.out(Easing.cubic) })
    action.value = 0
    action.value = withSequence(
      withTiming(1, { duration: motionMode === 'trace' ? 380 : 260, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: motionMode === 'wave' ? 560 : 430, easing: Easing.inOut(Easing.cubic) })
    )
  }

  const endInteraction = () => {
    touch.value = withTiming(0, { duration: 210, easing: Easing.out(Easing.cubic) })
  }

  const activeBg =
    motionMode === 'wave'
      ? 'rgba(156, 234, 205, 0.98)'
      : motionMode === 'trace'
        ? 'rgba(234, 248, 255, 0.94)'
        : 'rgba(191, 238, 219, 0.98)'
  const idleBg = motionMode === 'wave' ? 'rgba(245, 251, 247, 0.94)' : 'rgba(255, 253, 248, 0.92)'
  const modeMeta =
    motionMode === 'lift'
      ? 'nâng + glow khi chạm'
      : motionMode === 'trace'
        ? 'viền chạy quanh icon'
        : 'sóng mint đi qua nội dung'

  const cardStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      Math.max(progress.value, touch.value * 0.82),
      [0, 1],
      [idleBg, activeBg]
    ),
    borderColor: interpolateColor(
      Math.max(progress.value, touch.value),
      [0, 1],
      [palette.border, motionMode === 'trace' ? palette.tealStrong : palette.deepMint]
    ),
    transform: [
      { translateY: -7 * touch.value - 4 * action.value - 2 * progress.value },
      { scale: 1 + (motionMode === 'lift' ? 0.026 : 0.014) * touch.value + 0.024 * action.value },
    ],
  }))

  const iconWrapStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      Math.max(progress.value, touch.value),
      [0, 1],
      ['rgba(255, 255, 255, 0.62)', motionMode === 'wave' ? palette.seafoam : palette.surfaceWarm]
    ),
    borderColor: interpolateColor(
      Math.max(progress.value, touch.value),
      [0, 1],
      ['rgba(20, 152, 157, 0.22)', motionMode === 'trace' ? palette.tealStrong : palette.mintPeak]
    ),
    transform: [{ scale: 1 + 0.08 * action.value + 0.035 * touch.value }],
  }))

  const sweepStyle = useAnimatedStyle(() => ({
    opacity: action.value > 0 ? (motionMode === 'wave' ? 0.62 : 0.42) * (1 - action.value) : 0,
    transform: [
      { translateX: -84 + action.value * (motionMode === 'wave' ? 270 : 224) },
      { rotate: motionMode === 'trace' ? '4deg' : '12deg' },
    ],
  }))

  const ringStyle = useAnimatedStyle(() => ({
    opacity: action.value > 0 || touch.value > 0 ? 0.18 + 0.58 * Math.max(action.value, touch.value) : 0,
    transform: [{ scale: 0.78 + action.value * 0.75 + touch.value * 0.22 }],
  }))

  return (
    <Pressable
      accessibilityRole="button"
      onHoverIn={startInteraction}
      onHoverOut={endInteraction}
      onPressIn={startInteraction}
      onPressOut={endInteraction}
      onPress={onPress}
      style={styles.motionPressable}
    >
      <Reanimated.View style={[styles.motionServiceCard, cardStyle]}>
        <View
          pointerEvents="none"
          style={[
            styles.motionServiceAccent,
            serviceType === 'electrical' ? styles.motionServiceAccentElectric : styles.motionServiceAccentWater,
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.motionServiceInset,
            serviceType === 'electrical' ? styles.motionServiceInsetElectric : styles.motionServiceInsetWater,
          ]}
        />
        <Reanimated.View pointerEvents="none" style={[styles.motionServiceSweep, sweepStyle]} />
        <Reanimated.View style={[styles.motionServiceIconWrap, iconWrapStyle]}>
          <Reanimated.View pointerEvents="none" style={[styles.motionIconRing, ringStyle]} />
          {serviceType === 'electrical' ? (
            <PlugSocketHeroIcon active={active} />
          ) : (
            <PipeValveHeroIcon active={active} />
          )}
        </Reanimated.View>
        <Text style={styles.motionServiceTitle}>{title}</Text>
        <Text style={styles.motionServiceMeta}>{active ? modeMeta : 'Chạm/hover để chạy motion'}</Text>
      </Reanimated.View>
    </Pressable>
  )
}

function MotionChip({
  active,
  label,
  serviceType,
  motionMode,
  onInteract,
  onPress,
}: {
  active: boolean
  label: string
  serviceType: ServiceType
  motionMode: MotionMode
  onInteract: () => void
  onPress: () => void
}) {
  const progress = useSharedValue(active ? 1 : 0)
  const touch = useSharedValue(0)
  const action = useSharedValue(0)

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    })
  }, [active, progress])

  const startInteraction = () => {
    onInteract()
    touch.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) })
    action.value = 0
    action.value = withSequence(
      withTiming(1, { duration: motionMode === 'trace' ? 330 : 230, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 440, easing: Easing.inOut(Easing.cubic) })
    )
  }

  const endInteraction = () => {
    touch.value = withTiming(0, { duration: 190, easing: Easing.out(Easing.cubic) })
  }

  const chipStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(Math.max(progress.value, touch.value), [0, 1], [palette.border, palette.tealStrong]),
    transform: [{ scale: 1 + progress.value * 0.012 + touch.value * 0.025 }],
  }))

  const fillStyle = useAnimatedStyle(() => ({
    opacity: 0.05 + progress.value * 0.86 + action.value * 0.22,
    transform: [{ translateX: -180 + progress.value * 180 + action.value * (motionMode === 'wave' ? 64 : 34) }],
  }))

  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [palette.text, '#FFFFFF']),
  }))

  return (
    <Pressable
      accessibilityRole="button"
      onHoverIn={startInteraction}
      onHoverOut={endInteraction}
      onPressIn={startInteraction}
      onPressOut={endInteraction}
      onPress={onPress}
    >
      <Reanimated.View style={[styles.motionChip, chipStyle]}>
        <Reanimated.View pointerEvents="none" style={[styles.motionChipFill, fillStyle]} />
        <ChipGlyph serviceType={serviceType} selected={active} />
        <Reanimated.Text style={[styles.motionChipText, textStyle]}>{label}</Reanimated.Text>
        <Text style={[styles.motionChipHint, active && styles.motionChipHintActive]}>
          {active ? 'đang chọn' : 'tap'}
        </Text>
      </Reanimated.View>
    </Pressable>
  )
}

function MotionDetailCard({
  serviceType,
  runKey,
  motionMode,
  onInteract,
}: {
  serviceType: ServiceType
  runKey: number
  motionMode: MotionMode
  onInteract: () => void
}) {
  const focus = useSharedValue(0)
  const attach = useSharedValue(0)
  const [dotKey, setDotKey] = useState(0)

  useEffect(() => {
    if (runKey === 0) return
    focus.value = 0
    attach.value = 0
    focus.value =
      withSequence(
        withTiming(1, { duration: motionMode === 'trace' ? 540 : 680, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 520, easing: Easing.inOut(Easing.cubic) })
      )
    attach.value = withDelay(
      160,
      withSequence(
        withTiming(1, { duration: 440, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 520, easing: Easing.inOut(Easing.cubic) })
      )
    )
    setDotKey((current) => current + 1)
  }, [attach, focus, motionMode, runKey])

  const startInteraction = () => {
    onInteract()
    focus.value = 0
    attach.value = 0
    focus.value = withSequence(
      withTiming(1, { duration: motionMode === 'trace' ? 540 : 680, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 520, easing: Easing.inOut(Easing.cubic) })
    )
    attach.value = withDelay(
      160,
      withSequence(
        withTiming(1, { duration: 440, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 520, easing: Easing.inOut(Easing.cubic) })
      )
    )
    setDotKey((current) => current + 1)
  }

  const inputStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], [palette.border, palette.mintInk]),
    backgroundColor: interpolateColor(
      focus.value,
      [0, 1],
      ['rgba(255, 255, 255, 0.86)', 'rgba(191, 238, 219, 0.58)']
    ),
  }))

  const focusLineStyle = useAnimatedStyle(() => ({
    opacity: 0.12 + focus.value * (motionMode === 'wave' ? 0.58 : 0.42),
    transform: [{ translateX: -118 + focus.value * (motionMode === 'wave' ? 310 : 260) }],
  }))

  const attachStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(attach.value, [0, 1], [palette.border, palette.tealStrong]),
    backgroundColor: interpolateColor(
      attach.value,
      [0, 1],
      ['rgba(255, 255, 255, 0.78)', 'rgba(207, 243, 244, 0.72)']
    ),
    transform: [{ translateY: -3 * attach.value }],
  }))

  return (
    <Pressable
      accessibilityRole="button"
      onHoverIn={startInteraction}
      onPress={startInteraction}
      style={({ pressed }) => [styles.detailMotionCard, pressed && styles.pressMotionSoft]}
    >
      <View style={styles.detailMotionHeader}>
        <ChipGlyph serviceType={serviceType} selected />
        <View style={styles.detailMotionCopy}>
          <Text style={styles.detailMotionTitle}>Mô tả cũng có phản hồi</Text>
          <Text style={styles.detailMotionText}>focus line + ảnh đính kèm nhịp nhẹ</Text>
        </View>
      </View>
      <Reanimated.View style={[styles.detailInputMock, inputStyle]}>
        <Reanimated.View pointerEvents="none" style={[styles.detailFocusLine, focusLineStyle]} />
        <Text style={styles.detailInputText}>Ví dụ: ống rò dưới lavabo, nước nhỏ liên tục...</Text>
      </Reanimated.View>
      <View style={styles.detailAttachRow}>
        {[0, 1, 2].map((index) => (
          <Reanimated.View key={index} style={[styles.detailAttachBox, index === 1 ? attachStyle : null]}>
            <DetailSignalDot index={index} runKey={dotKey} />
          </Reanimated.View>
        ))}
      </View>
    </Pressable>
  )
}

function DetailSignalDot({ index, runKey }: { index: number; runKey: number }) {
  const progress = useSharedValue(0)

  useEffect(() => {
    if (runKey === 0) return
    progress.value = 0
    progress.value = withDelay(
      index * 120,
      withSequence(
        withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 520, easing: Easing.inOut(Easing.cubic) })
      )
    )
  }, [index, progress, runKey])

  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.34 + progress.value * 0.56,
    transform: [{ scale: 0.82 + progress.value * 0.28 }],
  }))

  return <Reanimated.View style={[styles.detailSignalDot, dotStyle]} />
}

function KaelScanCard({
  runKey,
  motionMode,
  onInteract,
}: {
  runKey: number
  motionMode: MotionMode
  onInteract: () => void
}) {
  const scan = useSharedValue(0)
  const pulse = useSharedValue(0)
  const [dotKey, setDotKey] = useState(0)

  useEffect(() => {
    if (runKey === 0) return
    scan.value = 0
    pulse.value = 0
    scan.value = withSequence(
      withTiming(1, { duration: motionMode === 'wave' ? 980 : 760, easing: Easing.inOut(Easing.cubic) }),
      withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) })
    )
    pulse.value = withSequence(
      withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 520, easing: Easing.in(Easing.cubic) })
    )
    setDotKey((current) => current + 1)
  }, [motionMode, pulse, runKey, scan])

  const startInteraction = () => {
    onInteract()
    scan.value = 0
    pulse.value = 0
    scan.value = withSequence(
      withTiming(1, { duration: motionMode === 'wave' ? 980 : 760, easing: Easing.inOut(Easing.cubic) }),
      withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) })
    )
    pulse.value = withSequence(
      withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 520, easing: Easing.in(Easing.cubic) })
    )
    setDotKey((current) => current + 1)
  }

  const scanStyle = useAnimatedStyle(() => ({
    opacity: 0.18 + scan.value * 0.34,
    transform: [{ translateX: -120 + scan.value * 320 }, { rotate: '10deg' }],
  }))

  const orbStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + pulse.value * 0.45,
    transform: [{ scale: 0.82 + pulse.value * 0.28 }],
  }))

  return (
    <Pressable
      accessibilityRole="button"
      onHoverIn={startInteraction}
      onPress={startInteraction}
      style={({ pressed }) => [styles.scanCard, pressed && styles.pressMotionSoft]}
    >
      <Reanimated.View pointerEvents="none" style={[styles.scanBeam, scanStyle]} />
      <View style={styles.scanIconCell}>
        <Reanimated.View style={[styles.scanOrb, orbStyle]} />
        <Text style={styles.scanIconText}>K</Text>
      </View>
      <View style={styles.scanCopy}>
        <Text style={styles.scanTitle}>Kael đang đọc tín hiệu</Text>
        <Text style={styles.scanText}>vệt quét teal/aqua chạy qua nội dung</Text>
      </View>
      <View style={styles.scanDots}>
        {[0, 1, 2].map((index) => (
          <ScanDot key={index} index={index} runKey={dotKey} />
        ))}
      </View>
    </Pressable>
  )
}

function ScanDot({ index, runKey }: { index: number; runKey: number }) {
  const progress = useSharedValue(0)

  useEffect(() => {
    if (runKey === 0) return
    progress.value = 0
    progress.value = withDelay(
      index * 120,
      withSequence(
        withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 360, easing: Easing.in(Easing.cubic) })
      )
    )
  }, [index, progress, runKey])

  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.34 + progress.value * 0.66,
    transform: [{ translateY: -3 * progress.value }],
  }))

  return <Reanimated.View style={[styles.scanDot, dotStyle]} />
}

function EstimateRevealCard({
  runKey,
  motionMode,
  onInteract,
}: {
  runKey: number
  motionMode: MotionMode
  onInteract: () => void
}) {
  const price = useSharedValue(1)
  const rowOne = useSharedValue(1)
  const rowTwo = useSharedValue(1)
  const glow = useSharedValue(0)

  useEffect(() => {
    if (runKey === 0) return
    price.value = 0
    rowOne.value = 0
    rowTwo.value = 0
    glow.value = 0
    price.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) })
    rowOne.value = withDelay(120, withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }))
    rowTwo.value = withDelay(210, withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }))
    glow.value = withSequence(
      withTiming(1, { duration: motionMode === 'wave' ? 760 : 520, easing: Easing.inOut(Easing.cubic) }),
      withTiming(0, { duration: 460, easing: Easing.out(Easing.cubic) })
    )
  }, [glow, motionMode, price, rowOne, rowTwo, runKey])

  const priceStyle = useAnimatedStyle(() => ({
    opacity: price.value,
    transform: [{ translateY: 14 * (1 - price.value) }, { scale: 0.96 + price.value * 0.04 }],
  }))

  const rowOneStyle = useAnimatedStyle(() => ({
    opacity: rowOne.value,
    transform: [{ translateY: 10 * (1 - rowOne.value) }],
  }))

  const rowTwoStyle = useAnimatedStyle(() => ({
    opacity: rowTwo.value,
    transform: [{ translateY: 10 * (1 - rowTwo.value) }],
  }))

  const accentStyle = useAnimatedStyle(() => ({
    opacity: glow.value * (motionMode === 'wave' ? 0.62 : 0.4),
    transform: [{ translateX: -160 + glow.value * (motionMode === 'wave' ? 360 : 320) }],
  }))

  return (
    <Pressable
      accessibilityRole="button"
      onHoverIn={onInteract}
      onPress={onInteract}
      style={({ pressed }) => [styles.revealCard, pressed && styles.pressMotionSoft]}
    >
      <Reanimated.View pointerEvents="none" style={[styles.revealAccent, accentStyle]} />
      <Text style={styles.revealLabel}>Hiện ước tính</Text>
      <Reanimated.Text style={[styles.revealPrice, priceStyle]}>280.000 - 420.000đ</Reanimated.Text>
      <Reanimated.View style={[styles.revealRow, rowOneStyle]}>
        <Text style={styles.revealRowLabel}>Độ tin cậy</Text>
        <Text style={styles.revealRowValue}>Khá chắc</Text>
      </Reanimated.View>
      <Reanimated.View style={[styles.revealRow, rowTwoStyle]}>
        <Text style={styles.revealRowLabel}>Lưu ý</Text>
        <Text style={styles.revealRowValue}>Ngắt cầu dao nếu còn mùi khét</Text>
      </Reanimated.View>
    </Pressable>
  )
}

function PlugSocketHeroIcon({ active }: { active: boolean }) {
  const stroke = active ? palette.tealDeep : palette.text
  const softStroke = active ? palette.teal : palette.textMuted
  const accent = active ? palette.amber : palette.clay

  return (
    <Svg width={62} height={62} viewBox="0 0 62 62">
      <Rect
        x={9}
        y={15}
        width={25}
        height={32}
        rx={8}
        fill="none"
        stroke={stroke}
        strokeWidth={2.8}
      />
      <Line x1={18} y1={26} x2={18} y2={34} stroke={softStroke} strokeWidth={2.6} strokeLinecap="round" />
      <Line x1={26} y1={26} x2={26} y2={34} stroke={softStroke} strokeWidth={2.6} strokeLinecap="round" />
      <Line x1={19} y1={40} x2={25} y2={40} stroke={softStroke} strokeWidth={2.6} strokeLinecap="round" />
      <Path
        d="M37 24H44C48 24 51 27 51 31V35"
        fill="none"
        stroke={stroke}
        strokeWidth={2.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1={42} y1={19} x2={42} y2={24} stroke={softStroke} strokeWidth={2.5} strokeLinecap="round" />
      <Line x1={47} y1={19} x2={47} y2={24} stroke={softStroke} strokeWidth={2.5} strokeLinecap="round" />
      <Path d="M48 39L54 34" fill="none" stroke={accent} strokeWidth={2.5} strokeLinecap="round" />
      <Path d="M50 43H57" fill="none" stroke={accent} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  )
}

function PipeValveHeroIcon({ active }: { active: boolean }) {
  const stroke = active ? palette.tealDeep : palette.text
  const softStroke = active ? palette.teal : palette.textMuted
  const accent = active ? palette.amber : palette.clay

  return (
    <Svg width={62} height={62} viewBox="0 0 62 62">
      <Path
        d="M13 22H38C44 22 49 27 49 33V36"
        fill="none"
        stroke={stroke}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M35 36H52" fill="none" stroke={stroke} strokeWidth={3} strokeLinecap="round" />
      <Path d="M20 14H34" fill="none" stroke={softStroke} strokeWidth={2.7} strokeLinecap="round" />
      <Line x1={27} y1={14} x2={27} y2={22} stroke={softStroke} strokeWidth={2.7} strokeLinecap="round" />
      <Circle cx={27} cy={22} r={5} fill="none" stroke={softStroke} strokeWidth={2.3} />
      <Path
        d="M20 43C20 37.5 28 30 28 30C28 30 36 37.5 36 43C36 47.8 32.6 51 28 51C23.4 51 20 47.8 20 43Z"
        fill="none"
        stroke={accent}
        strokeWidth={2.7}
        strokeLinejoin="round"
      />
      <Circle cx={50} cy={42} r={2.4} fill={accent} />
    </Svg>
  )
}

function ServiceScreen({
  serviceType,
  selectedChips,
  chips,
  selectionPulse,
  interactionPulse,
  onSelectService,
  onToggleChip,
}: {
  serviceType: ServiceType
  selectedChips: string[]
  chips: readonly string[]
  selectionPulse: Animated.Value
  interactionPulse: Animated.Value
  onSelectService: (serviceType: ServiceType) => void
  onToggleChip: (chip: string) => void
}) {
  const activeScale = interactionPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.025],
  })
  const activeLift = interactionPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -3],
  })
  const sweepTranslate = interactionPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [-90, 210],
  })
  const sweepOpacity = interactionPulse.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0, 0.34, 0],
  })

  return (
    <View style={styles.screenBlock}>
      <View style={styles.serviceGrid}>
        {SERVICES.map((service) => {
          const active = service.type === serviceType
          return (
            <Animated.View
              key={service.type}
              style={[
                styles.serviceTileMotion,
                active && {
                  transform: [{ translateY: activeLift }, { scale: activeScale }],
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => onSelectService(service.type)}
                style={({ pressed }) => [
                  styles.serviceTile,
                  active && styles.serviceTileActive,
                  active && service.type === 'electrical' && styles.serviceTileActiveElectric,
                  active && service.type === 'plumbing' && styles.serviceTileActiveWater,
                  pressed && styles.pressed,
                  pressed && styles.pressMotion,
                ]}
              >
                {active ? (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.serviceTileAccent,
                      service.type === 'electrical'
                        ? styles.serviceTileAccentElectric
                        : styles.serviceTileAccentWater,
                    ]}
                  />
                ) : null}
                {active ? (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.serviceTileInnerLayer,
                      service.type === 'electrical'
                        ? styles.serviceTileInnerElectric
                        : styles.serviceTileInnerWater,
                    ]}
                  />
                ) : null}
                {active ? (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.serviceTileSweep,
                      {
                        opacity: sweepOpacity,
                        transform: [{ translateX: sweepTranslate }, { rotate: '12deg' }],
                      },
                    ]}
                  />
                ) : null}
                <ServiceIcon
                  serviceType={service.type}
                  tone={service.tone}
                  active={active}
                  pulse={selectionPulse}
                  actionPulse={interactionPulse}
                />
                <View style={styles.serviceBody}>
                  <Text style={styles.serviceTitle}>{service.title}</Text>
                  <Text style={styles.serviceSubtitle}>{service.subtitle}</Text>
                </View>
                <Text style={[styles.serviceState, active && styles.serviceStateActive]}>
                  {active ? 'Đang chọn' : 'Chọn'}
                </Text>
              </Pressable>
            </Animated.View>
          )
        })}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Vấn đề thường gặp</Text>
        <View style={styles.chipGrid}>
          {chips.map((chip) => {
            const selected = selectedChips.includes(chip)
            return (
              <Pressable
                key={chip}
                accessibilityRole="button"
                onPress={() => onToggleChip(chip)}
                style={({ pressed }) => [
                  styles.problemChip,
                  selected && styles.problemChipSelected,
                  selected &&
                    serviceType === 'electrical' &&
                    styles.problemChipSelectedElectric,
                  selected &&
                    serviceType === 'plumbing' &&
                    styles.problemChipSelectedWater,
                  pressed && styles.pressed,
                  pressed && styles.pressMotionSoft,
                ]}
              >
                {selected ? (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.chipActionSheen,
                      {
                        opacity: sweepOpacity,
                        transform: [{ translateX: sweepTranslate }],
                      },
                    ]}
                  />
                ) : null}
                <ChipGlyph serviceType={serviceType} selected={selected} />
                <Text
                  style={[
                    styles.problemChipText,
                    selected && styles.problemChipTextSelected,
                  ]}
                >
                  {chip}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>
    </View>
  )
}

function DetailsScreen({
  description,
  onChangeDescription,
}: {
  description: string
  onChangeDescription: (value: string) => void
}) {
  return (
    <View style={styles.screenBlock}>
      <View style={styles.inputBlock}>
        <Text style={styles.fieldLabel}>Mô tả ngắn</Text>
        <TextInput
          multiline
          value={description}
          onChangeText={onChangeDescription}
          placeholder="Ví dụ: ổ cắm bị nóng, nước rò dưới bồn rửa..."
          placeholderTextColor={palette.textMuted}
          style={styles.textArea}
          textAlignVertical="top"
        />
      </View>

      <View style={styles.mediaStrip}>
        <View style={styles.mediaItem}>
          <MediaGlyph tone="primary" />
          <View style={styles.mediaTextStack}>
            <Text style={styles.mediaTitle}>Ảnh</Text>
            <Text style={styles.mediaCopy}>Thêm tối đa 5 ảnh</Text>
          </View>
        </View>
        <View style={styles.mediaItemMuted}>
          <MediaGlyph tone="muted" />
          <View style={styles.mediaTextStack}>
            <Text style={styles.mediaTitleMuted}>Video</Text>
            <Text style={styles.mediaCopyMuted}>Sau MVP</Text>
          </View>
        </View>
      </View>

      <View style={styles.guidanceBand}>
        <Text style={styles.guidanceTitle}>Gợi ý mô tả tốt</Text>
        <Text style={styles.guidanceCopy}>
          Nêu vị trí, dấu hiệu, thời điểm xảy ra và điều bạn đã thử. Không cần ghi số
          điện thoại hoặc địa chỉ đầy đủ.
        </Text>
      </View>
    </View>
  )
}

function ClarificationScreen({
  answers,
  setAnswers,
}: {
  answers: Record<number, string>
  setAnswers: (value: Record<number, string>) => void
}) {
  return (
    <View style={styles.screenBlock}>
      {QUESTIONS.map((question, index) => (
        <View key={question.label} style={styles.questionRow}>
          <View style={styles.questionHeader}>
            <QuestionGlyph />
            <Text style={styles.questionLabel}>{question.label}</Text>
          </View>
          <View style={styles.answerGrid}>
            {question.options.map((option) => {
              const active = answers[index] === option
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  onPress={() => setAnswers({ ...answers, [index]: option })}
                  style={({ pressed }) => [
                    styles.answerChip,
                    active && styles.answerChipActive,
                    pressed && styles.pressed,
                    pressed && styles.pressMotionSoft,
                  ]}
                >
                  <Text style={[styles.answerText, active && styles.answerTextActive]}>
                    {option}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
}

function LoadingScreen() {
  const spin = useRef(new Animated.Value(0)).current
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const spinAnimation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1700,
        useNativeDriver: true,
      })
    )
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    )

    spinAnimation.start()
    pulseAnimation.start()

    return () => {
      spinAnimation.stop()
      pulseAnimation.stop()
    }
  }, [pulse, spin])

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })
  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.08],
  })
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.42],
  })

  return (
    <View style={styles.statusScreen}>
      <View style={styles.statusGlyph}>
        <Animated.View
          style={[
            styles.statusPulseRing,
            {
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
        <Animated.View style={[styles.statusOrbit, { transform: [{ rotate }] }]}>
          <View style={styles.statusOrbitDot} />
        </Animated.View>
        <ActivityIndicator color={palette.tealStrong} />
      </View>
      <Text style={styles.statusTitle}>Kael đang phân tích</Text>
      <Text style={styles.statusCopy}>
        Đang đối chiếu mô tả, nhóm vấn đề và baseline giá an toàn. Màn này là
        trạng thái mẫu, chưa gọi AI thật.
      </Text>
    </View>
  )
}

function EstimateScreen() {
  return (
    <View style={styles.screenBlock}>
      <View style={styles.estimateHeader}>
        <Text style={styles.estimateLabel}>Khoảng giá thị trường</Text>
        <Text style={styles.priceValue}>{estimateFixture.range}</Text>
        <Text style={styles.estimateMeta}>
          {estimateFixture.complexity} · {estimateFixture.confidence}
        </Text>
      </View>

      <View style={styles.estimateList}>
        <InfoRow icon="problem" label="Vấn đề nhận diện" value={estimateFixture.problem} />
        <InfoRow icon="reason" label="Vì sao giá ở khoảng này" value={estimateFixture.reason} />
        <InfoRow icon="safety" label="Lưu ý an toàn" value={estimateFixture.advisory} />
      </View>

      <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
    </View>
  )
}

function FallbackScreen() {
  return (
    <View style={styles.fallbackScreen}>
      <InfoGlyph icon="safety" />
      <Text style={styles.fallbackTitle}>Chưa đủ tín hiệu để ước tính bằng AI</Text>
      <Text style={styles.fallbackCopy}>
        Nếu AI hoặc dữ liệu thị trường lỗi, app phải nói rõ đang dùng baseline an toàn
        hoặc yêu cầu mô tả lại. Không bịa giá và không báo thành công giả.
      </Text>
      <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
    </View>
  )
}

function InfoRow({ icon, label, value }: { icon: InfoIcon; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <InfoGlyph icon={icon} />
      <View style={styles.infoTextStack}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  )
}

function ServiceIcon({
  serviceType,
  tone,
  active,
  pulse,
  actionPulse,
}: {
  serviceType: ServiceType
  tone: 'aqua' | 'mint'
  active: boolean
  pulse: Animated.Value
  actionPulse: Animated.Value
}) {
  const tileTone = tone === 'aqua' ? styles.outlineIconAqua : styles.outlineIconMint
  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.08],
  })
  const haloOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.14, 0.38],
  })
  const actionRingScale = actionPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1.28],
  })
  const actionRingOpacity = actionPulse.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [0, 0.42, 0],
  })
  const iconStroke = serviceType === 'electrical' && active ? palette.copper : palette.deepMint
  const iconSoftStroke = serviceType === 'electrical' && active ? palette.amber : palette.sage

  return (
    <View style={[styles.outlineIconTile, tileTone, active && styles.outlineIconTileActive]}>
      {active ? (
        <Animated.View
          style={[
            styles.iconPulseRing,
            {
              opacity: haloOpacity,
              transform: [{ scale: haloScale }],
            },
          ]}
        />
      ) : null}
      {active ? (
        <Animated.View
          style={[
            styles.iconActionRing,
            {
              opacity: actionRingOpacity,
              transform: [{ scale: actionRingScale }],
            },
          ]}
        />
      ) : null}
      {serviceType === 'electrical' ? (
        <OutletSvgIcon active={active} stroke={iconStroke} softStroke={iconSoftStroke} />
      ) : (
        <FaucetSvgIcon active={active} stroke={iconStroke} softStroke={iconSoftStroke} />
      )}
    </View>
  )
}

function OutletSvgIcon({
  active,
  stroke,
  softStroke,
}: {
  active: boolean
  stroke: string
  softStroke: string
}) {
  const accent = active ? palette.amber : palette.clay

  return (
    <Svg width={42} height={42} viewBox="0 0 42 42">
      <Rect
        x={10}
        y={7}
        width={22}
        height={28}
        rx={7}
        fill="none"
        stroke={stroke}
        strokeWidth={2.4}
      />
      <Line
        x1={17}
        y1={16}
        x2={17}
        y2={23}
        stroke={softStroke}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <Line
        x1={25}
        y1={16}
        x2={25}
        y2={23}
        stroke={softStroke}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <Path
        d="M18.5 28H23.5"
        fill="none"
        stroke={softStroke}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <Path
        d="M33 11.5L38 8.5"
        fill="none"
        stroke={accent}
        strokeWidth={2.3}
        strokeLinecap="round"
      />
      <Path
        d="M34 17.5H39"
        fill="none"
        stroke={accent}
        strokeWidth={2.3}
        strokeLinecap="round"
      />
      <Path
        d="M32.5 23L36.5 26"
        fill="none"
        stroke={accent}
        strokeWidth={2.3}
        strokeLinecap="round"
      />
    </Svg>
  )
}

function FaucetSvgIcon({
  active,
  stroke,
  softStroke,
}: {
  active: boolean
  stroke: string
  softStroke: string
}) {
  const accent = active ? palette.amber : palette.clay

  return (
    <Svg width={42} height={42} viewBox="0 0 42 42">
      <Path
        d="M12 14H28C31 14 33 16 33 19V22"
        fill="none"
        stroke={stroke}
        strokeWidth={2.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M24 22H34"
        fill="none"
        stroke={stroke}
        strokeWidth={2.7}
        strokeLinecap="round"
      />
      <Path
        d="M15 9H24"
        fill="none"
        stroke={softStroke}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <Line
        x1={19.5}
        y1={9}
        x2={19.5}
        y2={14}
        stroke={softStroke}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <Path
        d="M17 27C17 23.8 21 20 21 20C21 20 25 23.8 25 27C25 29.4 23.3 31 21 31C18.7 31 17 29.4 17 27Z"
        fill="none"
        stroke={accent}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <Circle cx={33} cy={26} r={1.7} fill={accent} />
    </Svg>
  )
}

function ChipGlyph({
  serviceType,
  selected,
}: {
  serviceType: ServiceType
  selected: boolean
}) {
  const stroke = selected ? '#FFFFFF' : palette.tealDeep
  const softStroke = selected ? 'rgba(255, 255, 255, 0.82)' : palette.sage

  return (
    <View style={[styles.chipGlyphFrame, selected && styles.chipGlyphFrameSelected]}>
      {serviceType === 'electrical' ? (
        <Svg width={18} height={18} viewBox="0 0 18 18">
          <Rect
            x={5}
            y={3.5}
            width={8}
            height={11}
            rx={3}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
          />
          <Line
            x1={8}
            y1={7}
            x2={8}
            y2={10}
            stroke={softStroke}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
          <Line
            x1={10.6}
            y1={7}
            x2={10.6}
            y2={10}
            stroke={softStroke}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </Svg>
      ) : (
        <Svg width={18} height={18} viewBox="0 0 18 18">
          <Path
            d="M4 6.5H11.2C12.6 6.5 13.6 7.5 13.6 8.9V10"
            fill="none"
            stroke={stroke}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M10 10H14"
            fill="none"
            stroke={stroke}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <Path
            d="M6.2 4H10"
            fill="none"
            stroke={softStroke}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <Path
            d="M6.5 13.2C6.5 11.9 8.2 10.2 8.2 10.2C8.2 10.2 9.9 11.9 9.9 13.2C9.9 14.3 9.2 15 8.2 15C7.2 15 6.5 14.3 6.5 13.2Z"
            fill="none"
            stroke={softStroke}
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        </Svg>
      )}
    </View>
  )
}

function MediaGlyph({ tone }: { tone: 'primary' | 'muted' }) {
  const primary = tone === 'primary'

  return (
    <View style={[styles.mediaGlyph, primary ? styles.mediaGlyphPrimary : styles.mediaGlyphMuted]}>
      <View
        style={[
          styles.mediaGlyphFrame,
          primary ? styles.mediaGlyphStrokePrimary : styles.mediaGlyphStrokeMuted,
        ]}
      >
        <View style={[styles.mediaGlyphDot, primary && styles.mediaGlyphDotPrimary]} />
      </View>
    </View>
  )
}

function QuestionGlyph() {
  return (
    <View style={styles.questionGlyph}>
      <View style={styles.questionGlyphTop} />
      <View style={styles.questionGlyphBottom} />
    </View>
  )
}

function InfoGlyph({ icon }: { icon: InfoIcon }) {
  return (
    <View style={[styles.infoGlyph, icon === 'safety' && styles.infoGlyphSafety]}>
      {icon === 'problem' ? (
        <>
          <View style={styles.infoGlyphProblemA} />
          <View style={styles.infoGlyphProblemB} />
        </>
      ) : icon === 'reason' ? (
        <>
          <View style={styles.infoGlyphReasonA} />
          <View style={styles.infoGlyphReasonB} />
          <View style={styles.infoGlyphReasonC} />
        </>
      ) : (
        <>
          <View style={styles.infoGlyphSafetyA} />
          <View style={styles.infoGlyphSafetyB} />
        </>
      )}
    </View>
  )
}

const palette = {
  canvas: '#F8FCFA',
  canvasTint: '#F5FBF7',
  surface: '#FFFFFF',
  surfaceWarm: '#FFFDF8',
  wash: '#EEF9F5',
  washSoft: '#F4FBF8',
  mint: '#DDF4EA',
  mintStrong: '#BFEEDB',
  mintBright: '#A8EED3',
  mintDeep: '#8DD8BE',
  mintInk: '#2F8F75',
  seafoam: '#E4FBF1',
  mintVivid: '#6FD0B2',
  mintPeak: '#49C99E',
  jade: '#0F9B82',
  deepMint: '#0C756C',
  mistMint: '#EFFCF5',
  jadeSoft: '#C7F2DD',
  forest: '#075F58',
  leafVeil: '#D8F8E8',
  mineralMist: '#F1FAF7',
  mossLine: '#75D6B2',
  copperInk: '#91512C',
  electricTint: '#FFF8E8',
  electricGlow: '#FFEAB9',
  waterTint: '#EAF8FF',
  waterGlow: '#CBEFFF',
  copperSoft: '#F6DFCE',
  copperVeil: '#FFE2C5',
  copper: '#B87442',
  priceWash: '#FFF4D7',
  priceGold: '#E1A83E',
  aqua: '#CFF3F4',
  teal: '#4ABDC0',
  tealStrong: '#14989D',
  tealDeep: '#167D80',
  sage: '#7BBFA7',
  lemon: '#FFF2A8',
  amber: '#C8922D',
  clay: '#B9784D',
  ink: '#1E2B2D',
  text: '#3F4D50',
  textMuted: '#7B8A8D',
  border: '#DCEDEA',
  borderStrong: '#BFE3DD',
  danger: '#B15A45',
}

const typography = {
  regular:
    'Aptos, Inter, Geist, Manrope, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  medium:
    'Aptos, Inter, Geist, Manrope, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: palette.canvas,
    width: '100%',
    overflow: 'hidden',
  },
  shellWide: {
    maxWidth: 440,
    alignSelf: 'center',
  },
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    padding: 20,
    gap: 18,
    paddingBottom: 118,
  },
  backgroundLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: palette.canvas,
  },
  backgroundWash: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: 220,
    backgroundColor: palette.mistMint,
  },
  backgroundMintField: {
    position: 'absolute',
    top: 78,
    left: 0,
    width: '38%',
    height: 360,
    backgroundColor: 'rgba(216, 248, 232, 0.5)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(73, 201, 158, 0.2)',
  },
  backgroundWarmField: {
    position: 'absolute',
    top: 250,
    right: 0,
    width: '46%',
    height: 220,
    backgroundColor: 'rgba(255, 226, 197, 0.32)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(184, 116, 66, 0.14)',
  },
  backgroundJadeThread: {
    position: 'absolute',
    top: 112,
    left: 22,
    width: 2,
    height: 330,
    backgroundColor: 'rgba(7, 95, 88, 0.12)',
  },
  backgroundCopperThread: {
    position: 'absolute',
    top: 314,
    right: 28,
    width: 2,
    height: 210,
    backgroundColor: 'rgba(184, 116, 66, 0.16)',
  },
  backgroundSoftBand: {
    position: 'absolute',
    top: 142,
    right: 0,
    left: 0,
    height: 96,
    backgroundColor: 'rgba(111, 208, 178, 0.22)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(191, 227, 221, 0.42)',
  },
  backgroundEdge: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: 3,
    backgroundColor: palette.teal,
  },
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pageTitle: {
    fontFamily: typography.medium,
    color: palette.ink,
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: 0,
  },
  prototypeNote: {
    fontFamily: typography.regular,
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0,
  },
  fixtureBadge: {
    minHeight: 32,
    borderRadius: 8,
    backgroundColor: palette.priceWash,
    borderWidth: 1,
    borderColor: 'rgba(184, 116, 66, 0.3)',
    paddingHorizontal: 11,
    justifyContent: 'center',
  },
  fixtureBadgeText: {
    fontFamily: typography.medium,
    color: palette.copper,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  contextStrip: {
    minHeight: 86,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(15, 155, 130, 0.32)',
    backgroundColor: 'rgba(255, 253, 248, 0.96)',
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    overflow: 'hidden',
    boxShadow: '0 14px 32px rgba(12, 117, 108, 0.1)',
  },
  contextMaterialRail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 6,
    backgroundColor: palette.forest,
  },
  contextColumn: {
    flex: 1,
    gap: 3,
  },
  contextLabel: {
    fontFamily: typography.medium,
    color: palette.jade,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  contextValue: {
    fontFamily: typography.medium,
    color: palette.ink,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    letterSpacing: 0,
  },
  scopePill: {
    minHeight: 30,
    borderRadius: 8,
    backgroundColor: palette.electricGlow,
    borderWidth: 1,
    borderColor: 'rgba(184, 116, 66, 0.28)',
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  scopePillText: {
    fontFamily: typography.medium,
    color: palette.copper,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  prototypeScope: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(20, 152, 157, 0.22)',
    backgroundColor: 'rgba(234, 248, 255, 0.72)',
    padding: 14,
  },
  prototypeScopeText: {
    fontFamily: typography.regular,
    color: palette.text,
    fontSize: 13,
    lineHeight: 19,
    letterSpacing: 0,
  },
  colorSignaturePanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(7, 95, 88, 0.22)',
    backgroundColor: 'rgba(255, 253, 248, 0.99)',
    padding: 14,
    gap: 12,
    overflow: 'hidden',
    boxShadow: '0 24px 54px rgba(7, 95, 88, 0.13)',
  },
  colorSignatureAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    backgroundColor: palette.forest,
  },
  colorSignatureDepthRail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 7,
  },
  colorSignatureDepthSegment: {
    flex: 1,
  },
  colorSignatureDepthMint: {
    backgroundColor: palette.mossLine,
  },
  colorSignatureDepthTeal: {
    backgroundColor: palette.forest,
  },
  colorSignatureDepthCopper: {
    backgroundColor: palette.priceGold,
  },
  colorSignatureHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  colorSignatureKicker: {
    fontFamily: typography.medium,
    color: palette.jade,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  colorSignatureTitle: {
    marginTop: 2,
    fontFamily: typography.medium,
    color: palette.ink,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
    letterSpacing: 0,
  },
  colorSignalStack: {
    flexDirection: 'row',
    gap: 5,
    paddingTop: 3,
  },
  colorSignalDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  colorSignalDotMint: {
    backgroundColor: palette.mossLine,
  },
  colorSignalDotTeal: {
    backgroundColor: palette.forest,
  },
  colorSignalDotCopper: {
    backgroundColor: palette.priceGold,
  },
  colorSwatchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  colorSwatch: {
    flex: 1,
    minHeight: 70,
    borderRadius: 8,
    borderWidth: 1,
    padding: 9,
    justifyContent: 'space-between',
  },
  colorSwatchTrust: {
    backgroundColor: palette.mineralMist,
    borderColor: 'rgba(7, 95, 88, 0.18)',
  },
  colorSwatchAction: {
    backgroundColor: palette.leafVeil,
    borderColor: palette.mossLine,
  },
  colorSwatchMoney: {
    backgroundColor: palette.copperVeil,
    borderColor: 'rgba(145, 81, 44, 0.26)',
  },
  colorSwatchLabel: {
    fontFamily: typography.medium,
    color: palette.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  colorSwatchValue: {
    fontFamily: typography.regular,
    color: palette.text,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0,
  },
  colorRoleRow: {
    flexDirection: 'row',
    gap: 7,
  },
  colorRolePill: {
    flex: 1,
    minHeight: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  colorRoleElectric: {
    backgroundColor: palette.electricTint,
    borderColor: 'rgba(184, 116, 66, 0.28)',
  },
  colorRoleWater: {
    backgroundColor: palette.waterTint,
    borderColor: 'rgba(20, 152, 157, 0.28)',
  },
  colorRoleEstimate: {
    backgroundColor: palette.copperVeil,
    borderColor: 'rgba(225, 168, 62, 0.38)',
  },
  colorRoleText: {
    fontFamily: typography.medium,
    color: palette.ink,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center',
  },
  colorMaterialStack: {
    minHeight: 82,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(7, 95, 88, 0.16)',
    backgroundColor: palette.mineralMist,
    overflow: 'hidden',
  },
  colorMaterialLayer: {
    position: 'absolute',
    borderRadius: 8,
    borderWidth: 1,
  },
  colorMaterialLayerBase: {
    top: 12,
    left: 12,
    right: 54,
    bottom: 18,
    backgroundColor: palette.leafVeil,
    borderColor: 'rgba(117, 214, 178, 0.42)',
  },
  colorMaterialLayerCore: {
    top: 22,
    left: 40,
    right: 22,
    bottom: 10,
    backgroundColor: 'rgba(199, 242, 221, 0.9)',
    borderColor: 'rgba(7, 95, 88, 0.18)',
  },
  colorMaterialLayerPrice: {
    top: 10,
    right: 12,
    width: 74,
    height: 38,
    backgroundColor: palette.copperVeil,
    borderColor: 'rgba(145, 81, 44, 0.22)',
  },
  colorMaterialNeedle: {
    position: 'absolute',
    top: 12,
    bottom: 12,
    left: 20,
    width: 3,
    borderRadius: 2,
    backgroundColor: palette.forest,
  },
  motionLab: {
    gap: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(15, 155, 130, 0.34)',
    backgroundColor: 'rgba(239, 252, 245, 0.94)',
    padding: 12,
    boxShadow: '0 18px 42px rgba(12, 117, 108, 0.08)',
  },
  motionLabHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  motionLabKicker: {
    fontFamily: typography.medium,
    color: palette.jade,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  motionLabTitle: {
    fontFamily: typography.medium,
    color: palette.ink,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
    letterSpacing: 0,
  },
  motionLabSubtitle: {
    marginTop: 3,
    fontFamily: typography.regular,
    color: palette.text,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0,
  },
  replayButton: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.mintPeak,
    backgroundColor: palette.seafoam,
    paddingHorizontal: 11,
    justifyContent: 'center',
  },
  replayButtonText: {
    fontFamily: typography.medium,
    color: palette.deepMint,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  motionModeRow: {
    flexDirection: 'row',
    gap: 7,
  },
  motionModePill: {
    flex: 1,
    minHeight: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(73, 201, 158, 0.26)',
    backgroundColor: 'rgba(255, 253, 248, 0.84)',
    padding: 8,
    gap: 3,
  },
  motionModePillActive: {
    borderColor: palette.mintPeak,
    backgroundColor: palette.jadeSoft,
    boxShadow: '0 10px 22px rgba(12, 117, 108, 0.13)',
  },
  motionModeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.borderStrong,
  },
  motionModeDotActive: {
    backgroundColor: palette.deepMint,
  },
  motionModeLabel: {
    fontFamily: typography.medium,
    color: palette.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  motionModeLabelActive: {
    color: palette.tealDeep,
  },
  motionModeCaption: {
    fontFamily: typography.regular,
    color: palette.textMuted,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0,
  },
  motionModeCaptionActive: {
    color: palette.text,
  },
  rhythmRail: {
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(73, 201, 158, 0.34)',
    backgroundColor: 'rgba(255, 253, 248, 0.82)',
    padding: 6,
    flexDirection: 'row',
    gap: 6,
  },
  rhythmStep: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  rhythmStepFill: {
    position: 'absolute',
    top: -16,
    bottom: -16,
    width: 42,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    transform: [{ rotate: '12deg' }],
  },
  rhythmStepDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  rhythmStepLabel: {
    fontFamily: typography.medium,
    color: palette.ink,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center',
  },
  motionServiceGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  motionPressable: {
    flex: 1,
  },
  motionServiceCard: {
    minHeight: 154,
    borderRadius: 8,
    borderWidth: 1.5,
    padding: 14,
    gap: 10,
    overflow: 'hidden',
    boxShadow: '0 14px 30px rgba(12, 117, 108, 0.1)',
  },
  motionServiceAccent: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 5,
  },
  motionServiceAccentElectric: {
    backgroundColor: palette.priceGold,
  },
  motionServiceAccentWater: {
    backgroundColor: palette.tealStrong,
  },
  motionServiceInset: {
    position: 'absolute',
    right: 9,
    top: 9,
    width: 52,
    height: 24,
    borderRadius: 8,
    borderWidth: 1,
  },
  motionServiceInsetElectric: {
    backgroundColor: 'rgba(255, 226, 197, 0.46)',
    borderColor: 'rgba(225, 168, 62, 0.26)',
  },
  motionServiceInsetWater: {
    backgroundColor: 'rgba(203, 239, 255, 0.42)',
    borderColor: 'rgba(20, 152, 157, 0.24)',
  },
  motionServiceSweep: {
    position: 'absolute',
    top: -28,
    bottom: -28,
    width: 68,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
  },
  motionServiceIconWrap: {
    width: 74,
    height: 74,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(20, 152, 157, 0.22)',
  },
  motionIconRing: {
    position: 'absolute',
    top: 8,
    right: 8,
    bottom: 8,
    left: 8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: palette.amber,
  },
  motionServiceTitle: {
    fontFamily: typography.medium,
    color: palette.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: 0,
  },
  motionServiceMeta: {
    fontFamily: typography.regular,
    color: palette.text,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0,
  },
  motionChip: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    overflow: 'hidden',
  },
  motionChipFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '120%',
    backgroundColor: palette.jade,
  },
  motionChipText: {
    flex: 1,
    fontFamily: typography.medium,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    letterSpacing: 0,
  },
  motionChipHint: {
    fontFamily: typography.medium,
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
  motionChipHintActive: {
    color: '#FFFFFF',
  },
  detailMotionCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(73, 201, 158, 0.32)',
    backgroundColor: 'rgba(255, 253, 248, 0.9)',
    padding: 12,
    gap: 10,
    overflow: 'hidden',
  },
  detailMotionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  detailMotionCopy: {
    flex: 1,
    gap: 2,
  },
  detailMotionTitle: {
    fontFamily: typography.medium,
    color: palette.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 0,
  },
  detailMotionText: {
    fontFamily: typography.regular,
    color: palette.text,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0,
  },
  detailInputMock: {
    minHeight: 58,
    borderRadius: 8,
    borderWidth: 1.2,
    paddingHorizontal: 12,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  detailFocusLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 74,
    backgroundColor: 'rgba(73, 201, 158, 0.42)',
  },
  detailInputText: {
    fontFamily: typography.regular,
    color: palette.text,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0,
  },
  detailAttachRow: {
    flexDirection: 'row',
    gap: 8,
  },
  detailAttachBox: {
    width: 42,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.washSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailSignalDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.mintInk,
  },
  scanCard: {
    minHeight: 98,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(73, 201, 158, 0.4)',
    backgroundColor: 'rgba(228, 251, 241, 0.78)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  scanBeam: {
    position: 'absolute',
    top: -32,
    bottom: -32,
    width: 64,
    backgroundColor: 'rgba(73, 201, 158, 0.5)',
  },
  scanIconCell: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: palette.mintStrong,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  scanOrb: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: palette.mintInk,
  },
  scanIconText: {
    fontFamily: typography.medium,
    color: palette.tealDeep,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0,
  },
  scanCopy: {
    flex: 1,
    gap: 3,
  },
  scanTitle: {
    fontFamily: typography.medium,
    color: palette.ink,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    letterSpacing: 0,
  },
  scanText: {
    fontFamily: typography.regular,
    color: palette.text,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0,
  },
  scanDots: {
    flexDirection: 'row',
    gap: 4,
  },
  scanDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.tealDeep,
  },
  revealCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(184, 116, 66, 0.24)',
    backgroundColor: 'rgba(255, 253, 248, 0.94)',
    padding: 14,
    gap: 9,
    overflow: 'hidden',
  },
  revealAccent: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 92,
    backgroundColor: 'rgba(255, 244, 215, 0.95)',
  },
  revealLabel: {
    fontFamily: typography.medium,
    color: palette.tealDeep,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  revealPrice: {
    fontFamily: typography.medium,
    color: palette.deepMint,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
  },
  revealRow: {
    borderRadius: 8,
    backgroundColor: 'rgba(228, 251, 241, 0.72)',
    padding: 10,
    gap: 3,
  },
  revealRowLabel: {
    fontFamily: typography.medium,
    color: palette.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 0,
  },
  revealRowValue: {
    fontFamily: typography.regular,
    color: palette.text,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0,
  },
  hero: {
    backgroundColor: palette.surfaceWarm,
    borderColor: 'rgba(73, 201, 158, 0.24)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    gap: 7,
    boxShadow: '0 8px 22px rgba(30, 43, 45, 0.06)',
  },
  heroKicker: {
    fontFamily: typography.medium,
    color: palette.jade,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  heroTitle: {
    fontFamily: typography.medium,
    color: palette.ink,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: 0,
  },
  heroCopy: {
    fontFamily: typography.regular,
    color: palette.text,
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: 0,
  },
  stepper: {
    backgroundColor: 'rgba(245, 251, 247, 0.88)',
    borderColor: 'rgba(73, 201, 158, 0.24)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    minHeight: 64,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  stepDotDone: {
    backgroundColor: palette.mint,
    borderColor: palette.sage,
  },
  stepDotActive: {
    backgroundColor: palette.deepMint,
    borderColor: palette.deepMint,
  },
  stepDotText: {
    fontFamily: typography.medium,
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
  },
  stepDotTextActive: {
    color: '#FFFFFF',
  },
  stepLabel: {
    fontFamily: typography.medium,
    color: palette.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0,
  },
  stepLabelActive: {
    color: palette.tealDeep,
  },
  demoControl: {
    gap: 8,
  },
  demoControlLabel: {
    fontFamily: typography.medium,
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  reviewRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reviewChip: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 11,
    justifyContent: 'center',
  },
  reviewChipActive: {
    backgroundColor: palette.deepMint,
    borderColor: palette.deepMint,
  },
  reviewChipText: {
    fontFamily: typography.medium,
    color: palette.text,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  reviewChipTextActive: {
    color: '#FFFFFF',
  },
  flowHeader: {
    gap: 4,
  },
  flowTitle: {
    fontFamily: typography.medium,
    color: palette.ink,
    fontSize: 22,
    lineHeight: 29,
    fontWeight: '700',
    letterSpacing: 0,
  },
  flowCaption: {
    fontFamily: typography.regular,
    color: palette.text,
    fontSize: 14,
    lineHeight: 22,
    letterSpacing: 0,
  },
  motionSurface: {
    minHeight: 360,
  },
  screenBlock: {
    gap: 18,
  },
  serviceGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  serviceTileMotion: {
    flex: 1,
  },
  serviceTile: {
    flex: 1,
    minHeight: 154,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 12,
    justifyContent: 'space-between',
    boxShadow: '0 8px 18px rgba(30, 43, 45, 0.04)',
    overflow: 'hidden',
  },
  serviceTileActive: {
    backgroundColor: palette.seafoam,
    borderColor: palette.mintPeak,
    boxShadow: '0 12px 26px rgba(12, 117, 108, 0.1)',
  },
  serviceTileActiveElectric: {
    backgroundColor: 'rgba(255, 248, 232, 0.99)',
    borderColor: 'rgba(145, 81, 44, 0.28)',
  },
  serviceTileActiveWater: {
    backgroundColor: 'rgba(234, 248, 255, 0.98)',
    borderColor: 'rgba(7, 95, 88, 0.22)',
  },
  serviceTileAccent: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 5,
  },
  serviceTileAccentElectric: {
    backgroundColor: palette.priceGold,
  },
  serviceTileAccentWater: {
    backgroundColor: palette.forest,
  },
  serviceTileInnerLayer: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 42,
    height: 22,
    borderRadius: 8,
    borderWidth: 1,
  },
  serviceTileInnerElectric: {
    backgroundColor: 'rgba(255, 226, 197, 0.48)',
    borderColor: 'rgba(225, 168, 62, 0.24)',
  },
  serviceTileInnerWater: {
    backgroundColor: 'rgba(203, 239, 255, 0.42)',
    borderColor: 'rgba(20, 152, 157, 0.22)',
  },
  serviceTileSweep: {
    position: 'absolute',
    top: -30,
    bottom: -30,
    width: 52,
    backgroundColor: 'rgba(255, 253, 248, 0.9)',
  },
  serviceBody: {
    gap: 5,
  },
  serviceTitle: {
    fontFamily: typography.medium,
    color: palette.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: 0,
  },
  serviceSubtitle: {
    fontFamily: typography.regular,
    color: palette.text,
    fontSize: 13,
    lineHeight: 19,
    letterSpacing: 0,
  },
  serviceState: {
    fontFamily: typography.medium,
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  serviceStateActive: {
    color: palette.tealDeep,
  },
  outlineIconTile: {
    width: 64,
    height: 64,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    backgroundColor: 'rgba(255, 253, 248, 0.62)',
    overflow: 'hidden',
  },
  outlineIconAqua: {
    borderColor: 'rgba(20, 152, 157, 0.32)',
  },
  outlineIconMint: {
    borderColor: 'rgba(184, 116, 66, 0.28)',
  },
  outlineIconTileActive: {
    backgroundColor: 'rgba(255, 253, 248, 0.8)',
    borderColor: palette.mintPeak,
  },
  iconPulseRing: {
    position: 'absolute',
    top: 5,
    right: 5,
    bottom: 5,
    left: 5,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: palette.mintPeak,
  },
  iconActionRing: {
    position: 'absolute',
    top: 9,
    right: 9,
    bottom: 9,
    left: 9,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: palette.copper,
  },
  outletIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outletPlate: {
    width: 24,
    height: 29,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outletSlotLeft: {
    position: 'absolute',
    top: 8,
    left: 7,
    width: 2,
    height: 9,
    borderRadius: 2,
  },
  outletSlotRight: {
    position: 'absolute',
    top: 8,
    right: 7,
    width: 2,
    height: 9,
    borderRadius: 2,
  },
  outletGround: {
    position: 'absolute',
    bottom: 5,
    width: 6,
    height: 2,
    borderRadius: 2,
  },
  outletSparkA: {
    position: 'absolute',
    right: 1,
    top: 4,
    width: 8,
    height: 2,
    borderRadius: 2,
    backgroundColor: palette.clay,
    transform: [{ rotate: '-28deg' }],
  },
  outletSparkB: {
    position: 'absolute',
    right: 0,
    top: 11,
    width: 6,
    height: 2,
    borderRadius: 2,
    backgroundColor: palette.clay,
    transform: [{ rotate: '18deg' }],
  },
  outletSparkActive: {
    backgroundColor: palette.amber,
  },
  faucetIcon: {
    width: 38,
    height: 36,
  },
  faucetPipeTop: {
    position: 'absolute',
    top: 9,
    left: 7,
    width: 20,
    height: 4,
    borderRadius: 3,
  },
  faucetPipeDown: {
    position: 'absolute',
    top: 10,
    right: 8,
    width: 4,
    height: 14,
    borderRadius: 3,
  },
  faucetHandle: {
    position: 'absolute',
    top: 5,
    left: 7,
    width: 13,
    height: 3,
    borderRadius: 3,
  },
  faucetSpout: {
    position: 'absolute',
    top: 21,
    right: 8,
    width: 12,
    height: 4,
    borderRadius: 3,
  },
  dropOutline: {
    position: 'absolute',
    left: 8,
    bottom: 3,
    width: 10,
    height: 13,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: palette.clay,
    backgroundColor: 'transparent',
  },
  dropOutlineActive: {
    borderColor: palette.amber,
  },
  outlineBorder: {
    borderColor: palette.tealDeep,
  },
  outlineBorderActive: {
    borderColor: palette.tealDeep,
  },
  outlineLine: {
    backgroundColor: palette.tealDeep,
  },
  outlineLineActive: {
    backgroundColor: palette.tealDeep,
  },
  outlineLineSoft: {
    backgroundColor: palette.sage,
  },
  outlineLineSoftActive: {
    backgroundColor: palette.teal,
  },
  outlineStrokeSoft: {
    borderColor: palette.sage,
    backgroundColor: palette.sage,
  },
  outlineStrokeSoftActive: {
    borderColor: palette.teal,
    backgroundColor: palette.teal,
  },
  chipGlyphFrame: {
    width: 18,
    height: 18,
    borderRadius: 6,
    backgroundColor: 'rgba(228, 251, 241, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(73, 201, 158, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipGlyphFrameSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderColor: 'rgba(255, 255, 255, 0.48)',
  },
  miniOutletPlate: {
    width: 11,
    height: 13,
    borderRadius: 4,
    borderWidth: 1.4,
  },
  miniOutletSlotLeft: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 1.5,
    height: 5,
    borderRadius: 1,
  },
  miniOutletSlotRight: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 1.5,
    height: 5,
    borderRadius: 1,
  },
  miniFaucet: {
    width: 12,
    height: 12,
  },
  miniFaucetTop: {
    position: 'absolute',
    top: 2,
    left: 1,
    width: 9,
    height: 2.5,
    borderRadius: 2,
  },
  miniFaucetDown: {
    position: 'absolute',
    top: 3,
    right: 1,
    width: 2.5,
    height: 7,
    borderRadius: 2,
  },
  miniDrop: {
    position: 'absolute',
    left: 1,
    bottom: 0,
    width: 5,
    height: 6,
    borderRadius: 4,
    borderWidth: 1.4,
    backgroundColor: 'transparent',
  },
  miniGlyphBorder: {
    borderColor: palette.tealDeep,
  },
  miniGlyphBorderSelected: {
    borderColor: '#FFFFFF',
  },
  miniGlyphLine: {
    backgroundColor: palette.tealDeep,
  },
  miniGlyphLineSoft: {
    backgroundColor: palette.sage,
  },
  miniGlyphLineSelected: {
    backgroundColor: '#FFFFFF',
  },
  fieldGroup: {
    gap: 12,
  },
  fieldLabel: {
    fontFamily: typography.medium,
    color: palette.ink,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    letterSpacing: 0,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  problemChip: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(73, 201, 158, 0.2)',
    backgroundColor: 'rgba(255, 253, 248, 0.9)',
    paddingHorizontal: 10,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    overflow: 'hidden',
  },
  problemChipSelected: {
    backgroundColor: palette.jade,
    borderColor: palette.deepMint,
    boxShadow: '0 8px 14px rgba(12, 117, 108, 0.16)',
  },
  problemChipSelectedElectric: {
    backgroundColor: palette.copperInk,
    borderColor: palette.copperInk,
    boxShadow: '0 8px 14px rgba(145, 81, 44, 0.16)',
  },
  problemChipSelectedWater: {
    backgroundColor: palette.forest,
    borderColor: palette.forest,
  },
  chipActionSheen: {
    position: 'absolute',
    top: -10,
    bottom: -10,
    width: 34,
    backgroundColor: 'rgba(255, 255, 255, 0.34)',
  },
  problemChipText: {
    fontFamily: typography.medium,
    color: palette.text,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0,
  },
  problemChipTextSelected: {
    color: '#FFFFFF',
  },
  inputBlock: {
    gap: 11,
  },
  textArea: {
    minHeight: 150,
    backgroundColor: 'rgba(255, 253, 248, 0.92)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    color: palette.ink,
    fontFamily: typography.regular,
    fontSize: 15,
    lineHeight: 23,
    letterSpacing: 0,
  },
  mediaStrip: {
    flexDirection: 'row',
    gap: 12,
  },
  mediaItem: {
    flex: 1,
    minHeight: 88,
    borderRadius: 8,
    backgroundColor: palette.wash,
    borderColor: palette.borderStrong,
    borderWidth: 1,
    padding: 12,
    gap: 9,
  },
  mediaItemMuted: {
    flex: 1,
    minHeight: 88,
    borderRadius: 8,
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderWidth: 1,
    padding: 12,
    gap: 9,
  },
  mediaTextStack: {
    gap: 3,
  },
  mediaGlyph: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaGlyphPrimary: {
    backgroundColor: palette.aqua,
  },
  mediaGlyphMuted: {
    backgroundColor: palette.washSoft,
  },
  mediaGlyphFrame: {
    width: 18,
    height: 14,
    borderRadius: 4,
    borderWidth: 2,
  },
  mediaGlyphStrokePrimary: {
    borderColor: palette.tealDeep,
  },
  mediaGlyphStrokeMuted: {
    borderColor: palette.textMuted,
  },
  mediaGlyphDot: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.textMuted,
  },
  mediaGlyphDotPrimary: {
    backgroundColor: palette.clay,
  },
  mediaTitle: {
    fontFamily: typography.medium,
    color: palette.tealDeep,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
  mediaTitleMuted: {
    fontFamily: typography.medium,
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
  mediaCopy: {
    fontFamily: typography.regular,
    color: palette.text,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0,
  },
  mediaCopyMuted: {
    fontFamily: typography.regular,
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0,
  },
  guidanceBand: {
    backgroundColor: 'rgba(221, 244, 234, 0.56)',
    borderColor: 'rgba(141, 216, 190, 0.46)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 15,
    gap: 6,
  },
  guidanceTitle: {
    fontFamily: typography.medium,
    color: palette.tealDeep,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
  guidanceCopy: {
    fontFamily: typography.regular,
    color: palette.text,
    fontSize: 13,
    lineHeight: 19,
    letterSpacing: 0,
  },
  questionRow: {
    gap: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 15,
    boxShadow: '0 8px 18px rgba(30, 43, 45, 0.035)',
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  questionGlyph: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: palette.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionGlyphTop: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: palette.tealDeep,
    borderBottomColor: 'transparent',
  },
  questionGlyphBottom: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.clay,
    marginTop: 2,
  },
  questionLabel: {
    flex: 1,
    fontFamily: typography.medium,
    color: palette.ink,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: 0,
  },
  answerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  answerChip: {
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  answerChipActive: {
    backgroundColor: palette.mint,
    borderColor: palette.sage,
  },
  answerText: {
    fontFamily: typography.medium,
    color: palette.text,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0,
  },
  answerTextActive: {
    color: palette.tealDeep,
  },
  statusScreen: {
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 22,
    boxShadow: '0 12px 26px rgba(20, 152, 157, 0.08)',
  },
  statusGlyph: {
    width: 58,
    height: 58,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.aqua,
    borderWidth: 1,
    borderColor: '#AFE6E5',
    overflow: 'hidden',
  },
  statusPulseRing: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: palette.teal,
  },
  statusOrbit: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  statusOrbitDot: {
    position: 'absolute',
    top: 1,
    alignSelf: 'center',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.clay,
  },
  statusTitle: {
    fontFamily: typography.medium,
    color: palette.ink,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0,
  },
  statusCopy: {
    fontFamily: typography.regular,
    color: palette.text,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    letterSpacing: 0,
  },
  estimateHeader: {
    backgroundColor: palette.copperVeil,
    borderColor: 'rgba(145, 81, 44, 0.28)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 18,
    gap: 7,
    boxShadow: '0 14px 30px rgba(145, 81, 44, 0.12)',
  },
  estimateLabel: {
    fontFamily: typography.medium,
    color: palette.copperInk,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
  priceValue: {
    fontFamily: typography.medium,
    color: palette.forest,
    fontSize: 29,
    lineHeight: 37,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
  },
  estimateMeta: {
    fontFamily: typography.regular,
    color: palette.text,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0,
  },
  estimateList: {
    gap: 12,
  },
  infoRow: {
    backgroundColor: 'rgba(255, 253, 248, 0.94)',
    borderColor: 'rgba(7, 95, 88, 0.12)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 11,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoGlyph: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: palette.waterTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoGlyphSafety: {
    backgroundColor: palette.priceWash,
  },
  infoGlyphProblemA: {
    width: 4,
    height: 17,
    borderRadius: 3,
    backgroundColor: palette.tealDeep,
    transform: [{ rotate: '22deg' }],
  },
  infoGlyphProblemB: {
    position: 'absolute',
    width: 4,
    height: 11,
    borderRadius: 3,
    backgroundColor: palette.clay,
    transform: [{ rotate: '-22deg' }],
  },
  infoGlyphReasonA: {
    width: 15,
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.tealDeep,
  },
  infoGlyphReasonB: {
    width: 11,
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.sage,
    marginTop: 3,
  },
  infoGlyphReasonC: {
    width: 7,
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.clay,
    marginTop: 3,
  },
  infoGlyphSafetyA: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: palette.clay,
  },
  infoGlyphSafetyB: {
    position: 'absolute',
    width: 4,
    height: 11,
    borderRadius: 3,
    backgroundColor: palette.clay,
  },
  infoTextStack: {
    flex: 1,
    gap: 5,
  },
  infoLabel: {
    fontFamily: typography.medium,
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  infoValue: {
    fontFamily: typography.regular,
    color: palette.ink,
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: 0,
  },
  disclaimer: {
    backgroundColor: 'rgba(255, 234, 185, 0.46)',
    borderColor: 'rgba(225, 168, 62, 0.24)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    color: palette.text,
    fontFamily: typography.regular,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 0,
  },
  fallbackScreen: {
    backgroundColor: '#FFF9F3',
    borderColor: '#F2D5B4',
    borderWidth: 1,
    borderRadius: 8,
    padding: 18,
    gap: 14,
  },
  fallbackTitle: {
    fontFamily: typography.medium,
    color: palette.danger,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: 0,
  },
  fallbackCopy: {
    fontFamily: typography.regular,
    color: palette.text,
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: 0,
  },
  footerSpace: {
    height: 10,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(245, 251, 247, 0.96)',
    borderTopColor: 'rgba(73, 201, 158, 0.24)',
    borderTopWidth: 1,
    padding: 16,
    paddingBottom: 20,
    flexDirection: 'row',
    gap: 10,
  },
  backButton: {
    minHeight: 50,
    minWidth: 104,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(73, 201, 158, 0.28)',
    backgroundColor: palette.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    boxShadow: '0 -8px 22px rgba(30, 43, 45, 0.045)',
  },
  backButtonText: {
    fontFamily: typography.medium,
    color: palette.deepMint,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
  },
  nextButtonMotion: {
    flex: 1,
  },
  nextButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: palette.deepMint,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    boxShadow: '0 10px 22px rgba(12, 117, 108, 0.22)',
  },
  nextButtonText: {
    fontFamily: typography.medium,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.82,
  },
  pressMotion: {
    transform: [{ scale: 0.985 }],
  },
  pressMotionSoft: {
    transform: [{ scale: 0.99 }],
  },
})
