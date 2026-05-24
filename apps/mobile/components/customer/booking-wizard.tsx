// Phase 3.1 (plan §22.8.B, 2026-05-23): Booking tab dùng wizard A2-A7. Tu chốt
// 2026-05-23: Booking phải là form theo bước, KHÁC Kael tab (Q&A) và Home
// (shortcuts). Wizard reuses createRemoteJobFromDraft + confirmRemoteSearch
// để giữ workflow honesty (no fake price, no auto-confirm).
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useEffect, useReducer, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { type ServiceType } from '@home-services/shared'
import { type AppLanguage, useAppLanguage } from '@/lib/app-language'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { type LocalMediaUploadDraft } from '@/lib/media-upload'
import { AddressAutocomplete } from './address-autocomplete'

type WizardStep = 'service' | 'describe' | 'analyzing' | 'estimate' | 'time' | 'summary' | 'done'

type WizardState = {
  step: WizardStep
  serviceType: ServiceType | null
  description: string
  photoDrafts: LocalMediaUploadDraft[]
  addressLabel: string
  districtLabel: string | null
  jobId: string | null
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
  | { type: 'set_job_id'; jobId: string }
  | { type: 'reset' }

const INITIAL: WizardState = {
  step: 'service',
  serviceType: null,
  description: '',
  photoDrafts: [],
  addressLabel: '',
  districtLabel: null,
  jobId: null,
  isSubmitting: false,
  error: null,
}

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'select_service':
      return { ...state, serviceType: action.serviceType, step: 'describe', error: null }
    case 'update_description':
      return { ...state, description: action.description }
    case 'add_photos':
      return { ...state, photoDrafts: [...state.photoDrafts, ...action.drafts].slice(0, 5) }
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
    case 'set_job_id':
      return { ...state, jobId: action.jobId }
    case 'reset':
      return INITIAL
  }
}

const PLATFORM_FEE_PCT = 7.5
const PRICE_DISCLAIMER =
  'Đây là ước tính dựa trên thị trường. Giá thực tế sẽ được xác nhận bởi thợ trước khi bắt đầu.'

