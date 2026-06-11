import { type ReactNode, useEffect, useReducer, useRef, useState } from 'react'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type ImageStyle } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path, Rect } from 'react-native-svg'
import { useAuth } from '@/lib/auth-provider'
import { useAppLanguage, type AppLanguage } from '@/lib/app-language'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { KaelMascot } from '@/components/kael/kael-mascot'
import { ReduceMotionAwareEntranceView } from '@/components/ui/reduce-motion-aware-animation'
import { NESTSCOUT_BRAND } from '@/design/brand'
import { color } from '@/design/theme'

const LOGIN_ROLE_GATE_MARKER = 'LOGIN_ROLE_GATE_MARKER: auth-login-role-customer auth-login-role-worker'
const LOGIN_ROLE_GATE_GLASS_MARKER = 'LOGIN_ROLE_GATE_GLASS_MARKER: auth-role-gate-glass'
const AUTH_PROTOTYPE_PARITY_MARKER = 'AUTH_PROTOTYPE_PARITY_MARKER: roleGatewaySignature signatureRail auth-google-primary-client worker-no-google-login role-fixed-after-choice'
const kaelModel8AHead = require('../../assets/kael-model-8a-head.png')
const roleGateImageIcons = {
  customer: require('../../assets/client-image-icons/client-home.png'),
  worker: require('../../assets/worker-image-icons/utility-tools.png'),
} as const
const CLIENT_PHONE_AUTH_AVAILABLE = false

type AuthEntryRole = 'customer' | 'worker'
const EMPTY_AUTH_META: string[] = []

type LoginRoleState = {
  customerAuthMode: 'choices' | 'phone'
  customerAddress: string
  customerSetupDismissed: boolean
  email: string
  formError: string | null
  password: string
  passwordVisible: boolean
  phone: string
  customerDisplayName: string
  selectedEntryRole: AuthEntryRole | null
  signingIn: boolean
  welcomeDismissed: boolean
  workerAuthMode: 'create' | 'login'
}

type LoginRoleAction =
  | { type: 'field'; field: 'customerAddress' | 'customerDisplayName' | 'email' | 'password' | 'phone'; value: string }
  | { type: 'dismiss_customer_setup' }
  | { type: 'dismiss_welcome' }
  | { type: 'set_customer_auth_mode'; mode: 'choices' | 'phone' }
  | { type: 'form_error'; error: string | null }
  | { type: 'select_role'; role: AuthEntryRole | null }
  | { type: 'set_signing_in'; signingIn: boolean }
  | { type: 'set_worker_auth_mode'; mode: 'create' | 'login' }
  | { type: 'toggle_password_visible' }

const loginRoleInitialState: LoginRoleState = {
  customerAuthMode: 'choices',
  customerAddress: '',
  customerDisplayName: '',
  customerSetupDismissed: false,
  email: '',
  formError: null,
  password: '',
  passwordVisible: false,
  phone: '',
  selectedEntryRole: null,
  signingIn: false,
  welcomeDismissed: false,
  workerAuthMode: 'login',
}

function loginRoleReducer(state: LoginRoleState, action: LoginRoleAction): LoginRoleState {
  switch (action.type) {
    case 'field':
      return { ...state, [action.field]: action.value }
    case 'set_customer_auth_mode':
      return { ...state, customerAuthMode: action.mode, formError: null }
    case 'form_error':
      return { ...state, formError: action.error }
    case 'select_role':
      return { ...state, customerAuthMode: 'choices', customerSetupDismissed: false, formError: null, selectedEntryRole: action.role, workerAuthMode: 'login' }
    case 'dismiss_customer_setup':
      return { ...state, customerSetupDismissed: true, formError: null }
    case 'dismiss_welcome':
      return { ...state, formError: null, welcomeDismissed: true }
    case 'set_signing_in':
      return { ...state, signingIn: action.signingIn }
    case 'set_worker_auth_mode':
      return { ...state, formError: null, workerAuthMode: action.mode }
    case 'toggle_password_visible':
      return { ...state, passwordVisible: !state.passwordVisible }
    default:
      return state
  }
}

const authTokens = {
  canvas: color.background,
  raised: color.surface.base,
  glass: 'rgba(255,255,252,0.88)',
  milk: '#FFFDF8',
  mint: color.mint.mint100,
  cyan: '#E7FBFA',
  cream: '#FFF5E8',
  border: color.surface.strokeStrong,
  line: color.surface.stroke,
  ink: color.text.primary,
  muted: color.text.secondary,
  subtle: color.text.muted,
  primary: color.brand.primary,
  cookie: '#111817',
  cookieSoft: '#24302E',
  copper: '#BB743D',
  shadow: '0 18px 42px rgba(13,24,22,0.10)',
  softShadow: '0 10px 24px rgba(13,24,22,0.07)',
}

const authCopy = {
  vi: {
    kicker: '',
    titleAuthenticated: 'Chọn vai trò',
    roleGateTitle: 'Chọn vai trò',
    roleGateSubtitle: 'Tiếp tục đúng trải nghiệm của bạn',
    welcomeTitle: 'Xin chào! Tôi là Kael',
    welcomeSubtitle: 'Trợ lý của NestScout giúp bạn tìm đúng người, đúng việc, đúng lúc.',
    welcomeCta: 'Tiếp tục',
    welcomeTrust: 'Dịch vụ điện, nước và vệ sinh nhà',
    customerLoginHeading: 'Đăng nhập khách',
    customerLoginSubtitle: 'Vào app nhanh để gửi yêu cầu và theo dõi điều phối',
    workerLoginHeading: 'Tài khoản thợ',
    workerLoginSubtitle: 'Đăng nhập hoặc tạo hồ sơ thợ mới',
    workerVerificationHeading: 'Xác thực thợ',
    workerVerificationSubtitle: 'Hồ sơ quyết định quyền nhận việc',
    titleLogin: 'Việc nhà đúng người, đúng lúc!',
    bodyLogin: '',
    recovery: 'Hồ sơ vai trò chưa sẵn sàng. Tải lại hồ sơ hoặc đăng xuất để đăng nhập tài khoản khác.',
    refresh: 'Tải lại hồ sơ',
    signOut: 'Đăng xuất',
    submit: 'Tiếp tục',
    workerSubmit: 'Đăng nhập',
    changeRole: 'Quay lại',
    email: 'Email',
    password: 'Mật khẩu',
    selectedRole: (role: string) => `Vai trò: ${role}`,
    roleCustomer: 'Khách',
    roleWorker: 'Thợ',
    entryCustomer: 'Gửi yêu cầu và theo dõi dịch vụ',
    entryWorker: 'Đăng nhập hoặc tạo hồ sơ',
    adminCustomer: 'Mở khu vực Khách với quyền quản trị.',
    adminWorker: 'Mở khu vực Thợ với quyền quản trị.',
    customerDesc: 'Gửi yêu cầu, chat Kael và theo dõi hoạt động.',
    workerDesc: 'Nhận việc, phòng việc và đối soát.',
    google: 'Tiếp tục bằng Google',
    phone: 'Dùng số điện thoại',
    customerEmailFallback: 'Dùng email và mật khẩu',
    customerEmailFallbackClose: 'Ẩn đăng nhập email',
    signature: 'Đúng người, đúng việc, đúng lúc nhà cần.',
    workerLoginTitle: 'Đăng nhập cho Thợ',
    customerLoginTitle: 'Đăng nhập cho Khách',
    customerPhoneHeading: 'Số điện thoại',
    customerPhoneSubtitle: 'Đăng nhập cho khách',
    customerPhoneTitle: 'Đăng nhập bằng số điện thoại',
    customerPhonePlaceholder: 'Nhập số tại Việt Nam',
    customerPhoneSubmit: 'Nhận mã xác minh',
    customerGoogleFallback: 'Đăng nhập bằng Google',
    customerSetupHeading: 'Xác nhận thông tin',
    customerSetupSubtitle: 'Dùng khi gửi yêu cầu và liên hệ',
    customerSetupWelcomeTitle: 'Xin chào mừng!',
    customerSetupWelcomeSubtitle: 'Kael dùng hồ sơ này để chuẩn bị đúng địa chỉ và liên hệ khi bạn đặt dịch vụ.',
    customerSetupProfileStep: 'Hồ sơ',
    customerSetupProfileStepMeta: 'Tên gọi',
    customerSetupContactStep: 'Liên hệ',
    customerSetupContactStepMeta: 'Số thật',
    customerSetupAddressStep: 'Địa chỉ',
    customerSetupAddressStepMeta: 'Căn hộ',
    customerDisplayName: 'Tên hiển thị',
    customerDisplayNamePlaceholder: 'Nhập tên của bạn',
    customerPhoneContact: 'Số điện thoại',
    customerPhoneContactPlaceholder: 'Thêm số để thợ liên hệ',
    customerDefaultAddress: 'Địa chỉ mặc định',
    customerDefaultAddressPlaceholder: 'Chọn tòa nhà/căn hộ',
    customerSaveProfile: 'Lưu và tiếp tục',
    customerSkipSetup: 'Bỏ qua',
    accountLabel: 'Tài khoản',
    securityLabel: 'Bảo mật',
    workerAccountLabel: 'Email hoặc số điện thoại',
    workerAccountPlaceholder: 'Nhập tài khoản thợ',
    workerPasswordPlaceholder: 'Nhập mật khẩu',
    passwordVisibility: 'Hiện hoặc ẩn mật khẩu',
    createWorker: 'Tạo hồ sơ thợ',
    createWorkerAccount: 'Tạo tài khoản và xác thực',
    createWorkerQuestion: 'Chưa có tài khoản thợ?',
    workerHasAccount: 'Đã có tài khoản thợ?',
    workerBackToLogin: 'Đăng nhập',
    workerVerificationHeroTitle: 'Gửi hồ sơ để xét duyệt',
    workerVerificationRequired: 'Bắt buộc',
    workerSetupAccount: 'Tài khoản',
    workerSetupAccountMeta: 'Chưa mở',
    workerSetupVerify: 'Xác thực',
    workerSetupVerifyMeta: 'Sẽ duyệt',
    workerSetupProfile: 'Hồ sơ',
    workerSetupProfileMeta: 'Chờ duyệt',
    workerSkillAreaMode: 'Kỹ năng và khu vực',
    workerCccd: 'CCCD',
    workerCccdFront: 'CCCD mặt trước',
    workerCccdBack: 'CCCD mặt sau',
    workerCertificate: 'Chứng nhận nghề',
    workerPortrait: 'Ảnh chân dung',
    workerServiceSkills: 'Dịch vụ nhận',
    workerServiceElectrical: 'Sửa điện',
    workerServicePlumbing: 'Sửa nước',
    workerServiceCleaning: 'Vệ sinh',
    workerServiceArea: 'Khu vực nhận việc',
    workerPhoneContact: 'Số điện thoại',
    chooseArea: 'Chọn khu vực',
    addContact: 'Thêm liên hệ',
    chooseFile: 'Chọn tệp',
    workerCreateBoundaryTitle: 'Kênh tạo hồ sơ chưa mở trong app',
    workerCreateBoundaryBody: 'NestScout chỉ mở nhận việc sau khi tài khoản thợ được tạo và duyệt ở hệ thống thật. Màn này giữ các yêu cầu hồ sơ để bạn biết cần chuẩn bị gì.',
    workerCreateLockedMeta: 'Chờ kênh duyệt',
    workerCreateUnavailableCta: 'Chưa mở gửi xét duyệt',
    submitVerification: 'Gửi xét duyệt',
    forgotPassword: 'Quên mật khẩu?',
    divider: 'hoặc',
    openRoleA11y: (label: string) => `Đăng nhập vai trò ${label}`,
    roleStatus: {
      admin: 'Quản trị viên có thể mở cả hai khu vực.',
      customer: 'Tài khoản Khách chỉ vào khu vực Khách.',
      checking: 'Đang kiểm tra vai trò tài khoản.',
      worker: 'Tài khoản Thợ chỉ vào khu vực Thợ.',
    },
    roleHero: {
      customer: 'Ứng dụng cho khách',
      worker: 'Ứng dụng cho thợ',
      customerLock: 'Vai trò cố định: Khách',
      workerLock: 'Vai trò cố định: Thợ',
      workerFoot: 'Hồ sơ cần xét duyệt',
    },
    errors: {
      config: 'Dịch vụ đăng nhập chưa sẵn sàng. Vui lòng thử lại sau.',
      customerDenied: 'Tài khoản này chưa được phép vào khu vực Khách',
      generic: 'Không thể đăng nhập',
      login: 'Không thể đăng nhập',
      unavailable: 'Không thể đăng nhập lúc này',
      workerDenied: 'Tài khoản này chưa được phép vào khu vực Thợ',
      workerCreateUnavailable: 'Tạo tài khoản thợ chưa sẵn sàng. Vui lòng liên hệ hỗ trợ.',
      customerSetupUnavailable: 'Chưa lưu được hồ sơ khách. Vui lòng thử lại.',
      googleUnavailable: 'Chưa mở được đăng nhập Google. Vui lòng thử lại.',
      phoneUnavailable: 'Đăng nhập số điện thoại chưa sẵn sàng.',
      resetPasswordUnavailable: 'Đặt lại mật khẩu chưa sẵn sàng.',
    },
  },
  en: {
    kicker: '',
    titleAuthenticated: 'Choose role',
    roleGateTitle: 'Choose role',
    roleGateSubtitle: 'Continue into the right experience',
    welcomeTitle: 'Hi! I am Kael',
    welcomeSubtitle: 'NestScout assistant helps match the right home service at the right moment.',
    welcomeCta: 'Continue',
    welcomeTrust: 'Electrical, plumbing, and home cleaning',
    customerLoginHeading: 'Customer sign in',
    customerLoginSubtitle: 'Open the app quickly to send and track requests',
    workerLoginHeading: 'Worker account',
    workerLoginSubtitle: 'Sign in or create a new worker profile',
    workerVerificationHeading: 'Worker verification',
    workerVerificationSubtitle: 'Profile review decides when you can receive jobs',
    titleLogin: 'Home help, matched right!',
    bodyLogin: '',
    recovery: 'Role profile is not ready. Refresh the profile or sign out to use another account.',
    refresh: 'Refresh profile',
    signOut: 'Sign out',
    submit: 'Continue',
    workerSubmit: 'Sign in',
    changeRole: 'Back',
    email: 'Email',
    password: 'Password',
    selectedRole: (role: string) => `Role: ${role}`,
    roleCustomer: 'Customer',
    roleWorker: 'Worker',
    entryCustomer: 'Send request and track service',
    entryWorker: 'Sign in or create a profile',
    adminCustomer: 'Open customer workspace as admin.',
    adminWorker: 'Open worker workspace as admin.',
    customerDesc: 'Send a request, chat with Kael, and track activity.',
    workerDesc: 'Receive jobs, JobRoom, and reconciliation.',
    google: 'Continue with Google',
    phone: 'Use phone number',
    customerEmailFallback: 'Use email and password',
    customerEmailFallbackClose: 'Hide email sign-in',
    signature: 'Right person, right job, right when home needs it.',
    workerLoginTitle: 'Worker sign in',
    customerLoginTitle: 'Customer sign in',
    customerPhoneHeading: 'Phone number',
    customerPhoneSubtitle: 'Customer sign in',
    customerPhoneTitle: 'Sign in with phone number',
    customerPhonePlaceholder: 'Enter a Vietnam phone number',
    customerPhoneSubmit: 'Get verification code',
    customerGoogleFallback: 'Sign in with Google',
    customerSetupHeading: 'Confirm details',
    customerSetupSubtitle: 'Used for requests and contact',
    customerSetupWelcomeTitle: 'Welcome in!',
    customerSetupWelcomeSubtitle: 'Kael uses this profile to prepare the right address and contact details for service requests.',
    customerSetupProfileStep: 'Profile',
    customerSetupProfileStepMeta: 'Name',
    customerSetupContactStep: 'Contact',
    customerSetupContactStepMeta: 'Real number',
    customerSetupAddressStep: 'Address',
    customerSetupAddressStepMeta: 'Apartment',
    customerDisplayName: 'Display name',
    customerDisplayNamePlaceholder: 'Enter your name',
    customerPhoneContact: 'Phone number',
    customerPhoneContactPlaceholder: 'Add a contact number',
    customerDefaultAddress: 'Default address',
    customerDefaultAddressPlaceholder: 'Choose building/apartment',
    customerSaveProfile: 'Save and continue',
    customerSkipSetup: 'Skip',
    accountLabel: 'Account',
    securityLabel: 'Security',
    workerAccountLabel: 'Email or phone number',
    workerAccountPlaceholder: 'Enter worker account',
    workerPasswordPlaceholder: 'Enter password',
    passwordVisibility: 'Show or hide password',
    createWorker: 'Create worker profile',
    createWorkerAccount: 'Create account and verify',
    createWorkerQuestion: 'No worker account yet?',
    workerHasAccount: 'Already have a worker account?',
    workerBackToLogin: 'Sign in',
    workerVerificationHeroTitle: 'Submit profile for review',
    workerVerificationRequired: 'Required',
    workerSetupAccount: 'Account',
    workerSetupAccountMeta: 'Not open',
    workerSetupVerify: 'Verify',
    workerSetupVerifyMeta: 'Review',
    workerSetupProfile: 'Profile',
    workerSetupProfileMeta: 'Pending',
    workerSkillAreaMode: 'Skills and area',
    workerCccd: 'National ID',
    workerCccdFront: 'National ID front',
    workerCccdBack: 'National ID back',
    workerCertificate: 'Trade certificate',
    workerPortrait: 'Portrait photo',
    workerServiceSkills: 'Services',
    workerServiceElectrical: 'Electrical',
    workerServicePlumbing: 'Plumbing',
    workerServiceCleaning: 'Cleaning',
    workerServiceArea: 'Work area',
    workerPhoneContact: 'Phone number',
    chooseArea: 'Choose area',
    addContact: 'Add contact',
    chooseFile: 'Choose file',
    workerCreateBoundaryTitle: 'Worker profile creation is not open in app',
    workerCreateBoundaryBody: 'NestScout only opens job access after a real worker account is created and reviewed in the system. This screen keeps the required profile checklist visible.',
    workerCreateLockedMeta: 'Awaiting review',
    workerCreateUnavailableCta: 'Review submit not open',
    submitVerification: 'Send for review',
    forgotPassword: 'Forgot password?',
    divider: 'or',
    openRoleA11y: (label: string) => `Sign in as ${label}`,
    roleStatus: {
      admin: 'Admin can open both workspaces.',
      customer: 'Customer account can only open Customer.',
      checking: 'Checking account role.',
      worker: 'Worker account can only open Worker.',
    },
    roleHero: {
      customer: 'Customer app',
      worker: 'Worker app',
      customerLock: 'Fixed role: Customer',
      workerLock: 'Fixed role: Worker',
      workerFoot: 'Review required',
    },
    errors: {
      config: 'Sign-in is not ready yet. Please try again later.',
      customerDenied: 'This account cannot open Customer yet',
      generic: 'Unable to sign in',
      login: 'Unable to sign in',
      unavailable: 'Unable to sign in right now',
      workerDenied: 'This account cannot open Worker yet',
      workerCreateUnavailable: 'Worker account creation is not ready. Contact support.',
      customerSetupUnavailable: 'Customer profile could not be saved. Please try again.',
      googleUnavailable: 'Google sign-in could not open. Please try again.',
      phoneUnavailable: 'Phone sign-in is not ready.',
      resetPasswordUnavailable: 'Password reset is not ready.',
    },
  },
} as const

