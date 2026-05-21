import { type ReactNode, useReducer } from 'react'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path, Rect } from 'react-native-svg'
import { useAuth } from '@/lib/auth-provider'
import { useAppLanguage, type AppLanguage } from '@/lib/app-language'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { ReduceMotionAwareEntranceView } from '@/components/ui/reduce-motion-aware-animation'

const LOGIN_ROLE_GATE_MARKER = 'LOGIN_ROLE_GATE_MARKER: auth-login-role-customer auth-login-role-worker'
const LOGIN_ROLE_GATE_GLASS_MARKER = 'LOGIN_ROLE_GATE_GLASS_MARKER: auth-role-gate-glass'
const AUTH_PROTOTYPE_PARITY_MARKER = 'AUTH_PROTOTYPE_PARITY_MARKER: roleGatewaySignature signatureRail auth-google-primary-client worker-no-google-login role-fixed-after-choice'
const kaelModel8AHead = require('../../assets/kael-model-8a-head.png')

type AuthEntryRole = 'customer' | 'worker'
const EMPTY_AUTH_META: string[] = []

type LoginRoleState = {
  email: string
  formError: string | null
  password: string
  selectedEntryRole: AuthEntryRole | null
  signingIn: boolean
}

type LoginRoleAction =
  | { type: 'field'; field: 'email' | 'password'; value: string }
  | { type: 'form_error'; error: string | null }
  | { type: 'select_role'; role: AuthEntryRole | null }
  | { type: 'set_signing_in'; signingIn: boolean }

const loginRoleInitialState: LoginRoleState = {
  email: '',
  formError: null,
  password: '',
  selectedEntryRole: null,
  signingIn: false,
}

function loginRoleReducer(state: LoginRoleState, action: LoginRoleAction): LoginRoleState {
  switch (action.type) {
    case 'field':
      return { ...state, [action.field]: action.value }
    case 'form_error':
      return { ...state, formError: action.error }
    case 'select_role':
      return { ...state, formError: null, selectedEntryRole: action.role }
    case 'set_signing_in':
      return { ...state, signingIn: action.signingIn }
    default:
      return state
  }
}

const authTokens = {
  canvas: '#F3FAF7',
  raised: '#FFFFFF',
  glass: 'rgba(255,253,248,0.8)',
  mint: '#DDF4EC',
  cyan: '#E4F8F7',
  cream: '#FFF0DE',
  border: '#D2E8E1',
  line: '#D8E2E0',
  ink: '#102B2D',
  muted: '#58716E',
  subtle: '#8AA39E',
  primary: '#08786E',
  copper: '#BB743D',
  shadow: '0 12px 30px rgba(13,70,65,0.09)',
  softShadow: '0 8px 20px rgba(13,70,65,0.06)',
}