const copyMap = {
  vi: {
    serviceStep: 'A2 · Chọn dịch vụ',
    serviceTitle: 'Bạn cần dịch vụ nào?',
    serviceBody: 'Hiện hỗ trợ sửa điện, sửa nước và vệ sinh tại căn hộ TP.HCM.',
    services: {
      electrical: 'Sửa điện',
      plumbing: 'Sửa nước',
      cleaning: 'Vệ sinh / Dọn dẹp',
    },
    describeStep: 'A3 · Mô tả vấn đề',
    describeTitle: 'Mô tả ngắn để Kael ước tính',
    describePlaceholder: 'Ví dụ: bóng đèn phòng khách bị chập, có mùi khét nhẹ.',
    photosLabel: 'Ảnh hỗ trợ (tối đa 5)',
    pickPhotos: 'Thêm ảnh',
    addressLabel: 'Khu vực căn hộ',
    addressMissing: 'Cần địa chỉ quận TP.HCM rõ ràng để Kael ước tính đúng.',
    descriptionTooShort: 'Mô tả cần ít nhất 10 ký tự để Kael phân tích.',
    next: 'Tiếp tục',
    back: 'Quay lại',
    submitDescribe: 'Gửi cho Kael ước tính',
    analyzingStep: 'A4 · Kael phân tích',
    analyzingTitle: 'Kael đang ước tính…',
    analyzingBody: 'Quá trình mất khoảng 5-15 giây. Vui lòng giữ màn hình mở.',
    estimateStep: 'A5 · Ước tính Kael',
    estimateTitle: 'Ước tính từ Kael',
    estimateProblem: 'Vấn đề được nhận diện',
    estimateComplexity: 'Mức độ',
    estimatePrice: 'Ước tính giá',
    estimateAdvisory: 'Gợi ý từ Kael',
    estimateNoAdvisory: 'Không có cảnh báo bổ sung.',
    timeStep: 'A6 · Chọn thời gian',
    timeTitle: 'Khi nào bạn cần thợ?',
    timeNow: 'Tìm thợ ngay',
    timeSchedule: 'Lên lịch (sắp có)',
    timeScheduleHint: 'Hiện chỉ hỗ trợ đặt ngay. Chức năng lên lịch sẽ mở sau khi đủ thợ.',
    summaryStep: 'A7 · Xác nhận tìm thợ',
    summaryTitle: 'Tóm tắt trước khi tìm thợ',
    summaryService: 'Dịch vụ',
    summaryAddress: 'Địa điểm',
    summaryEstimate: 'Ước tính dự kiến',
    summaryFee: 'Phí nền tảng (~7,5%)',
    summaryCancellation:
      'Bạn có thể hủy miễn phí trước khi thợ nhận việc. Sau khi thợ nhận, hệ thống có thể áp dụng phí dịch vụ tối thiểu.',
    confirmCta: 'Xác nhận tìm thợ',
    photoPermissionTitle: 'Cần quyền truy cập ảnh',
    photoPermissionBody: 'Cho phép ứng dụng truy cập thư viện ảnh để gửi cho Kael.',
    doneTitle: 'Đã gửi yêu cầu',
    doneBody: 'Kael đang gửi yêu cầu tới các thợ phù hợp.',
    doneOpenHistory: 'Mở hoạt động',
    resetWizard: 'Tạo yêu cầu khác',
  },
  en: {
    serviceStep: 'A2 · Choose a service',
    serviceTitle: 'Which service do you need?',
    serviceBody: 'We currently support electrical, plumbing, and cleaning for HCMC apartments.',
    services: {
      electrical: 'Electrical',
      plumbing: 'Plumbing',
      cleaning: 'Cleaning / Housekeeping',
    },
    describeStep: 'A3 · Describe the issue',
    describeTitle: 'A short description for Kael to estimate',
    describePlaceholder: 'Example: living room ceiling light is short-circuiting and smells slightly burned.',
    photosLabel: 'Photos (up to 5)',
    pickPhotos: 'Add photos',
    addressLabel: 'Apartment area',
    addressMissing: 'Kael needs a clear HCMC district to estimate accurately.',
    descriptionTooShort: 'Description must be at least 10 characters.',
    next: 'Continue',
    back: 'Back',
    submitDescribe: 'Send to Kael',
    analyzingStep: 'A4 · Kael is analyzing',
    analyzingTitle: 'Kael is estimating…',
    analyzingBody: 'This usually takes 5-15 seconds. Keep the screen open.',
    estimateStep: 'A5 · Kael estimate',
    estimateTitle: 'Estimate from Kael',
    estimateProblem: 'Identified problem',
    estimateComplexity: 'Complexity',
    estimatePrice: 'Estimated price',
    estimateAdvisory: 'Kael advisory',
    estimateNoAdvisory: 'No additional advisory.',
    timeStep: 'A6 · Pick a time',
    timeTitle: 'When do you need the worker?',
    timeNow: 'Find a worker now',
    timeSchedule: 'Schedule (coming soon)',
    timeScheduleHint: 'Only on-demand booking is supported right now. Scheduling opens after the worker pool is ready.',
    summaryStep: 'A7 · Confirm worker search',
    summaryTitle: 'Summary before sending',
    summaryService: 'Service',
    summaryAddress: 'Location',
    summaryEstimate: 'Estimated range',
    summaryFee: 'Platform fee (~7.5%)',
    summaryCancellation:
      'You can cancel for free before a worker accepts. Once accepted, a minimum service fee may apply.',
    confirmCta: 'Confirm worker search',
    photoPermissionTitle: 'Photo permission required',
    photoPermissionBody: 'Allow photo library access to attach evidence for Kael.',
    doneTitle: 'Request sent',
    doneBody: 'Kael is sending the request to eligible workers.',
    doneOpenHistory: 'Open activity',
    resetWizard: 'Create another request',
  },
} as const

type WizardCopy = (typeof copyMap)[AppLanguage]

type BookingWizardProps = {
  onOpenHistory: () => void
}

