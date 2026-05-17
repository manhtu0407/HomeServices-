import { type ReactNode, useEffect, useMemo, useState } from 'react'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { PROBLEM_CHIPS, type ServiceType } from '@home-services/shared'
import { CustomerV4DockOverlay } from '@/components/customer/customer-surfaces'
import { Colors } from '@/constants/colors'

type PriceCheckUiStep = 'form' | 'clarification' | 'estimate' | 'schedule' | 'confirm' | 'searching' | 'emptyWorker' | 'matched'
type PriceCheckUiStatus = 'editing' | 'loading' | 'needs_clarification' | 'estimate_ready' | 'baseline_fallback' | 'fallback' | 'error'

type MediaDraftItem = {
  id: string
  uri: string
  type: 'image' | 'video'
  fileName?: string
  durationMs?: number
}

type PriceCheckDraft = {
  serviceType: ServiceType
  problemChips: string[]
  description: string
  mediaItems: MediaDraftItem[]
  addressLabel: string
  clarificationAnswers: Record<string, string>
  timeChoice: 'now' | 'scheduled'
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
  options: string[]
}

type WorkerMatch = {
  name: string
  avatarUri?: string
  rating: string
  jobCountLabel: string
  etaLabel: string
}

const theme = Colors.priceCheck
const BOOKING_V4_VISUAL_CONTRACT = 'BOOKING_V4_VISUAL_CONTRACT: production replaces old booking UI with prototype V4 flow'
const BOOKING_FORM_FIRST_CONTRACT = 'BOOKING_FORM_FIRST_CONTRACT: V4 form-first production price check'
const BOOKING_LAYER_SWITCH_V4 = 'BOOKING_LAYER_SWITCH_V4: glass mint/warm semantic layers'
const BOOKING_TYPE_RHYTHM = 'BOOKING_TYPE_RHYTHM: compact V4 typography'
const BOOKING_INTERACTION_MOTION_V4 = 'BOOKING_INTERACTION_MOTION_V4: tap and reveal only'
const searchingWorkerState = 'searchingWorkerState: local searching UI until worker backend exists'
const noWorkerFallbackState = 'noWorkerFallbackState: no fake worker rendered in production'
const PRICE_DISCLAIMER =
  'Đây là ước tính dựa trên thị trường. Giá thực tế sẽ được xác nhận bởi thợ trước khi bắt đầu.'
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
  glassShadow: '0 24px 70px rgba(13,70,65,0.18)',
  glassFloatShadow: '0 20px 52px rgba(13,70,65,0.14)',
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
const openHomePath = '/(customer)/home'

const INITIAL_DRAFT: PriceCheckDraft = {
  serviceType: 'electrical',
  problemChips: ['Ổ cắm nóng'],
  description: 'Ổ cắm bếp nóng khi bật máy nước nóng...',
  mediaItems: [],
  addressLabel: 'Căn hộ TP.HCM',
  clarificationAnswers: {},
  timeChoice: 'now',
}

const QUESTIONS: Record<ServiceType, ClarificationQuestion[]> = {
  electrical: [
    {
      id: 'scope',
      question: 'Ổ cắm nóng ở một vị trí hay nhiều vị trí?',
      options: ['Một vị trí', 'Nhiều vị trí', 'Chưa rõ'],
    },
    {
      id: 'breaker',
      question: 'Aptomat có nhảy lại sau khi bật máy nước nóng không?',
      options: ['Có', 'Không', 'Chưa thử'],
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
      options: ['Liên tục', 'Khi dùng', 'Chưa rõ'],
    },
  ],
}

const ESTIMATE: PriceCheckEstimateCard = {
  problemLabel: 'Ổ cắm nóng khi dùng máy nước nóng',
  complexity: 'medium',
  priceRangeLabel: '280k - 420k VND',
  confidenceLabel: 'Tự tin 72%',
  advisory: 'Tắt nguồn khu vực ổ cắm nếu có mùi khét hoặc vỏ ổ đổi màu.',
  disclaimer: PRICE_DISCLAIMER,
  source: 'kael',
}

const FALLBACK_ESTIMATE: PriceCheckEstimateCard = {
  problemLabel: 'Chưa đủ dữ liệu an toàn',
  complexity: 'unknown',
  priceRangeLabel: 'Cần thêm thông tin',
  confidenceLabel: 'Cần làm rõ',
  advisory: 'Thêm ảnh hoặc trả lời câu hỏi để Kael ước tính sát hơn.',
  disclaimer: PRICE_DISCLAIMER,
  source: 'baseline_fallback',
}