const authCopy = {
  vi: {
    kicker: '',
    titleAuthenticated: 'Chọn vai trò',
    titleLogin: 'Bắt đầu từ điều bạn cần hôm nay',
    bodyLogin: '',
    recovery: 'Hồ sơ vai trò chưa sẵn sàng. Tải lại hồ sơ hoặc đăng xuất để đăng nhập tài khoản khác.',
    refresh: 'Tải lại hồ sơ',
    signOut: 'Đăng xuất',
    submit: 'Tiếp tục',
    changeRole: 'Quay lại',
    email: 'Email hoặc số điện thoại',
    password: 'Mật khẩu',
    selectedRole: (role: string) => `Vai trò: ${role}`,
    roleCustomer: 'Khách',
    roleWorker: 'Thợ',
    entryCustomer: 'Google hoặc số điện thoại',
    entryWorker: 'Tài khoản thợ đã duyệt',
    adminCustomer: 'Mở khu vực Khách với quyền quản trị.',
    adminWorker: 'Mở khu vực Thợ với quyền quản trị.',
    customerDesc: 'Đặt dịch vụ, chat Kael và theo dõi lịch.',
    workerDesc: 'Nhận việc, JobRoom và đối soát.',
    fixedRole: 'Vai trò cố định',
    google: 'Đăng nhập bằng Google',
    phone: 'Dùng số điện thoại',
    signature: 'Đúng người, đúng việc, đúng lúc nhà cần.',
    workerLoginTitle: 'Đăng nhập cho Thợ',
    customerLoginTitle: 'Đăng nhập cho Khách',
    accountLabel: 'Tài khoản',
    securityLabel: 'Bảo mật',
    createWorker: 'Tạo hồ sơ thợ',
    forgotPassword: 'Quên mật khẩu?',
    divider: 'hoặc',
    openRoleA11y: (label: string) => `Đăng nhập vai trò ${label}`,
    roleStatus: {
      admin: 'Quản trị viên có thể mở cả hai khu vực.',
      customer: 'Tài khoản Khách chỉ vào khu vực Khách.',
      checking: 'Đang kiểm tra vai trò tài khoản.',
      worker: 'Tài khoản Thợ chỉ vào khu vực Thợ.',
    },
    errors: {
      config: 'Supabase chưa được cấu hình cho mobile build này',
      customerDenied: 'Tài khoản này chưa được phép vào khu vực Khách',
      generic: 'Không thể đăng nhập',
      login: 'Không thể đăng nhập',
      unavailable: 'Không thể đăng nhập lúc này',
      workerDenied: 'Tài khoản này chưa được phép vào khu vực Thợ',
      googleUnavailable: 'Google OAuth cần được cấu hình trước khi dùng trong production.',
      phoneUnavailable: 'Đăng nhập số điện thoại cần nhà cung cấp OTP ổn định trước khi bật.',
    },
  },
  en: {
    kicker: '',
    titleAuthenticated: 'Choose role',
    titleLogin: 'Start with what you need today',
    bodyLogin: '',
    recovery: 'Role profile is not ready. Refresh the profile or sign out to use another account.',
    refresh: 'Refresh profile',
    signOut: 'Sign out',
    submit: 'Continue',
    changeRole: 'Back',
    email: 'Email or phone',
    password: 'Password',
    selectedRole: (role: string) => `Role: ${role}`,
    roleCustomer: 'Customer',
    roleWorker: 'Worker',
    entryCustomer: 'Google or phone',
    entryWorker: 'Approved worker account',
    adminCustomer: 'Open customer workspace as admin.',
    adminWorker: 'Open worker workspace as admin.',
    customerDesc: 'Book service, chat with Kael, and track activity.',
    workerDesc: 'Receive jobs, JobRoom, and reconciliation.',
    fixedRole: 'Fixed role',
    google: 'Sign in with Google',
    phone: 'Use phone number',
    signature: 'Right person, right job, right when home needs it.',
    workerLoginTitle: 'Worker sign in',
    customerLoginTitle: 'Customer sign in',
    accountLabel: 'Account',
    securityLabel: 'Security',
    createWorker: 'Create worker profile',
    forgotPassword: 'Forgot password?',
    divider: 'or',
    openRoleA11y: (label: string) => `Sign in as ${label}`,
    roleStatus: {
      admin: 'Admin can open both workspaces.',
      customer: 'Customer account can only open Customer.',
      checking: 'Checking account role.',
      worker: 'Worker account can only open Worker.',
    },
    errors: {
      config: 'Supabase is not configured for this mobile build',
      customerDenied: 'This account cannot open Customer yet',
      generic: 'Unable to sign in',
      login: 'Unable to sign in',
      unavailable: 'Unable to sign in right now',
      workerDenied: 'This account cannot open Worker yet',
      googleUnavailable: 'Google OAuth must be configured before production use.',
      phoneUnavailable: 'Phone sign-in needs a stable OTP provider before it is enabled.',
    },
  },
} as const

