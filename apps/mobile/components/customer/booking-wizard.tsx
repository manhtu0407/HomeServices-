// Kael Autonomy v2: Booking is the A2/A3 intake form, not the price or matching
// authority. Wizard hands structured intake to the full-screen Kael chat so
// Kael can pre-analyze, ask for missing details, and orchestrate by policy.
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { createContext, type ReactNode, use, useEffect, useMemo, useReducer, useState } from 'react'
import { useLocalSearchParams } from 'expo-router'
import { Alert, Pressable, StyleSheet, Text, TextInput, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { type ServiceType } from '@home-services/shared'
import { GlassSurface } from '@/components/ui/glass-surface'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import { motionTokens } from '@/components/ui/motion-tokens'
import { type GlassMode } from '@/components/ui/tokens'
import { type AppLanguage, useAppLanguage } from '@/lib/app-language'
import { generateClientRequestId } from '@/lib/client-request-id'
import { type LocalMediaUploadDraft } from '@/lib/media-upload'
import { AddressAutocomplete } from './address-autocomplete'
import { setPendingKaelChatDraft } from './kael-chat/pending-intake'

const bookingServiceImageIcons: Record<ServiceType, number> = {
  cleaning: require('../../assets/client-image-icons/client-service-cleaning.png'),
  electrical: require('../../assets/client-image-icons/client-service-electrical.png'),
  plumbing: require('../../assets/client-image-icons/client-service-plumbing.png'),
}
const bookingServiceOrder: readonly ServiceType[] = ['electrical', 'plumbing', 'cleaning']
const bookingServiceSegmentWidthPercent = 100 / bookingServiceOrder.length
const BOOKING_WIZARD_APPLE_IOS26_INTAKE_MATERIAL = 'BOOKING_WIZARD_APPLE_IOS26_INTAKE_MATERIAL: standard content material, segmented selected service, Liquid Glass reserved for primary controls'
const BOOKING_WIZARD_APPLE_IOS26_COMPONENT_SYSTEM = 'BOOKING_WIZARD_APPLE_IOS26_COMPONENT_SYSTEM: description field, photo picker, address control, progress, and action buttons use one Apple-style component material system'
void BOOKING_WIZARD_APPLE_IOS26_INTAKE_MATERIAL
void BOOKING_WIZARD_APPLE_IOS26_COMPONENT_SYSTEM

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
    analyzingBody: 'Thông tin này được chuyển sang chat để Kael phân tích hoặc hỏi thêm, không bắt bạn nhập lại.',
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
        <View pointerEvents="none" style={styles.hiddenMarker} testID="booking-wizard-apple-ios26-intake-material" />
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
          aqua: '#16322D',
          border: 'rgba(190,210,205,0.12)',
          borderStrong: 'rgba(105,222,198,0.22)',
          card: '#161D1B',
          danger: '#F5A3A3',
          disabled: '#1D2522',
          muted: '#A9B7B3',
          primary: '#5BE0CB',
          primaryText: '#08201D',
          row: '#171D1B',
          rowStrong: '#14342F',
          text: '#F1F6F4',
          warm: '#1F211D',
        }
      : {
          aqua: '#EAF8F5',
          border: 'rgba(35,96,84,0.13)',
          borderStrong: 'rgba(8,120,110,0.22)',
          card: '#FFFFFF',
          danger: '#B43F3F',
          disabled: '#EEF3F1',
          muted: '#647672',
          primary: '#087F70',
          primaryText: '#FFFFFF',
          row: '#FFFFFF',
          rowStrong: '#E8F8F4',
          text: '#12231F',
          warm: '#F7F3EC',
        }
  }

  return dark
    ? {
        aqua: 'rgba(105,222,198,0.050)',
        border: 'rgba(190,210,205,0.12)',
        borderStrong: 'rgba(105,222,198,0.26)',
        card: 'rgba(22,29,27,0.92)',
        danger: '#F5A3A3',
        disabled: 'rgba(29,37,34,0.86)',
        muted: '#A9B7B3',
        primary: '#63E6D0',
        primaryText: '#08201D',
        row: 'rgba(23,29,27,0.92)',
        rowStrong: 'rgba(20,52,47,0.82)',
        text: '#F1F6F4',
        warm: 'rgba(224,160,107,0.055)',
      }
    : {
        aqua: 'rgba(0,200,179,0.050)',
        border: 'rgba(35,96,84,0.13)',
        borderStrong: 'rgba(13,134,119,0.22)',
        card: 'rgba(255,255,255,0.94)',
        danger: '#B43F3F',
        disabled: 'rgba(238,243,241,0.92)',
        muted: '#647672',
        primary: '#087F70',
        primaryText: '#FFFFFF',
        row: 'rgba(255,255,255,0.96)',
        rowStrong: 'rgba(232,248,244,0.90)',
        text: '#12231F',
        warm: 'rgba(187,116,61,0.045)',
      }
}

function parseRouteServiceType(value: string | string[] | undefined): ServiceType | null {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'electrical' || raw === 'plumbing' || raw === 'cleaning' ? raw : null
}