export function ClientPriceCheckFlow() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const frameWidth = Math.min(width, 430)
  const [step, setStep] = useState<PriceCheckUiStep>('form')
  const [status, setStatus] = useState<PriceCheckUiStatus>('editing')
  const [draft, setDraft] = useState<PriceCheckDraft>(INITIAL_DRAFT)
  const [matchedWorker] = useState<WorkerMatch | null>(null)
  const questions = QUESTIONS[draft.serviceType]
  const chips = useMemo(() => PROBLEM_CHIPS[draft.serviceType], [draft.serviceType])
  const answeredQuestions = questions.filter((question) => draft.clarificationAnswers[question.id]).length
  const clarificationComplete = answeredQuestions === questions.length
  const isEstimateFallback = status === 'baseline_fallback' || status === 'fallback'
  const estimate = isEstimateFallback ? FALLBACK_ESTIMATE : ESTIMATE

  const pickMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
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
      durationMs: asset.duration ?? undefined,
    }))

    setDraft((current) => ({
      ...current,
      mediaItems: [...current.mediaItems, ...nextItems].slice(0, 5),
    }))
    setStatus('editing')
  }

  const removeMedia = (id: string) => {
    setDraft((current) => ({
      ...current,
      mediaItems: current.mediaItems.filter((item) => item.id !== id),
    }))
  }

  const continueFlow = () => {
    if (step === 'form') {
      setStep('clarification')
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
      setStep('schedule')
      return
    }
    if (step === 'schedule') {
      setStep('confirm')
      return
    }
    if (step === 'confirm') {
      setStep('searching')
      setStatus('loading')
      return
    }
    if (step === 'searching') {
      if (matchedWorker === null) {
        setStep('emptyWorker')
        setStatus('fallback')
        return
      }
      setStep('matched')
      return
    }
    if (step === 'emptyWorker') {
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
    if (step === 'searching' || step === 'emptyWorker') setStep('confirm')
  }

  return (
    <View
      accessibilityLabel={`${BOOKING_V4_VISUAL_CONTRACT}; ${BOOKING_FORM_FIRST_CONTRACT}; ${BOOKING_LAYER_SWITCH_V4}; ${BOOKING_TYPE_RHYTHM}; ${BOOKING_INTERACTION_MOTION_V4}`}
      style={styles.root}
      testID="production-price-check-flow"
    >
      <View style={styles.hiddenMarker} testID="booking-layer-semantic-switch" />
      <BookingBackdrop />
      <BookingAmbientGlassField />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            alignSelf: 'center',
            maxWidth: 430,
            paddingBottom: insets.bottom + 190,
            paddingTop: insets.top + 36,
            width: Math.max(0, frameWidth - bookingFrameHorizontalPadding * 4),
          },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.bookingTopRow}>
          <Pressable accessibilityLabel="Quay lại" onPress={() => router.push(openHomePath)} style={styles.bookingMiniButton}>
            <ChevronGlyph />
          </Pressable>
          <View style={styles.bookingLocationPill}>
            <ElectricalGlyph />
            <Text style={styles.bookingLocationText} numberOfLines={1}>Căn hộ TP.HCM</Text>
          </View>
        </View>
        <View style={styles.bookingSheet}>
          <GlassSheen />
          <View style={styles.sheetHandle} />
          <BookingHeader />
          {step === 'form' ? (
            <>
              <BookingFormSurface
                chips={chips}
                draft={draft}
                onDescriptionChange={(description) => setDraft((current) => ({ ...current, description }))}
                onPickMedia={pickMedia}
                onRemoveMedia={removeMedia}
                onSelectService={(serviceType) =>
                  setDraft((current) => ({ ...current, serviceType, clarificationAnswers: {}, problemChips: serviceType === 'electrical' ? ['Ổ cắm nóng'] : ['Rò rỉ'] }))
                }
                onToggleChip={(chip) =>
                  setDraft((current) => ({
                    ...current,
                    problemChips: current.problemChips.includes(chip)
                      ? current.problemChips.filter((item) => item !== chip)
                      : [...current.problemChips, chip].slice(0, 3),
                  }))
                }
              />
              <TrustRail active="estimate" />
              <EstimatePanel estimate={estimate} isFallback={isEstimateFallback} />
              <SchedulePanel draft={draft} onSelect={(timeChoice) => setDraft((current) => ({ ...current, timeChoice }))} />
              <ConfirmPanel draft={draft} estimate={estimate} />
              <MatchingStatesPanel />
            </>
          ) : null}
          {step === 'clarification' ? <ClarificationPanel draft={draft} questions={questions} onAnswer={(questionId, answer) => setDraft((current) => ({ ...current, clarificationAnswers: { ...current.clarificationAnswers, [questionId]: answer } }))} /> : null}
          {step === 'estimate' ? <><TrustRail active="estimate" /><EstimatePanel estimate={estimate} isFallback={isEstimateFallback} /></> : null}
          {step === 'schedule' ? <SchedulePanel draft={draft} onSelect={(timeChoice) => setDraft((current) => ({ ...current, timeChoice }))} /> : null}
          {step === 'confirm' ? <ConfirmPanel draft={draft} estimate={estimate} /> : null}
          {step === 'searching' ? <SearchingWorkerPanel draft={draft} /> : null}
          {step === 'emptyWorker' ? <EmptyWorkerPanel /> : null}
          {step === 'matched' ? matchedWorker ? <WorkerMatchedPanel worker={matchedWorker} /> : <EmptyWorkerPanel /> : null}
          <SheetActions
            onPrimary={continueFlow}
            onSecondary={step === 'form' ? () => setDraft(INITIAL_DRAFT) : goBack}
            primaryLabel={primaryLabel(step, status)}
            progress={progressForStep(step, status)}
            secondaryLabel={step === 'form' ? 'Sửa lại' : 'Quay lại'}
          />
        </View>
      </ScrollView>
      <CustomerV4DockOverlay active="booking" />
    </View>
  )
}

