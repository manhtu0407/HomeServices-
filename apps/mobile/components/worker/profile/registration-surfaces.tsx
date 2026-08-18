import { useEffect, useReducer, useRef, type ReactNode } from 'react'
import { Alert, Pressable, Text as RNText, View, type TextProps } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { SERVICE_TYPES, type ServiceType, type WorkerRegisterInput, type WorkerRegistrationDraftInput } from '@nestscout/shared'
import Svg, { Circle, Path, Rect } from 'react-native-svg'

import { KaelButton, KaelChip, KaelTextField } from '@/components/ui/kael-primitives'
import { color } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import { localizedServiceLabel } from '@/lib/app-language'
import type { LocalMediaUploadDraft } from '@/lib/media-upload'
import { uploadWorkerVerificationDrafts } from '@/lib/media-upload'
import type { WorkerProfileResponse } from '@/lib/api-types'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

import { textByLanguage } from '../ui/format'
import { useWorkerThemeMode } from '../worker-theme'
import { workerNeedsRegistration } from './registration-model'
import { styles } from './registration-styles'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
type WorkerVerificationFileSlot = 'cccdFront' | 'cccdBack' | 'selfie'

type RegistrationState = {
  bankAccount: string
  bankName: string
  dateOfBirth: string
  districts: string
  files: Partial<Record<WorkerVerificationFileSlot, LocalMediaUploadDraft>>
  legalName: string
  problemSpecializations: string
  serviceRadiusKm: string
  serviceTypes: ServiceType[]
  submitError: string | null
  submitting: boolean
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  yearsExperience: string
}

type RegistrationAction =
  | { type: 'field'; field: RegistrationField; value: string }
  | { type: 'file'; file: LocalMediaUploadDraft; slot: WorkerVerificationFileSlot }
  | { type: 'service'; serviceType: ServiceType }
  | { type: 'error'; value: string | null }
  | { type: 'submitting'; value: boolean }
  | { type: 'saveStatus'; value: RegistrationState['saveStatus'] }

type RegistrationField = Exclude<keyof RegistrationState, 'files' | 'serviceTypes' | 'submitError' | 'submitting'>

function createRegistrationState(profile: WorkerProfileResponse | null) : RegistrationState {
  return {
    bankAccount: '',
    bankName: profile?.bank_name ?? '',
    dateOfBirth: profile?.date_of_birth ?? '',
    districts: profile?.districts.join(', ') ?? '',
    files: {},
    legalName: profile?.legal_name ?? '',
    problemSpecializations: profile?.problem_specializations.join(', ') ?? '',
    serviceRadiusKm: String(profile?.service_radius_km ?? 8),
    serviceTypes: profile?.service_types ?? [],
    submitError: null,
    submitting: false,
    saveStatus: 'idle',
    yearsExperience: profile?.years_experience ? String(profile.years_experience) : '',
  }
}

function registrationReducer(state: RegistrationState, action: RegistrationAction): RegistrationState {
  switch (action.type) {
    case 'field':
      return { ...state, [action.field]: action.value, submitError: null }
    case 'file':
      return { ...state, files: { ...state.files, [action.slot]: action.file }, submitError: null }
    case 'service':
      return state.serviceTypes.includes(action.serviceType)
        ? { ...state, serviceTypes: state.serviceTypes.filter((item) => item !== action.serviceType), submitError: null }
        : { ...state, serviceTypes: [...state.serviceTypes, action.serviceType], submitError: null }
    case 'error':
      return { ...state, submitError: action.value }
    case 'submitting':
      return { ...state, submitting: action.value }
    case 'saveStatus':
      return { ...state, saveStatus: action.value }
    default:
      return state
  }
}

function Text({ style, ...props }: TextProps) {
  const isDark = useWorkerThemeMode() === 'dark'
  return <RNText {...props} style={[styles.title, isDark ? styles.darkTitle : null, style]} />
}

function RegistrationHeaderGlyph({ isDark, stroke, testID }: { isDark: boolean; stroke: string; testID?: string }) {
  const common = {
    fill: 'none' as const,
    stroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.55,
  }
  return (
    <View style={[styles.registrationHeadingIconTile, isDark ? styles.registrationHeadingIconTileDark : null]}>
      <Svg height={24} testID={testID} viewBox="0 0 20 20" width={24}>
        <Rect {...common} height={13.5} rx={2} width={15} x={2.5} y={3.25} />
        <Circle {...common} cx={7.2} cy={8} r={1.55} />
        <Path {...common} d="M4.9 12.9c.55-1.1 1.32-1.65 2.3-1.65s1.75.55 2.3 1.65M11.8 7.25h3M11.8 10h3" />
      </Svg>
    </View>
  )
}