type AuthCopy = (typeof authCopy)[AppLanguage]

export function LoginRoleSurface() {
  const { replace } = useRouter()
  const { preview } = useLocalSearchParams<{ preview?: string | string[] }>()
  const { authError, loading, profileStatus, refreshProfile, role, session, signInWithGoogle, signInWithPassword, signOut, updateCustomerProfile } = useAuth()
  const { reduceTransparency } = useGlassAccessibility()
  const language = useAppLanguage()
  const copy = authCopy[language]
  const scrollRef = useRef<ScrollView>(null)
  const [signatureChoice, setSignatureChoice] = useState<AuthEntryRole | null>(null)
  const [{ customerAddress, customerAuthMode, customerDisplayName, customerSetupDismissed, email, formError, password, passwordVisible, phone, selectedEntryRole, signingIn, welcomeDismissed, workerAuthMode }, loginDispatch] = useReducer(loginRoleReducer, loginRoleInitialState)
  const setCustomerAddress = (value: string) => loginDispatch({ type: 'field', field: 'customerAddress', value })
  const setCustomerDisplayName = (value: string) => loginDispatch({ type: 'field', field: 'customerDisplayName', value })
  const setEmail = (value: string) => loginDispatch({ type: 'field', field: 'email', value })
  const setPassword = (value: string) => loginDispatch({ type: 'field', field: 'password', value })
  const setPhone = (value: string) => loginDispatch({ type: 'field', field: 'phone', value })
  const setFormError = (error: string | null) => loginDispatch({ type: 'form_error', error })
  const setSigningIn = (signingInValue: boolean) => loginDispatch({ type: 'set_signing_in', signingIn: signingInValue })
  const setCustomerAuthMode = (mode: 'choices' | 'phone') => loginDispatch({ type: 'set_customer_auth_mode', mode })
  const setSelectedEntryRole = (entryRole: AuthEntryRole | null) => loginDispatch({ type: 'select_role', role: entryRole })
  const setWorkerAuthMode = (mode: 'create' | 'login') => loginDispatch({ type: 'set_worker_auth_mode', mode })
  const isAdmin = role === 'admin'
  const isAuthenticated = Boolean(session && role)
  const canOpenCustomer = role === 'customer' || isAdmin
  const canOpenWorker = role === 'worker' || isAdmin
  const configMissing = profileStatus === 'config_missing'
  const visibleError = formError ?? (authError ? copy.errors.generic : null) ?? (configMissing ? copy.errors.config : null)
  const needsProfileRecovery = Boolean(session && !role && (profileStatus === 'profile_missing' || profileStatus === 'profile_error'))
  const authProviderName = typeof session?.user.app_metadata?.provider === 'string' ? session.user.app_metadata.provider : null
  const customerMetadata = session?.user.user_metadata ?? {}
  const metadataCustomerDisplayName = typeof customerMetadata.full_name === 'string' && customerMetadata.full_name.trim()
    ? customerMetadata.full_name.trim()
    : typeof customerMetadata.name === 'string' && customerMetadata.name.trim()
      ? customerMetadata.name.trim()
      : ''
  const metadataCustomerAddress = typeof customerMetadata.default_address === 'string' ? customerMetadata.default_address.trim() : ''
  const metadataCustomerPhone = typeof customerMetadata.phone_number === 'string' ? customerMetadata.phone_number.trim() : ''
  const customerDisplayNameValue = customerDisplayName || metadataCustomerDisplayName
  const customerAddressValue = customerAddress || metadataCustomerAddress
  const customerPhoneValue = phone || metadataCustomerPhone
  const previewMode = Array.isArray(preview) ? preview[0] : preview
  const customerSetupPreview = Platform.OS === 'web' && __DEV__ && previewMode === 'customer-setup'
  const customerSetupPreviewActive = customerSetupPreview && !customerSetupDismissed
  const shouldShowSignedInCustomerSetup = Boolean(
    (customerSetupPreviewActive && session && role === 'customer') ||
      (session &&
      role === 'customer' &&
      selectedEntryRole === 'customer' &&
      !customerSetupDismissed &&
      (!metadataCustomerDisplayName || !metadataCustomerAddress)),
  )
  const needsCustomerOnboarding = shouldShowSignedInCustomerSetup || (needsProfileRecovery && !customerSetupDismissed && (selectedEntryRole === 'customer' || authProviderName === 'google'))
  const isWorkerCreateMode = selectedEntryRole === 'worker' && workerAuthMode === 'create'
  const isCustomerPhoneMode = selectedEntryRole === 'customer' && customerAuthMode === 'phone'
  const loginTitle = isWorkerCreateMode
    ? copy.createWorker
    : selectedEntryRole === 'worker'
    ? copy.workerLoginTitle
    : isCustomerPhoneMode
    ? copy.customerPhoneTitle
    : copy.customerLoginTitle
  const submitLabel = selectedEntryRole === 'worker' ? copy.workerSubmit : copy.submit
  const showClientAuthOptions = selectedEntryRole === 'customer' && customerAuthMode === 'choices'
  const accountPlaceholder = copy.workerAccountPlaceholder
  const passwordPlaceholder = copy.workerPasswordPlaceholder
  const shouldShowWelcome = !needsProfileRecovery && !needsCustomerOnboarding && !isAuthenticated && !selectedEntryRole && !welcomeDismissed
  const shouldShowRoleGate = !needsProfileRecovery && !needsCustomerOnboarding && !isAuthenticated && !selectedEntryRole && welcomeDismissed
  const authSurfaceKey = needsCustomerOnboarding
    ? 'customer-onboarding'
    : needsProfileRecovery
      ? 'profile-recovery'
      : isAuthenticated
        ? `authenticated-${role ?? 'unknown'}`
        : shouldShowWelcome
          ? 'welcome'
          : selectedEntryRole
          ? `${selectedEntryRole}-${customerAuthMode}-${workerAuthMode}`
          : 'role-gate'
  const isTopAligned = Boolean(needsProfileRecovery || isAuthenticated || selectedEntryRole)
  const useAuthFlowShell = Boolean(needsProfileRecovery || needsCustomerOnboarding || (!isAuthenticated && selectedEntryRole))

  useEffect(() => {
    if (!isAuthenticated || loading || needsProfileRecovery || needsCustomerOnboarding || isAdmin) return
    if (role === 'customer') {
      replace('/(customer)/home')
    } else if (role === 'worker') {
      replace('/(worker)/home')
    }
  }, [isAdmin, isAuthenticated, loading, needsCustomerOnboarding, needsProfileRecovery, replace, role])

  useEffect(() => {
    const resetWebScroll = () => {
      if (Platform.OS !== 'web') return
      const webGlobal = globalThis as typeof globalThis & {
        document?: {
          querySelectorAll?: (selector: string) => ArrayLike<{ scrollTop?: number }>
        }
        requestAnimationFrame?: (callback: () => void) => number
      }
      const nodes = webGlobal.document?.querySelectorAll?.('[data-testid="auth-login-surface"] *')
      if (!nodes) return
      Array.from(nodes).forEach((node) => {
        if (typeof node.scrollTop === 'number' && node.scrollTop > 0) {
          node.scrollTop = 0
        }
      })
    }
    const resetScroll = () => {
      scrollRef.current?.scrollTo({ y: 0, animated: false })
      resetWebScroll()
    }
    resetScroll()
    if (Platform.OS === 'web') {
      const webGlobal = globalThis as typeof globalThis & { requestAnimationFrame?: (callback: () => void) => number }
      webGlobal.requestAnimationFrame?.(resetScroll)
    }
    const timeout = setTimeout(resetScroll, 80)
    return () => clearTimeout(timeout)
  }, [authSurfaceKey])

  const submitLogin = async () => {
    setFormError(null)
    setSigningIn(true)
    try {
      const result = await signInWithPassword(email, password)
      if (!result.success) {
        setFormError(result.error ?? copy.errors.login)
      } else {
        setPassword('')
      }
    } catch {
      setFormError(copy.errors.unavailable)
    } finally {
      setSigningIn(false)
    }
  }

  const submitGoogleLogin = async () => {
    setFormError(null)
    setSigningIn(true)
    try {
      const result = await signInWithGoogle()
      if (!result.success) setFormError(result.error ?? copy.errors.login)
    } catch {
      setFormError(copy.errors.unavailable)
    } finally {
      setSigningIn(false)
    }
  }

  const dismissCustomerSetup = () => {
    loginDispatch({ type: 'dismiss_customer_setup' })
    void refreshProfile()
  }

  const saveCustomerProfile = async () => {
    setFormError(null)
    setSigningIn(true)
    try {
      const result = await updateCustomerProfile({
        defaultAddress: customerAddressValue,
        displayName: customerDisplayNameValue,
        phone: customerPhoneValue,
      })
      if (!result.success) {
        setFormError(result.error ?? copy.errors.customerSetupUnavailable)
        return
      }
      loginDispatch({ type: 'dismiss_customer_setup' })
      await refreshProfile()
    } catch {
      setFormError(copy.errors.customerSetupUnavailable)
    } finally {
      setSigningIn(false)
    }
  }

  const openCustomerSection = () => {
    if (!canOpenCustomer) {
      setFormError(copy.errors.customerDenied)
      return
    }
    replace('/(customer)/home')
  }

  const openWorkerSection = () => {
    if (!canOpenWorker) {
      setFormError(copy.errors.workerDenied)
      return
    }
    replace('/(worker)/home')
  }

  return (
    <AuthFrame testID="auth-login-surface" topAligned={isTopAligned}>
      <ScrollView key={authSurfaceKey} ref={scrollRef} contentContainerStyle={[styles.authContent, isTopAligned ? styles.authContentScrollable : null]} showsVerticalScrollIndicator={isTopAligned} style={[styles.authScroll, isTopAligned ? styles.authScrollScrollable : null]}>
        <View style={useAuthFlowShell ? styles.authFlowShell : [styles.roleGateShell, glassSurface('glass', reduceTransparency), reduceTransparency ? styles.roleGateShellReduced : styles.roleGateShellPrototype]} testID={useAuthFlowShell ? 'auth-flow-shell' : 'auth-role-gate-glass'}>
          <View style={styles.hiddenMarker} testID={AUTH_PROTOTYPE_PARITY_MARKER} />
          {!shouldShowWelcome && !needsProfileRecovery && !needsCustomerOnboarding && (shouldShowRoleGate || isAuthenticated) ? (
            <View style={styles.loginHeader}>
              <AuthTopRow
                subtitle={copy.roleGateSubtitle}
                title={copy.roleGateTitle}
                trailing={<View style={[styles.topKaelFace, reduceTransparency ? styles.topKaelFaceReduced : null]}><Image contentFit="contain" source={kaelModel8AHead} style={styles.topKaelImage as ImageStyle} /></View>}
              />
              <RoleGatewayHero choice={signatureChoice} copy={copy} />
            </View>
          ) : null}

          {shouldShowWelcome ? (
            <AuthWelcomePanel
              copy={copy}
              onContinue={() => loginDispatch({ type: 'dismiss_welcome' })}
            />
          ) : needsCustomerOnboarding ? (
            <CustomerOnboardingPanel
              address={customerAddressValue}
              copy={copy}
              displayName={customerDisplayNameValue}
              loading={loading}
              onBack={dismissCustomerSetup}
              onSaveProfile={saveCustomerProfile}
              onSkip={dismissCustomerSetup}
              onUpdateAddress={setCustomerAddress}
              onUpdateDisplayName={setCustomerDisplayName}
              onUpdatePhone={setPhone}
              phone={customerPhoneValue}
              signingIn={signingIn}
              visibleError={visibleError}
            />
          ) : needsProfileRecovery ? (
            <View style={styles.formStack} testID="auth-profile-recovery">
              <Text style={styles.errorText}>{copy.recovery}</Text>
              {visibleError ? <Text style={styles.errorText}>{visibleError}</Text> : null}
              <Pressable
                accessibilityLabel={copy.refresh}
                accessibilityRole="button"
                accessibilityState={{ disabled: loading }}
                disabled={loading}
                onPress={() => void refreshProfile()}
                style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null, loading ? styles.disabled : null]}
                testID="auth-profile-refresh"
              >
                {loading ? <ActivityIndicator color={authTokens.raised} /> : <Text style={styles.primaryButtonText}>{copy.refresh}</Text>}
              </Pressable>
              <Pressable accessibilityLabel={copy.signOut} accessibilityRole="button" onPress={signOut} style={styles.secondaryAction} testID="auth-profile-recovery-sign-out">
                <Text style={styles.secondaryActionText}>{copy.signOut}</Text>
              </Pressable>
            </View>
          ) : !isAuthenticated && !selectedEntryRole ? (
            <>
              <View style={styles.hiddenMarker} testID="auth-entry-role-first" />
              <RoleGatewayCards copy={copy} language={language} onPreviewRole={setSignatureChoice} onSelectRole={setSelectedEntryRole} />
            </>
          ) : !isAuthenticated ? (
            <UnauthenticatedRoleForm
              accountPlaceholder={accountPlaceholder}
              configMissing={configMissing}
              copy={copy}
              email={email}
              isCustomerPhoneMode={isCustomerPhoneMode}
              isWorkerCreateMode={isWorkerCreateMode}
              loading={loading}
              loginTitle={loginTitle}
              onBack={() => {
                setFormError(null)
                if (isCustomerPhoneMode) {
                  setCustomerAuthMode('choices')
                  return
                }
                setSelectedEntryRole(null)
              }}
              onForgotPassword={() => setFormError(copy.errors.resetPasswordUnavailable)}
              onGoogle={submitGoogleLogin}
              onOpenPhone={() => setCustomerAuthMode('phone')}
              onPhoneBack={() => setCustomerAuthMode('choices')}
              onPhoneSubmitUnavailable={() => setFormError(copy.errors.phoneUnavailable)}
              onSubmitLogin={submitLogin}
              onSubmitWorkerCreate={() => setFormError(copy.errors.workerCreateUnavailable)}
              onTogglePasswordVisible={() => loginDispatch({ type: 'toggle_password_visible' })}
              onUpdateEmail={setEmail}
              onUpdatePassword={setPassword}
              onUpdatePhone={setPhone}
              onWorkerModeChange={setWorkerAuthMode}
              password={password}
              passwordPlaceholder={passwordPlaceholder}
              passwordVisible={passwordVisible}
              phone={phone}
              reduceTransparency={reduceTransparency}
              selectedEntryRole={selectedEntryRole}
              showClientAuthOptions={showClientAuthOptions}
              signingIn={signingIn}
              submitLabel={submitLabel}
              visibleError={visibleError}
            />
          ) : (
            <AuthenticatedRoleActions canOpenCustomer={canOpenCustomer} canOpenWorker={canOpenWorker} copy={copy} isAdmin={isAdmin} language={language} onOpenCustomer={openCustomerSection} onOpenWorker={openWorkerSection} onSignOut={signOut} onPreviewRole={setSignatureChoice} />
          )}
        </View>
      </ScrollView>
      <View style={styles.hiddenMarker} testID={LOGIN_ROLE_GATE_MARKER + LOGIN_ROLE_GATE_GLASS_MARKER + '/(customer)/home /(worker)/home'} />
    </AuthFrame>
  )
}

