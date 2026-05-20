import { type ReactNode, useReducer } from 'react'
import { useRouter } from 'expo-router'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path, Rect } from 'react-native-svg'
import { useAuth } from '@/lib/auth-provider'
import { useAppLanguage, type AppLanguage } from '@/lib/app-language'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'

const LOGIN_ROLE_GATE_MARKER = 'LOGIN_ROLE_GATE_MARKER: auth-login-role-customer auth-login-role-worker'
const LOGIN_ROLE_GATE_GLASS_MARKER = 'LOGIN_ROLE_GATE_GLASS_MARKER: auth-role-gate-glass'

type AuthEntryRole = 'customer' | 'worker'

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
    titleLogin: 'Đăng nhập',
    bodyLogin: '',
    recovery: 'Hồ sơ vai trò chưa sẵn sàng. Tải lại hồ sơ hoặc đăng xuất để đăng nhập tài khoản khác.',
    refresh: 'Tải lại hồ sơ',
    signOut: 'Đăng xuất',
    submit: 'Đăng nhập',
    changeRole: 'Đổi vai trò',
    email: 'Email',
    password: 'Mật khẩu',
    selectedRole: (role: string) => `Vai trò: ${role}`,
    roleCustomer: 'Khách',
    roleWorker: 'Thợ',
    entryCustomer: 'Đặt dịch vụ',
    entryWorker: 'Nhận việc',
    adminCustomer: 'Mở khu vực Khách với quyền quản trị.',
    adminWorker: 'Mở khu vực Thợ với quyền quản trị.',
    customerDesc: 'Kiểm giá và theo dõi.',
    workerDesc: 'Tóm tắt và đối soát.',
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
    },
  },
  en: {
    kicker: '',
    titleAuthenticated: 'Choose role',
    titleLogin: 'Sign in',
    bodyLogin: '',
    recovery: 'Role profile is not ready. Refresh the profile or sign out to use another account.',
    refresh: 'Refresh profile',
    signOut: 'Sign out',
    submit: 'Sign in',
    changeRole: 'Change role',
    email: 'Email',
    password: 'Password',
    selectedRole: (role: string) => `Role: ${role}`,
    roleCustomer: 'Customer',
    roleWorker: 'Worker',
    entryCustomer: 'Book service',
    entryWorker: 'Receive jobs',
    adminCustomer: 'Open customer workspace as admin.',
    adminWorker: 'Open worker workspace as admin.',
    customerDesc: 'Check prices and track.',
    workerDesc: 'Briefs and reconciliation.',
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
          <View style={styles.loginHeader}>
            {copy.kicker ? <Text style={styles.kicker}>{copy.kicker}</Text> : null}
            <Text style={styles.title}>{isAuthenticated ? copy.titleAuthenticated : copy.titleLogin}</Text>
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
              <RoleCard
                accessibilityLabel={copy.openRoleA11y(copy.roleCustomer)}
                description={copy.entryCustomer}
                icon="home"
                label={copy.roleCustomer}
                onPress={() => setSelectedEntryRole('customer')}
                testID="auth-entry-role-customer"
              />
              <RoleCard
                accessibilityLabel={copy.openRoleA11y(copy.roleWorker)}
                description={copy.entryWorker}
                icon="tools"
                label={copy.roleWorker}
                onPress={() => setSelectedEntryRole('worker')}
                testID="auth-entry-role-worker"
              />
            </>
          ) : !isAuthenticated ? (
            <View style={styles.formStack}>
              <View style={styles.hiddenMarker} testID={`auth-entry-role-selected-${selectedEntryRole}`} />
              <Text style={styles.body}>{copy.selectedRole(selectedEntryRoleLabel)}</Text>
              <TextInput
                accessibilityLabel={copy.email}
                autoCapitalize="none"
                autoCorrect={false}
                inputMode="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder={copy.email}
                placeholderTextColor={authTokens.subtle}
                style={styles.input}
                testID="auth-login-email-input"
                value={email}
              />
              <TextInput
                accessibilityLabel={copy.password}
                autoCapitalize="none"
                onChangeText={setPassword}
                placeholder={copy.password}
                placeholderTextColor={authTokens.subtle}
                secureTextEntry
                style={styles.input}
                testID="auth-login-password-input"
                value={password}
              />
              {visibleError ? <Text style={styles.errorText}>{visibleError}</Text> : null}
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

function RoleCard({
  accessibilityLabel,
  description,
  disabled = false,
  icon,
  label,
  onPress,
  testID,
}: {
  accessibilityLabel: string
  description: string
  disabled?: boolean
  icon: 'home' | 'tools'
  label: string
  onPress: () => void
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
      style={({ pressed }) => [styles.roleCard, glassSurface('raised', reduceTransparency), disabled ? styles.disabled : null, pressed ? styles.pressed : null]}
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
      </View>
      <Text style={styles.roleArrow}>›</Text>
    </Pressable>
  )
}

function AuthIcon({ name }: { name: 'home' | 'tools' }) {
  const color = authTokens.primary
  const accent = authTokens.copper

  return (
    <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
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
  roleGateShell: { alignSelf: 'center', borderRadius: 34, gap: 14, maxWidth: 260, overflow: 'hidden', padding: 14, paddingTop: 22, width: '100%' },
  roleCard: { alignItems: 'center', alignSelf: 'stretch', borderRadius: 28, flexDirection: 'row', gap: 12, minHeight: 112, padding: 14 },
  roleIcon: { alignItems: 'center', borderRadius: 22, height: 58, justifyContent: 'center', width: 58 },
  titleStack: { flex: 1, gap: 5 },
  roleTitle: { color: authTokens.ink, fontSize: 22, fontWeight: '700' },
  roleArrow: { color: authTokens.primary, fontSize: 32, fontWeight: '700' },
  disabled: { opacity: 0.54 },
  pressed: { opacity: 0.78 },
  hiddenMarker: { height: 0, opacity: 0, width: 0 },
})