export function WorkerV5WorkerRegistrationBody({
  language,
  profile,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  profile: WorkerProfileResponse | null
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const isDark = useWorkerThemeMode() === 'dark'
  const [state, dispatch] = useReducer(registrationReducer, profile, createRegistrationState)
  const lastSavedDraftRef = useRef('')
  const setField = (field: RegistrationField) => (value: string) => dispatch({ type: 'field', field, value })

  useEffect(() => {
    const draft = validWorkerRegistrationDraft({
      bankAccount: state.bankAccount,
      bankName: state.bankName,
      dateOfBirth: state.dateOfBirth,
      districts: state.districts,
      legalName: state.legalName,
      problemSpecializations: state.problemSpecializations,
      serviceRadiusKm: state.serviceRadiusKm,
      serviceTypes: state.serviceTypes,
      yearsExperience: state.yearsExperience,
    })
    const serialized = JSON.stringify(draft)
    if (Object.keys(draft).length === 0 || serialized === lastSavedDraftRef.current) return
    dispatch({ type: 'saveStatus', value: 'saving' })
    const timer = setTimeout(() => {
      void runtime.actions.workerSaveRegistrationDraft(draft).then((saved) => {
        if (saved) lastSavedDraftRef.current = serialized
        dispatch({ type: 'saveStatus', value: saved ? 'saved' : 'error' })
      })
    }, 700)
    return () => clearTimeout(timer)
  }, [runtime.actions, state.bankAccount, state.bankName, state.dateOfBirth, state.districts, state.legalName, state.problemSpecializations, state.serviceRadiusKm, state.serviceTypes, state.yearsExperience])

  const pickFile = async (slot: WorkerVerificationFileSlot) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      dispatch({ type: 'error', value: textByLanguage(language, 'Cần cho phép chọn ảnh để gửi hồ sơ.', 'Allow photo access to submit your profile.') })
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.86,
      selectionLimit: 1,
    })
    const asset = result.canceled ? null : result.assets[0]
    if (!asset) return
    dispatch({
      type: 'file',
      file: {
        fileName: asset.fileName ?? asset.uri.split('/').pop(),
        fileSizeBytes: asset.fileSize ?? undefined,
        mimeType: asset.mimeType ?? undefined,
        type: 'image',
        uri: asset.uri,
      },
      slot,
    })
  }

  const submit = async () => {
    const years = Number.parseInt(state.yearsExperience, 10)
    const radius = Number.parseInt(state.serviceRadiusKm, 10)
    const districts = commaSeparatedValues(state.districts)
    const specializations = commaSeparatedValues(state.problemSpecializations)
    if (state.legalName.trim().length < 2 || !isPastDate(state.dateOfBirth)) {
      dispatch({ type: 'error', value: textByLanguage(language, 'Nhập họ tên hợp lệ và ngày sinh theo dạng YYYY-MM-DD.', 'Enter a valid name and date of birth as YYYY-MM-DD.') })
      return
    }
    if (!Number.isInteger(years) || years < 0 || years > 60 || districts.length === 0 || state.serviceTypes.length === 0 || !Number.isInteger(radius) || radius < 1 || radius > 30) {
      dispatch({ type: 'error', value: textByLanguage(language, 'Bổ sung kinh nghiệm, khu vực, bán kính và ít nhất một dịch vụ.', 'Add experience, service area, radius, and at least one service.') })
      return
    }
    if (!state.bankName.trim() || state.bankAccount.trim().length < 6) {
      dispatch({ type: 'error', value: textByLanguage(language, 'Nhập tên ngân hàng và số tài khoản hợp lệ.', 'Enter a valid bank name and account number.') })
      return
    }
    if (!state.files.cccdFront || !state.files.cccdBack || !state.files.selfie) {
      dispatch({ type: 'error', value: textByLanguage(language, 'Cần đủ ảnh mặt trước, mặt sau giấy tờ và ảnh chân dung.', 'Add the front, back, and selfie images before submitting.') })
      return
    }

    dispatch({ type: 'error', value: null })
    dispatch({ type: 'submitting', value: true })
    try {
      const uploaded = await uploadWorkerVerificationDrafts({
        cccdBack: state.files.cccdBack,
        cccdFront: state.files.cccdFront,
        selfie: state.files.selfie,
      })
      if (!uploaded.success) {
        dispatch({ type: 'error', value: textByLanguage(language, 'Chưa thể tải giấy tờ lên. Hãy kiểm tra kết nối rồi thử lại.', 'The documents could not be uploaded. Check the connection and try again.') })
        return
      }
      await runtime.actions.workerSaveRegistrationDraft(uploaded.urls)
      const input: WorkerRegisterInput = {
        bank_account: state.bankAccount.trim(),
        bank_name: state.bankName.trim(),
        cccd_back_url: uploaded.urls.cccd_back_url,
        cccd_front_url: uploaded.urls.cccd_front_url,
        date_of_birth: state.dateOfBirth.trim(),
        districts,
        legal_name: state.legalName.trim(),
        problem_specializations: specializations,
        service_radius_km: radius,
        service_types: state.serviceTypes,
        selfie_url: uploaded.urls.selfie_url,
        years_experience: years,
      }
      const saved = await runtime.actions.workerSubmitRegistration(input)
      if (!saved) {
        dispatch({ type: 'error', value: textByLanguage(language, 'Chưa thể gửi hồ sơ. Hãy kiểm tra lại thông tin rồi thử lại.', 'The profile could not be submitted. Check the details and try again.') })
        return
      }
      Alert.alert(
        textByLanguage(language, 'Đã gửi hồ sơ', 'Profile submitted'),
        textByLanguage(language, 'Hồ sơ sẽ được kiểm tra trước khi bật nhận việc.', 'The profile will be reviewed before availability can be turned on.'),
      )
    } catch {
      dispatch({ type: 'error', value: textByLanguage(language, 'Chưa thể gửi hồ sơ lúc này. Hãy thử lại sau.', 'The profile could not be submitted right now. Try again later.') })
    } finally {
      dispatch({ type: 'submitting', value: false })
    }
  }

  if (!workerNeedsRegistration(profile)) return null

  return (
    <View style={[styles.card, isDark ? styles.cardDark : null, reduceTransparency ? (isDark ? styles.cardOpaqueDark : styles.cardOpaque) : null]} testID="worker-v5-registration-form">
      <View style={styles.cardContent}>
      <View>
        <View style={styles.registrationHeading}>
          <RegistrationHeaderGlyph
            isDark={isDark}
            stroke={isDark ? '#63E6D0' : color.brand.primary}
            testID="worker-v5-registration-title-icon"
          />
          <Text>{textByLanguage(language, 'Hoàn tất hồ sơ thợ', 'Complete your worker profile')}</Text>
        </View>
        <RNText style={[styles.copy, isDark ? styles.darkCopy : null]}>
          {textByLanguage(language, 'Dùng thông tin, giấy tờ thật. Hồ sơ được kiểm tra trước khi nhận việc.', 'Use real details and documents. Your profile is reviewed before you accept work.')}
        </RNText>
        <RNText accessibilityLiveRegion="polite" style={[styles.note, isDark ? styles.darkCopy : null]} testID="worker-v5-registration-save-status">
          {registrationSaveStatus(language, state.saveStatus)}
        </RNText>
      </View>

      <View style={styles.formGap}>
        <Field label={textByLanguage(language, 'Họ và tên', 'Legal name')}>
          <KaelTextField accessibilityLabel={textByLanguage(language, 'Họ và tên', 'Legal name')} inputShellStyle={styles.fieldShell} onChangeText={setField('legalName')} placeholder={textByLanguage(language, 'Nhập đúng như giấy tờ', 'Enter the name on your document')} testID="worker-v5-registration-legal-name" value={state.legalName} />
        </Field>
        <View style={styles.formGap}>
          <Field label={textByLanguage(language, 'Ngày sinh', 'Date of birth')}>
            <KaelTextField accessibilityLabel={textByLanguage(language, 'Ngày sinh', 'Date of birth')} inputShellStyle={styles.fieldShell} onChangeText={setField('dateOfBirth')} placeholder="YYYY-MM-DD" testID="worker-v5-registration-date-of-birth" value={state.dateOfBirth} />
          </Field>
          <Field label={textByLanguage(language, 'Số năm kinh nghiệm', 'Years of experience')}>
            <KaelTextField accessibilityLabel={textByLanguage(language, 'Số năm kinh nghiệm', 'Years of experience')} inputShellStyle={styles.fieldShell} keyboardType="number-pad" onChangeText={setField('yearsExperience')} placeholder="0" testID="worker-v5-registration-years" value={state.yearsExperience} />
          </Field>
        </View>
        <Field label={textByLanguage(language, 'Khu vực nhận việc', 'Work area')}>
          <KaelTextField accessibilityLabel={textByLanguage(language, 'Khu vực nhận việc', 'Work area')} inputShellStyle={styles.fieldShell} onChangeText={setField('districts')} placeholder={textByLanguage(language, 'Ví dụ: Quận 1, Bình Thạnh', 'Example: District 1, Binh Thanh')} testID="worker-v5-registration-districts" value={state.districts} />
        </Field>
        <Field label={textByLanguage(language, 'Bán kính nhận việc (km)', 'Work radius (km)')}>
          <KaelTextField accessibilityLabel={textByLanguage(language, 'Bán kính nhận việc', 'Work radius')} inputShellStyle={styles.fieldShell} keyboardType="number-pad" onChangeText={setField('serviceRadiusKm')} placeholder="8" testID="worker-v5-registration-radius" value={state.serviceRadiusKm} />
        </Field>
        <Field label={textByLanguage(language, 'Dịch vụ có thể nhận', 'Services you can provide')}>
          <View style={styles.serviceWrap} testID="worker-v5-registration-services">
            {SERVICE_TYPES.map((serviceType) => (
              <KaelChip
                accessibilityLabel={localizedServiceLabel(serviceType, language)}
                accessibilityState={{ selected: state.serviceTypes.includes(serviceType) }}
                key={serviceType}
                label={localizedServiceLabel(serviceType, language)}
                onPress={() => dispatch({ type: 'service', serviceType })}
                testID={`worker-v5-registration-service-${serviceType}`}
                variant={state.serviceTypes.includes(serviceType) ? 'selected' : 'unselected'}
              />
            ))}
          </View>
        </Field>
        <Field label={textByLanguage(language, 'Mô tả kỹ năng chính', 'Main skills')}>
          <KaelTextField accessibilityLabel={textByLanguage(language, 'Mô tả kỹ năng chính', 'Main skills')} inputShellStyle={styles.fieldShell} onChangeText={setField('problemSpecializations')} placeholder={textByLanguage(language, 'Ngăn cách bằng dấu phẩy', 'Separate items with commas')} testID="worker-v5-registration-specializations" value={state.problemSpecializations} />
        </Field>
        <Field label={textByLanguage(language, 'Tài khoản nhận tiền', 'Payout account')}>
          <View style={styles.formGap}>
            <KaelTextField accessibilityLabel={textByLanguage(language, 'Tên ngân hàng', 'Bank name')} inputShellStyle={styles.fieldShell} onChangeText={setField('bankName')} placeholder={textByLanguage(language, 'Tên ngân hàng', 'Bank name')} testID="worker-v5-registration-bank-name" value={state.bankName} />
            <KaelTextField accessibilityLabel={textByLanguage(language, 'Số tài khoản', 'Account number')} inputShellStyle={styles.fieldShell} keyboardType="number-pad" onChangeText={setField('bankAccount')} placeholder={textByLanguage(language, 'Số tài khoản', 'Account number')} secureTextEntry testID="worker-v5-registration-bank-account" value={state.bankAccount} />
          </View>
        </Field>
      </View>

      <View style={styles.formGap}>
        <RNText style={[styles.sectionTitle, isDark ? styles.darkTitle : null]}>{textByLanguage(language, 'Giấy tờ xác minh', 'Verification documents')}</RNText>
        <RNText style={[styles.note, isDark ? styles.darkCopy : null]}>{textByLanguage(language, 'Ảnh chỉ được gửi vào kho riêng để kiểm tra hồ sơ.', 'Images are sent to the private verification store for review.')}</RNText>
        <View style={styles.fileList}>
          <VerificationFileRow dark={isDark} file={state.files.cccdFront} label={textByLanguage(language, 'Mặt trước giấy tờ', 'Document front')} onPress={() => void pickFile('cccdFront')} testID="worker-v5-registration-cccd-front" />
          <VerificationFileRow dark={isDark} file={state.files.cccdBack} label={textByLanguage(language, 'Mặt sau giấy tờ', 'Document back')} onPress={() => void pickFile('cccdBack')} testID="worker-v5-registration-cccd-back" />
          <VerificationFileRow dark={isDark} file={state.files.selfie} label={textByLanguage(language, 'Ảnh chân dung', 'Selfie')} onPress={() => void pickFile('selfie')} testID="worker-v5-registration-selfie" />
        </View>
      </View>

      {state.submitError ? <RNText style={styles.error} testID="worker-v5-registration-error">{state.submitError}</RNText> : null}
      <KaelButton
        disabled={state.submitting}
        label={state.submitting ? textByLanguage(language, 'Đang gửi hồ sơ', 'Submitting profile') : textByLanguage(language, 'Gửi hồ sơ để kiểm tra', 'Submit for review')}
        loading={state.submitting}
        onPress={() => void submit()}
        style={styles.submit}
        testID="worker-v5-registration-submit"
      />
      </View>
    </View>
  )
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <View>
      <RNText style={styles.formLabel}>{label}</RNText>
      {children}
    </View>
  )
}