function BookingHeader() {
  return (
    <View style={styles.bookingTitle}>
      <View>
        <Text style={styles.flowBadge} numberOfLines={1}>
          LUỒNG V4
        </Text>
        <Text style={styles.pageTitle} numberOfLines={1}>
          Kiểm giá đầy đủ
        </Text>
      </View>
      <View style={styles.kaelHeaderMascot}>
        <GlassSheen />
        <Image resizeMode="contain" source={kaelModel8A} style={styles.kaelHeaderImage} />
      </View>
    </View>
  )
}

function BookingBackdrop() {
  const pulse = useSharedValue(0)

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.quad) }), -1, true)
  }, [pulse])

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.20 + pulse.value * 0.14,
    transform: [{ translateX: -75 }, { scale: 0.96 + pulse.value * 0.1 }],
  }))
  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -9 }, { scale: 1 + pulse.value * 0.08 }],
  }))

  return (
    <View pointerEvents="none" style={styles.bookingBackdrop}>
      <Animated.View style={[styles.backdropGlow, glowStyle]} />
      <View style={[styles.backdropLine, styles.backdropLineOne]} />
      <View style={[styles.backdropLine, styles.backdropLineTwo]} />
      <View style={[styles.backdropRoom, styles.backdropRoomOne]} />
      <View style={[styles.backdropRoom, styles.backdropRoomTwo]} />
      <Animated.View style={[styles.backdropPin, pinStyle]} />
    </View>
  )
}

function BookingAmbientGlassField() {
  const drift = useSharedValue(0)

  useEffect(() => {
    drift.value = withRepeat(withTiming(1, { duration: 5800, easing: Easing.inOut(Easing.quad) }), -1, true)
  }, [drift])

  const orbStyle = useAnimatedStyle(() => ({
    opacity: 0.11 + drift.value * 0.06,
    transform: [{ translateY: -8 + drift.value * 16 }, { scale: 0.98 + drift.value * 0.04 }],
  }))
  const lineStyle = useAnimatedStyle(() => ({
    opacity: 0.08 + drift.value * 0.05,
    transform: [{ rotate: '-12deg' }, { translateX: -10 + drift.value * 20 }],
  }))

  return (
    <View pointerEvents="none" style={styles.bookingAmbientField} testID="booking-section-glass-field">
      <Animated.View style={[styles.bookingAmbientMint, orbStyle]} />
      <View style={styles.bookingAmbientWarm} />
      <Animated.View style={[styles.bookingAmbientLine, lineStyle]} />
    </View>
  )
}

function GlassSheen() {
  return (
    <>
      <View pointerEvents="none" style={styles.glassTopHighlight} />
      <View pointerEvents="none" style={styles.glassSheen} />
    </>
  )
}