export function BookingWizard({ onOpenHistory }: BookingWizardProps) {
  const language = useAppLanguage()
  const copy = copyMap[language]
  const { actions, selectors, state: wfState } = useFrontendWorkflow()
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const [isConfirming, setIsConfirming] = useState(false)

  const deal = wfState.deal
  const remoteEstimate = deal?.estimate
  const currentStatus = selectors.currentStatus

  useEffect(() => {
    if (state.step === 'analyzing' && remoteEstimate && currentStatus === 'awaiting_customer_confirm') {
      dispatch({ type: 'goto', step: 'estimate' })
    }
  }, [state.step, remoteEstimate, currentStatus])

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
      const draft = {
        serviceType: state.serviceType,
        problemChips: [copy.services[state.serviceType]],
        description: state.description.trim(),
        mediaCount: state.photoDrafts.length,
        addressLabel: state.addressLabel.trim(),
        districtLabel: state.districtLabel,
        timeChoice: 'now' as const,
        source: 'booking' as const,
        needsServiceChoice: false,
        inferredProblemLabel: copy.services[state.serviceType],
        unsupportedServiceLabel: null,
      }
      const created = await actions.createRemoteJobFromDraft(draft, state.photoDrafts)
      if (!created || !created.jobId) {
        dispatch({ type: 'goto', step: 'describe' })
        return
      }
      dispatch({ type: 'set_job_id', jobId: created.jobId })
    } finally {
      dispatch({ type: 'set_submitting', flag: false })
    }
  }

  const confirmBooking = async () => {
    setIsConfirming(true)
    try {
      const ok = await actions.confirmRemoteSearch()
      if (ok) {
        dispatch({ type: 'goto', step: 'done' })
      }
    } finally {
      setIsConfirming(false)
    }
  }

  switch (state.step) {
    case 'service':
      return <ServiceStep copy={copy} onSelect={(serviceType) => dispatch({ type: 'select_service', serviceType })} />
    case 'describe':
      return (
        <DescribeStep
          copy={copy}
          dispatch={dispatch}
          language={language}
          onPickPhotos={pickPhotos}
          onSubmit={() => void submitDescribe()}
          state={state}
        />
      )
    case 'analyzing':
      return <AnalyzingStep copy={copy} />
    case 'estimate':
      return (
        <EstimateStep
          copy={copy}
          estimate={remoteEstimate}
          onNext={() => dispatch({ type: 'goto', step: 'time' })}
        />
      )
    case 'time':
      return <TimeStep copy={copy} onNext={() => dispatch({ type: 'goto', step: 'summary' })} />
    case 'summary':
      return (
        <SummaryStep
          addressLabel={state.addressLabel}
          copy={copy}
          isConfirming={isConfirming}
          onBack={() => dispatch({ type: 'goto', step: 'time' })}
          onConfirm={() => void confirmBooking()}
          serviceType={state.serviceType}
          estimate={remoteEstimate}
        />
      )
    case 'done':
      return (
        <DoneStep
          copy={copy}
          onOpenHistory={onOpenHistory}
          onReset={() => dispatch({ type: 'reset' })}
        />
      )
  }
}

