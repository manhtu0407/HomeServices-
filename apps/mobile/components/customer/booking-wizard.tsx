// Kael Autonomy v2: Booking is the A2/A3 intake form, not the price or matching
// authority. Wizard hands structured intake to the full-screen Kael chat so
// Kael can pre-analyze, ask for missing details, and orchestrate by policy.
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { createContext, type ReactNode, use, useMemo, useReducer, useState } from 'react'
import { useLocalSearchParams } from 'expo-router'
import { Alert, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { type ServiceType } from '@home-services/shared'
import { GlassSurface } from '@/components/ui/glass-surface'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import { type GlassMode } from '@/components/ui/tokens'
import { type AppLanguage, useAppLanguage } from '@/lib/app-language'
import { generateClientRequestId } from '@/lib/client-request-id'
import { type LocalMediaUploadDraft } from '@/lib/media-upload'
import { AddressAutocomplete } from './address-autocomplete'
import { setPendingKaelChatDraft } from './kael-chat/pending-intake'

type WizardStep = 'service' | 'describe' | 'analyzing' | 'done'

type WizardState = {
  step: WizardStep
  serviceType: ServiceType | null
  description: string
  photoDrafts: LocalMediaUploadDraft[]
  addressLabel: string
  districtLabel: string | null
  isSubmitting: boolean
  error: string | null
}

type WizardAction =
  | { type: 'select_service'; serviceType: ServiceType }
  | { type: 'update_description'; description: string }
  | { type: 'add_photos'; drafts: LocalMediaUploadDraft[] }
  | { type: 'remove_photo'; index: number }
  | { type: 'update_address'; label: string; district: string | null }
  | { type: 'goto'; step: WizardStep }
  | { type: 'set_submitting'; flag: boolean }
  | { type: 'set_error'; error: string | null }
  | { type: 'reset' }

const INITIAL: WizardState = {
  step: 'service',
  serviceType: null,
  description: '',
  photoDrafts: [],
  addressLabel: '',
  districtLabel: null,
  isSubmitting: false,
  error: null,
}

function createInitialWizardState(routeServiceType: ServiceType | null): WizardState {
  return routeServiceType
    ? { ...INITIAL, serviceType: routeServiceType, step: 'describe', photoDrafts: [] }
    : { ...INITIAL, photoDrafts: [] }
}

function mergePhotoDrafts(current: LocalMediaUploadDraft[], drafts: LocalMediaUploadDraft[]) {
  const seenUris = new Set(current.map((photo) => photo.uri))
  const merged = [...current]
  for (const draft of drafts) {
    if (seenUris.has(draft.uri)) continue
    seenUris.add(draft.uri)
    merged.push(draft)
    if (merged.length >= 5) break
  }
  return merged
}

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'select_service':
      return { ...state, serviceType: action.serviceType, step: 'describe', error: null }
    case 'update_description':
      return { ...state, description: action.description }
    case 'add_photos':
      return { ...state, photoDrafts: mergePhotoDrafts(state.photoDrafts, action.drafts) }
    case 'remove_photo':
      return { ...state, photoDrafts: state.photoDrafts.filter((_, index) => index !== action.index) }
    case 'update_address':
      return { ...state, addressLabel: action.label, districtLabel: action.district }
    case 'goto':
      return { ...state, step: action.step }
    case 'set_submitting':
      return { ...state, isSubmitting: action.flag }
    case 'set_error':
      return { ...state, error: action.error }
    case 'reset':
      return INITIAL
  }
}

const copyMap = {
  vi: {
    serviceStep: 'Chọn dịch vụ',
    serviceTitle: 'Bạn cần dịch vụ nào?',
    serviceBody: 'Hiện hỗ trợ sửa điện, sửa nước và vệ sinh tại căn hộ TP.HCM.',
    services: {
      electrical: 'Sửa điện',
      plumbing: 'Sửa nước',
      cleaning: 'Vệ sinh',
    },
    serviceMeta: {
      electrical: 'Ổ cắm, CB, đèn',
      plumbing: 'Rò rỉ, nghẹt',
      cleaning: 'Dọn căn hộ',
    },
    servicePreviewTitle: 'Phiếu gửi Kael',
    servicePreviewMeta: 'Thông tin đầu vào',
    servicePreviewPill: 'Kael sẽ nhận',
    servicePreviewBody: 'Kael sẽ nhận dịch vụ, mô tả, ảnh và khu vực rồi phân tích trong chat.',
    servicePreviewChips: {
      problem: 'Vấn đề: cần mô tả',
      media: 'Ảnh: chưa có',
      area: 'Khu vực: cần dữ liệu',
    },
    servicePreviewService: 'Dịch vụ',
    servicePreviewDescription: 'Mô tả',
    servicePreviewArea: 'Khu vực',
    servicePreviewChat: 'Kael chat',
    flowSteps: [
      ['Chọn dịch vụ', 'Điện · Nước · Vệ sinh'],
      ['Mô tả', 'Vấn đề · Ảnh · Khu vực'],
      ['Gửi Kael', 'Tạo phiếu đầu vào'],
      ['Kael xử lý', 'Phân tích · Hỏi thêm'],
    ],
    describeStep: 'Mô tả vấn đề',
    describeTitle: 'Mô tả ngắn để Kael ước tính',
    describePlaceholder: 'Ví dụ: bóng đèn phòng khách bị chập, có mùi khét nhẹ.',
    photosLabel: 'Ảnh hỗ trợ (tối đa 5)',
    pickPhotos: 'Thêm ảnh',
    addressLabel: 'Khu vực căn hộ',
    addressMissing: 'Cần địa chỉ quận TP.HCM rõ ràng để Kael ước tính đúng.',
    descriptionTooShort: 'Mô tả cần ít nhất 10 ký tự để Kael phân tích.',
    next: 'Tiếp tục',
    back: 'Quay lại',
    submitDescribe: 'Gửi cho Kael phân tích',
    analyzingStep: 'Chuyển sang Kael',
    analyzingTitle: 'Đang mở Kael chat…',
    analyzingBody: 'Kael sẽ nhận sẵn thông tin này để phân tích hoặc hỏi thêm, không bắt bạn nhập lại.',
    pendingValue: 'Chưa có',
    photoPermissionTitle: 'Cần quyền truy cập ảnh',
    photoPermissionBody: 'Cho phép ứng dụng truy cập thư viện ảnh để gửi cho Kael.',
    doneTitle: 'Kael đã nhận phiếu',
    doneBody: 'Tiếp tục trong Kael chat để xem phân tích và điều phối tự động.',
    doneOpenHistory: 'Mở hoạt động',
    resetWizard: 'Tạo yêu cầu khác',
  },
  en: {
    serviceStep: 'Choose a service',
    serviceTitle: 'Which service do you need?',
    serviceBody: 'We currently support electrical, plumbing, and cleaning for HCMC apartments.',
    services: {
      electrical: 'Electrical',
      plumbing: 'Plumbing',
      cleaning: 'Cleaning',
    },
    serviceMeta: {
      electrical: 'Outlet, breaker, light',
      plumbing: 'Leak, clog',
      cleaning: 'Apartment cleaning',
    },
    servicePreviewTitle: 'Kael intake ticket',
    servicePreviewMeta: 'Input',
    servicePreviewPill: 'Kael receives',
    servicePreviewBody: 'Kael receives the service, description, photos, and area, then analyzes them in chat.',
    servicePreviewChips: {
      problem: 'Problem: needs details',
      media: 'Photos: none yet',
      area: 'Area: needs data',
    },
    servicePreviewService: 'Service',
    servicePreviewDescription: 'Description',
    servicePreviewArea: 'Area',
    servicePreviewChat: 'Kael chat',
    flowSteps: [
      ['Choose service', 'Electrical · Plumbing · Cleaning'],
      ['Describe', 'Issue · Photos · Area'],
      ['Send to Kael', 'Create intake ticket'],
      ['Kael works', 'Analyze · Ask more'],
    ],
    describeStep: 'Describe the issue',
    describeTitle: 'A short description for Kael to estimate',
    describePlaceholder: 'Example: living room ceiling light is short-circuiting and smells slightly burned.',
    photosLabel: 'Photos (up to 5)',
    pickPhotos: 'Add photos',
    addressLabel: 'Apartment area',
    addressMissing: 'Kael needs a clear HCMC district to estimate accurately.',
    descriptionTooShort: 'Description must be at least 10 characters.',
    next: 'Continue',
    back: 'Back',
    submitDescribe: 'Send for Kael analysis',
    analyzingStep: 'Opening Kael',
    analyzingTitle: 'Opening Kael chat…',
    analyzingBody: 'Kael receives this intake directly, then analyzes it or asks for missing details.',
    pendingValue: 'Not yet',
    photoPermissionTitle: 'Photo permission required',
    photoPermissionBody: 'Allow photo library access to attach evidence for Kael.',
    doneTitle: 'Kael received the ticket',
    doneBody: 'Continue in Kael chat to review analysis and automatic orchestration.',
    doneOpenHistory: 'Open activity',
    resetWizard: 'Create another request',
  },
} as const