function VerificationFileRow({ dark, file, label, onPress, testID }: { dark: boolean; file?: LocalMediaUploadDraft; label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(file) }}
      onPress={onPress}
      style={({ pressed }) => [styles.fileRow, dark ? styles.fileRowDark : null, pressed ? styles.fileRowPressed : null]}
      testID={testID}
    >
      <RNText style={[styles.fileTitle, dark ? styles.darkTitle : null]}>{label}</RNText>
      <RNText numberOfLines={1} style={[styles.fileStatus, dark ? styles.fileStatusDark : null]}>{file?.fileName ?? 'Chọn ảnh'}</RNText>
    </Pressable>
  )
}

function commaSeparatedValues(value: string) {
  return value.split(',').flatMap((item) => {
    const trimmed = item.trim()
    return trimmed ? [trimmed] : []
  })
}

type RegistrationDraftState = Pick<RegistrationState, 'bankAccount' | 'bankName' | 'dateOfBirth' | 'districts' | 'legalName' | 'problemSpecializations' | 'serviceRadiusKm' | 'serviceTypes' | 'yearsExperience'>

function validWorkerRegistrationDraft(state: RegistrationDraftState): WorkerRegistrationDraftInput {
  const draft: WorkerRegistrationDraftInput = {}
  const years = Number.parseInt(state.yearsExperience, 10)
  const radius = Number.parseInt(state.serviceRadiusKm, 10)
  const districts = commaSeparatedValues(state.districts)
  const specializations = commaSeparatedValues(state.problemSpecializations)
  if (state.legalName.trim().length >= 2) draft.legal_name = state.legalName.trim()
  if (isPastDate(state.dateOfBirth)) draft.date_of_birth = state.dateOfBirth.trim()
  if (Number.isInteger(years) && years >= 0 && years <= 60) draft.years_experience = years
  if (districts.length > 0) draft.districts = districts
  if (Number.isInteger(radius) && radius >= 1 && radius <= 30) draft.service_radius_km = radius
  if (state.serviceTypes.length > 0) draft.service_types = state.serviceTypes
  if (specializations.length > 0) draft.problem_specializations = specializations
  if (state.bankName.trim().length >= 2) draft.bank_name = state.bankName.trim()
  if (state.bankAccount.trim().length >= 6) draft.bank_account = state.bankAccount.trim()
  return draft
}

function registrationSaveStatus(language: AppLanguage, status: RegistrationState['saveStatus']) {
  if (status === 'saving') return textByLanguage(language, 'Đang tự lưu tiến độ…', 'Saving progress…')
  if (status === 'saved') return textByLanguage(language, 'Đã tự lưu tiến độ.', 'Progress saved.')
  if (status === 'error') return textByLanguage(language, 'Chưa lưu. Dữ liệu vẫn còn trên thiết bị.', 'Not saved. Your data remains on this device.')
  return textByLanguage(language, 'Tiến độ hợp lệ sẽ được tự lưu.', 'Valid progress is saved automatically.')
}

function isPastDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false
  return value <= new Date().toISOString().slice(0, 10)
}