function ServiceStep({ copy, onSelect }: { copy: WizardCopy; onSelect: (serviceType: ServiceType) => void }) {
  return (
    <View style={styles.card} testID="booking-wizard-step-service">
      <Text style={styles.stepEyebrow}>{copy.serviceStep}</Text>
      <Text style={styles.title}>{copy.serviceTitle}</Text>
      <Text style={styles.body}>{copy.serviceBody}</Text>
      <View style={styles.serviceGrid}>
        {(['electrical', 'plumbing', 'cleaning'] as const).map((service) => (
          <Pressable
            accessibilityLabel={copy.services[service]}
            accessibilityRole="button"
            key={service}
            onPress={() => onSelect(service)}
            style={styles.serviceCard}
            testID={`booking-wizard-service-${service}`}
          >
            <Text style={styles.serviceCardText}>{copy.services[service]}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

function DescribeStep({
  copy,
  dispatch,
  language,
  onPickPhotos,
  onSubmit,
  state,
}: {
  copy: WizardCopy
  dispatch: (action: WizardAction) => void
  language: AppLanguage
  onPickPhotos: () => void
  onSubmit: () => void
  state: WizardState
}) {
  return (
    <View style={styles.card} testID="booking-wizard-step-describe">
      <Text style={styles.stepEyebrow}>{copy.describeStep}</Text>
      <Text style={styles.title}>{copy.describeTitle}</Text>
      <TextInput
        accessibilityLabel={copy.describeTitle}
        multiline
        numberOfLines={4}
        onChangeText={(description) => dispatch({ type: 'update_description', description })}
        placeholder={copy.describePlaceholder}
        style={styles.input}
        value={state.description}
      />
      <Text style={styles.label}>{copy.photosLabel}</Text>
      <View style={styles.photoRow}>
        {state.photoDrafts.map((photo, index) => (
          <View key={`${photo.uri}-${index}`} style={styles.photoTile}>
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
            style={styles.photoAdd}
            testID="booking-wizard-photo-add"
          >
            <Text style={styles.photoAddText}>+ {copy.pickPhotos}</Text>
          </Pressable>
        ) : null}
      </View>
      <AddressAutocomplete
        language={language}
        onChange={(label, district) => dispatch({ type: 'update_address', label, district })}
        value={state.addressLabel}
      />
      {state.error ? <Text style={styles.errorText}>{state.error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: state.isSubmitting }}
        disabled={state.isSubmitting}
        onPress={onSubmit}
        style={[styles.primaryButton, state.isSubmitting ? styles.primaryButtonDisabled : null]}
        testID="booking-wizard-submit-describe"
      >
        <Text style={styles.primaryButtonText}>{copy.submitDescribe}</Text>
      </Pressable>
    </View>
  )
}

function AnalyzingStep({ copy }: { copy: WizardCopy }) {
  return (
    <View style={styles.card} testID="booking-wizard-step-analyzing">
      <Text style={styles.stepEyebrow}>{copy.analyzingStep}</Text>
      <Text style={styles.title}>{copy.analyzingTitle}</Text>
      <Text style={styles.body}>{copy.analyzingBody}</Text>
    </View>
  )
}

function EstimateStep({
  copy,
  estimate,
  onNext,
}: {
  copy: WizardCopy
  estimate: NonNullable<ReturnType<typeof useFrontendWorkflow>['state']['deal']>['estimate'] | undefined
  onNext: () => void
}) {
  return (
    <View style={styles.card} testID="booking-wizard-step-estimate">
      <Text style={styles.stepEyebrow}>{copy.estimateStep}</Text>
      <Text style={styles.title}>{copy.estimateTitle}</Text>
      <View style={styles.estimateRow}>
        <Text style={styles.label}>{copy.estimateProblem}</Text>
        <Text style={styles.estimateValue}>{estimate?.problemLabel ?? '—'}</Text>
      </View>
      <View style={styles.estimateRow}>
        <Text style={styles.label}>{copy.estimateComplexity}</Text>
        <Text style={styles.estimateValue}>{estimate?.complexity ?? '—'}</Text>
      </View>
      <View style={styles.estimateRow}>
        <Text style={styles.label}>{copy.estimatePrice}</Text>
        <Text style={styles.estimateValue}>{estimate?.priceRangeLabel ?? '—'}</Text>
      </View>
      <View style={styles.estimateRow}>
        <Text style={styles.label}>{copy.estimateAdvisory}</Text>
        <Text style={styles.estimateValue}>{estimate?.advisory ?? copy.estimateNoAdvisory}</Text>
      </View>
      <Text style={styles.disclaimer}>{estimate?.disclaimer ?? PRICE_DISCLAIMER}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onNext}
        style={styles.primaryButton}
        testID="booking-wizard-estimate-next"
      >
        <Text style={styles.primaryButtonText}>{copy.next}</Text>
      </Pressable>
    </View>
  )
}

function TimeStep({ copy, onNext }: { copy: WizardCopy; onNext: () => void }) {
  return (
    <View style={styles.card} testID="booking-wizard-step-time">
      <Text style={styles.stepEyebrow}>{copy.timeStep}</Text>
      <Text style={styles.title}>{copy.timeTitle}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onNext}
        style={styles.primaryButton}
        testID="booking-wizard-time-now"
      >
        <Text style={styles.primaryButtonText}>{copy.timeNow}</Text>
      </Pressable>
      <View style={styles.scheduleDisabled} testID="booking-wizard-time-schedule-placeholder">
        <Text style={styles.scheduleDisabledTitle}>{copy.timeSchedule}</Text>
        <Text style={styles.scheduleDisabledBody}>{copy.timeScheduleHint}</Text>
      </View>
    </View>
  )
}

function SummaryStep({
  addressLabel,
  copy,
  estimate,
  isConfirming,
  onBack,
  onConfirm,
  serviceType,
}: {
  addressLabel: string
  copy: WizardCopy
  estimate: NonNullable<ReturnType<typeof useFrontendWorkflow>['state']['deal']>['estimate'] | undefined
  isConfirming: boolean
  onBack: () => void
  onConfirm: () => void
  serviceType: ServiceType | null
}) {
  const serviceLabel = serviceType ? copy.services[serviceType] : '—'
  return (
    <View style={styles.card} testID="booking-wizard-step-summary">
      <Text style={styles.stepEyebrow}>{copy.summaryStep}</Text>
      <Text style={styles.title}>{copy.summaryTitle}</Text>
      <View style={styles.estimateRow}>
        <Text style={styles.label}>{copy.summaryService}</Text>
        <Text style={styles.estimateValue}>{serviceLabel}</Text>
      </View>
      <View style={styles.estimateRow}>
        <Text style={styles.label}>{copy.summaryAddress}</Text>
        <Text style={styles.estimateValue}>{addressLabel || '—'}</Text>
      </View>
      <View style={styles.estimateRow}>
        <Text style={styles.label}>{copy.summaryEstimate}</Text>
        <Text style={styles.estimateValue}>{estimate?.priceRangeLabel ?? '—'}</Text>
      </View>
      <View style={styles.estimateRow}>
        <Text style={styles.label}>{copy.summaryFee}</Text>
        <Text style={styles.estimateValue}>~{PLATFORM_FEE_PCT}%</Text>
      </View>
      <Text style={styles.disclaimer}>{copy.summaryCancellation}</Text>
      <Text style={styles.disclaimer}>{estimate?.disclaimer ?? PRICE_DISCLAIMER}</Text>
      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={[styles.secondaryButton, isConfirming ? styles.primaryButtonDisabled : null]}
          disabled={isConfirming}
          testID="booking-wizard-summary-back"
        >
          <Text style={styles.secondaryButtonText}>{copy.back}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: isConfirming }}
          disabled={isConfirming}
          onPress={onConfirm}
          style={[styles.primaryButton, isConfirming ? styles.primaryButtonDisabled : null]}
          testID="booking-wizard-confirm-search"
        >
          <Text style={styles.primaryButtonText}>{copy.confirmCta}</Text>
        </Pressable>
      </View>
    </View>
  )
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
    <View style={styles.card} testID="booking-wizard-step-done">
      <Text style={styles.title}>{copy.doneTitle}</Text>
      <Text style={styles.body}>{copy.doneBody}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onOpenHistory}
        style={styles.primaryButton}
        testID="booking-wizard-open-history"
      >
        <Text style={styles.primaryButtonText}>{copy.doneOpenHistory}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onReset}
        style={styles.secondaryButton}
        testID="booking-wizard-reset"
      >
        <Text style={styles.secondaryButtonText}>{copy.resetWizard}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  actionRow: { flexDirection: 'row', gap: 10 },
  body: { color: '#52615C', fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: '#FAF6EE',
    borderColor: '#D8E2DC',
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  disclaimer: { color: '#52615C', fontSize: 12, fontStyle: 'italic', lineHeight: 16 },
  errorText: { color: '#B43F3F', fontSize: 13, fontWeight: '600' },
  estimateRow: { gap: 4 },
  estimateValue: { color: '#1F2937', fontSize: 14, fontWeight: '600' },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E2DC',
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 14,
    minHeight: 96,
    padding: 12,
    textAlignVertical: 'top',
  },
  label: { color: '#52615C', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  photoAdd: {
    alignItems: 'center',
    backgroundColor: '#EAF2EE',
    borderColor: '#9FB7AC',
    borderRadius: 14,
    borderStyle: 'dashed',
    borderWidth: 1,
    height: 78,
    justifyContent: 'center',
    width: 78,
  },
  photoAddText: { color: '#3F6F5A', fontSize: 12, fontWeight: '600', textAlign: 'center' },
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
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoTile: { borderColor: '#D8E2DC', borderRadius: 14, borderWidth: 1, height: 78, overflow: 'hidden', position: 'relative', width: 78 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#256B47',
    borderRadius: 18,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 14,
  },
  primaryButtonDisabled: { opacity: 0.55 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  scheduleDisabled: {
    backgroundColor: '#EAF2EE',
    borderColor: '#D8E2DC',
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    opacity: 0.85,
    padding: 12,
  },
  scheduleDisabledBody: { color: '#52615C', fontSize: 12, lineHeight: 16 },
  scheduleDisabledTitle: { color: '#1F2937', fontSize: 13, fontWeight: '700' },
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
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E2DC',
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 96,
    padding: 16,
  },
  serviceCardText: { color: '#256B47', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stepEyebrow: { color: '#3F6F5A', fontSize: 12, fontWeight: '800', letterSpacing: 0, textTransform: 'uppercase' },
  title: { color: '#0F172A', fontSize: 19, fontWeight: '700', lineHeight: 25 },
})