function ChevronGlyph() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="m14.5 6.5-5 5.5 5 5.5" stroke={tokens.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function TrustRail({ active }: { active: 'describe' | 'estimate' | 'confirm' | 'match' }) {
  const steps = [
    ['describe', 'Mô tả'],
    ['estimate', 'Ước tính'],
    ['confirm', 'Xác nhận'],
    ['match', 'Tìm thợ'],
  ] as const
  const activeIndex = Math.max(steps.findIndex(([key]) => key === active), 0)
  return (
    <View style={styles.trustRail}>
      <GlassSheen />
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

function MatchingStatesPanel() {
  return (
    <View style={styles.flowCard}>
      <GlassSheen />
      <Text style={styles.cardTitle}>Trạng thái tìm thợ</Text>
      <View style={styles.stateGrid}>
        {['Đang tìm', 'Thử thợ khác', 'Không có thợ', 'Đã ghép'].map((state, index) => (
          <View key={state} style={styles.stateItem}>
            <View style={[styles.stateDot, index === 0 ? styles.stateDotActive : null]} />
            <Text style={styles.stateText} numberOfLines={1}>
              {state}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.actionRow}>
        <Pressable style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText} numberOfLines={1}>Hủy tìm</Text>
        </Pressable>
        <Pressable style={styles.primaryButton}>
          <Text style={styles.primaryButtonText} numberOfLines={1}>Thử lại</Text>
        </Pressable>
      </View>
    </View>
  )
}

function BookingFormSurface({
  chips,
  draft,
  onDescriptionChange,
  onPickMedia,
  onRemoveMedia,
  onSelectService,
  onToggleChip,
}: {
  chips: readonly string[]
  draft: PriceCheckDraft
  onDescriptionChange: (description: string) => void
  onPickMedia: () => void
  onRemoveMedia: (id: string) => void
  onSelectService: (serviceType: ServiceType) => void
  onToggleChip: (chip: string) => void
}) {
  return (
    <View style={styles.formStack} testID="booking-form-first-shell">
      <View style={styles.segmented}>
        <Segment label="Sửa điện" active={draft.serviceType === 'electrical'} onPress={() => onSelectService('electrical')} />
        <Segment label="Sửa nước" active={draft.serviceType === 'plumbing'} onPress={() => onSelectService('plumbing')} />
      </View>
      <SoftField title="Vấn đề" meta="Chọn">
        <View style={styles.pillRow}>
          {chips.slice(0, 6).map((chip) => (
            <Chip key={chip} active={draft.problemChips.includes(chip)} label={chip} onPress={() => onToggleChip(chip)} />
          ))}
        </View>
      </SoftField>
      <SoftField title="Mô tả" meta={`${draft.description.trim().length}/160`}>
        <TextInput
          multiline
          onChangeText={onDescriptionChange}
          placeholder="Ổ cắm bếp nóng khi bật máy nước nóng..."
          placeholderTextColor={tokens.subtle}
          style={styles.descriptionInput}
          textAlignVertical="top"
          value={draft.description}
          testID="booking-form-field-focus"
        />
      </SoftField>
      <EvidenceDraftSlots mediaItems={draft.mediaItems} onPickMedia={onPickMedia} onRemoveMedia={onRemoveMedia} />
      <View style={styles.clarifyCard}>
        <GlassSheen />
        <View style={styles.cardMetaRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            Quản Gia Kael hỏi thêm
          </Text>
          <Text style={styles.statusText} numberOfLines={1}>
            0-2
          </Text>
        </View>
        <Text style={styles.clarifyItem} numberOfLines={2}>
          Ổ cắm nóng ở một vị trí hay nhiều vị trí?
        </Text>
        <Text style={styles.clarifyItem} numberOfLines={2}>
          Aptomat có nhảy lại sau khi bật máy nước nóng không?
        </Text>
      </View>
    </View>
  )
}

function ClarificationPanel({ draft, questions, onAnswer }: { draft: PriceCheckDraft; questions: ClarificationQuestion[]; onAnswer: (questionId: string, answer: string) => void }) {
  return (
    <View style={styles.formStack}>
      {questions.map((question, index) => (
        <View key={question.id} style={styles.flowCard}>
          <GlassSheen />
          <Text style={styles.cardTitle} numberOfLines={2}>
            {index + 1}. {question.question}
          </Text>
          <View style={styles.pillRow}>
            {question.options.map((option) => (
              <Chip key={option} active={draft.clarificationAnswers[question.id] === option} label={option} onPress={() => onAnswer(question.id, option)} />
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

function EstimatePanel({ estimate, isFallback }: { estimate: PriceCheckEstimateCard; isFallback: boolean }) {
  return (
    <View style={[styles.estimateCard, isFallback ? styles.warningCard : null]}>
      <GlassSheen />
      <View style={styles.cardMetaRow}>
        <Text style={styles.kicker} numberOfLines={1}>
          KHUNG ƯỚC TÍNH
        </Text>
        <Text style={styles.statusText} numberOfLines={1}>
          {estimate.confidenceLabel}
        </Text>
      </View>
      <View style={styles.priceRange}>
        <Text style={styles.priceValue} numberOfLines={2}>
          {estimate.priceRangeLabel}
        </Text>
        <Text style={styles.priceMeta} numberOfLines={1}>
          {complexityLabel(estimate.complexity)} · {estimate.problemLabel}
        </Text>
      </View>
      <View style={styles.summaryGrid}>
        <SummaryCell label="Độ phức tạp" value={complexityLabel(estimate.complexity)} />
        <SummaryCell label="Gợi ý" value={estimate.advisory} />
      </View>
      <Text selectable style={styles.disclaimerText}>
        {estimate.disclaimer}
      </Text>
    </View>
  )
}

function SchedulePanel({ draft, onSelect }: { draft: PriceCheckDraft; onSelect: (choice: PriceCheckDraft['timeChoice']) => void }) {
  return (
    <View style={styles.flowCard}>
      <GlassSheen />
      <Text style={styles.cardTitle}>Thời gian</Text>
      <View style={styles.twoCol}>
        <ChoiceCard active={draft.timeChoice === 'now'} title="Ngay bây giờ" text="Ưu tiên tìm thợ gần nhất" onPress={() => onSelect('now')} />
        <ChoiceCard active={draft.timeChoice === 'scheduled'} title="Đặt lịch" text="Hôm nay 18:30" onPress={() => onSelect('scheduled')} />
      </View>
    </View>
  )
}

function ConfirmPanel({ draft, estimate }: { draft: PriceCheckDraft; estimate: PriceCheckEstimateCard }) {
  return (
    <View style={styles.flowCard}>
      <GlassSheen />
      <View style={styles.cardMetaRow}>
        <Text style={styles.cardTitle}>Xác nhận tìm thợ</Text>
        <Text style={styles.statusText}>Bắt buộc</Text>
      </View>
      <View style={styles.summaryGrid}>
        <SummaryCell label="Dịch vụ" value={draft.serviceType === 'electrical' ? 'Sửa điện' : 'Sửa nước'} />
        <SummaryCell label="Vấn đề" value={draft.problemChips[0] ?? 'Đã mô tả'} />
        <SummaryCell label="Địa chỉ" value={draft.addressLabel} />
        <SummaryCell label="Thời gian" value={draft.timeChoice === 'now' ? 'Ngay bây giờ' : 'Hôm nay 18:30'} />
        <SummaryCell label="Ước giá" value={estimate.priceRangeLabel} />
        <SummaryCell label="Phí nền tảng" value="7.5%" />
      </View>
      <Text selectable style={styles.disclaimerText}>
        {PRICE_DISCLAIMER}
      </Text>
    </View>
  )
}

function SearchingWorkerPanel({ draft }: { draft: PriceCheckDraft }) {
  return (
    <View accessibilityLabel={searchingWorkerState} style={styles.loadingCard}>
      <GlassSheen />
      <ActivityIndicator color={tokens.primary} />
      <Text style={styles.loadingTitle}>Đang tìm thợ phù hợp</Text>
      <Text style={styles.loadingText}>{draft.timeChoice === 'now' ? 'Ưu tiên thợ gần căn hộ của bạn.' : 'Đang kiểm tra lịch hẹn phù hợp.'}</Text>
      <View style={styles.stateGrid}>
        {['Đang tìm', 'Thử thợ khác', 'Không có thợ', 'Đã ghép'].map((state, index) => (
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

function EmptyWorkerPanel() {
  return (
    <View accessibilityLabel={noWorkerFallbackState} style={styles.warningCard} testID="customer-no-fake-worker-data">
      <GlassSheen />
      <Text style={styles.cardTitle}>Chưa có thợ phù hợp</Text>
      <Text style={styles.panelText}>Production không hiển thị dữ liệu thợ giả. Bạn có thể thử lại hoặc chỉnh yêu cầu.</Text>
    </View>
  )
}

function WorkerMatchedPanel({ worker }: { worker: WorkerMatch }) {
  return (
    <View style={styles.flowCard}>
      <GlassSheen />
      <Text style={styles.cardTitle}>Đã ghép thợ</Text>
      <View style={styles.workerRow}>
        <View style={styles.workerAvatar}>{worker.avatarUri ? <Image source={{ uri: worker.avatarUri }} style={styles.workerImage} /> : <ElectricalGlyph />}</View>
        <View style={styles.workerCopy}>
          <Text style={styles.workerName}>{worker.name}</Text>
          <Text style={styles.panelText}>{worker.rating} · {worker.jobCountLabel} · {worker.etaLabel}</Text>
        </View>
      </View>
    </View>
  )
}

function EvidenceDraftSlots({ mediaItems, onPickMedia, onRemoveMedia }: { mediaItems: MediaDraftItem[]; onPickMedia: () => void; onRemoveMedia: (id: string) => void }) {
  return (
    <SoftField title="Ảnh / video" meta={mediaItems.length > 0 ? `${mediaItems.length}/5` : 'Tùy chọn'} testID="client-media-local-only">
      <View style={styles.mediaGrid}>
        {mediaItems.map((item) => (
          <Pressable key={item.id} accessibilityRole="button" onPress={() => onRemoveMedia(item.id)} style={styles.mediaTile}>
            {item.type === 'image' ? <Image source={{ uri: item.uri }} style={styles.mediaPreview} resizeMode="cover" /> : <Text style={styles.mediaText}>Video</Text>}
            <Text style={styles.mediaText} numberOfLines={1}>
              Gỡ
            </Text>
          </Pressable>
        ))}
        {mediaItems.length < 5 ? (
          <Pressable accessibilityRole="button" onPress={onPickMedia} style={styles.mediaTile}>
            <CameraGlyph />
            <Text style={styles.mediaText} numberOfLines={2}>
              Thêm ảnh/video
            </Text>
          </Pressable>
        ) : null}
      </View>
    </SoftField>
  )
}

function SheetActions({
  onPrimary,
  onSecondary,
  primaryLabel,
  progress,
  secondaryLabel,
}: {
  onPrimary: () => void
  onSecondary: () => void
  primaryLabel: string
  progress: number
  secondaryLabel: string
}) {
  return (
    <View style={styles.sheetActions}>
      <GlassSheen />
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
      <View style={styles.actionRow}>
        <Pressable onPress={onSecondary} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText} numberOfLines={1}>{secondaryLabel}</Text>
        </Pressable>
        <Pressable onPress={onPrimary} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText} numberOfLines={1}>{primaryLabel}</Text>
        </Pressable>
      </View>
    </View>
  )
}

function SoftField({ children, meta, testID, title }: { children: ReactNode; meta?: string; testID?: string; title: string }) {
  return (
    <View style={styles.softField} testID={testID}>
      <GlassSheen />
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
    <Pressable onPress={onPress} style={[styles.segment, active ? styles.segmentActive : null]}>
      <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>{label}</Text>
    </Pressable>
  )
}

function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active ? styles.chipActive : null]}>
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]} numberOfLines={1}>{label}</Text>
    </Pressable>
  )
}

function ChoiceCard({ active, onPress, text, title }: { active: boolean; onPress: () => void; text: string; title: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.choiceCard, active ? styles.choiceCardActive : null]}>
      <Text style={[styles.choiceTitle, active ? styles.choiceTextActive : null]}>{title}</Text>
      <Text style={[styles.choiceText, active ? styles.choiceTextActive : null]}>{text}</Text>
    </Pressable>
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

function primaryLabel(step: PriceCheckUiStep, status: PriceCheckUiStatus) {
  if (step === 'form') return 'Để Kael kiểm tra'
  if (step === 'clarification') return 'Xem ước tính'
  if (step === 'estimate') return 'Chọn thời gian'
  if (step === 'schedule') return 'Xem xác nhận'
  if (step === 'confirm') return 'Xác nhận phát yêu cầu'
  if (step === 'searching') return 'Kiểm tra trạng thái'
  if (step === 'emptyWorker') return 'Thử lại'
  return status === 'estimate_ready' ? 'Trò chuyện' : 'Tiếp tục'
}

function progressForStep(step: PriceCheckUiStep, status: PriceCheckUiStatus) {
  if (step === 'form') return 34
  if (step === 'clarification') return 72
  if (step === 'estimate') return status === 'baseline_fallback' ? 78 : 82
  if (step === 'schedule') return 88
  if (step === 'confirm') return 94
  return 100
}

function complexityLabel(complexity: PriceCheckEstimateCard['complexity']) {
  if (complexity === 'small') return 'Nhỏ'
  if (complexity === 'medium') return 'Trung bình'
  if (complexity === 'large') return 'Lớn'
  return 'Chưa rõ'
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

const styles = StyleSheet.create({
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
  bookingAmbientMint: {
    backgroundColor: theme.aqua,
    borderRadius: 999,
    height: 230,
    opacity: 0.2,
    position: 'absolute',
    right: -86,
    top: 198,
    width: 230,
  },
  bookingAmbientWarm: {
    backgroundColor: tokens.copper,
    borderRadius: 999,
    bottom: 155,
    height: 156,
    left: -60,
    opacity: 0.11,
    position: 'absolute',
    width: 156,
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
    backdropFilter: 'blur(28px) saturate(1.18)',
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
  bookingTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  bookingMiniButton: {
    alignItems: 'center',
    backgroundColor: tokens.glassStrong,
    backdropFilter: 'blur(24px) saturate(1.18)',
    borderColor: tokens.glassBorder,
    borderRadius: 18,
    borderWidth: 1,
    boxShadow: '0 14px 32px rgba(13,70,65,0.12)',
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  bookingLocationPill: {
    alignItems: 'center',
    backgroundColor: tokens.glassStrong,
    backdropFilter: 'blur(24px) saturate(1.18)',
    borderColor: tokens.glassBorder,
    borderRadius: 18,
    borderWidth: 1,
    boxShadow: '0 14px 32px rgba(13,70,65,0.12)',
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
  glassSheen: {
    backgroundColor: tokens.glassHighlight,
    height: '170%',
    left: -72,
    opacity: 0.38,
    position: 'absolute',
    top: -46,
    transform: [{ rotate: '11deg' }],
    width: 58,
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
    minHeight: 40,
  },
  segmentActive: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    boxShadow: '0 8px 20px rgba(13,70,65,0.10)',
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
    backgroundColor: tokens.glassSoft,
    backdropFilter: 'blur(22px) saturate(1.16)',
    borderColor: tokens.glassBorder,
    borderRadius: 21,
    borderWidth: 1,
    boxShadow: tokens.glassFloatShadow,
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
    boxShadow: '0 0 0 5px rgba(22,185,168,0.14)',
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
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: tokens.primary,
    boxShadow: '0 8px 20px rgba(8,120,110,0.20)',
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
    backgroundColor: 'rgba(222,251,244,0.68)',
    borderColor: tokens.glassBorder,
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    overflow: 'hidden',
    padding: 13,
  },
  clarifyItem: {
    backgroundColor: 'rgba(216,247,239,0.72)',
    borderColor: 'rgba(255,255,255,0.66)',
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
    backgroundColor: tokens.glassSoft,
    backdropFilter: 'blur(22px) saturate(1.16)',
    borderColor: tokens.glassBorder,
    borderRadius: 22,
    borderWidth: 1,
    boxShadow: tokens.glassFloatShadow,
    experimental_backgroundImage:
      'radial-gradient(circle at 92% 10%, rgba(255,184,102,0.13), transparent 20%), radial-gradient(circle at 8% 92%, rgba(183,246,231,0.30), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.52), rgba(225,249,244,0.42))',
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
    backdropFilter: 'blur(22px) saturate(1.16)',
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
    backdropFilter: 'blur(22px) saturate(1.16)',
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
    backgroundColor: 'rgba(220,243,236,0.68)',
    backdropFilter: 'blur(22px) saturate(1.16)',
    borderColor: tokens.glassBorder,
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
    backdropFilter: 'blur(22px) saturate(1.18)',
    borderColor: tokens.glassBorder,
    borderRadius: 20,
    borderWidth: 1,
    boxShadow: '0 16px 38px rgba(12,117,108,0.12), inset 0 1px 0 rgba(255,255,255,0.62)',
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
    boxShadow: '0 10px 22px rgba(12,117,108,0.18)',
    flex: 1.45,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0,
    textAlign: 'center',
  },
} as any)