export function LoginRoleSurface() {
  const { replace } = useRouter()
  const { authError, loading, profileStatus, refreshProfile, role, session, signInWithPassword, signOut } = useAuth()
  const { reduceTransparency } = useGlassAccessibility()
  const language = useAppLanguage()
  const copy = authCopy[language]
  const [{ email, formError, password, selectedEntryRole, signingIn }, loginDispatch] = useReducer(loginRoleReducer, loginRoleInitialState)
  const setEmail = (value: string) => loginDispatch({ type: 'field', field: 'email', value })
  const setPassword = (value: string) => loginDispatch({ type: 'field', field: 'password', value })
  const setFormError = (error: string | null) => loginDispatch({ type: 'form_error', error })
  const setSigningIn = (signingInValue: boolean) => loginDispatch({ type: 'set_signing_in', signingIn: signingInValue })
  const setSelectedEntryRole = (entryRole: AuthEntryRole | null) => loginDispatch({ type: 'select_role', role: entryRole })
  const isAdmin = role === 'admin'
  const isAuthenticated = Boolean(session && role)
  const canOpenCustomer = role === 'customer' || isAdmin
  const canOpenWorker = role === 'worker' || isAdmin
  const configMissing = profileStatus === 'config_missing'
  const visibleError = formError ?? (authError ? copy.errors.generic : null) ?? (configMissing ? copy.errors.config : null)
  const needsProfileRecovery = Boolean(session && !role && (profileStatus === 'profile_missing' || profileStatus === 'profile_error'))
  const selectedEntryRoleLabel = selectedEntryRole === 'worker' ? copy.roleWorker : copy.roleCustomer
  const headerBody = isAuthenticated ? roleLabel(role, language) : copy.bodyLogin
  const loginTitle = selectedEntryRole === 'worker' ? copy.workerLoginTitle : copy.customerLoginTitle
  const showClientAuthOptions = selectedEntryRole === 'customer'

  const submitLogin = async () => {
    setFormError(null)
    setSigningIn(true)
    try {
      const result = await signInWithPassword(email, password)
      if (!result.success) {
        setFormError(copy.errors.login)
      } else {
        setPassword('')
      }
    } catch {
      setFormError(copy.errors.unavailable)
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
    <AuthFrame testID="auth-login-surface">
      <ScrollView contentContainerStyle={styles.authContent} showsVerticalScrollIndicator={false} style={styles.authScroll}>
        <View style={[styles.roleGateShell, glassSurface('glass', reduceTransparency)]} testID="auth-role-gate-glass">
          <MapLineField />
          <View style={styles.hiddenMarker} testID={AUTH_PROTOTYPE_PARITY_MARKER} />
          <View style={styles.loginHeader}>
            {!isAuthenticated && !selectedEntryRole ? (
              <RoleGatewayHero copy={copy} />
            ) : (
              <>
                {copy.kicker ? <Text style={styles.kicker}>{copy.kicker}</Text> : null}
                <Text style={styles.title}>{isAuthenticated ? copy.titleAuthenticated : loginTitle}</Text>
              </>
            )}
            {headerBody ? <Text style={styles.body}>{headerBody}</Text> : null}
          </View>

          {needsProfileRecovery ? (
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
              <View style={styles.roleGatewayGrid}>
                <RoleCard
                  accessibilityLabel={copy.openRoleA11y(copy.roleCustomer)}
                  description={copy.entryCustomer}
                  icon="home"
                  label={copy.roleCustomer}
                  meta={language === 'en' ? ['Google', 'Phone'] : ['Google', 'Số điện thoại']}
                  onPress={() => setSelectedEntryRole('customer')}
                  primary
                  testID="auth-entry-role-customer"
                />
                <RoleCard
                  accessibilityLabel={copy.openRoleA11y(copy.roleWorker)}
                  description={copy.entryWorker}
                  icon="tools"
                  label={copy.roleWorker}
                  meta={language === 'en' ? ['Worker account', 'Verification'] : ['Tài khoản thợ', 'Xác thực']}
                  onPress={() => setSelectedEntryRole('worker')}
                  testID="auth-entry-role-worker"
                />
              </View>
            </>
          ) : !isAuthenticated ? (
            <View style={styles.formStack}>
              <View style={styles.hiddenMarker} testID={`auth-entry-role-selected-${selectedEntryRole}`} />
              <View style={styles.loginMode}>
                <Text style={styles.loginModeText}>{copy.selectedRole(selectedEntryRoleLabel)}</Text>
              </View>
              {showClientAuthOptions ? (
                <>
                  <Pressable
                    accessibilityLabel={copy.google}
                    accessibilityRole="button"
                    onPress={() => setFormError(copy.errors.googleUnavailable)}
                    style={({ pressed }) => [styles.googleButton, pressed ? styles.pressed : null]}
                    testID="auth-client-google-primary"
                  >
                    <GoogleMark />
                    <Text style={styles.googleButtonText}>{copy.google}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={copy.phone}
                    accessibilityRole="button"
                    onPress={() => setFormError(copy.errors.phoneUnavailable)}
                    style={({ pressed }) => [styles.phoneButton, pressed ? styles.pressed : null]}
                    testID="auth-client-phone-secondary"
                  >
                    <AuthIcon name="phone" />
                    <Text style={styles.phoneButtonText}>{copy.phone}</Text>
                  </Pressable>
                  <View style={styles.loginDivider}>
                    <View style={styles.loginDividerLine} />
                    <Text style={styles.loginDividerText}>{copy.divider}</Text>
                    <View style={styles.loginDividerLine} />
                  </View>
                </>
              ) : null}
              <AuthInputField
                icon="email"
                label={copy.accountLabel}
                valueLabel={copy.email}
              >
                <TextInput
                  accessibilityLabel={copy.email}
                  autoCapitalize="none"
                  autoCorrect={false}
                  inputMode="email"
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder={copy.email}
                  placeholderTextColor={authTokens.subtle}
                  style={styles.fieldInput}
                  testID="auth-login-email-input"
                  value={email}
                />
              </AuthInputField>
              <AuthInputField
                actionLabel={copy.forgotPassword}
                icon="lock"
                label={copy.securityLabel}
                valueLabel={copy.password}
              >
                <TextInput
                  accessibilityLabel={copy.password}
                  autoCapitalize="none"
                  onChangeText={setPassword}
                  placeholder={copy.password}
                  placeholderTextColor={authTokens.subtle}
                  secureTextEntry
                  style={styles.fieldInput}
                  testID="auth-login-password-input"
                  value={password}
                />
              </AuthInputField>
              {visibleError ? <Text style={styles.errorText}>{visibleError}</Text> : null}
              {selectedEntryRole === 'worker' ? (
                <View style={styles.workerFormFoot}>
                  <Text style={styles.workerFormFootText}>{copy.entryWorker}</Text>
                  <Text style={styles.workerFormFootAction}>{copy.forgotPassword}</Text>
                </View>
              ) : null}
              <Pressable
                accessibilityLabel={copy.submit}
                accessibilityRole="button"
                accessibilityState={{ disabled: signingIn || loading || configMissing }}
                disabled={signingIn || loading || configMissing}
                onPress={submitLogin}
                style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null, signingIn || loading || configMissing ? styles.disabled : null]}
                testID="auth-login-submit"
              >
                {signingIn || loading ? <ActivityIndicator color={authTokens.raised} /> : <Text style={styles.primaryButtonText}>{copy.submit}</Text>}
              </Pressable>
              {selectedEntryRole === 'worker' ? (
                <Pressable
                  accessibilityLabel={copy.createWorker}
                  accessibilityRole="button"
                  onPress={() => setFormError(copy.errors.workerDenied)}
                  style={({ pressed }) => [styles.secondaryBoxButton, pressed ? styles.pressed : null]}
                  testID="auth-worker-create-profile"
                >
                  <Text style={styles.secondaryBoxButtonText}>{copy.createWorker}</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityLabel={copy.changeRole}
                accessibilityRole="button"
                accessibilityState={{ disabled: signingIn || loading }}
                disabled={signingIn || loading}
                onPress={() => {
                  setFormError(null)
                  setSelectedEntryRole(null)
                }}
                style={styles.secondaryAction}
                testID="auth-entry-role-change"
              >
                <Text style={styles.secondaryActionText}>{copy.changeRole}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <RoleCard
                accessibilityLabel={copy.openRoleA11y(copy.roleCustomer)}
                description={isAdmin ? copy.adminCustomer : copy.customerDesc}
                disabled={!canOpenCustomer}
                icon="home"
                label={copy.roleCustomer}
                onPress={openCustomerSection}
                testID={isAdmin ? 'auth-login-admin-audit-customer' : 'auth-login-role-customer'}
              />
              <RoleCard
                accessibilityLabel={copy.openRoleA11y(copy.roleWorker)}
                description={isAdmin ? copy.adminWorker : copy.workerDesc}
                disabled={!canOpenWorker}
                icon="tools"
                label={copy.roleWorker}
                onPress={openWorkerSection}
                testID={isAdmin ? 'auth-login-admin-audit-worker' : 'auth-login-role-worker'}
              />
              {isAdmin ? <View style={styles.hiddenMarker} testID="auth-login-admin-audit" /> : null}
              <Pressable accessibilityLabel={copy.signOut} accessibilityRole="button" onPress={signOut} style={styles.secondaryAction} testID="auth-login-sign-out">
                <Text style={styles.secondaryActionText}>{copy.signOut}</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
      <View style={styles.hiddenMarker} testID={LOGIN_ROLE_GATE_MARKER + LOGIN_ROLE_GATE_GLASS_MARKER + '/(customer)/home /(worker)/home'} />
    </AuthFrame>
  )
}

function roleLabel(role: string | null, language: AppLanguage) {
  const statusCopy = authCopy[language].roleStatus
  if (role === 'admin') return statusCopy.admin
  if (role === 'worker') return statusCopy.worker
  if (role === 'customer') return statusCopy.customer
  return statusCopy.checking
}

function AuthFrame({ children, testID }: { children: ReactNode; testID: string }) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const frameWidth = Math.min(width, 430)
  const contentWidth = Math.max(0, frameWidth - 48)

  return (
    <SafeAreaView style={styles.safe} testID={testID}>
      <View style={styles.canvas}>
        <AmbientBackdrop />
        <View style={{ width: contentWidth, paddingTop: Math.max(insets.top, 8), paddingBottom: insets.bottom + 18 }}>
          {children}
        </View>
      </View>
    </SafeAreaView>
  )
}

function AmbientBackdrop() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 390 844" preserveAspectRatio="none">
      <Path d="M-18 152 C72 116 120 178 198 144 S318 80 418 126" stroke={authTokens.border} strokeWidth={5} opacity={0.42} fill="none" />
      <Path d="M32 320 C118 282 144 352 232 314 S332 250 420 292" stroke={authTokens.line} strokeWidth={4} opacity={0.34} fill="none" />
      <Path d="M-30 642 C64 600 122 668 198 622 S316 552 424 604" stroke={authTokens.border} strokeWidth={5} opacity={0.32} fill="none" />
      <Rect x={34} y={226} width={76} height={48} rx={16} fill={authTokens.mint} opacity={0.32} />
      <Rect x={248} y={146} width={92} height={56} rx={18} fill={authTokens.cyan} opacity={0.34} />
      <Rect x={218} y={652} width={104} height={64} rx={18} fill={authTokens.cream} opacity={0.38} />
    </Svg>
  )
}