type WizardCopy = (typeof copyMap)[AppLanguage]

type BookingWizardProps = {
  mode?: GlassMode
  onOpenKael: (serviceType: ServiceType) => void
  onOpenHistory: () => void
}

export function BookingWizard({ mode = 'light', onOpenHistory, onOpenKael }: BookingWizardProps) {
  const language = useAppLanguage()
  const copy = copyMap[language]
  const params = useLocalSearchParams<{ serviceType?: string | string[] }>()
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const routeServiceType = useMemo(() => parseRouteServiceType(params.serviceType), [params.serviceType])
  const [state, dispatch] = useReducer(reducer, routeServiceType, createInitialWizardState)
  const visual = useMemo(() => getBookingWizardVisual(mode, reduceTransparency), [mode, reduceTransparency])
  const visualContext = useMemo(() => ({ mode, reduceMotion, reduceTransparency, visual }), [mode, reduceMotion, reduceTransparency, visual])

  const pickPhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(copy.photoPermissionTitle, copy.photoPermissionBody)
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      selectionLimit: 5,
    })
    if (result.canceled) return
    const drafts: LocalMediaUploadDraft[] = result.assets.map((asset) => ({
      uri: asset.uri,
      type: 'image',
      fileName: asset.fileName ?? asset.uri.split('/').pop(),
      mimeType: asset.mimeType ?? undefined,
      fileSizeBytes: asset.fileSize ?? undefined,
    }))
    dispatch({ type: 'add_photos', drafts })
  }

  const submitDescribe = async () => {
    if (state.description.trim().length < 10) {
      dispatch({ type: 'set_error', error: copy.descriptionTooShort })
      return
    }
    if (!state.districtLabel) {
      dispatch({ type: 'set_error', error: copy.addressMissing })
      return
    }
    if (!state.serviceType) return
    dispatch({ type: 'set_submitting', flag: true })
    dispatch({ type: 'set_error', error: null })
    dispatch({ type: 'goto', step: 'analyzing' })
    try {
      setPendingKaelChatDraft({
        addressLabel: state.addressLabel.trim(),
        clientRequestId: generateClientRequestId(),
        createdAt: new Date().toISOString(),
        districtLabel: state.districtLabel,
        locale: language,
        mediaCount: state.photoDrafts.length,
        message: state.description.trim(),
        photoDrafts: state.photoDrafts,
        problemChips: [],
        serviceType: state.serviceType,
        source: 'booking',
      })
      onOpenKael(state.serviceType)
    } finally {
      dispatch({ type: 'set_submitting', flag: false })
    }
  }

  const activeFlowIndex = bookingFlowIndex(state.step)

  return (
    <BookingWizardVisualContext.Provider value={visualContext}>
      <View style={styles.wizardFlowShell} testID="booking-wizard-intake-handoff-flow">
        <BookingFlowOverview activeIndex={activeFlowIndex} copy={copy} />
        {state.step === 'service' ? (
          <ServiceStep key={state.serviceType ?? routeServiceType ?? 'none'} copy={copy} initialServiceType={state.serviceType ?? routeServiceType} onSelect={(serviceType) => dispatch({ type: 'select_service', serviceType })} />
        ) : state.step === 'describe' ? (
          <DescribeStep
            copy={copy}
            dispatch={dispatch}
            language={language}
            onBack={() => dispatch({ type: 'goto', step: 'service' })}
            onPickPhotos={pickPhotos}
            onSubmit={() => void submitDescribe()}
            state={state}
          />
        ) : state.step === 'analyzing' ? (
          <AnalyzingStep copy={copy} />
        ) : (
          <DoneStep
            copy={copy}
            onOpenHistory={onOpenHistory}
            onReset={() => dispatch({ type: 'reset' })}
          />
        )}
      </View>
    </BookingWizardVisualContext.Provider>
  )
}

function bookingFlowIndex(step: WizardStep) {
  if (step === 'service') return 0
  if (step === 'describe') return 1
  if (step === 'analyzing') return 2
  return 3
}

type BookingWizardVisual = {
  aqua: string
  border: string
  borderStrong: string
  card: string
  danger: string
  disabled: string
  muted: string
  primary: string
  primaryText: string
  row: string
  rowStrong: string
  text: string
  warm: string
}

const BookingWizardVisualContext = createContext<{
  mode: GlassMode
  reduceMotion: boolean
  reduceTransparency: boolean
  visual: BookingWizardVisual
} | null>(null)

function useBookingWizardVisual() {
  const value = use(BookingWizardVisualContext)
  if (!value) throw new Error('BookingWizard visual context is missing')
  return value
}