function UnauthenticatedRoleForm({
  accountPlaceholder,
  configMissing,
  copy,
  email,
  isCustomerPhoneMode,
  isWorkerCreateMode,
  loading,
  loginTitle,
  onBack,
  onForgotPassword,
  onGoogle,
  onOpenPhone,
  onPhoneBack,
  onPhoneSubmitUnavailable,
  onSubmitLogin,
  onSubmitWorkerCreate,
  onTogglePasswordVisible,
  onUpdateEmail,
  onUpdatePassword,
  onUpdatePhone,
  onWorkerModeChange,
  password,
  passwordPlaceholder,
  passwordVisible,
  phone,
  reduceTransparency,
  selectedEntryRole,
  showClientAuthOptions,
  signingIn,
  submitLabel,
  visibleError,
}: {
  accountPlaceholder: string
  configMissing: boolean
  copy: AuthCopy
  email: string
  isCustomerPhoneMode: boolean
  isWorkerCreateMode: boolean
  loading: boolean
  loginTitle: string
  onBack: () => void
  onForgotPassword: () => void
  onGoogle: () => void
  onOpenPhone: () => void
  onPhoneBack: () => void
  onPhoneSubmitUnavailable: () => void
  onSubmitLogin: () => void
  onSubmitWorkerCreate: () => void
  onTogglePasswordVisible: () => void
  onUpdateEmail: (value: string) => void
  onUpdatePassword: (value: string) => void
  onUpdatePhone: (value: string) => void
  onWorkerModeChange: (mode: 'create' | 'login') => void
  password: string
  passwordPlaceholder: string
  passwordVisible: boolean
  phone: string
  reduceTransparency: boolean
  selectedEntryRole: AuthEntryRole | null
  showClientAuthOptions: boolean
  signingIn: boolean
  submitLabel: string
  visibleError: string | null
}) {
  const isWorker = selectedEntryRole === 'worker'
  const isCustomerPasswordFallback = selectedEntryRole === 'customer' && !isCustomerPhoneMode
  const [showCustomerEmailFallback, setShowCustomerEmailFallback] = useState(false)
  const canUsePasswordLogin = isWorker || (isCustomerPasswordFallback && showCustomerEmailFallback)
  const primarySubmitLabel = isWorkerCreateMode ? copy.workerCreateUnavailableCta : submitLabel

  return (
    <View style={styles.formStack}>
      <View style={styles.hiddenMarker} testID={`auth-entry-role-selected-${selectedEntryRole}`} />
      <AuthTopRow
        onBack={onBack}
        subtitle={isWorkerCreateMode ? copy.workerVerificationSubtitle : isWorker ? copy.workerLoginSubtitle : isCustomerPhoneMode ? copy.customerPhoneSubtitle : copy.customerLoginSubtitle}
        title={isWorkerCreateMode ? copy.workerVerificationHeading : isWorker ? copy.workerLoginHeading : isCustomerPhoneMode ? copy.customerPhoneHeading : copy.customerLoginHeading}
      />
      {isCustomerPhoneMode || isWorkerCreateMode ? null : (
        <LoginHeroRole
          icon={isWorker ? 'tools' : 'home'}
          lockLabel={isWorker ? copy.roleHero.workerLock : copy.roleHero.customerLock}
          title={isWorker ? copy.roleHero.worker : copy.roleHero.customer}
        />
      )}
      {isWorkerCreateMode ? <WorkerVerificationHero copy={copy} /> : null}
      <ReduceMotionAwareEntranceView delayMs={80} distanceY={6} style={[styles.loginForm, reduceTransparency ? styles.loginFormReduced : null]} testID="authLoginFormMotion">
        {!reduceTransparency ? <View pointerEvents="none" style={styles.loginFormGlow} testID="auth-login-form-glow" /> : null}
        <View style={styles.loginMode}>
          <Text style={styles.loginModeText}>{loginTitle}</Text>
        </View>
        {showClientAuthOptions ? (
          <ClientAuthChoices
            configMissing={configMissing}
            copy={copy}
            loading={loading}
            onGoogle={onGoogle}
            onPhone={onOpenPhone}
            signingIn={signingIn}
          />
        ) : null}
        {isCustomerPhoneMode ? (
          <CustomerPhoneLoginPanel
            configMissing={configMissing}
            copy={copy}
            loading={loading}
            onBackToChoices={onPhoneBack}
            onSubmitUnavailable={onPhoneSubmitUnavailable}
            onUpdatePhone={onUpdatePhone}
            phone={phone}
            signingIn={signingIn}
          />
        ) : null}
        {isCustomerPasswordFallback ? (
          <Pressable
            accessibilityLabel={showCustomerEmailFallback ? copy.customerEmailFallbackClose : copy.customerEmailFallback}
            accessibilityRole="button"
            onPress={() => setShowCustomerEmailFallback((current) => !current)}
            style={({ pressed }) => [styles.customerEmailFallbackButton, pressed ? styles.pressed : null]}
            testID="auth-client-email-fallback-toggle"
          >
            <Text style={styles.customerEmailFallbackText}>{showCustomerEmailFallback ? copy.customerEmailFallbackClose : copy.customerEmailFallback}</Text>
          </Pressable>
        ) : null}
        {isCustomerPasswordFallback && showCustomerEmailFallback ? (
          <View style={styles.loginDivider} testID="auth-client-email-fallback-divider">
            <View style={styles.loginDividerLine} />
            <Text style={styles.loginDividerText}>{copy.divider}</Text>
            <View style={styles.loginDividerLine} />
          </View>
        ) : null}
        {canUsePasswordLogin ? (
          <>
            <AuthInputField icon="email" label={isWorker ? copy.workerAccountLabel : copy.email}>
              <TextInput
                accessibilityLabel={isWorker ? copy.workerAccountLabel : copy.email}
                autoCapitalize="none"
                autoCorrect={false}
                inputMode={isWorker ? 'text' : 'email'}
                keyboardType={isWorker ? 'default' : 'email-address'}
                onChangeText={onUpdateEmail}
                placeholder={isWorker ? accountPlaceholder : copy.email}
                placeholderTextColor={authTokens.subtle}
                style={styles.fieldInput}
                testID="auth-login-email-input"
                value={email}
              />
            </AuthInputField>
            <AuthInputField actionLabel={copy.passwordVisibility} icon="lock" label={copy.password} onAction={onTogglePasswordVisible}>
              <TextInput
                accessibilityLabel={copy.password}
                autoCapitalize="none"
                onChangeText={onUpdatePassword}
                placeholder={isWorker ? passwordPlaceholder : copy.password}
                placeholderTextColor={authTokens.subtle}
                secureTextEntry={!passwordVisible}
                style={styles.fieldInput}
                testID="auth-login-password-input"
                value={password}
              />
            </AuthInputField>
            {isWorkerCreateMode ? (
              <WorkerVerificationPreview copy={copy} />
            ) : null}
          </>
        ) : null}
        {isCustomerPasswordFallback && showCustomerEmailFallback ? (
          <View style={styles.customerPasswordFoot} testID="auth-customer-password-foot">
            <Pressable accessibilityRole="button" onPress={onForgotPassword} testID="auth-customer-forgot-password">
              <Text style={styles.customerPasswordFootAction}>{copy.forgotPassword}</Text>
            </Pressable>
          </View>
        ) : null}
        {visibleError ? <Text style={styles.errorText}>{visibleError}</Text> : null}
        {isWorker ? (
          <View style={styles.workerFormFoot}>
            <Text style={styles.workerFormFootText}>{isWorkerCreateMode ? copy.workerHasAccount : copy.roleHero.workerFoot}</Text>
            <Pressable accessibilityRole="button" onPress={() => isWorkerCreateMode ? onWorkerModeChange('login') : onForgotPassword()}>
              <Text style={styles.workerFormFootAction}>{isWorkerCreateMode ? copy.workerBackToLogin : copy.forgotPassword}</Text>
            </Pressable>
          </View>
        ) : null}
        {canUsePasswordLogin ? (
          <Pressable
            accessibilityLabel={primarySubmitLabel}
            accessibilityRole="button"
            accessibilityState={{ disabled: signingIn || loading || configMissing }}
            disabled={signingIn || loading || configMissing}
            onPress={isWorkerCreateMode ? onSubmitWorkerCreate : onSubmitLogin}
            style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null, signingIn || loading || configMissing ? styles.disabled : null]}
            testID="auth-login-submit"
          >
            {signingIn || loading ? <ActivityIndicator color={authTokens.raised} /> : <Text style={styles.primaryButtonText}>{primarySubmitLabel}</Text>}
          </Pressable>
        ) : null}
        {isWorker && !isWorkerCreateMode ? (
          <View style={styles.authFootCta}>
            <Text style={styles.authFootCtaText}>{copy.createWorkerQuestion}</Text>
            <Pressable
              accessibilityLabel={copy.createWorkerAccount}
              accessibilityRole="button"
              onPress={() => onWorkerModeChange('create')}
              style={({ pressed }) => [styles.authFootLinkButton, pressed ? styles.pressed : null]}
              testID="auth-worker-create-profile"
            >
              <Text style={styles.authFootLinkText}>{copy.createWorkerAccount}</Text>
            </Pressable>
          </View>
        ) : null}
      </ReduceMotionAwareEntranceView>
    </View>
  )
}