function MapLineField() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 360 390" preserveAspectRatio="none">
      <Path d="M20 132 C84 96 134 134 188 116 S292 62 342 98" stroke={authTokens.line} strokeWidth={4} opacity={0.42} fill="none" />
      <Path d="M40 214 C86 194 106 236 162 218 S246 166 322 198" stroke={authTokens.line} strokeWidth={3.2} opacity={0.34} fill="none" />
      <Path d="M82 176 L82 258 M162 204 L162 314 M258 168 L238 286" stroke={authTokens.line} strokeWidth={3} opacity={0.18} fill="none" />
    </Svg>
  )
}

function RoleGatewayHero({ copy }: { copy: (typeof authCopy)[AppLanguage] }) {
  return (
    <ReduceMotionAwareEntranceView delayMs={45} distanceY={8} style={styles.roleGatewayHero} testID="auth-role-gateway-hero-motion">
      <View style={styles.roleGatewayTop}>
        <Text style={styles.roleGatewayBadge}>Home Services</Text>
        <View style={styles.roleGatewayBadgeIconRow}>
          <AuthIcon name="shield" />
          <Text style={styles.roleGatewayBadge}>{copy.fixedRole}</Text>
        </View>
      </View>
      <View style={styles.roleGatewayGlassLine}>
        <Text style={styles.title}>{copy.titleLogin}</Text>
        <View style={styles.roleGatewayKael}>
          <Image accessible={false} contentFit="contain" source={kaelModel8AHead} style={styles.roleGatewayKaelImage} />
        </View>
      </View>
      <ReduceMotionAwareEntranceView delayMs={130} distanceY={4} style={styles.roleGatewaySignature} testID="roleGatewaySignature">
        <View style={styles.signatureRail} testID="signatureRail" />
        <Text style={styles.roleGatewaySignatureText}>{copy.signature}</Text>
        <View pointerEvents="none" style={styles.signatureLiquid} />
      </ReduceMotionAwareEntranceView>
    </ReduceMotionAwareEntranceView>
  )
}