function getBookingWizardVisual(mode: GlassMode, reduceTransparency: boolean): BookingWizardVisual {
  const dark = mode === 'dark'
  if (reduceTransparency) {
    return dark
      ? {
          aqua: '#1E4A41',
          border: 'rgba(255,255,255,0.12)',
          borderStrong: 'rgba(105,222,198,0.24)',
          card: '#102420',
          danger: '#F5A3A3',
          disabled: '#1B322E',
          muted: '#9DBCB5',
          primary: '#8AEBD9',
          primaryText: '#06221D',
          row: '#132A26',
          rowStrong: '#183C35',
          text: '#EEF8F4',
          warm: '#CBA56E',
        }
      : {
          aqua: '#CFF8EF',
          border: 'rgba(35,96,84,0.13)',
          borderStrong: 'rgba(13,134,119,0.24)',
          card: '#FFFEFA',
          danger: '#B43F3F',
          disabled: '#EAF2EE',
          muted: '#647672',
          primary: '#087F70',
          primaryText: '#FFFFFF',
          row: '#FFFEFA',
          rowStrong: '#DDFBF2',
          text: '#12231F',
          warm: '#FFF4DB',
        }
  }

  return dark
    ? {
        aqua: 'rgba(105,222,198,0.18)',
        border: 'rgba(255,255,255,0.14)',
        borderStrong: 'rgba(105,222,198,0.26)',
        card: 'rgba(16,36,32,0.74)',
        danger: '#F5A3A3',
        disabled: 'rgba(29,61,54,0.72)',
        muted: '#9DBCB5',
        primary: '#8AEBD9',
        primaryText: '#06221D',
        row: 'rgba(18,39,36,0.82)',
        rowStrong: 'rgba(32,72,64,0.78)',
        text: '#EEF8F4',
        warm: 'rgba(203,165,110,0.22)',
      }
    : {
        aqua: 'rgba(66,216,189,0.32)',
        border: 'rgba(35,96,84,0.13)',
        borderStrong: 'rgba(13,134,119,0.22)',
        card: 'rgba(255,253,248,0.92)',
        danger: '#B43F3F',
        disabled: 'rgba(229,241,235,0.86)',
        muted: '#647672',
        primary: '#087F70',
        primaryText: '#FFFFFF',
        row: 'rgba(255,254,250,0.96)',
        rowStrong: 'rgba(220,251,243,0.94)',
        text: '#12231F',
        warm: 'rgba(255,244,219,0.90)',
      }
}

function parseRouteServiceType(value: string | string[] | undefined): ServiceType | null {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'electrical' || raw === 'plumbing' || raw === 'cleaning' ? raw : null
}

function WizardCard({ children, testID }: { children: ReactNode; testID: string }) {
  const { mode, visual } = useBookingWizardVisual()
  const isServiceStep = testID === 'booking-wizard-step-service'

  if (isServiceStep) {
    return (
      <View style={[styles.card, styles.cardServiceStep]} testID={testID}>
        <View pointerEvents="none" style={styles.hiddenMarker} testID="booking-wizard-production-glass-intake-handoff" />
        {children}
      </View>
    )
  }

  return (
    <GlassSurface backgroundColor={visual.card} borderColor={visual.border} mode={mode} style={styles.card} testID={testID} variant="sheet">
      <View pointerEvents="none" style={[styles.cardWash, { backgroundColor: visual.aqua }]} testID="booking-wizard-liquid-wash" />
      <View pointerEvents="none" style={[styles.cardWarmWash, { backgroundColor: visual.warm }]} />
      <View pointerEvents="none" style={styles.hiddenMarker} testID="booking-wizard-production-glass-intake-handoff" />
      {children}
    </GlassSurface>
  )
}

function WizardText({
  children,
  kind,
  numberOfLines,
  testID,
}: {
  children: ReactNode
  kind: 'body' | 'disclaimer' | 'eyebrow' | 'error' | 'label' | 'title' | 'value'
  numberOfLines?: number
  testID?: string
}) {
  const { visual } = useBookingWizardVisual()
  const styleByKind = {
    body: [styles.body, { color: visual.muted }],
    disclaimer: [styles.disclaimer, { color: visual.muted }],
    eyebrow: [styles.stepEyebrow, { color: visual.primary }],
    error: [styles.errorText, { color: visual.danger }],
    label: [styles.label, { color: visual.muted }],
    title: [styles.title, { color: visual.text }],
    value: [styles.estimateValue, { color: visual.text }],
  }[kind]

  return (
    <Text numberOfLines={numberOfLines} style={styleByKind} testID={testID}>
      {children}
    </Text>
  )
}