function AuthWelcomePanel({ copy, onContinue }: { copy: AuthCopy; onContinue: () => void }) {
  const { reduceTransparency } = useGlassAccessibility()

  return (
    <ReduceMotionAwareEntranceView delayMs={50} distanceY={8} style={[styles.welcomeShell, reduceTransparency ? styles.welcomeShellReduced : null]} testID="auth-welcome-screen">
      {!reduceTransparency ? (
        <>
          <View pointerEvents="none" style={styles.welcomeMintAura} />
          <View pointerEvents="none" style={styles.welcomeSoftLine} />
        </>
      ) : null}
      <View style={styles.welcomeBrandRow}>
        <View style={styles.welcomeBrandMark}>
          <Text style={styles.welcomeBrandMarkText}>K</Text>
        </View>
        <Text style={styles.welcomeBrandText}>{NESTSCOUT_BRAND.appName}</Text>
      </View>
      <KaelMascot size={176} state="welcome" style={styles.welcomeMascot} testID="auth-welcome-kael" />
      <View style={styles.welcomeCopy}>
        <Text style={styles.welcomeTitle}>{copy.welcomeTitle}</Text>
        <Text style={styles.welcomeSubtitle}>{copy.welcomeSubtitle}</Text>
        <Text style={styles.welcomeTrust}>{copy.welcomeTrust}</Text>
      </View>
      <Pressable accessibilityLabel={copy.welcomeCta} accessibilityRole="button" onPress={onContinue} style={({ pressed }) => [styles.primaryButton, styles.welcomeButton, pressed ? styles.pressed : null]} testID="auth-welcome-continue">
        <Text style={styles.primaryButtonText}>{copy.welcomeCta}</Text>
      </Pressable>
    </ReduceMotionAwareEntranceView>
  )
}

function WorkerVerificationHero({ copy }: { copy: AuthCopy }) {
  return (
    <View style={styles.setupHero} testID="auth-worker-verification-setup-hero">
      <View style={styles.setupHeroTop}>
        <View style={[styles.roleIcon, styles.roleIconHero]}>
          <AuthIcon name="tools" inverse />
        </View>
        <View style={styles.titleStack}>
          <Text style={styles.loginHeroTitle}>{copy.workerVerificationHeroTitle}</Text>
        </View>
        <Text style={[styles.roleLock, styles.roleLockCream]}>{copy.workerVerificationRequired}</Text>
      </View>
      <View style={styles.setupSteps}>
        <SetupStep active label={copy.workerSetupAccount} value={copy.workerSetupAccountMeta} />
        <SetupStep active label={copy.workerSetupVerify} value={copy.workerSetupVerifyMeta} />
        <SetupStep label={copy.workerSetupProfile} value={copy.workerSetupProfileMeta} />
      </View>
    </View>
  )
}

function WorkerVerificationPreview({ copy }: { copy: AuthCopy }) {
  return (
    <View style={styles.workerVerificationStack} testID="auth-worker-verification-preview">
      <WorkerCreateBoundaryNote copy={copy} />
      <View style={styles.workerUploadGrid} testID="auth-worker-verification-upload-grid">
        <WorkerCredentialPill icon="shield" label={copy.workerCccdFront} meta={copy.workerCreateLockedMeta} variant="upload" />
        <WorkerCredentialPill icon="shield" label={copy.workerCccdBack} meta={copy.workerCreateLockedMeta} variant="upload" />
        <WorkerCredentialPill icon="home" label={copy.workerPortrait} meta={copy.workerCreateLockedMeta} variant="upload" />
        <WorkerCredentialPill icon="tools" label={copy.workerCertificate} meta={copy.workerCreateLockedMeta} variant="upload" />
      </View>
      <View style={styles.loginMode}>
        <Text style={styles.loginModeText}>{copy.workerSkillAreaMode}</Text>
      </View>
      <View style={styles.workerVerifyServiceRow} testID="auth-worker-verification-services">
        {[copy.workerServiceElectrical, copy.workerServicePlumbing, copy.workerServiceCleaning].map((service) => (
          <Text key={service} style={styles.workerVerifyServiceChip} numberOfLines={1}>{service}</Text>
        ))}
      </View>
      <WorkerCredentialPill icon="home" label={copy.workerServiceArea} meta={copy.workerCreateLockedMeta} />
      <WorkerCredentialPill icon="phone" label={copy.workerPhoneContact} meta={copy.workerCreateLockedMeta} />
    </View>
  )
}

function WorkerCreateBoundaryNote({ copy }: { copy: AuthCopy }) {
  return (
    <View style={styles.workerCreateBoundaryNote} testID="auth-worker-create-boundary-note">
      <Text style={styles.workerCreateBoundaryTitle}>{copy.workerCreateBoundaryTitle}</Text>
      <Text style={styles.workerCreateBoundaryBody}>{copy.workerCreateBoundaryBody}</Text>
    </View>
  )
}

function RoleGatewayCards({
  copy,
  language,
  onPreviewRole,
  onSelectRole,
}: {
  copy: (typeof authCopy)[AppLanguage]
  language: AppLanguage
  onPreviewRole: (role: AuthEntryRole) => void
  onSelectRole: (role: AuthEntryRole) => void
}) {
  return (
    <View style={styles.roleGatewayGrid}>
      <ReduceMotionAwareEntranceView delayMs={105} distanceY={8} testID="auth-role-card-motion-customer">
        <RoleCard
          accessibilityLabel={copy.openRoleA11y(copy.roleCustomer)}
          description={copy.entryCustomer}
          icon="home"
          label={copy.roleCustomer}
          meta={language === 'en' ? ['Google', 'Phone'] : ['Google', 'Số điện thoại']}
          onPreview={() => onPreviewRole('customer')}
          onPress={() => onSelectRole('customer')}
          primary
          testID="auth-entry-role-customer"
        />
      </ReduceMotionAwareEntranceView>
      <ReduceMotionAwareEntranceView delayMs={160} distanceY={8} testID="auth-role-card-motion-worker">
        <RoleCard
          accessibilityLabel={copy.openRoleA11y(copy.roleWorker)}
          description={copy.entryWorker}
          icon="tools"
          label={copy.roleWorker}
          meta={language === 'en' ? ['Worker account', 'Verification'] : ['Tài khoản thợ', 'Xác thực']}
          onPreview={() => onPreviewRole('worker')}
          onPress={() => onSelectRole('worker')}
          testID="auth-entry-role-worker"
        />
      </ReduceMotionAwareEntranceView>
    </View>
  )
}

function ClientAuthChoices({
  configMissing,
  copy,
  loading,
  onGoogle,
  onPhone,
  signingIn,
}: {
  configMissing: boolean
  copy: (typeof authCopy)[AppLanguage]
  loading: boolean
  onGoogle: () => void
  onPhone: () => void
  signingIn: boolean
}) {
  const disabled = signingIn || loading || configMissing
  const phoneDisabled = disabled

  return (
    <View style={styles.authChoiceList}>
      <AuthMotionPressable
        accessibilityLabel={copy.google}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        motionTestID="authOptionPressScale"
        onPress={onGoogle}
        style={({ pressed }) => [styles.googleButton, pressed ? styles.pressed : null, disabled ? styles.disabled : null]}
        testID="auth-client-google-primary"
      >
        <GoogleMark />
        {signingIn || loading ? <ActivityIndicator color={authTokens.primary} /> : <Text style={styles.googleButtonText}>{copy.google}</Text>}
      </AuthMotionPressable>
      <AuthMotionPressable
        accessibilityLabel={copy.phone}
        accessibilityRole="button"
        accessibilityState={{ disabled: phoneDisabled }}
        disabled={phoneDisabled}
        onPress={onPhone}
        style={({ pressed }) => [styles.phoneButton, pressed ? styles.pressed : null, phoneDisabled ? styles.disabled : null]}
        testID="auth-client-phone-secondary"
      >
        <View style={styles.authMark}>
          <AuthIcon name="phone" />
        </View>
        <Text style={styles.phoneButtonText}>{copy.phone}</Text>
      </AuthMotionPressable>
    </View>
  )
}

function CustomerPhoneLoginPanel({
  configMissing,
  copy,
  loading,
  onBackToChoices,
  onSubmitUnavailable,
  onUpdatePhone,
  phone,
  signingIn,
}: {
  configMissing: boolean
  copy: (typeof authCopy)[AppLanguage]
  loading: boolean
  onBackToChoices: () => void
  onSubmitUnavailable: () => void
  onUpdatePhone: (value: string) => void
  phone: string
  signingIn: boolean
}) {
  const disabled = signingIn || loading || configMissing || !CLIENT_PHONE_AUTH_AVAILABLE
  const phoneAuthUnavailable = !CLIENT_PHONE_AUTH_AVAILABLE

  return (
    <View style={styles.authChoiceList} testID="auth-client-phone-login-form">
      <AuthInputField icon="phone" label={copy.phone}>
        <TextInput
          accessibilityLabel={copy.phone}
          autoCapitalize="none"
          inputMode="tel"
          keyboardType="phone-pad"
          onChangeText={onUpdatePhone}
          placeholder={copy.customerPhonePlaceholder}
          placeholderTextColor={authTokens.subtle}
          style={styles.fieldInput}
          testID="auth-client-phone-input"
          value={phone}
        />
      </AuthInputField>
      {phoneAuthUnavailable ? (
        <Pressable
          accessibilityLabel={copy.errors.phoneUnavailable}
          accessibilityRole="button"
          onPress={onSubmitUnavailable}
          style={({ pressed }) => [styles.phoneUnavailableBox, pressed ? styles.pressed : null]}
          testID="auth-client-phone-submit-unavailable"
        >
          <Text style={styles.phoneUnavailableText}>{copy.errors.phoneUnavailable}</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityLabel={copy.customerPhoneSubmit}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onSubmitUnavailable}
          style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null, disabled ? styles.disabled : null]}
          testID="auth-client-phone-submit"
        >
          <Text style={styles.primaryButtonText}>{copy.customerPhoneSubmit}</Text>
        </Pressable>
      )}
      <Pressable
        accessibilityLabel={copy.customerGoogleFallback}
        accessibilityRole="button"
        onPress={onBackToChoices}
        style={({ pressed }) => [styles.secondaryBoxButton, pressed ? styles.pressed : null]}
        testID="auth-client-phone-back-google"
      >
        <Text style={styles.secondaryBoxButtonText}>{copy.customerGoogleFallback}</Text>
      </Pressable>
    </View>
  )
}