function WizardCard({ children, testID }: { children: ReactNode; testID: string }) {
  const { mode, reduceTransparency, visual } = useBookingWizardVisual()
  const isServiceStep = testID === 'booking-wizard-step-service'
  const isDescribeStep = testID === 'booking-wizard-step-describe'

  if (isServiceStep) {
    return (
      <View style={[styles.card, styles.cardServiceStep]} testID={testID}>
        <View pointerEvents="none" style={styles.hiddenMarker} testID="booking-wizard-production-glass-intake-handoff" />
        {children}
      </View>
    )
  }

  return (
    <GlassSurface
      backgroundColor={visual.card}
      borderColor={isDescribeStep ? visual.borderStrong : visual.border}
      material="standard"
      mode={mode}
      style={[styles.card, isDescribeStep ? bookingDescribeCardSurface(visual, mode, reduceTransparency) : null]}
      testID={testID}
      variant="sheet"
    >
      <View
        pointerEvents="none"
        style={[styles.cardWash, isDescribeStep ? styles.cardDescribeWash : null, { backgroundColor: visual.aqua }]}
        testID="booking-wizard-liquid-wash"
      />
      <View
        pointerEvents="none"
        style={[
          styles.cardWarmWash,
          isDescribeStep ? styles.cardDescribeLowerWash : null,
          { backgroundColor: isDescribeStep ? visual.aqua : visual.warm },
        ]}
      />
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
  const { mode, reduceMotion, reduceTransparency, visual } = useBookingWizardVisual()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        bookingPrimaryButtonSurface(visual, mode, reduceTransparency),
        buttonStyle,
        disabled ? styles.primaryButtonDisabled : null,
        reduceMotionAwarePressStyle(pressed, reduceMotion),
      ]}
      testID={testID}
    >
      <View pointerEvents="none" style={[styles.buttonSheen, bookingButtonSheenSurface(mode)]} />
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
  const { mode, reduceMotion, reduceTransparency, visual } = useBookingWizardVisual()
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        bookingSecondaryButtonSurface(visual, mode, reduceTransparency),
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
  const { mode, reduceMotion, reduceTransparency, visual } = useBookingWizardVisual()
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.backButton,
        bookingSecondaryButtonSurface(visual, mode, reduceTransparency),
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