function WizardPrimaryButton({
  buttonStyle,
  disabled,
  label,
  onPress,
  testID,
}: {
  buttonStyle?: StyleProp<ViewStyle>
  disabled?: boolean
  label: string
  onPress: () => void
  testID: string
}) {
  const { reduceMotion, visual } = useBookingWizardVisual()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: visual.primary },
        buttonStyle,
        disabled ? styles.primaryButtonDisabled : null,
        reduceMotionAwarePressStyle(pressed, reduceMotion),
      ]}
      testID={testID}
    >
      <Text style={[styles.primaryButtonText, { color: visual.primaryText }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

function WizardSecondaryButton({
  disabled,
  label,
  onPress,
  testID,
}: {
  disabled?: boolean
  label: string
  onPress: () => void
  testID: string
}) {
  const { reduceMotion, visual } = useBookingWizardVisual()
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        { backgroundColor: visual.row, borderColor: visual.borderStrong },
        disabled ? styles.primaryButtonDisabled : null,
        reduceMotionAwarePressStyle(pressed, reduceMotion),
      ]}
      testID={testID}
    >
      <Text style={[styles.secondaryButtonText, { color: visual.primary }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

function WizardBackButton({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  const { reduceMotion, visual } = useBookingWizardVisual()
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.backButton,
        { backgroundColor: visual.row, borderColor: visual.borderStrong },
        reduceMotionAwarePressStyle(pressed, reduceMotion),
      ]}
      testID={testID}
    >
      <Text style={[styles.backButtonText, { color: visual.primary }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

function BookingFlowOverview({ activeIndex, copy }: { activeIndex: number; copy: WizardCopy }) {
  const { mode, reduceTransparency, visual } = useBookingWizardVisual()
  return (
    <View style={styles.flowOverview} testID="booking-wizard-intake-handoff-overview">
      {copy.flowSteps.map(([title, meta], index) => {
        const active = index === activeIndex
        return (
          <View
            key={title}
            style={[
              styles.flowStepCard,
              bookingFlowStepSurface(visual, mode, reduceTransparency, index, active),
            ]}
            testID={`booking-wizard-flow-step-${index + 1}`}
          >
            <View style={[styles.flowStepBadge, bookingFlowBadgeSurface(visual, mode, reduceTransparency, index, active)]}>
              <Text style={[styles.flowStepBadgeText, { color: active ? visual.primaryText : bookingFlowTextColor(visual, mode, index) }]} numberOfLines={1}>
                {index + 1}
              </Text>
            </View>
            <View style={styles.flowStepCopy}>
              <Text style={[styles.flowStepTitle, { color: active ? visual.text : bookingFlowTitleColor(visual, mode, index) }]} numberOfLines={1}>
                {title}
              </Text>
              <Text style={[styles.flowStepMeta, { color: active ? visual.muted : bookingFlowMetaColor(visual, mode, index) }]} numberOfLines={1}>
                {meta}
              </Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

function bookingFlowStepSurface(
  visual: BookingWizardVisual,
  mode: GlassMode,
  reduceTransparency: boolean,
  index: number,
  active: boolean,
) {
  const tone = index === 2 ? 'warm' : index === 1 ? 'water' : 'mint'
  const isWarm = tone === 'warm'
  const isWater = tone === 'water'
  const lightGradient = isWarm
    ? 'radial-gradient(circle at 86% 20%, rgba(255,230,178,0.72), transparent 38%), linear-gradient(180deg, rgba(255,254,250,0.98), rgba(255,248,231,0.90))'
    : isWater
      ? 'radial-gradient(circle at 86% 20%, rgba(181,241,247,0.82), transparent 38%), linear-gradient(180deg, rgba(250,255,254,0.98), rgba(231,251,250,0.92))'
      : 'radial-gradient(circle at 86% 20%, rgba(177,249,234,0.84), transparent 38%), linear-gradient(180deg, rgba(250,255,252,0.98), rgba(225,250,242,0.92))'
  const darkGradient = isWarm
    ? 'radial-gradient(circle at 84% 18%, rgba(224,160,107,0.18), transparent 38%), linear-gradient(180deg, rgba(34,29,23,0.96), rgba(18,39,36,0.88))'
    : isWater
      ? 'radial-gradient(circle at 84% 18%, rgba(80,190,202,0.18), transparent 38%), linear-gradient(180deg, rgba(18,39,36,0.96), rgba(15,44,45,0.88))'
      : 'radial-gradient(circle at 84% 18%, rgba(105,222,198,0.18), transparent 38%), linear-gradient(180deg, rgba(18,39,36,0.96), rgba(13,29,27,0.90))'

  return {
    background: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundColor: mode === 'dark'
      ? isWarm ? '#221D17' : isWater ? '#102B2C' : active ? '#183C35' : '#122724'
      : isWarm ? '#FFF7E8' : isWater ? '#F0FEFF' : active ? visual.rowStrong : '#F0FFF9',
    backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    borderColor: active
      ? visual.borderStrong
      : mode === 'dark'
        ? isWarm ? 'rgba(224,160,107,0.22)' : 'rgba(105,222,198,0.18)'
        : isWarm ? 'rgba(202,145,75,0.22)' : isWater ? 'rgba(35,156,168,0.20)' : 'rgba(15,130,115,0.18)',
    boxShadow: mode === 'dark'
      ? '0 10px 22px rgba(0,0,0,0.18)'
      : isWarm
        ? '0 12px 24px rgba(176,118,44,0.10)'
        : '0 12px 24px rgba(9,121,106,0.10)',
    experimental_backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function bookingFlowBadgeSurface(
  visual: BookingWizardVisual,
  mode: GlassMode,
  reduceTransparency: boolean,
  index: number,
  active: boolean,
) {
  const tone = index === 2 ? 'warm' : index === 1 ? 'water' : 'mint'
  const isWarm = tone === 'warm'
  const isWater = tone === 'water'
  const lightGradient = isWarm
    ? 'radial-gradient(circle at 24% 18%, rgba(255,255,255,0.94), transparent 28%), linear-gradient(145deg, #FFF1D6, #F3D28D)'
    : isWater
      ? 'radial-gradient(circle at 24% 18%, rgba(255,255,255,0.92), transparent 28%), linear-gradient(145deg, #E4FCFA, #AEEBEF)'
      : 'radial-gradient(circle at 24% 18%, rgba(255,255,255,0.92), transparent 28%), linear-gradient(145deg, #C9F8EA, #8FE7D2)'

  return {
    background: reduceTransparency || active ? undefined : mode === 'dark' ? undefined : lightGradient,
    backgroundColor: active
      ? visual.primary
      : mode === 'dark'
        ? isWater ? '#15363A' : isWarm ? '#3B291B' : '#173B35'
        : isWater ? '#E8FCFA' : isWarm ? '#FFF8EB' : '#DCFBF3',
    backgroundImage: reduceTransparency || active ? undefined : mode === 'dark' ? undefined : lightGradient,
    borderColor: active
      ? visual.borderStrong
      : mode === 'dark'
        ? isWarm ? 'rgba(224,160,107,0.24)' : 'rgba(105,222,198,0.20)'
        : isWarm ? 'rgba(202,145,75,0.24)' : isWater ? 'rgba(35,156,168,0.22)' : 'rgba(15,130,115,0.20)',
    experimental_backgroundImage: reduceTransparency || active ? undefined : mode === 'dark' ? undefined : lightGradient,
  } as any
}

function bookingFlowTextColor(visual: BookingWizardVisual, mode: GlassMode, index: number) {
  if (mode === 'dark') return visual.primary
  if (index === 2) return '#9A691D'
  if (index === 1) return '#087B89'
  return visual.primary
}

function bookingFlowTitleColor(visual: BookingWizardVisual, mode: GlassMode, index: number) {
  if (mode === 'dark') return visual.text
  if (index === 2) return '#1F211D'
  if (index === 1) return '#102527'
  return visual.text
}

function bookingFlowMetaColor(visual: BookingWizardVisual, mode: GlassMode, index: number) {
  if (mode === 'dark') return visual.muted
  if (index === 2) return '#756547'
  if (index === 1) return '#557377'
  return visual.muted
}

function ServiceStep({
  copy,
  initialServiceType,
  onSelect,
}: {
  copy: WizardCopy
  initialServiceType: ServiceType | null
  onSelect: (serviceType: ServiceType) => void
}) {
  const { mode, reduceMotion, reduceTransparency, visual } = useBookingWizardVisual()
  const [selectedService, setSelectedService] = useState<ServiceType | null>(initialServiceType)
  const serviceChip = selectedService ? `${copy.serviceStep}: ${copy.services[selectedService]}` : copy.servicePreviewChips.problem

  return (
    <WizardCard testID="booking-wizard-step-service">
      <View style={styles.serviceGrid}>
        {(['electrical', 'plumbing', 'cleaning'] as const).map((service) => (
          <Pressable
            accessibilityLabel={copy.services[service]}
            accessibilityRole="button"
            key={service}
            onPress={() => setSelectedService(service)}
            style={({ pressed }) => [
              styles.serviceCard,
              bookingServiceCardSurface(visual, mode, reduceTransparency, service, selectedService === service),
              reduceMotionAwarePressStyle(pressed, reduceMotion),
            ]}
            testID={`booking-wizard-service-${service}`}
          >
            <View style={[styles.serviceIconDisk, bookingServiceIconSurface(visual, mode, reduceTransparency, service)]}>
              <ServiceGlyph service={service} color={visual.primary} accent={bookingServiceGlyphAccent(visual, mode, service)} />
            </View>
            <Text style={[styles.serviceCardText, { color: visual.text }]} numberOfLines={2}>
              {copy.services[service]}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.previewChipRow} testID="booking-wizard-service-pending-chips">
        {[serviceChip, copy.servicePreviewChips.media, copy.servicePreviewChips.area].map((label, index) => (
          <View key={label} style={[styles.previewChip, bookingPreviewChipSurface(visual, mode, reduceTransparency, index)]}>
            <Text style={[styles.previewChipText, { color: bookingPreviewChipTextColor(visual, mode, index) }]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      <View style={[styles.previewPanel, bookingDiagnosisSurface(visual, mode, reduceTransparency)]} testID="booking-wizard-intake-preview">
        <View style={[styles.previewPillRow, bookingDiagnosisPillSurface(visual, mode, reduceTransparency)]}>
          <View style={[styles.kaelBadge, { backgroundColor: mode === 'dark' ? 'rgba(105,222,198,0.22)' : 'rgba(255,255,255,0.72)' }]}>
            <Text style={[styles.kaelBadgeText, { color: visual.primary }]}>K</Text>
          </View>
          <Text style={[styles.previewPillText, { color: visual.primary }]} numberOfLines={1}>
            {copy.servicePreviewPill}
          </Text>
        </View>
        <Text style={[styles.previewBody, { color: visual.text }]} numberOfLines={3}>
          {copy.servicePreviewBody}
        </Text>
      </View>
      <View style={[styles.estimateShell, bookingEstimateShellSurface(visual, mode, reduceTransparency)]} testID="booking-wizard-intake-shell">
        <View style={styles.previewHeader}>
          <Text style={[styles.previewTitle, { color: visual.text }]} numberOfLines={1}>
            {copy.servicePreviewTitle}
          </Text>
          <Text style={[styles.previewMeta, { color: visual.primary }]} numberOfLines={1}>
            {copy.servicePreviewMeta}
          </Text>
        </View>
        <View style={styles.estimateGrid} testID="booking-wizard-intake-grid">
          <EstimateField label={copy.servicePreviewService} value={copy.pendingValue} />
          <EstimateField label={copy.servicePreviewDescription} value={copy.pendingValue} />
          <EstimateField label={copy.servicePreviewArea} value={copy.pendingValue} />
          <EstimateField label={copy.servicePreviewChat} value={copy.pendingValue} />
        </View>
      </View>
      <WizardPrimaryButton
        disabled={!selectedService}
        label={copy.next}
        onPress={() => {
          if (selectedService) onSelect(selectedService)
        }}
        testID="booking-wizard-service-next"
      />
    </WizardCard>
  )
}

function bookingServiceTone(service: ServiceType) {
  if (service === 'plumbing') return 'water'
  if (service === 'cleaning') return 'warm'
  return 'service'
}

function bookingServiceCardSurface(visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean, service: ServiceType, selected: boolean) {
  const tone = bookingServiceTone(service)
  const isWater = tone === 'water'
  const isWarm = tone === 'warm'
  const lightGradient = isWarm
    ? 'radial-gradient(circle at 84% 20%, rgba(255,230,178,0.70), transparent 38%), linear-gradient(180deg, rgba(255,254,250,0.98), rgba(255,248,231,0.88))'
    : isWater
      ? 'radial-gradient(circle at 84% 20%, rgba(181,241,247,0.78), transparent 38%), linear-gradient(180deg, rgba(250,255,254,0.98), rgba(232,251,250,0.90))'
      : 'radial-gradient(circle at 84% 20%, rgba(177,249,234,0.82), transparent 38%), linear-gradient(180deg, rgba(250,255,252,0.98), rgba(226,250,242,0.90))'
  const darkGradient = isWarm
    ? 'radial-gradient(circle at 82% 18%, rgba(224,160,107,0.18), transparent 38%), linear-gradient(180deg, rgba(34,29,23,0.98), rgba(18,39,36,0.88))'
    : isWater
      ? 'radial-gradient(circle at 82% 18%, rgba(80,190,202,0.17), transparent 38%), linear-gradient(180deg, rgba(18,39,36,0.98), rgba(15,44,45,0.88))'
      : 'radial-gradient(circle at 82% 18%, rgba(105,222,198,0.17), transparent 38%), linear-gradient(180deg, rgba(18,39,36,0.98), rgba(13,29,27,0.90))'

  return {
    backgroundColor: mode === 'dark'
      ? isWarm ? '#221D17' : isWater ? '#102B2C' : '#122724'
      : isWarm ? '#FFF7E8' : isWater ? '#F0FEFF' : '#F0FFF9',
    borderColor: selected
      ? mode === 'dark'
        ? isWarm ? 'rgba(244,190,122,0.34)' : 'rgba(138,235,217,0.34)'
        : isWarm ? 'rgba(176,118,44,0.30)' : isWater ? 'rgba(35,156,168,0.30)' : 'rgba(13,134,119,0.30)'
      : mode === 'dark'
        ? isWarm ? 'rgba(224,160,107,0.20)' : 'rgba(105,222,198,0.16)'
        : isWarm ? 'rgba(202,145,75,0.20)' : isWater ? 'rgba(35,156,168,0.18)' : 'rgba(15,130,115,0.16)',
    boxShadow: mode === 'dark'
      ? '0 10px 22px rgba(0,0,0,0.20)'
      : selected
        ? isWarm ? '0 12px 24px rgba(176,118,44,0.11)' : '0 12px 24px rgba(9,121,106,0.12)'
        : '0 10px 24px rgba(17,70,61,0.075)',
    background: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function bookingServiceIconSurface(visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean, service: ServiceType) {
  const tone = bookingServiceTone(service)
  const isWater = tone === 'water'
  const isWarm = tone === 'warm'
  const lightGradient = isWarm
    ? 'radial-gradient(circle at 24% 18%, rgba(255,255,255,0.94), transparent 28%), linear-gradient(145deg, #FFF1D6, #F3D28D)'
    : isWater
      ? 'radial-gradient(circle at 24% 18%, rgba(255,255,255,0.92), transparent 28%), linear-gradient(145deg, #E4FCFA, #AEEBEF)'
      : 'radial-gradient(circle at 24% 18%, rgba(255,255,255,0.92), transparent 28%), linear-gradient(145deg, #C9F8EA, #8FE7D2)'
  const darkGradient = 'radial-gradient(circle at 24% 18%, rgba(255,255,255,0.10), transparent 28%), linear-gradient(145deg, rgba(105,222,198,0.20), rgba(18,39,36,0.82))'

  return {
    backgroundColor: mode === 'dark'
      ? isWater ? '#15363A' : isWarm ? '#3B291B' : '#173B35'
      : isWater ? '#E8FCFA' : isWarm ? '#FFF8EB' : '#DCFBF3',
    borderColor: mode === 'dark'
      ? isWarm ? 'rgba(224,160,107,0.24)' : 'rgba(118,220,227,0.22)'
      : isWarm ? 'rgba(176,118,44,0.22)' : isWater ? 'rgba(33,140,178,0.22)' : visual.borderStrong,
    background: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function bookingServiceGlyphAccent(visual: BookingWizardVisual, mode: GlassMode, service: ServiceType) {
  if (service === 'cleaning') return mode === 'dark' ? '#F3D7A9' : '#9A6B25'
  if (service === 'plumbing') return mode === 'dark' ? visual.primary : '#0A8A92'
  return visual.primary
}

function bookingDiagnosisSurface(visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean) {
  const lightGradient = 'radial-gradient(circle at 94% 18%, rgba(255,244,219,0.64), transparent 30%), linear-gradient(135deg, rgba(223,253,246,0.96), rgba(255,247,226,0.82))'
  const darkGradient = 'radial-gradient(circle at 94% 18%, rgba(224,160,107,0.15), transparent 30%), linear-gradient(135deg, rgba(17,54,48,0.96), rgba(38,32,23,0.82))'

  return {
    backgroundColor: mode === 'dark' ? 'rgba(17,54,48,0.94)' : 'rgba(229,252,246,0.94)',
    borderColor: mode === 'dark' ? visual.borderStrong : 'rgba(13,134,119,0.16)',
    boxShadow: reduceTransparency ? 'none' : mode === 'dark' ? '0 10px 22px rgba(0,0,0,0.16)' : '0 12px 26px rgba(17,70,61,0.055)',
    background: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function bookingDiagnosisPillSurface(visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean) {
  const lightGradient = 'linear-gradient(135deg, rgba(210,252,241,0.98), rgba(232,255,249,0.94))'
  const darkGradient = 'linear-gradient(135deg, rgba(23,72,63,0.92), rgba(15,48,43,0.88))'
  return {
    backgroundColor: mode === 'dark' ? 'rgba(23,72,63,0.90)' : 'rgba(220,251,243,0.94)',
    borderColor: mode === 'dark' ? visual.borderStrong : 'rgba(13,134,119,0.18)',
    background: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function bookingEstimateShellSurface(visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean) {
  const lightGradient = 'radial-gradient(circle at 92% 10%, rgba(255,248,226,0.42), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.96), rgba(255,253,248,0.92))'
  const darkGradient = 'radial-gradient(circle at 92% 10%, rgba(224,160,107,0.10), transparent 28%), linear-gradient(180deg, rgba(22,43,40,0.96), rgba(18,39,36,0.94))'

  return {
    backgroundColor: mode === 'dark' ? 'rgba(22,43,40,0.96)' : 'rgba(255,253,248,0.96)',
    borderColor: mode === 'dark' ? visual.border : 'rgba(28,106,94,0.13)',
    boxShadow: reduceTransparency ? 'none' : mode === 'dark' ? '0 10px 24px rgba(0,0,0,0.18)' : '0 12px 28px rgba(17,70,61,0.06)',
    background: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function bookingPreviewChipSurface(visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean, index: number) {
  const tone = index === 1 ? 'water' : index === 2 ? 'warm' : 'service'
  const isWater = tone === 'water'
  const isWarm = tone === 'warm'

  return {
    backgroundColor: mode === 'dark'
      ? isWarm ? 'rgba(64,42,24,0.86)' : isWater ? 'rgba(18,60,64,0.82)' : 'rgba(19,64,55,0.82)'
      : isWarm ? 'rgba(255,244,219,0.94)' : isWater ? 'rgba(232,252,253,0.94)' : 'rgba(220,251,243,0.94)',
    borderColor: mode === 'dark'
      ? isWarm ? 'rgba(224,160,107,0.24)' : 'rgba(105,222,198,0.20)'
      : isWarm ? 'rgba(176,118,44,0.18)' : isWater ? 'rgba(35,156,168,0.18)' : 'rgba(13,134,119,0.18)',
    boxShadow: reduceTransparency ? 'none' : mode === 'dark' ? '0 6px 14px rgba(0,0,0,0.16)' : '0 8px 18px rgba(17,70,61,0.055)',
  }
}

function bookingPreviewChipTextColor(visual: BookingWizardVisual, mode: GlassMode, index: number) {
  if (index === 2) return mode === 'dark' ? '#F3D7A9' : '#6F4C22'
  return visual.primary
}

function ServiceGlyph({ accent, color, service }: { accent: string; color: string; service: ServiceType }) {
  if (service === 'electrical') {
    return (
      <Svg width={26} height={26} viewBox="0 0 26 26" accessibilityRole="image">
        <Path d="M9.4 5.8v5.2M16.6 5.8V11" stroke={accent} strokeWidth={1.9} strokeLinecap="round" />
        <Path d="M8.2 10.8h9.6v3.3a4.8 4.8 0 0 1-9.6 0v-3.3Z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
        <Path d="M13 18.9v2.3" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      </Svg>
    )
  }

  if (service === 'plumbing') {
    return (
      <Svg width={26} height={26} viewBox="0 0 26 26" accessibilityRole="image">
        <Path d="M5.8 8.7h6.8c2.4 0 4.2 1.7 4.2 4.1v1" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M7.8 6.1h5M10.3 6.1v2.6M5.7 11.8h4.6" stroke={accent} strokeWidth={1.9} strokeLinecap="round" />
        <Path d="M16.8 14.7c1.2 1.2 1.8 2.1 1.8 2.9a1.85 1.85 0 0 1-3.7 0c0-.8.7-1.7 1.9-2.9Z" stroke={accent} strokeWidth={1.9} strokeLinejoin="round" />
      </Svg>
    )
  }

  return (
    <Svg width={26} height={26} viewBox="0 0 26 26" accessibilityRole="image">
      <Path d="M17.1 5.8 10.3 14" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="m9.4 13.6 4.4 3.7" stroke={accent} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M7.8 14.9 13 19.3l-1.3 1.5c-1.5.6-3.1.5-5-.5l-1.4-1.1 2.5-4.3Z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
      <Path d="m6.8 18.6 2.4 2" stroke={accent} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  )
}

function DescribeStep({
  copy,
  dispatch,
  language,
  onBack,
  onPickPhotos,
  onSubmit,
  state,
}: {
  copy: WizardCopy
  dispatch: (action: WizardAction) => void
  language: AppLanguage
  onBack: () => void
  onPickPhotos: () => void
  onSubmit: () => void
  state: WizardState
}) {
  const { reduceMotion, visual } = useBookingWizardVisual()
  return (
    <WizardCard testID="booking-wizard-step-describe">
      <View style={styles.stepHeaderWithAction}>
        <View style={styles.stepHeaderCopy}>
          <WizardText kind="eyebrow">{copy.describeStep}</WizardText>
          <WizardText kind="title">{copy.describeTitle}</WizardText>
        </View>
        <WizardBackButton label={copy.back} onPress={onBack} testID="booking-wizard-describe-back" />
      </View>
      <View style={styles.formGroup}>
        <TextInput
          accessibilityLabel={copy.describeTitle}
          multiline
          numberOfLines={4}
          onChangeText={(description) => dispatch({ type: 'update_description', description })}
          placeholder={copy.describePlaceholder}
          placeholderTextColor={visual.muted}
          style={[styles.input, styles.describeInput, { backgroundColor: visual.row, borderColor: visual.borderStrong, color: visual.text }]}
          value={state.description}
        />
      </View>
      <View style={styles.photoGroup}>
        <WizardText kind="label">{copy.photosLabel}</WizardText>
        <View style={styles.photoRow}>
          {state.photoDrafts.map((photo, index) => (
            <View key={photo.uri} style={[styles.photoTile, { borderColor: visual.borderStrong }]}>
              <Image accessibilityLabel={`photo-${index}`} contentFit="cover" source={{ uri: photo.uri }} style={styles.photoImage} />
              <Pressable
                accessibilityLabel={`remove-photo-${index}`}
                accessibilityRole="button"
                onPress={() => dispatch({ type: 'remove_photo', index })}
                style={styles.photoRemove}
                testID={`booking-wizard-photo-remove-${index}`}
              >
                <Text style={styles.photoRemoveText}>×</Text>
              </Pressable>
            </View>
          ))}
          {state.photoDrafts.length < 5 ? (
            <Pressable
              accessibilityLabel={copy.pickPhotos}
              accessibilityRole="button"
              onPress={onPickPhotos}
              style={({ pressed }) => [
                styles.photoAdd,
                { backgroundColor: visual.disabled, borderColor: visual.borderStrong },
                reduceMotionAwarePressStyle(pressed, reduceMotion),
              ]}
              testID="booking-wizard-photo-add"
            >
              <Text style={[styles.photoAddText, { color: visual.primary }]}>+ {copy.pickPhotos}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <AddressAutocomplete
        language={language}
        onChange={(label, district) => dispatch({ type: 'update_address', label, district })}
        value={state.addressLabel}
      />
      {state.error ? (
        <View style={styles.errorSlot}>
          <WizardText kind="error">{state.error}</WizardText>
        </View>
      ) : null}
      <WizardPrimaryButton disabled={state.isSubmitting} label={copy.submitDescribe} onPress={onSubmit} testID="booking-wizard-submit-describe" />
    </WizardCard>
  )
}

function AnalyzingStep({ copy }: { copy: WizardCopy }) {
  const { visual } = useBookingWizardVisual()
  return (
    <WizardCard testID="booking-wizard-step-analyzing">
      <WizardText kind="eyebrow">{copy.analyzingStep}</WizardText>
      <WizardText kind="title">{copy.analyzingTitle}</WizardText>
      <WizardText kind="body">{copy.analyzingBody}</WizardText>
      <View style={[styles.progressTrack, { backgroundColor: visual.disabled }]} testID="booking-wizard-kael-progress">
        <View style={[styles.progressFill, { backgroundColor: visual.primary }]} />
      </View>
    </WizardCard>
  )
}

type BookingFieldTone = 'mint' | 'water' | 'warm'

function EstimateField({
  label,
  tone = 'mint',
  value,
  wide,
}: {
  label: string
  tone?: BookingFieldTone
  value: string
  wide?: boolean
}) {
  const { mode, reduceTransparency, visual } = useBookingWizardVisual()
  return (
    <View style={[styles.estimateField, bookingFieldSurface(visual, mode, reduceTransparency, tone), wide ? styles.estimateFieldWide : null]}>
      <View pointerEvents="none" style={[styles.estimateFieldWash, { backgroundColor: bookingFieldWashColor(visual, mode, tone) }]} />
      <WizardText kind="label" numberOfLines={1}>{label}</WizardText>
      <WizardText kind="value" numberOfLines={2}>{value}</WizardText>
    </View>
  )
}

function bookingFieldSurface(
  visual: BookingWizardVisual,
  mode: GlassMode,
  reduceTransparency: boolean,
  tone: BookingFieldTone,
) {
  const isWater = tone === 'water'
  const isWarm = tone === 'warm'
  const lightGradient = isWarm
    ? 'radial-gradient(circle at 82% 18%, rgba(255,229,176,0.76), transparent 38%), linear-gradient(180deg, rgba(255,254,249,0.98), rgba(255,247,230,0.91))'
    : isWater
      ? 'radial-gradient(circle at 82% 18%, rgba(174,235,239,0.82), transparent 38%), linear-gradient(180deg, rgba(250,255,254,0.98), rgba(232,251,250,0.92))'
      : 'radial-gradient(circle at 82% 18%, rgba(167,246,228,0.84), transparent 38%), linear-gradient(180deg, rgba(250,255,252,0.98), rgba(224,250,242,0.92))'
  const darkGradient = isWarm
    ? 'radial-gradient(circle at 82% 18%, rgba(224,160,107,0.18), transparent 38%), linear-gradient(180deg, rgba(37,31,24,0.96), rgba(22,43,38,0.88))'
    : isWater
      ? 'radial-gradient(circle at 82% 18%, rgba(80,190,202,0.18), transparent 38%), linear-gradient(180deg, rgba(18,43,43,0.96), rgba(15,43,45,0.88))'
      : 'radial-gradient(circle at 82% 18%, rgba(105,222,198,0.18), transparent 38%), linear-gradient(180deg, rgba(18,43,36,0.96), rgba(13,35,31,0.90))'

  return {
    background: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundColor: mode === 'dark'
      ? isWarm ? '#251F18' : isWater ? '#102B2C' : '#122B24'
      : isWarm ? '#FFF7E6' : isWater ? '#F0FEFF' : '#F0FFF9',
    backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    borderColor: mode === 'dark'
      ? isWarm ? 'rgba(224,160,107,0.28)' : 'rgba(105,222,198,0.22)'
      : isWarm ? 'rgba(202,145,75,0.26)' : isWater ? 'rgba(35,156,168,0.24)' : 'rgba(15,130,115,0.23)',
    boxShadow: mode === 'dark'
      ? '0 12px 24px rgba(0,0,0,0.20)'
      : isWarm
        ? '0 14px 28px rgba(176,118,44,0.11)'
        : '0 14px 28px rgba(9,121,106,0.11)',
    experimental_backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function bookingFieldWashColor(visual: BookingWizardVisual, mode: GlassMode, tone: BookingFieldTone) {
  if (mode === 'dark') return tone === 'warm' ? 'rgba(224,160,107,0.16)' : 'rgba(105,222,198,0.16)'
  if (tone === 'warm') return 'rgba(255,229,176,0.42)'
  if (tone === 'water') return 'rgba(174,235,239,0.44)'
  return visual.aqua
}

function DoneStep({
  copy,
  onOpenHistory,
  onReset,
}: {
  copy: WizardCopy
  onOpenHistory: () => void
  onReset: () => void
}) {
  return (
    <WizardCard testID="booking-wizard-step-done">
      <WizardText kind="title">{copy.doneTitle}</WizardText>
      <WizardText kind="body">{copy.doneBody}</WizardText>
      <WizardPrimaryButton label={copy.doneOpenHistory} onPress={onOpenHistory} testID="booking-wizard-open-history" />
      <WizardSecondaryButton label={copy.resetWizard} onPress={onReset} testID="booking-wizard-reset" />
    </WizardCard>
  )
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
  },
  backButtonText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  body: { color: '#52615C', fontSize: 14, lineHeight: 20 },
  card: {
    gap: 16,
    minHeight: 320,
    overflow: 'hidden',
    padding: 20,
    position: 'relative',
  },
  cardServiceStep: {
    minHeight: 0,
    overflow: 'visible',
    padding: 0,
  },
  cardWarmWash: {
    borderRadius: 999,
    height: 122,
    opacity: 0.32,
    position: 'absolute',
    right: -42,
    top: 132,
    width: 122,
  },
  cardWash: {
    borderRadius: 999,
    height: 180,
    opacity: 0.28,
    position: 'absolute',
    right: -70,
    top: -68,
    width: 180,
  },
  disclaimer: { color: '#52615C', fontSize: 12, fontStyle: 'italic', lineHeight: 16 },
  errorText: { color: '#B43F3F', fontSize: 13, fontWeight: '600' },
  errorSlot: { marginTop: -2 },
  estimateField: {
    borderRadius: 18,
    borderWidth: 1,
    boxShadow: '0 7px 16px rgba(17,70,61,0.035)',
    flexBasis: '47%',
    flexGrow: 1,
    gap: 7,
    minHeight: 86,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 13,
    position: 'relative',
  },
  estimateFieldWash: {
    borderRadius: 999,
    height: 96,
    opacity: 0.42,
    position: 'absolute',
    right: -42,
    top: -34,
    width: 96,
  },
  estimateFieldWide: {
    flexBasis: '100%',
  },
  estimateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  estimateShell: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    overflow: 'hidden',
    padding: 16,
  },
  estimateValue: { color: '#1F2937', fontSize: 15, fontWeight: '700', lineHeight: 19 },
  flowOverview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  flowStepBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  flowStepBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  flowStepCard: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: '47%',
    flexDirection: 'row',
    flexGrow: 1,
    gap: 9,
    minHeight: 64,
    overflow: 'hidden',
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  flowStepCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  flowStepMeta: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 14,
  },
  flowStepTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 17,
  },
  formGroup: { gap: 9 },
  hiddenMarker: { height: 0, opacity: 0, position: 'absolute', width: 0 },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E2DC',
    borderRadius: 18,
    borderWidth: 1,
    fontSize: 14,
    minHeight: 96,
    paddingHorizontal: 14,
    paddingVertical: 13,
    textAlignVertical: 'top',
  },
  describeInput: { minHeight: 112 },
  label: { color: '#52615C', fontSize: 11, fontWeight: '700', letterSpacing: 0, lineHeight: 14 },
  photoAdd: {
    alignItems: 'center',
    backgroundColor: '#EAF2EE',
    borderColor: '#9FB7AC',
    borderRadius: 18,
    borderStyle: 'dashed',
    borderWidth: 1,
    height: 84,
    justifyContent: 'center',
    width: 84,
  },
  photoAddText: { color: '#3F6F5A', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  photoGroup: { gap: 10, marginTop: 1 },
  photoImage: { height: '100%', width: '100%' },
  photoRemove: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.7)',
    borderRadius: 999,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    top: 4,
    width: 22,
  },
  photoRemoveText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoTile: { borderColor: '#D8E2DC', borderRadius: 18, borderWidth: 1, height: 84, overflow: 'hidden', position: 'relative', width: 84 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#256B47',
    borderRadius: 20,
    boxShadow: '0 16px 28px rgba(9,121,106,0.22)',
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 14,
  },
  primaryButtonDisabled: { opacity: 0.68 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  previewBody: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  previewChip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: 11,
  },
  previewChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  previewChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  previewHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  previewMeta: {
    fontSize: 12,
    fontWeight: '800',
  },
  previewPanel: {
    borderRadius: 22,
    borderWidth: 1,
    boxShadow: '0 12px 26px rgba(17,70,61,0.055)',
    gap: 10,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  previewPillRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 34,
    paddingHorizontal: 10,
  },
  previewPillText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  progressFill: {
    borderRadius: 999,
    height: '100%',
    width: '62%',
  },
  progressTrack: {
    borderRadius: 999,
    height: 9,
    overflow: 'hidden',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#256B47',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 14,
  },
  secondaryButtonText: { color: '#256B47', fontSize: 14, fontWeight: '700' },
  serviceCard: {
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E2DC',
    borderRadius: 22,
    borderWidth: 1,
    boxShadow: '0 10px 22px rgba(17,70,61,0.07)',
    flexBasis: '31%',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 76,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  serviceCardText: { color: '#256B47', fontSize: 13, fontWeight: '700', lineHeight: 16, textAlign: 'left' },
  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  serviceIconDisk: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    marginBottom: 2,
    width: 36,
  },
  serviceMetaText: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
    textAlign: 'center',
  },
  serviceStepIntro: {
    gap: 3,
  },
  stepHeader: { gap: 5, marginBottom: 1 },
  stepHeaderCopy: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  stepHeaderWithAction: {
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 1,
  },
  stepEyebrow: { color: '#3F6F5A', fontSize: 12, fontWeight: '800', letterSpacing: 0, textTransform: 'uppercase' },
  title: { color: '#0F172A', fontSize: 19, fontWeight: '700', lineHeight: 25 },
  kaelBadge: {
    alignItems: 'center',
    borderRadius: 999,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  kaelBadgeText: {
    fontSize: 12,
    fontWeight: '900',
  },
  wizardFlowShell: {
    gap: 16,
  },
})