function CustomerOnboardingPanel({
  address,
  copy,
  displayName,
  loading,
  onBack,
  onSaveProfile,
  onSkip,
  onUpdateAddress,
  onUpdateDisplayName,
  onUpdatePhone,
  phone,
  signingIn,
  visibleError,
}: {
  address: string
  copy: (typeof authCopy)[AppLanguage]
  displayName: string
  loading: boolean
  onBack: () => void
  onSaveProfile: () => void
  onSkip: () => void
  onUpdateAddress: (value: string) => void
  onUpdateDisplayName: (value: string) => void
  onUpdatePhone: (value: string) => void
  phone: string
  signingIn: boolean
  visibleError: string | null
}) {
  const disabled = loading || signingIn

  return (
    <View style={styles.formStack} testID="auth-client-onboarding">
      <AuthTopRow onBack={onBack} subtitle={copy.customerSetupSubtitle} title={copy.customerSetupHeading} />
      <CustomerOnboardingHero copy={copy} />
      <View style={[styles.loginForm, styles.setupForm, styles.customerSetupForm]} testID="auth-client-onboarding-core-form">
        <View pointerEvents="none" style={styles.customerSetupCoolGlow} />
        <View pointerEvents="none" style={styles.customerSetupWarmGlow} />
        <AuthInputField icon="home" label={copy.customerDisplayName} variant="customerSetup">
          <TextInput
            accessibilityLabel={copy.customerDisplayName}
            autoCapitalize="words"
            onChangeText={onUpdateDisplayName}
            placeholder={copy.customerDisplayNamePlaceholder}
            placeholderTextColor={authTokens.subtle}
            style={styles.fieldInput}
            testID="auth-client-onboarding-display-name"
            value={displayName}
          />
        </AuthInputField>
        <AuthInputField icon="phone" label={copy.customerPhoneContact} variant="customerSetup">
          <TextInput
            accessibilityLabel={copy.customerPhoneContact}
            autoCapitalize="none"
            inputMode="tel"
            keyboardType="phone-pad"
            onChangeText={onUpdatePhone}
            placeholder={copy.customerPhoneContactPlaceholder}
            placeholderTextColor={authTokens.subtle}
            style={styles.fieldInput}
            testID="auth-client-onboarding-phone"
            value={phone}
          />
        </AuthInputField>
        <AuthInputField icon="map" label={copy.customerDefaultAddress} variant="customerSetup">
          <TextInput
            accessibilityLabel={copy.customerDefaultAddress}
            onChangeText={onUpdateAddress}
            placeholder={copy.customerDefaultAddressPlaceholder}
            placeholderTextColor={authTokens.subtle}
            style={styles.fieldInput}
            testID="auth-client-onboarding-address"
            value={address}
          />
        </AuthInputField>
        {visibleError ? <Text style={styles.errorText}>{visibleError}</Text> : null}
        <Pressable
          accessibilityLabel={copy.customerSaveProfile}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onSaveProfile}
          style={({ pressed }) => [styles.primaryButton, styles.customerSetupPrimaryButton, pressed ? styles.pressed : null, disabled ? styles.disabled : null]}
          testID="auth-client-onboarding-save"
        >
          {disabled ? <ActivityIndicator color={authTokens.raised} /> : <Text style={styles.primaryButtonText}>{copy.customerSaveProfile}</Text>}
        </Pressable>
        <Pressable accessibilityLabel={copy.customerSkipSetup} accessibilityRole="button" onPress={onSkip} style={({ pressed }) => [styles.secondaryBoxButton, styles.customerSetupSecondaryButton, pressed ? styles.pressed : null]} testID="auth-client-onboarding-skip">
          <Text style={styles.secondaryBoxButtonText}>{copy.customerSkipSetup}</Text>
        </Pressable>
      </View>
    </View>
  )
}

function CustomerOnboardingHero({ copy }: { copy: AuthCopy }) {
  const { reduceTransparency } = useGlassAccessibility()

  return (
    <View style={[styles.setupHero, styles.customerSetupHero, reduceTransparency ? styles.customerSetupHeroReduced : null]} testID="auth-client-onboarding-hero">
      <View style={styles.customerSetupHeroTop}>
        <KaelMascot size={82} state="understood" style={styles.customerSetupKael} testID="auth-client-onboarding-kael" />
        <View style={styles.titleStack}>
          <Text style={styles.customerSetupHeroTitle}>{copy.customerSetupWelcomeTitle}</Text>
          <Text style={styles.customerSetupHeroSubtitle}>{copy.customerSetupWelcomeSubtitle}</Text>
        </View>
      </View>
      <View style={styles.setupSteps}>
        <SetupStep active label={copy.customerSetupProfileStep} testID="auth-client-onboarding-step-profile" value={copy.customerSetupProfileStepMeta} />
        <SetupStep active label={copy.customerSetupContactStep} testID="auth-client-onboarding-step-contact" value={copy.customerSetupContactStepMeta} />
        <SetupStep label={copy.customerSetupAddressStep} testID="auth-client-onboarding-step-address" value={copy.customerSetupAddressStepMeta} />
      </View>
    </View>
  )
}

function SetupStep({ active = false, label, testID, value }: { active?: boolean; label: string; testID?: string; value: string }) {
  return (
    <View style={[styles.setupStep, active ? styles.setupStepActive : null]} testID={testID}>
      <Text style={styles.setupStepLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.setupStepValue} numberOfLines={1}>{value}</Text>
    </View>
  )
}

function AuthenticatedRoleActions({
  canOpenCustomer,
  canOpenWorker,
  copy,
  isAdmin,
  language,
  onOpenCustomer,
  onOpenWorker,
  onPreviewRole,
  onSignOut,
}: {
  canOpenCustomer: boolean
  canOpenWorker: boolean
  copy: (typeof authCopy)[AppLanguage]
  isAdmin: boolean
  language: AppLanguage
  onOpenCustomer: () => void
  onOpenWorker: () => void
  onPreviewRole: (role: AuthEntryRole) => void
  onSignOut: () => Promise<void>
}) {
  return (
      <View style={styles.roleGatewayGrid}>
      <ReduceMotionAwareEntranceView delayMs={105} distanceY={8} testID="auth-role-card-motion-customer">
        <RoleCard
          accessibilityLabel={copy.openRoleA11y(copy.roleCustomer)}
          description={copy.entryCustomer}
          disabled={!canOpenCustomer}
          icon="home"
          label={copy.roleCustomer}
          meta={language === 'en' ? ['Google', 'Phone'] : ['Google', 'Số điện thoại']}
          onPreview={() => onPreviewRole('customer')}
          onPress={onOpenCustomer}
          primary
          testID={isAdmin ? 'auth-login-admin-audit-customer' : 'auth-login-role-customer'}
        />
      </ReduceMotionAwareEntranceView>
      <ReduceMotionAwareEntranceView delayMs={160} distanceY={8} testID="auth-role-card-motion-worker">
        <RoleCard
          accessibilityLabel={copy.openRoleA11y(copy.roleWorker)}
          description={copy.entryWorker}
          disabled={!canOpenWorker}
          icon="tools"
          label={copy.roleWorker}
          meta={language === 'en' ? ['Worker account', 'Verification'] : ['Tài khoản thợ', 'Xác thực']}
          onPreview={() => onPreviewRole('worker')}
          onPress={onOpenWorker}
          testID={isAdmin ? 'auth-login-admin-audit-worker' : 'auth-login-role-worker'}
        />
      </ReduceMotionAwareEntranceView>
      {isAdmin ? <View style={styles.hiddenMarker} testID="auth-login-admin-audit" /> : null}
      <Pressable accessibilityLabel={copy.signOut} accessibilityRole="button" onPress={onSignOut} style={({ pressed }) => [styles.authSignOutAction, pressed ? styles.pressed : null]} testID="auth-login-sign-out">
        <Text style={styles.secondaryActionText}>{copy.signOut}</Text>
      </Pressable>
    </View>
  )
}

function WorkerCredentialPill({ icon, label, meta, variant = 'row' }: { icon: 'home' | 'phone' | 'shield' | 'tools'; label: string; meta: string; variant?: 'row' | 'upload' }) {
  const isUpload = variant === 'upload'
  return (
    <View style={isUpload ? styles.workerUploadTile : styles.workerCredentialPill}>
      <View style={isUpload ? styles.workerUploadIcon : null}>
        <AuthIcon name={icon} />
      </View>
      <View style={isUpload ? styles.workerUploadCopy : styles.workerCredentialCopy}>
        <Text style={isUpload ? styles.workerUploadLabel : styles.workerCredentialLabel} numberOfLines={isUpload ? 2 : 1}>{label}</Text>
        <Text style={isUpload ? styles.workerUploadMeta : styles.workerCredentialMeta} numberOfLines={isUpload ? 2 : 1}>{meta}</Text>
      </View>
    </View>
  )
}

function roleLabel(role: string | null, language: AppLanguage) {
  const statusCopy = authCopy[language].roleStatus
  if (role === 'admin') return statusCopy.admin
  if (role === 'worker') return statusCopy.worker
  if (role === 'customer') return statusCopy.customer
  return statusCopy.checking
}

function AuthFrame({ children, testID, topAligned = false }: { children: ReactNode; testID: string; topAligned?: boolean }) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const frameWidth = Math.min(width, 430)
  const contentWidth = Math.max(0, Math.min(frameWidth - 40, 350))
  const topPadding = topAligned ? Math.max(insets.top + 42, 56) : Math.max(insets.top, 8)

  return (
    <SafeAreaView style={styles.safe} testID={testID}>
      <View style={[styles.canvas, topAligned ? styles.canvasTop : null]}>
        <AmbientBackdrop />
        <View style={[styles.authFrameBody, topAligned ? styles.authFrameBodyScrollable : null, { width: contentWidth, paddingTop: topPadding, paddingBottom: insets.bottom + 18 }]}>
          {children}
        </View>
      </View>
    </SafeAreaView>
  )
}

function AmbientBackdrop() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 390 844" preserveAspectRatio="none">
      <Path d="M-18 152 C72 116 120 178 198 144 S318 80 418 126" stroke={authTokens.border} strokeWidth={5} opacity={0.36} fill="none" />
      <Path d="M32 320 C118 282 144 352 232 314 S332 250 420 292" stroke="rgba(17,24,23,0.10)" strokeWidth={3} opacity={0.26} fill="none" />
      <Path d="M-30 642 C64 600 122 668 198 622 S316 552 424 604" stroke={authTokens.line} strokeWidth={5} opacity={0.30} fill="none" />
      <Rect x={34} y={226} width={76} height={48} rx={16} fill={authTokens.mint} opacity={0.26} />
      <Rect x={248} y={146} width={92} height={56} rx={18} fill={authTokens.cyan} opacity={0.28} />
      <Rect x={218} y={652} width={104} height={64} rx={18} fill={authTokens.milk} opacity={0.54} />
    </Svg>
  )
}

function AuthTopRow({
  onBack,
  subtitle,
  title,
  trailing,
}: {
  onBack?: () => void
  subtitle: string
  title: string
  trailing?: ReactNode
}) {
  const { reduceTransparency } = useGlassAccessibility()
  const language = useAppLanguage()
  const backLabel = language === 'en' ? 'Back to role selection' : 'Quay lại chọn vai trò'

  return (
    <View style={styles.authTopRow}>
      <View style={styles.authTitleBlock}>
        <Text style={styles.authScreenTitle}>{title}</Text>
        <Text style={styles.authScreenSubtitle}>{subtitle}</Text>
      </View>
      {trailing ?? (
        <Pressable accessibilityLabel={backLabel} accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.roundBackButton, reduceTransparency ? styles.roundBackButtonReduced : null, pressed ? styles.pressed : null]} testID="auth-entry-role-change">
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path d="M15 18l-6-6 6-6" stroke={authTokens.primary} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>
      )}
    </View>
  )
}

function LoginHeroRole({ icon, lockLabel, title }: { icon: 'home' | 'tools'; lockLabel: string; title: string }) {
  const { reduceTransparency } = useGlassAccessibility()

  return (
    <View style={[styles.loginHeroRole, reduceTransparency ? styles.loginHeroRoleReduced : null]}>
      <View style={[styles.roleIcon, styles.roleIconHero]}>
        <AuthIcon name={icon} inverse />
      </View>
      <View style={styles.titleStack}>
        <Text style={styles.loginHeroTitle}>{title}</Text>
        <Text style={styles.roleLock}>{lockLabel}</Text>
      </View>
    </View>
  )
}

function RoleGatewayHero({ choice, copy }: { choice: AuthEntryRole | null; copy: (typeof authCopy)[AppLanguage] }) {
  const { reduceTransparency } = useGlassAccessibility()

  return (
    <ReduceMotionAwareEntranceView delayMs={45} distanceY={8} style={[styles.roleGatewayHero, reduceTransparency ? styles.roleGatewayHeroReduced : null]} testID="auth-role-gateway-hero-motion">
      {!reduceTransparency ? (
        <>
          <View pointerEvents="none" style={styles.roleGatewayHeroTint} />
          <View pointerEvents="none" style={styles.roleGatewayHeroSheen} />
          <View pointerEvents="none" style={styles.roleGatewayHeroDivider} />
        </>
      ) : null}
      <View style={styles.roleGatewayTop}>
        <Text style={[styles.roleGatewayBadge, reduceTransparency ? styles.roleGatewayBadgeReduced : null]}>{NESTSCOUT_BRAND.appName}</Text>
      </View>
      <View style={styles.roleGatewayGlassLine}>
        <Text style={styles.roleGatewayTitle}>{copy.titleLogin}</Text>
        <View style={[styles.roleGatewayKael, reduceTransparency ? styles.roleGatewayKaelReduced : null]}>
          <Image contentFit="contain" source={kaelModel8AHead} style={styles.roleGatewayKaelImage as ImageStyle} />
        </View>
      </View>
      <ReduceMotionAwareEntranceView delayMs={130} distanceY={4} testID="roleGatewaySignature">
        <RoleGatewaySignatureEffects choice={choice} reduceTransparency={reduceTransparency}>
          <View style={[styles.signatureRail, reduceTransparency ? styles.signatureRailReduced : null]} testID="signatureRail" />
          <Text style={styles.roleGatewaySignatureText}>{copy.signature}</Text>
        </RoleGatewaySignatureEffects>
      </ReduceMotionAwareEntranceView>
    </ReduceMotionAwareEntranceView>
  )
}