function bookingPrimaryButtonSurface(visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean) {
  const lightGradient = 'radial-gradient(circle at 36% 8%, rgba(255,255,255,0.34), transparent 35%), linear-gradient(180deg, #0E8D7D, #087F70)'
  const darkGradient = 'radial-gradient(circle at 36% 8%, rgba(255,255,255,0.16), transparent 35%), linear-gradient(180deg, #63E6D0, #40CDB8)'

  return {
    background: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundColor: visual.primary,
    backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    borderColor: mode === 'dark' ? 'rgba(190,210,205,0.18)' : 'rgba(255,255,255,0.42)',
    boxShadow: reduceTransparency ? 'none' : mode === 'dark' ? '0 10px 22px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.16)' : '0 10px 22px rgba(9,121,106,0.13), inset 0 1px 0 rgba(255,255,255,0.30)',
    experimental_backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function bookingSecondaryButtonSurface(visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean) {
  const lightGradient = 'radial-gradient(circle at 50% 42%, rgba(76,222,199,0.095), transparent 54%), radial-gradient(circle at 34% 8%, rgba(255,255,255,0.76), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(244,252,249,0.92))'
  const darkGradient = 'radial-gradient(circle at 50% 42%, rgba(105,222,198,0.075), transparent 54%), radial-gradient(circle at 34% 8%, rgba(190,210,205,0.10), transparent 34%), linear-gradient(180deg, rgba(25,33,31,0.94), rgba(18,24,22,0.88))'

  return {
    background: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundColor: visual.row,
    backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    borderColor: mode === 'dark' ? 'rgba(190,210,205,0.13)' : 'rgba(15,133,118,0.11)',
    boxShadow: reduceTransparency ? 'none' : mode === 'dark' ? 'inset 0 1px 0 rgba(190,210,205,0.075)' : '0 8px 18px rgba(31,92,82,0.035), inset 0 1px 0 rgba(255,255,255,0.80)',
    experimental_backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function bookingDescribeCardSurface(visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean) {
  const lightGradient = 'radial-gradient(circle at 86% 6%, rgba(76,222,199,0.11), transparent 35%), radial-gradient(circle at 16% 98%, rgba(244,237,224,0.20), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.97), rgba(248,255,252,0.92))'
  const darkGradient = 'radial-gradient(circle at 86% 6%, rgba(105,222,198,0.075), transparent 35%), radial-gradient(circle at 16% 98%, rgba(224,160,107,0.045), transparent 28%), linear-gradient(180deg, rgba(22,29,27,0.92), rgba(15,20,19,0.88))'

  return {
    background: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundColor: visual.card,
    backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    boxShadow: reduceTransparency ? 'none' : mode === 'dark' ? '0 18px 38px rgba(0,0,0,0.26), inset 0 1px 0 rgba(190,210,205,0.075)' : '0 18px 38px rgba(17,70,61,0.060), inset 0 1px 0 rgba(255,255,255,0.82)',
    experimental_backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function bookingButtonSheenSurface(mode: GlassMode) {
  return {
    backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.42)',
  }
}

function BookingFlowOverview({ activeIndex, copy }: { activeIndex: number; copy: WizardCopy }) {
  const { mode, reduceTransparency, visual } = useBookingWizardVisual()
  return (
    <View style={[styles.flowOverview, bookingFlowOverviewSurface(visual, mode, reduceTransparency)]} testID="booking-wizard-intake-handoff-overview">
      <View pointerEvents="none" style={styles.hiddenMarker} testID="booking-wizard-flow-apple-progress-rail" />
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

function bookingFlowOverviewSurface(visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean) {
  const lightGradient = 'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(240,255,251,0.86))'
  const darkGradient = 'radial-gradient(circle at 86% 0%, rgba(230,244,240,0.056), transparent 34%), linear-gradient(180deg, rgba(24,31,29,0.72), rgba(13,17,16,0.56))'

  return {
    background: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundColor: mode === 'dark' ? 'rgba(22,29,27,0.66)' : '#F8FFFC',
    backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    borderColor: mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(35,96,84,0.13)',
    boxShadow: reduceTransparency ? 'none' : mode === 'dark' ? '0 15px 34px rgba(0,0,0,0.31), inset 0 1px 0 rgba(230,244,240,0.08)' : '0 10px 24px rgba(17,70,61,0.07)',
    experimental_backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function bookingMintOperationalTileSurface(visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean) {
  const specularCatch = mode === 'dark' ? 'rgba(190,210,205,0.026)' : 'rgba(255,255,255,0.58)'
  const mintAura = mode === 'dark' ? 'rgba(105,222,198,0.10)' : 'rgba(76,222,199,0.10)'
  const gradient = mode === 'dark'
    ? `radial-gradient(circle at 50% 38%, ${mintAura}, transparent 48%), radial-gradient(circle at 74% 20%, ${specularCatch}, transparent 32%), linear-gradient(180deg, rgba(22,29,27,0.98), rgba(16,24,23,0.92))`
    : `radial-gradient(circle at 50% 38%, ${mintAura}, transparent 48%), radial-gradient(circle at 74% 20%, ${specularCatch}, transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,248,0.94))`

  return {
    background: reduceTransparency ? undefined : gradient,
    backgroundColor: mode === 'dark' ? '#16211F' : '#FAFFFD',
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: mode === 'dark' ? 'rgba(190,210,205,0.10)' : 'rgba(20,73,66,0.08)',
    boxShadow: reduceTransparency ? 'none' : mode === 'dark' ? '0 7px 16px rgba(0,0,0,0.10), inset 0 1px 0 rgba(190,210,205,0.055)' : '0 10px 22px rgba(31,92,82,0.04), inset 0 1px 0 rgba(255,255,255,0.76)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function bookingFlowStepSurface(
  visual: BookingWizardVisual,
  mode: GlassMode,
  reduceTransparency: boolean,
  _index: number,
  active: boolean,
) {
  if (active) return bookingMintOperationalTileSurface(visual, mode, reduceTransparency)

  return {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    boxShadow: 'none',
  } as any
}

function bookingFlowBadgeSurface(
  visual: BookingWizardVisual,
  mode: GlassMode,
  reduceTransparency: boolean,
  index: number,
  active: boolean,
) {
  const lightGradient = 'radial-gradient(circle at 24% 18%, rgba(255,255,255,0.82), transparent 28%), linear-gradient(145deg, rgba(255,255,255,0.96), rgba(238,243,241,0.92))'

  return {
    background: reduceTransparency || active ? undefined : mode === 'dark' ? undefined : lightGradient,
    backgroundColor: active
      ? visual.primary
      : mode === 'dark' ? '#1D2522' : '#EEF3F1',
    backgroundImage: reduceTransparency || active ? undefined : mode === 'dark' ? undefined : lightGradient,
    borderColor: active ? visual.borderStrong : visual.border,
    experimental_backgroundImage: reduceTransparency || active ? undefined : mode === 'dark' ? undefined : lightGradient,
  } as any
}

function bookingFlowTextColor(visual: BookingWizardVisual, mode: GlassMode, _index: number) {
  if (mode === 'dark') return visual.primary
  return visual.primary
}

function bookingFlowTitleColor(visual: BookingWizardVisual, mode: GlassMode, _index: number) {
  if (mode === 'dark') return visual.text
  return visual.text
}

function bookingFlowMetaColor(visual: BookingWizardVisual, mode: GlassMode, _index: number) {
  if (mode === 'dark') return visual.muted
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
  const [railWidth, setRailWidth] = useState(0)
  const selectedIndex = selectedService ? bookingServiceOrder.indexOf(selectedService) : -1
  const segmentWidth = railWidth > 0 ? railWidth / bookingServiceOrder.length : 0
  const thumbTranslateX = useSharedValue(0)
  const thumbOpacity = useSharedValue(selectedIndex >= 0 ? 1 : 0)
  const thumbAnimatedStyle = useAnimatedStyle(() => (
    railWidth > 0
      ? {
          opacity: thumbOpacity.value,
          transform: [{ translateX: thumbTranslateX.value }],
        }
      : { opacity: thumbOpacity.value }
  ), [railWidth])

  useEffect(() => {
    thumbOpacity.value = selectedIndex >= 0
      ? withTiming(1, { duration: reduceMotion ? 80 : 120 })
      : withTiming(0, { duration: 80 })
    if (railWidth <= 0 || selectedIndex < 0) return

    const targetX = selectedIndex * segmentWidth
    thumbTranslateX.value = reduceMotion
      ? withTiming(targetX, { duration: 120 })
      : withSpring(targetX, motionTokens.liquid.pill)

    return () => {
      cancelAnimation(thumbOpacity)
      cancelAnimation(thumbTranslateX)
    }
  }, [railWidth, reduceMotion, segmentWidth, selectedIndex, thumbOpacity, thumbTranslateX])

  const handleRailLayout = (event: LayoutChangeEvent) => setRailWidth(event.nativeEvent.layout.width)

  return (
    <WizardCard testID="booking-wizard-step-service">
      <GlassSurface
        backgroundColor={mode === 'dark' ? 'rgba(22,29,27,0.56)' : 'rgba(255,255,255,0.18)'}
        borderColor={mode === 'dark' ? 'rgba(190,210,205,0.16)' : 'rgba(255,255,255,0.74)'}
        material={reduceTransparency ? 'standard' : 'liquid'}
        mode={mode}
        onLayout={handleRailLayout}
        style={[styles.serviceSegmentedRail, bookingServiceRailSurface(visual, mode, reduceTransparency)]}
        testID="booking-wizard-service-segmented-control"
        variant="control"
      >
        <View pointerEvents="none" style={[styles.serviceSegmentAura, { backgroundColor: visual.aqua }]} testID="booking-wizard-service-mint-aura" />
        {selectedIndex >= 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.serviceSegmentThumb,
              railWidth > 0
                ? { width: segmentWidth }
                : {
                    left: `${selectedIndex * bookingServiceSegmentWidthPercent}%`,
                    width: `${bookingServiceSegmentWidthPercent}%`,
                  },
              bookingServiceThumbSurface(visual, mode, reduceTransparency),
              railWidth > 0 ? thumbAnimatedStyle : null,
            ]}
            testID="booking-wizard-service-slider-thumb"
          >
            <View pointerEvents="none" style={[styles.serviceSegmentThumbSheen, bookingServiceThumbSheenSurface(mode)]} />
          </Animated.View>
        ) : null}
        <View style={styles.serviceSegmentRow}>
          {bookingServiceOrder.map((service) => {
            const selected = selectedService === service
            return (
              <Pressable
                accessibilityLabel={copy.services[service]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={service}
                onPress={() => setSelectedService(service)}
                style={({ pressed }) => [
                  styles.serviceSegment,
                  reduceMotionAwarePressStyle(pressed, reduceMotion),
                ]}
                testID={`booking-wizard-service-${service}`}
              >
                <View style={[styles.serviceIconDisk, bookingServiceIconSurface(visual, mode, reduceTransparency, service, selected)]}>
                  <BookingServiceImageIcon service={service} />
                </View>
                <Text style={[styles.serviceCardText, { color: selected ? visual.text : visual.muted }]} numberOfLines={1}>
                  {copy.services[service]}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </GlassSurface>
      <View style={[styles.estimateShell, bookingEstimateShellSurface(visual, mode, reduceTransparency)]} testID="booking-wizard-intake-shell">
        <View style={styles.previewHeader}>
          <Text style={[styles.previewTitle, { color: visual.text }]} numberOfLines={1}>
            {copy.servicePreviewTitle}
          </Text>
          <Text style={[styles.previewMeta, { color: visual.primary }]} numberOfLines={1}>
            {copy.servicePreviewMeta}
          </Text>
        </View>
        <View style={[styles.estimateGrid, bookingEstimateGridSurface(visual, mode, reduceTransparency)]} testID="booking-wizard-intake-grid">
          <EstimateField label={copy.servicePreviewService} testID="booking-wizard-intake-service-field" value={copy.pendingValue} />
          <EstimateField label={copy.servicePreviewDescription} testID="booking-wizard-intake-description-field" value={copy.pendingValue} />
          <EstimateField label={copy.servicePreviewArea} testID="booking-wizard-intake-area-field" value={copy.pendingValue} />
          <EstimateField label={copy.servicePreviewChat} testID="booking-wizard-intake-chat-field" value={copy.pendingValue} />
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
  void service
  const base = bookingMintOperationalTileSurface(visual, mode, reduceTransparency)

  return {
    ...base,
    borderColor: selected ? visual.borderStrong : base.borderColor,
    boxShadow: selected && !reduceTransparency
      ? mode === 'dark' ? '0 12px 24px rgba(0,0,0,0.20), inset 0 1px 0 rgba(190,210,205,0.08)' : '0 12px 24px rgba(9,121,106,0.12), inset 0 1px 0 rgba(255,255,255,0.78)'
      : base.boxShadow,
  } as any
}

function bookingServiceRailSurface(visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean) {
  const lightGradient = 'radial-gradient(circle at 18% 10%, rgba(255,255,255,0.72), transparent 28%), radial-gradient(circle at 50% 50%, rgba(76,222,199,0.12), transparent 56%), linear-gradient(180deg, rgba(255,255,255,0.48), rgba(255,255,255,0.18))'
  const darkGradient = 'radial-gradient(circle at 18% 8%, rgba(190,210,205,0.12), transparent 30%), radial-gradient(circle at 50% 50%, rgba(105,222,198,0.090), transparent 54%), linear-gradient(180deg, rgba(22,29,27,0.58), rgba(15,20,19,0.42))'

  return {
    background: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundColor: reduceTransparency ? visual.row : mode === 'dark' ? 'rgba(22,29,27,0.54)' : 'rgba(255,255,255,0.38)',
    backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    borderColor: mode === 'dark' ? 'rgba(190,210,205,0.16)' : 'rgba(255,255,255,0.84)',
    boxShadow: reduceTransparency ? 'none' : mode === 'dark' ? '0 16px 34px rgba(0,0,0,0.24), inset 0 1px 0 rgba(190,210,205,0.12)' : '0 16px 34px rgba(31,92,82,0.060), inset 0 1px 0 rgba(255,255,255,0.86)',
    experimental_backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function bookingServiceThumbSurface(visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean) {
  const lightGradient = 'radial-gradient(circle at 38% 8%, rgba(255,255,255,0.90), transparent 36%), radial-gradient(circle at 50% 92%, rgba(76,222,199,0.18), transparent 52%), linear-gradient(180deg, rgba(255,255,255,0.70), rgba(245,249,248,0.42))'
  const darkGradient = 'radial-gradient(circle at 38% 8%, rgba(190,210,205,0.20), transparent 36%), radial-gradient(circle at 50% 92%, rgba(105,222,198,0.12), transparent 52%), linear-gradient(180deg, rgba(38,48,45,0.62), rgba(22,29,27,0.46))'

  return {
    background: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundColor: reduceTransparency ? visual.rowStrong : mode === 'dark' ? 'rgba(32,43,40,0.64)' : 'rgba(255,255,255,0.62)',
    backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    borderColor: mode === 'dark' ? 'rgba(190,210,205,0.18)' : 'rgba(255,255,255,0.86)',
    boxShadow: reduceTransparency ? 'none' : mode === 'dark' ? '0 12px 26px rgba(0,0,0,0.28), inset 0 1px 0 rgba(190,210,205,0.18)' : '0 12px 26px rgba(31,92,82,0.085), inset 0 1px 0 rgba(255,255,255,0.92)',
    experimental_backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function bookingServiceThumbSheenSurface(mode: GlassMode) {
  return {
    backgroundColor: mode === 'dark' ? 'rgba(190,210,205,0.14)' : 'rgba(255,255,255,0.52)',
  }
}

function bookingServiceIconSurface(_visual: BookingWizardVisual, mode: GlassMode, _reduceTransparency: boolean, _service: ServiceType, selected = false) {
  const lightGradient = 'radial-gradient(circle at 72% 36%, rgba(76,222,199,0.20), transparent 42%), linear-gradient(145deg, rgba(255,255,255,0.94), rgba(241,254,251,0.72))'
  const darkGradient = 'radial-gradient(circle at 72% 36%, rgba(105,222,198,0.10), transparent 44%), linear-gradient(145deg, rgba(190,210,205,0.055), rgba(22,29,27,0.08))'

  return {
    background: _reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundColor: mode === 'dark' ? 'rgba(190,210,205,0.035)' : 'rgba(245,255,252,0.72)',
    backgroundImage: _reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    borderColor: mode === 'dark' ? 'rgba(190,210,205,0.07)' : 'rgba(20,117,105,0.08)',
    boxShadow: _reduceTransparency
      ? 'none'
      : selected
        ? mode === 'dark'
          ? '0 0 0 5px rgba(105,222,198,0.045), 0 10px 22px rgba(0,0,0,0.12), inset 0 1px 0 rgba(190,210,205,0.06)'
          : '0 0 0 5px rgba(76,222,199,0.070), 0 12px 24px rgba(23,169,149,0.080), inset 0 1px 0 rgba(255,255,255,0.82)'
        : mode === 'dark'
          ? 'inset 0 1px 0 rgba(190,210,205,0.06)'
          : 'inset 0 1px 0 rgba(255,255,255,0.82)',
    experimental_backgroundImage: _reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function bookingEstimateShellSurface(visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean) {
  const lightGradient = 'radial-gradient(circle at 80% 18%, rgba(76,222,199,0.20), transparent 42%), radial-gradient(circle at 16% 92%, rgba(76,222,199,0.10), transparent 46%), linear-gradient(180deg, rgba(255,255,255,0.95), rgba(238,255,251,0.90))'
  const darkGradient = 'radial-gradient(circle at 80% 18%, rgba(105,222,198,0.13), transparent 42%), radial-gradient(circle at 16% 92%, rgba(105,222,198,0.06), transparent 46%), linear-gradient(180deg, rgba(24,31,29,0.72), rgba(13,17,16,0.56))'

  return {
    backgroundColor: mode === 'dark' ? 'rgba(22,29,27,0.66)' : '#F4FFFB',
    borderColor: mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(15,133,118,0.16)',
    boxShadow: reduceTransparency ? 'none' : mode === 'dark' ? '0 15px 34px rgba(0,0,0,0.31), inset 0 1px 0 rgba(230,244,240,0.08)' : '0 14px 30px rgba(17,70,61,0.060), inset 0 1px 0 rgba(255,255,255,0.78)',
    background: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function bookingEstimateGridSurface(_visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean) {
  const lightGradient = 'radial-gradient(circle at 74% 96%, rgba(76,222,199,0.20), transparent 48%), linear-gradient(180deg, rgba(238,255,250,0.78), rgba(232,255,248,0.66))'
  const darkGradient = 'radial-gradient(circle at 74% 96%, rgba(105,222,198,0.12), transparent 48%), linear-gradient(180deg, rgba(21,30,28,0.72), rgba(15,22,20,0.62))'

  return {
    background: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundColor: mode === 'dark' ? 'rgba(21,30,28,0.70)' : 'rgba(232,255,248,0.72)',
    backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    borderColor: mode === 'dark' ? 'rgba(190,210,205,0.10)' : 'rgba(15,133,118,0.12)',
    boxShadow: reduceTransparency ? 'none' : mode === 'dark' ? 'inset 0 1px 0 rgba(190,210,205,0.055)' : 'inset 0 1px 0 rgba(255,255,255,0.46)',
    experimental_backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function bookingInputShellSurface(visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean) {
  const lightGradient = 'radial-gradient(circle at 74% 18%, rgba(76,222,199,0.16), transparent 40%), radial-gradient(circle at 18% 2%, rgba(255,255,255,0.76), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,255,251,0.90))'
  const darkGradient = 'radial-gradient(circle at 74% 18%, rgba(105,222,198,0.11), transparent 42%), radial-gradient(circle at 18% 2%, rgba(190,210,205,0.095), transparent 32%), linear-gradient(180deg, rgba(22,29,27,0.98), rgba(16,24,23,0.92))'

  return {
    background: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundColor: mode === 'dark' ? '#16211F' : '#F7FFFC',
    backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    borderColor: mode === 'dark' ? 'rgba(190,210,205,0.11)' : 'rgba(15,133,118,0.12)',
    boxShadow: reduceTransparency ? 'none' : mode === 'dark' ? '0 7px 16px rgba(0,0,0,0.10), inset 0 1px 0 rgba(190,210,205,0.070)' : '0 10px 24px rgba(31,92,82,0.045), inset 0 1px 0 rgba(255,255,255,0.82)',
    experimental_backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function bookingComponentEdgeSurface(mode: GlassMode) {
  return {
    backgroundColor: mode === 'dark' ? 'rgba(190,210,205,0.12)' : 'rgba(255,255,255,0.78)',
  }
}

function bookingTextInputFocusSurface(mode: GlassMode) {
  return {
    caretColor: mode === 'dark' ? '#63E6D0' : '#087F70',
    outlineColor: mode === 'dark' ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.96)',
    outlineOffset: -1,
    outlineStyle: 'solid',
    outlineWidth: 1,
  } as any
}

function bookingPhotoGroupSurface(visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean) {
  const lightGradient = 'radial-gradient(circle at 80% 4%, rgba(76,222,199,0.15), transparent 40%), radial-gradient(circle at 18% 92%, rgba(255,255,255,0.82), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.92), rgba(238,255,251,0.88))'
  const darkGradient = 'radial-gradient(circle at 80% 4%, rgba(105,222,198,0.10), transparent 40%), radial-gradient(circle at 18% 92%, rgba(190,210,205,0.060), transparent 34%), linear-gradient(180deg, rgba(24,31,29,0.74), rgba(13,17,16,0.58))'

  return {
    background: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundColor: mode === 'dark' ? 'rgba(22,29,27,0.66)' : '#F4FFFB',
    backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    borderColor: mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(15,133,118,0.15)',
    boxShadow: reduceTransparency ? 'none' : mode === 'dark' ? '0 15px 34px rgba(0,0,0,0.31), inset 0 1px 0 rgba(230,244,240,0.08)' : '0 14px 30px rgba(17,70,61,0.060), inset 0 1px 0 rgba(255,255,255,0.76)',
    experimental_backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function bookingPhotoTileSurface(visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean) {
  return {
    backgroundColor: visual.row,
    borderColor: mode === 'dark' ? 'rgba(190,210,205,0.12)' : 'rgba(20,73,66,0.10)',
    boxShadow: reduceTransparency ? 'none' : mode === 'dark' ? '0 8px 16px rgba(0,0,0,0.16)' : '0 8px 16px rgba(31,92,82,0.035)',
  } as any
}

function bookingPhotoAddSurface(visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean) {
  const lightGradient = 'radial-gradient(circle at 50% 34%, rgba(76,222,199,0.20), transparent 54%), radial-gradient(circle at 30% 8%, rgba(255,255,255,0.78), transparent 36%), linear-gradient(180deg, rgba(255,255,255,0.94), rgba(241,255,251,0.78))'
  const darkGradient = 'radial-gradient(circle at 50% 34%, rgba(105,222,198,0.12), transparent 54%), radial-gradient(circle at 30% 8%, rgba(190,210,205,0.12), transparent 36%), linear-gradient(180deg, rgba(28,38,35,0.88), rgba(18,24,22,0.76))'

  return {
    background: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundColor: visual.row,
    backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    borderColor: mode === 'dark' ? 'rgba(190,210,205,0.14)' : 'rgba(15,133,118,0.14)',
    boxShadow: reduceTransparency ? 'none' : mode === 'dark' ? 'inset 0 1px 0 rgba(190,210,205,0.080)' : '0 8px 18px rgba(31,92,82,0.045), inset 0 1px 0 rgba(255,255,255,0.80)',
    experimental_backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function bookingPhotoRemoveSurface(mode: GlassMode) {
  return {
    backgroundColor: mode === 'dark' ? 'rgba(15,20,19,0.82)' : 'rgba(12,24,22,0.68)',
    borderColor: mode === 'dark' ? 'rgba(190,210,205,0.18)' : 'rgba(255,255,255,0.62)',
  }
}

function BookingServiceImageIcon({ service }: { service: ServiceType }) {
  return <Image contentFit="contain" source={bookingServiceImageIcons[service]} style={styles.serviceImageIcon} />
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
  const { mode, reduceMotion, reduceTransparency, visual } = useBookingWizardVisual()
  return (
    <WizardCard testID="booking-wizard-step-describe">
      <View pointerEvents="none" style={styles.hiddenMarker} testID="booking-wizard-apple-ios26-component-system" />
      <View style={styles.stepHeaderWithAction}>
        <View style={styles.stepHeaderCopy}>
          <WizardText kind="eyebrow">{copy.describeStep}</WizardText>
          <WizardText kind="title">{copy.describeTitle}</WizardText>
        </View>
        <WizardBackButton label={copy.back} onPress={onBack} testID="booking-wizard-describe-back" />
      </View>
      <View style={styles.formGroup}>
        <WizardText kind="label">{copy.describeStep}</WizardText>
        <View style={[styles.fieldShell, bookingInputShellSurface(visual, mode, reduceTransparency)]} testID="booking-wizard-description-field-shell">
          <View pointerEvents="none" style={[styles.fieldEdgeHighlight, bookingComponentEdgeSurface(mode)]} />
          <TextInput
            accessibilityLabel={copy.describeTitle}
            multiline
            numberOfLines={4}
            onChangeText={(description) => dispatch({ type: 'update_description', description })}
            placeholder={copy.describePlaceholder}
            placeholderTextColor={visual.muted}
            style={[styles.input, styles.describeInput, bookingTextInputFocusSurface(mode), { color: visual.text }]}
            value={state.description}
          />
        </View>
      </View>
      <View style={[styles.photoGroup, bookingPhotoGroupSurface(visual, mode, reduceTransparency)]} testID="booking-wizard-photo-rail">
        <View pointerEvents="none" style={[styles.fieldEdgeHighlight, bookingComponentEdgeSurface(mode)]} />
        <WizardText kind="label">{copy.photosLabel}</WizardText>
        <View style={styles.photoRow}>
          {state.photoDrafts.map((photo, index) => (
            <View key={photo.uri} style={[styles.photoTile, bookingPhotoTileSurface(visual, mode, reduceTransparency)]}>
              <Image accessibilityLabel={`photo-${index}`} contentFit="cover" source={{ uri: photo.uri }} style={styles.photoImage} />
              <Pressable
                accessibilityLabel={`remove-photo-${index}`}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => dispatch({ type: 'remove_photo', index })}
                style={({ pressed }) => [
                  styles.photoRemove,
                  bookingPhotoRemoveSurface(mode),
                  reduceMotionAwarePressStyle(pressed, reduceMotion),
                ]}
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
                bookingPhotoAddSurface(visual, mode, reduceTransparency),
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
  const { mode, reduceTransparency, visual } = useBookingWizardVisual()
  return (
    <WizardCard testID="booking-wizard-step-analyzing">
      <WizardText kind="eyebrow">{copy.analyzingStep}</WizardText>
      <WizardText kind="title">{copy.analyzingTitle}</WizardText>
      <WizardText kind="body">{copy.analyzingBody}</WizardText>
      <View style={[styles.progressTrack, bookingProgressTrackSurface(visual, mode, reduceTransparency)]} testID="booking-wizard-kael-progress">
        <View style={[styles.progressFill, bookingProgressFillSurface(visual, mode, reduceTransparency)]}>
          <View pointerEvents="none" style={[styles.progressSheen, bookingButtonSheenSurface(mode)]} />
        </View>
      </View>
    </WizardCard>
  )
}

function bookingProgressTrackSurface(visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean) {
  const lightGradient = 'linear-gradient(180deg, rgba(238,243,241,0.96), rgba(229,236,233,0.92))'
  const darkGradient = 'linear-gradient(180deg, rgba(29,37,34,0.96), rgba(17,22,21,0.92))'

  return {
    background: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundColor: visual.disabled,
    backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    boxShadow: reduceTransparency ? 'none' : mode === 'dark' ? 'inset 0 1px 0 rgba(190,210,205,0.070)' : 'inset 0 1px 0 rgba(255,255,255,0.74)',
    experimental_backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function bookingProgressFillSurface(visual: BookingWizardVisual, mode: GlassMode, reduceTransparency: boolean) {
  const lightGradient = 'linear-gradient(90deg, #087F70, #17A995)'
  const darkGradient = 'linear-gradient(90deg, #40CDB8, #63E6D0)'

  return {
    background: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    backgroundColor: visual.primary,
    backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

type BookingFieldTone = 'mint' | 'water' | 'warm'

function EstimateField({
  label,
  testID,
  tone = 'mint',
  value,
  wide,
}: {
  label: string
  testID?: string
  tone?: BookingFieldTone
  value: string
  wide?: boolean
}) {
  const { mode, reduceTransparency, visual } = useBookingWizardVisual()
  return (
    <View style={[styles.estimateField, bookingFieldSurface(visual, mode, reduceTransparency, tone), wide ? styles.estimateFieldWide : null]} testID={testID}>
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
  void visual
  void reduceTransparency

  return {
    backgroundColor: 'transparent',
    borderBottomColor: mode === 'dark'
      ? isWarm ? 'rgba(224,160,107,0.075)' : 'rgba(190,210,205,0.075)'
      : isWarm ? 'rgba(187,116,61,0.060)' : isWater ? 'rgba(81,187,192,0.060)' : 'rgba(15,133,118,0.075)',
    borderWidth: 0,
    boxShadow: 'none',
  } as any
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
    overflow: 'hidden',
    paddingHorizontal: 12,
    position: 'relative',
  },
  backButtonText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  body: { color: '#52615C', fontSize: 14, fontWeight: '600', letterSpacing: 0, lineHeight: 20 },
  buttonSheen: {
    borderRadius: 999,
    height: 1,
    left: 18,
    opacity: 0.74,
    position: 'absolute',
    right: 18,
    top: 2,
  },
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
  cardDescribeLowerWash: {
    bottom: -48,
    height: 156,
    opacity: 0.085,
    right: 20,
    top: undefined,
    width: 156,
  },
  cardDescribeWash: {
    height: 210,
    opacity: 0.18,
    right: -78,
    top: -76,
    width: 210,
  },
  cardWarmWash: {
    borderRadius: 999,
    height: 122,
    opacity: 0.12,
    position: 'absolute',
    right: -42,
    top: 132,
    width: 122,
  },
  cardWash: {
    borderRadius: 999,
    height: 180,
    opacity: 0.16,
    position: 'absolute',
    right: -70,
    top: -68,
    width: 180,
  },
  disclaimer: { color: '#52615C', fontSize: 12, fontStyle: 'italic', lineHeight: 16 },
  errorText: { color: '#B43F3F', fontSize: 13, fontWeight: '600' },
  errorSlot: { marginTop: -2 },
  estimateField: {
    alignItems: 'center',
    borderRadius: 0,
    borderWidth: 0,
    boxShadow: 'none',
    flexBasis: '100%',
    flexDirection: 'row',
    flexGrow: 0,
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 27,
    overflow: 'visible',
    paddingHorizontal: 0,
    paddingVertical: 0,
    position: 'relative',
  },
  estimateFieldWash: {
    borderRadius: 999,
    height: 82,
    opacity: 0.11,
    position: 'absolute',
    right: -36,
    top: -32,
    width: 82,
  },
  estimateFieldWide: {
    flexBasis: '100%',
  },
  estimateGrid: {
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'column',
    gap: 10,
    overflow: 'hidden',
    padding: 12,
  },
  estimateShell: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    overflow: 'hidden',
    padding: 14,
  },
  estimateValue: { color: '#1F2937', fontSize: 15, fontWeight: '700', lineHeight: 19 },
  flowOverview: {
    borderCurve: 'continuous',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    overflow: 'hidden',
    padding: 4,
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
    fontWeight: '700',
    letterSpacing: 0,
  },
  flowStepCard: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 20,
    borderWidth: 1,
    flexBasis: '48%',
    flexDirection: 'row',
    flexGrow: 1,
    gap: 8,
    minHeight: 58,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 8,
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
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 17,
  },
  formGroup: { gap: 9 },
  fieldEdgeHighlight: {
    borderRadius: 999,
    height: 1,
    left: 14,
    opacity: 0.72,
    position: 'absolute',
    right: 14,
    top: 1,
  },
  fieldShell: {
    borderCurve: 'continuous',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  hiddenMarker: { height: 0, opacity: 0, position: 'absolute', width: 0 },
  input: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
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
    borderCurve: 'continuous',
    borderRadius: 20,
    borderWidth: 1,
    height: 84,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 84,
  },
  photoAddText: { color: '#3F6F5A', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  photoGroup: {
    borderCurve: 'continuous',
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    marginTop: 1,
    overflow: 'hidden',
    padding: 12,
    position: 'relative',
  },
  photoImage: { height: '100%', width: '100%' },
  photoRemove: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.7)',
    borderRadius: 999,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'absolute',
    right: 5,
    top: 5,
    width: 28,
  },
  photoRemoveText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoTile: { borderColor: '#D8E2DC', borderRadius: 18, borderWidth: 1, height: 84, overflow: 'hidden', position: 'relative', width: 84 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#256B47',
    borderRadius: 999,
    borderWidth: 1,
    boxShadow: '0 10px 22px rgba(9,121,106,0.13), inset 0 1px 0 rgba(255,255,255,0.26)',
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    overflow: 'hidden',
    paddingHorizontal: 14,
    position: 'relative',
  },
  primaryButtonDisabled: { opacity: 0.68 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  previewHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  previewMeta: {
    fontSize: 12,
    fontWeight: '700',
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  progressFill: {
    borderRadius: 999,
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
    width: '62%',
  },
  progressSheen: {
    height: 1,
    left: 10,
    opacity: 0.78,
    position: 'absolute',
    right: 10,
    top: 1,
  },
  progressTrack: {
    borderRadius: 999,
    height: 10,
    overflow: 'hidden',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#256B47',
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    overflow: 'hidden',
    paddingHorizontal: 14,
    position: 'relative',
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
    height: 34,
    justifyContent: 'center',
    overflow: 'visible',
    width: 34,
  },
  serviceImageIcon: {
    flexShrink: 0,
    height: 34,
    width: 34,
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
  serviceSegment: {
    alignItems: 'center',
    borderRadius: 20,
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minHeight: 66,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 7,
  },
  serviceSegmentAura: {
    borderRadius: 999,
    bottom: 8,
    left: 26,
    opacity: 0.26,
    position: 'absolute',
    right: 26,
    top: 8,
  },
  serviceSegmentedRail: {
    borderCurve: 'continuous',
    borderRadius: 30,
    borderWidth: 1,
    minHeight: 74,
    overflow: 'hidden',
    padding: 4,
    position: 'relative',
  },
  serviceSegmentRow: {
    flexDirection: 'row',
    gap: 0,
    position: 'relative',
    zIndex: 2,
  },
  serviceSegmentThumb: {
    borderCurve: 'continuous',
    borderRadius: 26,
    borderWidth: 1,
    bottom: 4,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 4,
    zIndex: 1,
  },
  serviceSegmentThumbSheen: {
    borderRadius: 999,
    height: 1,
    left: 14,
    opacity: 0.78,
    position: 'absolute',
    right: 14,
    top: 2,
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
  stepEyebrow: { color: '#3F6F5A', fontSize: 12, fontWeight: '700', letterSpacing: 0, textTransform: 'uppercase' },
  title: { color: '#0F172A', fontSize: 19, fontWeight: '700', lineHeight: 25 },
  wizardFlowShell: {
    gap: 16,
  },
})