function RoleCard({
  accessibilityLabel,
  description,
  disabled = false,
  icon,
  label,
  meta = EMPTY_AUTH_META,
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
  onPress: () => void
  primary?: boolean
  testID: string
}) {
  const { reduceTransparency } = useGlassAccessibility()

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.roleCard, primary ? styles.roleCardPrimary : null, glassSurface('raised', reduceTransparency), disabled ? styles.disabled : null, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <View style={[styles.roleIcon, { backgroundColor: authTokens.mint }]}>
        <AuthIcon name={icon} />
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
      <Text style={styles.roleArrow}>›</Text>
    </Pressable>
  )
}

function AuthInputField({
  actionLabel,
  children,
  icon,
  label,
  valueLabel,
}: {
  actionLabel?: string
  children: ReactNode
  icon: 'email' | 'lock'
  label: string
  valueLabel: string
}) {
  return (
    <View style={styles.fieldShell}>
      <View style={styles.fieldIcon}>
        <AuthIcon name={icon} />
      </View>
      <View style={styles.fieldCopy}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValueLabel}>{valueLabel}</Text>
        {children}
      </View>
      {actionLabel ? <Text style={styles.fieldAction}>{actionLabel}</Text> : null}
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

function AuthIcon({ name }: { name: 'email' | 'home' | 'lock' | 'phone' | 'shield' | 'tools' }) {
  const color = authTokens.primary
  const accent = authTokens.copper

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
    glass: reduceTransparency ? 'rgba(255,253,248,0.98)' : authTokens.glass,
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
  safe: { backgroundColor: authTokens.canvas, flex: 1 },
  canvas: { alignItems: 'center', backgroundColor: authTokens.canvas, flex: 1, justifyContent: 'center', overflow: 'hidden' },
  authScroll: { width: '100%' },
  authContent: { alignItems: 'stretch', gap: 16, minHeight: '100%', paddingVertical: 18, width: '100%' },
  formStack: { gap: 10 },
  loginHeader: { gap: 7 },
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
  primaryButton: { alignItems: 'center', backgroundColor: authTokens.primary, borderRadius: 20, justifyContent: 'center', minHeight: 52 },
  primaryButtonText: { color: authTokens.raised, fontSize: 15, fontWeight: '700' },
  secondaryAction: { alignItems: 'center', minHeight: 42, justifyContent: 'center' },
  secondaryActionText: { color: authTokens.primary, fontSize: 14, fontWeight: '700' },
  roleGateShell: { alignSelf: 'center', borderRadius: 34, gap: 14, maxWidth: 392, overflow: 'hidden', padding: 14, paddingTop: 16, width: '100%' },
  roleGatewayHero: { borderColor: 'rgba(255,255,255,0.86)', borderRadius: 32, borderWidth: 1, boxShadow: '0 22px 42px rgba(17,70,61,0.12)', gap: 13, overflow: 'hidden', padding: 16 },
  roleGatewayTop: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  roleGatewayBadge: { backgroundColor: 'rgba(255,255,255,0.66)', borderColor: 'rgba(13,134,119,0.12)', borderRadius: 999, borderWidth: 1, color: authTokens.primary, fontSize: 11, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 7 },
  roleGatewayBadgeIconRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  roleGatewayGlassLine: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', minHeight: 94 },
  roleGatewayKael: { alignItems: 'center', backgroundColor: 'rgba(230,255,249,0.78)', borderColor: 'rgba(255,255,255,0.88)', borderRadius: 24, borderWidth: 1, boxShadow: authTokens.softShadow, height: 66, justifyContent: 'center', overflow: 'hidden', width: 66 },
  roleGatewayKaelImage: { height: 74, transform: [{ translateY: 5 }], width: 74 },
  roleGatewaySignature: { alignItems: 'center', backgroundColor: 'rgba(235,255,250,0.70)', borderColor: 'rgba(255,255,255,0.78)', borderRadius: 24, borderWidth: 1, flexDirection: 'row', gap: 11, minHeight: 58, overflow: 'hidden', paddingHorizontal: 13, paddingVertical: 11, position: 'relative' },
  roleGatewaySignatureText: { color: '#123F38', flex: 1, fontSize: 13.8, fontWeight: '800', lineHeight: 18 },
  signatureRail: { backgroundColor: authTokens.primary, borderRadius: 999, boxShadow: '0 0 18px rgba(50,218,190,0.42)', height: 34, width: 7 },
  signatureLiquid: { backgroundColor: 'rgba(116,255,223,0.20)', borderRadius: 999, height: 60, position: 'absolute', right: 18, top: -12, transform: [{ rotate: '-10deg' }], width: 120 },
  roleGatewayGrid: { gap: 13 },
  roleCard: { alignItems: 'center', alignSelf: 'stretch', borderRadius: 28, flexDirection: 'row', gap: 12, minHeight: 106, padding: 16 },
  roleCardPrimary: { backgroundColor: 'rgba(241,255,251,0.94)' },
  roleIcon: { alignItems: 'center', borderRadius: 22, height: 54, justifyContent: 'center', width: 54 },
  titleStack: { flex: 1, gap: 5 },
  roleTitle: { color: authTokens.ink, fontSize: 19, fontWeight: '700' },
  roleMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  roleMetaPill: { backgroundColor: 'rgba(218,255,247,0.78)', borderColor: 'rgba(13,134,119,0.11)', borderRadius: 999, borderWidth: 1, color: authTokens.primary, fontSize: 10, fontWeight: '800', maxWidth: 120, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5 },
  roleArrow: { color: authTokens.primary, fontSize: 32, fontWeight: '700' },
  loginMode: { alignItems: 'center', backgroundColor: authTokens.mint, borderColor: authTokens.border, borderRadius: 21, borderWidth: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 14 },
  loginModeText: { color: authTokens.primary, fontSize: 13, fontWeight: '800' },
  googleButton: { alignItems: 'center', backgroundColor: authTokens.raised, borderColor: authTokens.border, borderRadius: 22, borderWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 58 },
  googleButtonText: { color: authTokens.ink, fontSize: 14, fontWeight: '800' },
  googleMark: { alignItems: 'center', backgroundColor: authTokens.raised, borderColor: authTokens.border, borderRadius: 999, borderWidth: 1, height: 28, justifyContent: 'center', width: 28 },
  phoneButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.94)', borderColor: authTokens.border, borderRadius: 22, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 54, paddingHorizontal: 14 },
  phoneButtonText: { color: authTokens.ink, flex: 1, fontSize: 14, fontWeight: '800' },
  loginDivider: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  loginDividerLine: { backgroundColor: authTokens.line, flex: 1, height: 1 },
  loginDividerText: { color: authTokens.subtle, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  fieldShell: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.94)', borderColor: authTokens.border, borderRadius: 22, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 64, paddingHorizontal: 13, paddingVertical: 10 },
  fieldIcon: { alignItems: 'center', backgroundColor: authTokens.mint, borderColor: authTokens.border, borderRadius: 15, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  fieldCopy: { flex: 1, gap: 1, minWidth: 0 },
  fieldLabel: { color: authTokens.primary, fontSize: 10, fontWeight: '800', lineHeight: 12 },
  fieldValueLabel: { color: authTokens.ink, fontSize: 14, fontWeight: '800', lineHeight: 17 },
  fieldInput: { color: authTokens.ink, fontSize: 14, fontWeight: '700', minHeight: 0, padding: 0 },
  fieldAction: { color: authTokens.primary, fontSize: 11, fontWeight: '800' },
  workerFormFoot: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  workerFormFootText: { color: authTokens.muted, flex: 1, fontSize: 12, fontWeight: '700' },
  workerFormFootAction: { color: authTokens.primary, fontSize: 12, fontWeight: '800' },
  secondaryBoxButton: { alignItems: 'center', backgroundColor: authTokens.raised, borderColor: authTokens.border, borderRadius: 20, borderWidth: 1, justifyContent: 'center', minHeight: 50 },
  secondaryBoxButtonText: { color: authTokens.primary, fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.54 },
  pressed: { opacity: 0.78 },
  hiddenMarker: { height: 0, opacity: 0, width: 0 },
})