function RoleGatewaySignatureEffects({ children, choice, reduceTransparency }: { children: ReactNode; choice: AuthEntryRole | null; reduceTransparency: boolean }) {
  const { reduceMotion } = useGlassAccessibility()
  const signatureChoicePulse = useSharedValue(1)
  const signatureSheenOpacity = useSharedValue(reduceMotion ? 0 : 0)
  const signatureSheenX = useSharedValue(reduceMotion ? 0 : -160)
  const signatureIdleOpacity = useSharedValue(reduceMotion ? 0.12 : 0)
  const signatureIdleX = useSharedValue(reduceMotion ? 0 : -48)
  const signatureIdleScaleX = useSharedValue(reduceMotion ? 1 : 0.88)

  useEffect(() => {
    if (reduceMotion) {
      signatureChoicePulse.value = 1
      signatureSheenOpacity.value = 0
      signatureSheenX.value = 0
      signatureIdleOpacity.value = reduceTransparency ? 0 : 0.12
      signatureIdleX.value = 0
      signatureIdleScaleX.value = 1
      return
    }

    signatureChoicePulse.value = 1
    signatureSheenOpacity.value = 0
    signatureSheenX.value = -160
    signatureIdleOpacity.value = 0
    signatureIdleX.value = choice === 'worker' ? 190 : -48
    signatureIdleScaleX.value = 0.88
    signatureChoicePulse.value = withSequence(
      withTiming(0.993, { duration: 170 }),
      withSpring(1, { damping: 18, stiffness: 150 }),
    )
    signatureSheenOpacity.value = withDelay(70, withSequence(
      withTiming(0.58, { duration: 150 }),
      withTiming(0, { duration: 610 }),
    ))
    signatureSheenX.value = withDelay(70, withTiming(160, { duration: 760 }))
    const targetX = choice === 'worker' ? 46 : choice === 'customer' ? 205 : 260
    signatureIdleOpacity.value = withDelay(120, withSequence(
      withTiming(reduceTransparency ? 0 : 0.28, { duration: 220 }),
      withTiming(reduceTransparency ? 0 : 0.08, { duration: choice ? 700 : 2380 }),
      withTiming(0, { duration: 180 }),
    ))
    signatureIdleX.value = withDelay(120, withTiming(targetX, { duration: choice ? 920 : 2600 }))
    signatureIdleScaleX.value = withDelay(120, withTiming(choice ? 1.06 : 1.12, { duration: choice ? 920 : 2600 }))

    return () => {
      cancelAnimation(signatureChoicePulse)
      cancelAnimation(signatureSheenOpacity)
      cancelAnimation(signatureSheenX)
      cancelAnimation(signatureIdleOpacity)
      cancelAnimation(signatureIdleX)
      cancelAnimation(signatureIdleScaleX)
    }
  }, [choice, reduceMotion, reduceTransparency, signatureChoicePulse, signatureIdleOpacity, signatureIdleScaleX, signatureIdleX, signatureSheenOpacity, signatureSheenX])

  const shellStyle = useAnimatedStyle(() => ({
    transform: [{ scale: signatureChoicePulse.value }],
  }), [signatureChoicePulse])

  const sheenStyle = useAnimatedStyle(() => ({
    opacity: signatureSheenOpacity.value,
    transform: [{ translateX: signatureSheenX.value }, { skewX: '-10deg' }],
  }), [signatureSheenOpacity, signatureSheenX])

  const liquidStyle = useAnimatedStyle(() => ({
    opacity: signatureIdleOpacity.value,
    transform: [{ translateX: signatureIdleX.value }, { skewX: choice === 'worker' ? '10deg' : '-10deg' }, { scaleX: signatureIdleScaleX.value }],
  }), [choice, signatureIdleOpacity, signatureIdleScaleX, signatureIdleX])

  return (
    <Animated.View
      style={[styles.roleGatewaySignature, reduceTransparency ? styles.roleGatewaySignatureReduced : null, shellStyle]}
      testID="signatureChoicePulse"
    >
      {children}
      {!reduceTransparency ? (
        <>
          <Animated.View pointerEvents="none" style={[styles.signatureSheen, sheenStyle]} testID="signatureSheenLight" />
          <Animated.View pointerEvents="none" style={[styles.signatureLiquid, liquidStyle]} testID="signatureIdleLiquid" />
          <SignatureLiquidLight reduceTransparency={reduceTransparency} />
        </>
      ) : null}
    </Animated.View>
  )
}

function SignatureLiquidLight({ reduceTransparency }: { reduceTransparency: boolean }) {
  if (reduceTransparency) return null
  return <View style={styles.hiddenMarker} testID="signatureLiquidLight" />
}

function RoleCard({
  accessibilityLabel,
  description,
  disabled = false,
  icon,
  label,
  meta = EMPTY_AUTH_META,
  onPreview,
  onPress,
  primary = false,
  testID,
}: {
  accessibilityLabel: string
  description: string
  disabled?: boolean
  icon: 'home' | 'tools'
  label: string
  meta?: string[]
  onPreview?: () => void
  onPress: () => void
  primary?: boolean
  testID: string
}) {
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const pressProgress = useSharedValue(0)
  const roleCardPressScale = disabled ? 1 : 0.985
  const roleArrowPressTravel = primary ? 2.4 : 1.8
  const roleIconSource = icon === 'home' ? roleGateImageIcons.customer : roleGateImageIcons.worker

  const cardMotionStyle = useAnimatedStyle(() => {
    if (reduceMotion) return {}
    return {
      transform: [
        { translateY: pressProgress.value },
        { scale: 1 - ((1 - roleCardPressScale) * pressProgress.value) },
      ],
    }
  }, [pressProgress, reduceMotion, roleCardPressScale])

  const arrowMotionStyle = useAnimatedStyle(() => {
    if (reduceMotion) return {}
    return {
      transform: [
        { translateX: pressProgress.value * roleArrowPressTravel },
        { scale: 1 + (pressProgress.value * 0.04) },
      ],
    }
  }, [pressProgress, reduceMotion, roleArrowPressTravel])

  const setPressed = (pressed: boolean) => {
    if (disabled || reduceMotion) return
    pressProgress.value = withTiming(pressed ? 1 : 0, { duration: pressed ? 120 : 150 })
  }

  return (
    <Animated.View style={[styles.motionPressShell, cardMotionStyle]} testID={primary ? 'roleCardPressScale' : undefined}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPressIn={() => {
          onPreview?.()
          setPressed(true)
        }}
        onPressOut={() => setPressed(false)}
        onPress={onPress}
        style={({ pressed }) => [styles.roleCard, glassSurface('raised', reduceTransparency), primary ? styles.roleCardPrimary : styles.roleCardSecondary, disabled ? styles.disabled : null, pressed ? styles.pressed : null]}
        testID={testID}
      >
        {!reduceTransparency ? <View pointerEvents="none" style={[styles.roleCardGlow, primary ? styles.roleCardGlowPrimary : styles.roleCardGlowWorker]} /> : null}
        <View style={[styles.roleIcon, primary ? styles.roleIconCustomer : styles.roleIconWorker]}>
          <Image contentFit="contain" source={roleIconSource} style={styles.roleIconImage as ImageStyle} />
        </View>
        <View style={styles.titleStack}>
          <Text style={styles.roleTitle}>{label}</Text>
          <Text style={styles.body} numberOfLines={2}>
            {description}
          </Text>
          {meta.length > 0 ? (
            <View style={styles.roleMetaRow}>
              {meta.map((item) => (
                <Text key={item} style={styles.roleMetaPill} numberOfLines={1}>
                  {item}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
        <Animated.View style={[styles.roleArrowBox, primary ? styles.roleArrowBoxPrimary : null, arrowMotionStyle]} testID="roleArrowPressTravel">
          <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
            <Path d="m7 4.5 4.5 4.5L7 13.5" stroke={primary ? '#FFFFFF' : authTokens.primary} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

function AuthMotionPressable({
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  children,
  disabled,
  motionTestID,
  onPress,
  style,
  testID,
}: {
  accessibilityLabel: string
  accessibilityRole: 'button'
  accessibilityState?: { disabled?: boolean }
  children: ReactNode
  disabled?: boolean
  motionTestID?: string
  onPress: () => void
  style: (state: { pressed: boolean }) => any
  testID: string
}) {
  const { reduceMotion } = useGlassAccessibility()
  const pressProgress = useSharedValue(0)
  const authOptionPressScale = 0.985

  const motionStyle = useAnimatedStyle(() => {
    if (reduceMotion) return {}
    return {
      transform: [{ scale: 1 - ((1 - authOptionPressScale) * pressProgress.value) }],
    }
  }, [authOptionPressScale, pressProgress, reduceMotion])

  const updatePress = (pressed: boolean) => {
    if (disabled || reduceMotion) return
    pressProgress.value = withTiming(pressed ? 1 : 0, { duration: pressed ? 120 : 150 })
  }

  return (
    <Animated.View style={[styles.motionPressShell, motionStyle]} testID={motionTestID}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityRole}
        accessibilityState={accessibilityState}
        disabled={disabled}
        onPressIn={() => updatePress(true)}
        onPressOut={() => updatePress(false)}
        onPress={onPress}
        style={style}
        testID={testID}
      >
        {children}
      </Pressable>
    </Animated.View>
  )
}

function AuthInputField({
  actionLabel,
  children,
  icon,
  label,
  onAction,
  variant = 'default',
}: {
  actionLabel?: string
  children: ReactNode
  icon: 'email' | 'home' | 'lock' | 'map' | 'phone'
  label: string
  onAction?: () => void
  variant?: 'default' | 'customerSetup'
}) {
  const isCustomerSetup = variant === 'customerSetup'

  return (
    <View style={[styles.fieldShell, isCustomerSetup ? styles.customerSetupFieldShell : null]}>
      <View style={[styles.fieldIcon, isCustomerSetup ? styles.customerSetupFieldIcon : null]}>
        <AuthIcon name={icon} />
      </View>
      <View style={styles.fieldCopy}>
        <Text style={[styles.fieldLabel, isCustomerSetup ? styles.customerSetupFieldLabel : null]}>{label}</Text>
        {children}
      </View>
      {actionLabel && onAction ? (
        <Pressable accessibilityLabel={actionLabel} accessibilityRole="button" onPress={onAction} style={({ pressed }) => [styles.fieldActionButton, pressed ? styles.pressed : null]}>
          <AuthIcon name="eye" />
        </Pressable>
      ) : null}
    </View>
  )
}

function GoogleMark() {
  return (
    <View style={styles.googleMark}>
      <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
        <Path d="M16.7 9.2c0-.6-.1-1.1-.2-1.6H9v3.1h4.3c-.2 1-.8 1.9-1.6 2.4v2h2.6c1.5-1.4 2.4-3.4 2.4-5.9Z" fill="#4285F4" />
        <Path d="M9 17c2.2 0 4-.7 5.3-1.9l-2.6-2c-.7.5-1.6.8-2.7.8-2.1 0-3.9-1.4-4.5-3.3H1.8v2.1C3.1 15.2 5.8 17 9 17Z" fill="#34A853" />
        <Path d="M4.5 10.6c-.2-.5-.3-1-.3-1.6s.1-1.1.3-1.6V5.3H1.8C1.3 6.4 1 7.6 1 9s.3 2.6.8 3.7l2.7-2.1Z" fill="#FBBC05" />
        <Path d="M9 4.1c1.2 0 2.3.4 3.1 1.2l2.3-2.3C13 1.7 11.2 1 9 1 5.8 1 3.1 2.8 1.8 5.3l2.7 2.1C5.1 5.5 6.9 4.1 9 4.1Z" fill="#EA4335" />
      </Svg>
    </View>
  )
}

function AuthIcon({ inverse = false, name }: { inverse?: boolean; name: 'email' | 'eye' | 'home' | 'lock' | 'map' | 'phone' | 'shield' | 'tools' }) {
  const color = inverse ? authTokens.raised : authTokens.primary
  const accent = inverse ? 'rgba(255,255,255,0.84)' : authTokens.copper

  return (
    <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
      {name === 'email' ? (
        <>
          <Rect x={4.8} y={7} width={15.4} height={11} rx={3} stroke={color} strokeWidth={2} />
          <Path d="m6.2 9.2 6.3 4.6 6.3-4.6" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      {name === 'home' ? (
        <>
          <Path d="M5.5 12.2 12.5 6l7 6.2v7.2H5.5v-7.2Z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M10.2 19.4v-4.2h4.6v4.2" stroke={accent} strokeWidth={2} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'eye' ? (
        <>
          <Path d="M3.8 12.5s3.1-5.2 8.7-5.2 8.7 5.2 8.7 5.2-3.1 5.2-8.7 5.2-8.7-5.2-8.7-5.2Z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M10.5 12.5a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" stroke={accent} strokeWidth={2} />
        </>
      ) : null}
      {name === 'tools' ? (
        <>
          <Path d="M7.2 17.8 17.8 7.2M15.8 5.8l3.4 3.4M5.8 15.8l3.4 3.4" stroke={color} strokeWidth={2} strokeLinecap="round" />
          <Rect x={6.2} y={5.8} width={4.2} height={4.2} rx={1.2} stroke={accent} strokeWidth={2} />
        </>
      ) : null}
      {name === 'lock' ? (
        <>
          <Rect x={6.6} y={11} width={11.8} height={8.2} rx={2.4} stroke={color} strokeWidth={2} />
          <Path d="M9.2 11V8.8a3.3 3.3 0 0 1 6.6 0V11" stroke={accent} strokeWidth={2} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'phone' ? (
        <>
          <Path d="M8.4 5.8h8.2c1 0 1.8.8 1.8 1.8v9.8c0 1-.8 1.8-1.8 1.8H8.4c-1 0-1.8-.8-1.8-1.8V7.6c0-1 .8-1.8 1.8-1.8Z" stroke={color} strokeWidth={2} />
          <Path d="M11.2 8.8h2.6M11 16.6h3" stroke={accent} strokeWidth={2} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'map' ? (
        <>
          <Path d="M12.5 20.4s6-4.5 6-10a6 6 0 0 0-12 0c0 5.5 6 10 6 10Z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M10.4 10.4a2.1 2.1 0 1 0 4.2 0 2.1 2.1 0 0 0-4.2 0Z" stroke={accent} strokeWidth={2} />
        </>
      ) : null}
      {name === 'shield' ? (
        <>
          <Path d="M12.5 4.6 18.4 7v5.4c0 3.4-2.1 5.8-5.9 7.2-3.8-1.4-5.9-3.8-5.9-7.2V7l5.9-2.4Z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        </>
      ) : null}
    </Svg>
  )
}

function glassSurface(tone: 'cream' | 'cyan' | 'glass' | 'mint' | 'raised', reduceTransparency = false) {
  const backgroundColor = {
    cream: authTokens.cream,
    cyan: authTokens.cyan,
    glass: reduceTransparency ? '#FFFDF8' : authTokens.glass,
    mint: authTokens.mint,
    raised: reduceTransparency ? authTokens.raised : 'rgba(255,255,255,0.88)',
  }[tone]

  return {
    backgroundColor,
    borderColor: reduceTransparency ? authTokens.border : 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tone === 'glass' || tone === 'raised' ? authTokens.shadow : authTokens.softShadow,
  }
}

const styles = StyleSheet.create({
  safe: { backgroundColor: authTokens.canvas, flex: 1, width: '100%' },
  canvas: { alignItems: 'center', backgroundColor: authTokens.canvas, flex: 1, justifyContent: 'center', overflow: 'hidden', width: '100%' },
  canvasTop: { justifyContent: 'flex-start' },
  authFrameBody: { alignSelf: 'center' },
  authFrameBodyScrollable: { flex: 1 },
  authScroll: { width: '100%' },
  authScrollScrollable: { flex: 1 },
  authContent: { alignItems: 'stretch', gap: 16, minHeight: '100%', paddingVertical: 18, width: '100%' },
  authContentScrollable: { flexGrow: 1, paddingBottom: 26 },
  formStack: { gap: 10 },
  loginHeader: { gap: 7 },
  welcomeShell: { alignItems: 'center', alignSelf: 'center', backgroundColor: 'rgba(255,255,252,0.94)', borderColor: 'rgba(132,230,210,0.34)', borderRadius: 34, borderWidth: 1, boxShadow: '0 24px 52px rgba(13,24,22,0.12), inset 0 1px 0 rgba(255,255,255,0.98)', gap: 16, maxWidth: 350, minHeight: 520, overflow: 'hidden', padding: 18, position: 'relative', width: '100%' },
  welcomeShellReduced: { backgroundColor: authTokens.milk, borderColor: authTokens.border, boxShadow: 'none' },
  welcomeMintAura: { backgroundColor: 'rgba(183,255,240,0.28)', borderRadius: 999, height: 210, position: 'absolute', right: -74, top: -56, width: 210 },
  welcomeSoftLine: { backgroundColor: 'rgba(17,24,23,0.08)', height: 1, left: 22, position: 'absolute', right: 22, top: 76 },
  welcomeBrandRow: { alignItems: 'center', alignSelf: 'stretch', flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 46, zIndex: 1 },
  welcomeBrandMark: { alignItems: 'center', backgroundColor: authTokens.primary, borderColor: 'rgba(255,255,255,0.74)', borderRadius: 16, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  welcomeBrandMarkText: { color: authTokens.raised, fontSize: 23, fontWeight: '900', lineHeight: 27 },
  welcomeBrandText: { color: authTokens.cookie, fontSize: 19, fontWeight: '900', letterSpacing: 0, lineHeight: 24 },
  welcomeMascot: { marginTop: 8 },
  welcomeCopy: { alignItems: 'center', gap: 8, zIndex: 1 },
  welcomeTitle: { color: authTokens.cookie, fontSize: 25, fontWeight: '900', letterSpacing: 0, lineHeight: 31, textAlign: 'center' },
  welcomeSubtitle: { color: authTokens.cookieSoft, fontSize: 14, fontWeight: '700', lineHeight: 20, maxWidth: 286, opacity: 0.84, textAlign: 'center' },
  welcomeTrust: { backgroundColor: authTokens.mint, borderColor: authTokens.border, borderRadius: 999, borderWidth: 1, color: authTokens.primary, fontSize: 11, fontWeight: '900', lineHeight: 15, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 7, textAlign: 'center' },
  welcomeButton: { alignSelf: 'stretch', marginTop: 6, zIndex: 1 },
  authFlowShell: { alignSelf: 'center', gap: 14, maxWidth: 350, width: '100%' },
  authTopRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  authTitleBlock: { flex: 1, minWidth: 0 },
  authScreenTitle: { color: authTokens.cookie, fontSize: 25, fontWeight: '800', letterSpacing: 0, lineHeight: 29 },
  authScreenSubtitle: { color: authTokens.cookieSoft, fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: 4, opacity: 0.78 },
  topKaelFace: { alignItems: 'center', backgroundColor: 'rgba(255,253,248,0.92)', borderColor: 'rgba(132,230,210,0.34)', borderRadius: 22, borderWidth: 1, boxShadow: '0 12px 24px rgba(13,24,22,0.09), inset 0 1px 0 rgba(255,255,255,0.96)', height: 54, justifyContent: 'center', overflow: 'hidden', width: 54 },
  topKaelFaceReduced: { backgroundColor: authTokens.milk, borderColor: authTokens.border, boxShadow: 'none' },
  topKaelImage: { height: 60, transform: [{ translateY: 4 }], width: 60 },
  roundBackButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.86)', borderColor: authTokens.border, borderRadius: 18, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  roundBackButtonReduced: { backgroundColor: '#FFFFFF', boxShadow: 'none' },
  kicker: { color: authTokens.primary, fontSize: 12, fontWeight: '700', letterSpacing: 0 },
  title: { color: authTokens.ink, fontSize: 24, fontWeight: '700', letterSpacing: 0, lineHeight: 30 },
  body: { color: authTokens.muted, fontSize: 14, fontWeight: '500', lineHeight: 20 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: authTokens.border,
    borderRadius: 20,
    borderWidth: 1,
    color: authTokens.ink,
    fontSize: 15,
    fontWeight: '600',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  errorText: { color: '#B64B40', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  primaryButton: { alignItems: 'center', backgroundColor: authTokens.primary, borderRadius: 20, boxShadow: '0 14px 25px rgba(9,121,106,0.22)', justifyContent: 'center', minHeight: 52 },
  primaryButtonText: { color: authTokens.raised, fontSize: 15, fontWeight: '700' },
  secondaryAction: { alignItems: 'center', minHeight: 42, justifyContent: 'center' },
  secondaryActionText: { color: authTokens.primary, fontSize: 14, fontWeight: '700' },
  authSignOutAction: { alignItems: 'center', alignSelf: 'center', borderRadius: 999, justifyContent: 'center', marginTop: 3, minHeight: 38, paddingHorizontal: 20 },
  roleGateShell: { alignSelf: 'center', borderRadius: 34, gap: 14, maxWidth: 350, overflow: 'hidden', padding: 14, paddingTop: 16, width: '100%' },
  roleGateShellPrototype: { backgroundColor: 'rgba(255,253,248,0.92)', borderColor: 'rgba(188,239,228,0.78)', boxShadow: '0 24px 52px rgba(13,24,22,0.12), inset 0 1px 0 rgba(255,255,255,0.98)' },
  roleGateShellReduced: { backgroundColor: authTokens.milk, borderColor: authTokens.border, boxShadow: 'none' },
  roleGatewayHero: { backgroundColor: 'rgba(255,255,252,0.94)', borderColor: 'rgba(132,230,210,0.34)', borderRadius: 32, borderWidth: 1, boxShadow: '0 24px 46px rgba(13,24,22,0.12), inset 0 1px 0 rgba(255,255,255,0.96)', gap: 13, marginTop: 10, overflow: 'hidden', padding: 16, position: 'relative', experimental_backgroundImage: 'linear-gradient(142deg, rgba(255,255,252,0.98) 0%, rgba(249,255,252,0.95) 48%, rgba(218,255,247,0.76) 100%)' } as any,
  roleGatewayHeroReduced: { backgroundColor: authTokens.milk, borderColor: authTokens.border, boxShadow: 'none' },
  roleGatewayHeroTint: { backgroundColor: 'rgba(183,255,240,0.44)', borderBottomLeftRadius: 30, bottom: 0, position: 'absolute', right: 0, top: 0, width: 118 },
  roleGatewayHeroSheen: { backgroundColor: 'rgba(255,255,255,0.58)', height: 92, left: -26, position: 'absolute', top: 62, transform: [{ rotate: '-18deg' }], width: 230 },
  roleGatewayHeroDivider: { backgroundColor: 'rgba(17,24,23,0.08)', height: 1, left: 16, position: 'absolute', right: 16, top: 58 },
  roleGatewayTop: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'flex-start', zIndex: 1 },
  roleGatewayBadge: { backgroundColor: 'rgba(255,255,255,0.90)', borderColor: 'rgba(17,24,23,0.10)', borderRadius: 999, borderWidth: 1, boxShadow: '0 8px 16px rgba(13,24,22,0.05)', color: authTokens.primary, fontSize: 11, fontWeight: '800', lineHeight: 15, minHeight: 32, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 7 },
  roleGatewayBadgeReduced: { backgroundColor: '#FFFFFF', borderColor: authTokens.border },
  roleGatewayGlassLine: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', minHeight: 92, paddingBottom: 10, paddingRight: 8, paddingTop: 11, zIndex: 1 },
  roleGatewayTitle: { color: authTokens.cookie, flex: 1, fontSize: 24, fontWeight: '800', letterSpacing: 0, lineHeight: 27, maxWidth: 214 },
  roleGatewayKael: { alignItems: 'center', backgroundColor: 'rgba(255,253,248,0.90)', borderColor: 'rgba(255,255,255,0.96)', borderRadius: 24, borderWidth: 1, boxShadow: '0 12px 24px rgba(13,24,22,0.09), inset 0 1px 0 rgba(255,255,255,0.94)', height: 66, justifyContent: 'center', overflow: 'hidden', width: 66 },
  roleGatewayKaelReduced: { backgroundColor: authTokens.milk, borderColor: authTokens.border, boxShadow: 'none' },
  roleGatewayKaelImage: { height: 74, transform: [{ translateY: 5 }], width: 74 },
  roleGatewaySignature: { alignItems: 'center', backgroundColor: 'rgba(255,255,252,0.74)', borderColor: 'rgba(17,24,23,0.08)', borderRadius: 24, borderWidth: 1, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.88), 0 8px 18px rgba(13,24,22,0.05)', flexDirection: 'row', gap: 11, minHeight: 58, overflow: 'hidden', paddingHorizontal: 13, paddingVertical: 11, position: 'relative', zIndex: 1 },
  roleGatewaySignatureReduced: { backgroundColor: authTokens.milk, borderColor: authTokens.border },
  roleGatewaySignatureText: { color: authTokens.cookieSoft, flex: 1, fontSize: 13.8, fontWeight: '800', lineHeight: 18 },
  signatureRail: { backgroundColor: '#078E7F', borderRadius: 999, boxShadow: '0 0 18px rgba(50,218,190,0.42)', height: 34, width: 7 },
  signatureRailReduced: { boxShadow: 'none' },
  signatureSheen: { backgroundColor: 'rgba(255,255,255,0.72)', bottom: -16, left: -28, position: 'absolute', top: -16, width: 42 },
  signatureLiquid: { backgroundColor: 'rgba(116,255,223,0.20)', borderRadius: 999, height: 60, left: -24, position: 'absolute', top: -12, width: 120 },
  roleGatewayGrid: { gap: 13, marginTop: 15 },
  motionPressShell: { alignSelf: 'stretch' },
  roleCard: { alignItems: 'center', alignSelf: 'stretch', borderRadius: 30, flexDirection: 'row', gap: 13, minHeight: 110, overflow: 'hidden', padding: 16, position: 'relative' },
  roleCardPrimary: { backgroundColor: 'rgba(255,255,252,0.96)', borderColor: 'rgba(132,230,210,0.48)', boxShadow: '0 16px 30px rgba(13,24,22,0.08), inset 0 1px 0 rgba(255,255,255,0.96)', experimental_backgroundImage: 'linear-gradient(112deg, rgba(255,255,252,0.98) 0%, rgba(247,255,252,0.96) 54%, rgba(184,255,240,0.66) 100%)' } as any,
  roleCardSecondary: { backgroundColor: 'rgba(255,255,252,0.96)', borderColor: 'rgba(17,24,23,0.10)', boxShadow: '0 14px 26px rgba(13,24,22,0.06), inset 0 1px 0 rgba(255,255,255,0.96)', experimental_backgroundImage: 'linear-gradient(112deg, rgba(255,255,252,0.98) 0%, rgba(255,253,248,0.96) 58%, rgba(255,243,224,0.62) 100%)' } as any,
  roleCardGlow: { borderRadius: 999, bottom: -20, height: 102, position: 'absolute', right: -30, width: 150 },
  roleCardGlowPrimary: { backgroundColor: 'rgba(103,255,225,0.30)' },
  roleCardGlowWorker: { backgroundColor: 'rgba(255,232,193,0.32)' },
  roleIcon: { alignItems: 'center', borderRadius: 22, height: 54, justifyContent: 'center', width: 54 },
  roleIconCustomer: { backgroundColor: 'rgba(236,255,250,0.92)', borderColor: 'rgba(17,24,23,0.08)', borderWidth: 1 },
  roleIconHero: { backgroundColor: authTokens.primary, borderColor: 'rgba(255,255,255,0.54)', borderWidth: 1, boxShadow: '0 12px 22px rgba(10,119,105,0.20)', experimental_backgroundImage: `linear-gradient(135deg, ${color.brand.primaryDark}, ${color.mint.mint500})` } as any,
  roleIconImage: { height: 58, width: 58 },
  roleIconWorker: { backgroundColor: 'rgba(255,248,236,0.94)', borderColor: 'rgba(17,24,23,0.08)', borderWidth: 1 },
  titleStack: { flex: 1, gap: 5 },
  roleTitle: { color: authTokens.cookie, fontSize: 19, fontWeight: '800' },
  roleMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  roleMetaPill: { backgroundColor: 'rgba(255,255,255,0.86)', borderColor: 'rgba(8,124,114,0.18)', borderRadius: 999, borderWidth: 1, color: authTokens.primary, fontSize: 10, fontWeight: '800', maxWidth: 120, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5 },
  roleArrow: { color: authTokens.primary, fontSize: 32, fontWeight: '700' },
  roleArrowBox: { alignItems: 'center', backgroundColor: 'rgba(255,255,252,0.92)', borderColor: 'rgba(17,24,23,0.12)', borderRadius: 18, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  roleArrowBoxPrimary: { backgroundColor: authTokens.cookie, borderColor: 'rgba(255,255,255,0.82)', boxShadow: '0 12px 24px rgba(13,24,22,0.22)' },
  loginHeroRole: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.84)', borderColor: 'rgba(15,118,104,0.16)', borderRadius: 28, borderWidth: 1, boxShadow: authTokens.softShadow, flexDirection: 'row', gap: 14, marginTop: 4, minHeight: 86, padding: 16 },
  loginHeroRoleReduced: { backgroundColor: '#FFFFFF', borderColor: authTokens.border, boxShadow: 'none' },
  loginHeroTitle: { color: authTokens.ink, fontSize: 19, fontWeight: '700', lineHeight: 22 },
  roleLock: { alignSelf: 'flex-start', backgroundColor: 'rgba(217,255,246,0.82)', borderColor: 'rgba(13,134,119,0.14)', borderRadius: 999, borderWidth: 1, color: authTokens.primary, fontSize: 10, fontWeight: '800', marginTop: 2, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6 },
  roleLockCream: { backgroundColor: 'rgba(255,244,219,0.88)', borderColor: 'rgba(187,116,61,0.16)', color: '#7B552D' },
  loginForm: { backgroundColor: 'rgba(242,255,251,0.90)', borderColor: 'rgba(20,117,105,0.18)', borderRadius: 30, borderWidth: 1, boxShadow: '0 18px 38px rgba(17,70,61,0.11), inset 0 1px 0 rgba(255,255,255,0.92)', gap: 10, marginTop: 2, overflow: 'hidden', padding: 16, position: 'relative' },
  loginFormReduced: { backgroundColor: '#F2FFFB', borderColor: authTokens.border, boxShadow: 'none' },
  loginFormGlow: { backgroundColor: 'rgba(206,255,244,0.34)', borderRadius: 999, height: 104, position: 'absolute', right: -40, top: -38, width: 136 },
  setupHero: { backgroundColor: 'rgba(235,255,250,0.82)', borderColor: 'rgba(255,255,255,0.82)', borderRadius: 30, borderWidth: 1, boxShadow: authTokens.softShadow, gap: 13, overflow: 'hidden', padding: 15 },
  setupHeroTop: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  customerSetupHero: { backgroundColor: 'rgba(241,255,251,0.90)', borderColor: 'rgba(132,230,210,0.30)', boxShadow: '0 16px 32px rgba(17,70,61,0.09), inset 0 1px 0 rgba(255,255,255,0.94)' },
  customerSetupHeroReduced: { backgroundColor: authTokens.milk, borderColor: authTokens.border, boxShadow: 'none' },
  customerSetupHeroTop: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  customerSetupKael: { marginLeft: -3 },
  customerSetupHeroTitle: { color: authTokens.cookie, fontSize: 20, fontWeight: '900', letterSpacing: 0, lineHeight: 24 },
  customerSetupHeroSubtitle: { color: authTokens.cookieSoft, fontSize: 12.5, fontWeight: '700', lineHeight: 17 },
  setupSteps: { flexDirection: 'row', gap: 8 },
  setupStep: { backgroundColor: 'rgba(255,255,255,0.78)', borderColor: authTokens.border, borderRadius: 18, borderWidth: 1, flex: 1, gap: 2, minHeight: 62, paddingHorizontal: 9, paddingVertical: 9 },
  setupStepActive: { backgroundColor: authTokens.mint },
  setupStepLabel: { color: authTokens.primary, fontSize: 11, fontWeight: '800', lineHeight: 14 },
  setupStepValue: { color: authTokens.muted, fontSize: 10.5, fontWeight: '700', lineHeight: 13 },
  setupForm: { marginTop: 0 },
  customerSetupForm: {
    backgroundColor: 'rgba(246,255,252,0.96)',
    borderColor: 'rgba(99,220,199,0.52)',
    borderRadius: 30,
    boxShadow: '0 22px 44px rgba(17,70,61,0.12), inset 0 1px 0 rgba(255,255,255,0.98)',
    gap: 12,
    padding: 16,
    experimental_backgroundImage: 'linear-gradient(152deg, rgba(255,255,255,0.97) 0%, rgba(230,255,249,0.86) 48%, rgba(255,247,232,0.78) 100%)',
  } as any,
  customerSetupCoolGlow: { backgroundColor: 'rgba(123,255,226,0.30)', borderRadius: 999, height: 108, position: 'absolute', right: -44, top: -36, width: 150 },
  customerSetupWarmGlow: { backgroundColor: 'rgba(255,233,198,0.32)', borderRadius: 999, bottom: -46, height: 112, position: 'absolute', right: -18, width: 132 },
  customerSetupFieldShell: { backgroundColor: 'rgba(255,255,255,0.93)', borderColor: 'rgba(12,134,119,0.20)', borderRadius: 22, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.96), 0 8px 18px rgba(17,70,61,0.045)', minHeight: 58, paddingHorizontal: 14, zIndex: 1 },
  customerSetupFieldIcon: { backgroundColor: 'rgba(195,250,238,0.98)', borderColor: 'rgba(13,134,119,0.16)', borderRadius: 16, height: 42, width: 42 },
  customerSetupFieldLabel: { color: color.brand.primaryDark, fontSize: 10.5, lineHeight: 13 },
  customerSetupPrimaryButton: { borderRadius: 22, boxShadow: '0 15px 28px rgba(8,120,110,0.22)', marginTop: 2, minHeight: 52, zIndex: 1 },
  customerSetupSecondaryButton: { backgroundColor: 'rgba(255,255,255,0.86)', borderColor: 'rgba(20,117,105,0.18)', borderRadius: 22, minHeight: 50, zIndex: 1 },
  loginMode: { alignItems: 'center', backgroundColor: 'rgba(215,255,246,0.96)', borderColor: 'rgba(13,134,119,0.18)', borderRadius: 21, borderWidth: 1, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.88)', justifyContent: 'center', minHeight: 42, paddingHorizontal: 14, zIndex: 1 },
  loginModeText: { color: authTokens.primary, fontSize: 13, fontWeight: '900' },
  workerCreateBoundaryNote: { backgroundColor: 'rgba(255,250,241,0.88)', borderColor: 'rgba(202,132,65,0.22)', borderRadius: 20, borderWidth: 1, gap: 5, paddingHorizontal: 12, paddingVertical: 11 },
  workerCreateBoundaryTitle: { color: authTokens.copper, fontSize: 12.5, fontWeight: '900', lineHeight: 16 },
  workerCreateBoundaryBody: { color: authTokens.cookieSoft, fontSize: 11.5, fontWeight: '700', lineHeight: 16 },
  authChoiceList: { gap: 10, zIndex: 1 },
  googleButton: { alignItems: 'center', backgroundColor: 'rgba(245,255,252,0.98)', borderColor: 'rgba(13,134,119,0.20)', borderRadius: 22, borderWidth: 1, boxShadow: '0 14px 28px rgba(17,70,61,0.09), inset 0 1px 0 rgba(255,255,255,0.94)', flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 58, paddingHorizontal: 13 },
  googleButtonText: { color: '#073F38', fontSize: 14, fontWeight: '900' },
  googleMark: { alignItems: 'center', backgroundColor: authTokens.raised, borderColor: 'rgba(20,117,105,0.10)', borderRadius: 999, borderWidth: 1, height: 24, justifyContent: 'center', width: 24 },
  authMark: { alignItems: 'center', backgroundColor: 'rgba(202,251,240,0.96)', borderColor: 'rgba(13,134,119,0.10)', borderRadius: 15, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  phoneButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.94)', borderColor: 'rgba(20,117,105,0.15)', borderRadius: 22, borderWidth: 1, boxShadow: '0 8px 18px rgba(17,70,61,0.05), inset 0 1px 0 rgba(255,255,255,0.92)', flexDirection: 'row', gap: 12, minHeight: 56, paddingHorizontal: 13, paddingVertical: 10 },
  phoneButtonText: { color: authTokens.ink, flex: 1, fontSize: 14, fontWeight: '800' },
  customerEmailFallbackButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.80)', borderColor: 'rgba(20,117,105,0.14)', borderRadius: 18, borderWidth: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 12, zIndex: 1 },
  customerEmailFallbackText: { color: authTokens.primary, fontSize: 13, fontWeight: '800' },
  phoneUnavailableBox: { alignItems: 'center', backgroundColor: 'rgba(226,255,249,0.78)', borderColor: 'rgba(13,134,119,0.13)', borderRadius: 20, borderWidth: 1, justifyContent: 'center', minHeight: 50, paddingHorizontal: 12 },
  phoneUnavailableText: { color: authTokens.primary, fontSize: 13, fontWeight: '800', lineHeight: 17, textAlign: 'center' },
  loginDivider: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  loginDividerLine: { backgroundColor: authTokens.line, flex: 1, height: 1 },
  loginDividerText: { color: authTokens.subtle, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  fieldShell: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.94)', borderColor: 'rgba(20,117,105,0.18)', borderRadius: 21, borderWidth: 1, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.92), 0 7px 14px rgba(17,70,61,0.035)', flexDirection: 'row', gap: 12, minHeight: 54, paddingHorizontal: 14, paddingVertical: 10, zIndex: 1 },
  fieldIcon: { alignItems: 'center', backgroundColor: 'rgba(202,251,240,0.96)', borderColor: 'rgba(13,134,119,0.10)', borderRadius: 15, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  fieldCopy: { flex: 1, gap: 1, minWidth: 0 },
  fieldLabel: { color: authTokens.primary, fontSize: 10, fontWeight: '800', lineHeight: 12 },
  fieldInput: { color: authTokens.ink, fontSize: 15, fontWeight: '800', lineHeight: 19, minHeight: 22, padding: 0 },
  fieldActionButton: { alignItems: 'center', borderRadius: 999, height: 38, justifyContent: 'center', width: 38 },
  workerFormFoot: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  workerFormFootText: { color: authTokens.muted, flex: 1, fontSize: 12, fontWeight: '700' },
  workerFormFootAction: { color: authTokens.primary, fontSize: 12, fontWeight: '800' },
  workerVerificationStack: { gap: 10, zIndex: 1 },
  workerUploadGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  workerUploadTile: { backgroundColor: 'rgba(255,255,255,0.88)', borderColor: 'rgba(20,117,105,0.25)', borderRadius: 22, borderStyle: 'dashed', borderWidth: 1, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.92), 0 8px 16px rgba(17,70,61,0.04)', gap: 8, minHeight: 104, padding: 13, width: '48%' },
  workerUploadIcon: { height: 26, justifyContent: 'center', width: 26 },
  workerUploadCopy: { gap: 4 },
  workerUploadLabel: { color: authTokens.ink, fontSize: 13, fontWeight: '800', lineHeight: 15 },
  workerUploadMeta: { color: authTokens.muted, fontSize: 10.5, fontWeight: '700', lineHeight: 14 },
  workerCredentialPill: { alignItems: 'center', backgroundColor: authTokens.raised, borderColor: authTokens.border, borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 52, paddingHorizontal: 12 },
  workerCredentialCopy: { flex: 1, minWidth: 0 },
  workerCredentialLabel: { color: authTokens.ink, fontSize: 13, fontWeight: '800' },
  workerCredentialMeta: { color: authTokens.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  workerVerifyServiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 2 },
  workerVerifyServiceChip: { backgroundColor: authTokens.mint, borderColor: authTokens.border, borderRadius: 999, borderWidth: 1, color: authTokens.primary, fontSize: 12, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 11, paddingVertical: 8 },
  customerPasswordFoot: { alignItems: 'flex-end', marginTop: -2, zIndex: 1 },
  customerPasswordFootAction: { color: authTokens.primary, fontSize: 12, fontWeight: '900', lineHeight: 16 },
  authFootCta: { alignItems: 'center', backgroundColor: 'rgba(226,255,249,0.78)', borderColor: 'rgba(13,134,119,0.13)', borderRadius: 20, borderWidth: 1, gap: 8, marginTop: 2, padding: 12, zIndex: 1 },
  authFootCtaText: { color: authTokens.primary, fontSize: 11.5, fontWeight: '700', lineHeight: 15, textAlign: 'center' },
  authFootLinkButton: { alignItems: 'center', borderRadius: 999, minHeight: 28, paddingHorizontal: 12 },
  authFootLinkText: { color: authTokens.primary, fontSize: 13, fontWeight: '900' },
  secondaryBoxButton: { alignItems: 'center', alignSelf: 'stretch', backgroundColor: authTokens.raised, borderColor: authTokens.border, borderRadius: 20, borderWidth: 1, justifyContent: 'center', minHeight: 50 },
  secondaryBoxButtonText: { color: authTokens.primary, fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.54 },
  pressed: { opacity: 0.78 },
  hiddenMarker: { height: 0, opacity: 0, width: 0 },
})
