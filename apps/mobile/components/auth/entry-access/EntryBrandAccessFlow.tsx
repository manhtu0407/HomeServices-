import { useCallback, useEffect, useMemo, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg'
import { KaelLottieView, kaelLottieRendererKind } from '@/components/kael/kael-lottie-view'
import { AssetTile, GlassPanel, IconButton, KaelMascot, KaelStatus, PageAura, PrimaryButton, TextAction, useEntryAccessibility } from './components/materials'
import { CheckRow, EntryTextField } from './components/fields'
import { EntryIcon, ProviderBrandIcon, type ProviderBrand } from './components/icons'
import { entryTheme } from './theme'
import type {
  EntryAccessFeatureFlags,
  EntryAccessStep,
  EntryBrandAccessFlowProps,
  EntryRole,
} from './types'

const assets = {
  activity: require('./assets/activity.png') as ImageSourcePropType,
  customerHome: require('./assets/customer-home.png') as ImageSourcePropType,
  identity: require('./assets/identity.png') as ImageSourcePropType,
  kael: require('./assets/kael.png') as ImageSourcePropType,
  shield: require('./assets/shield.png') as ImageSourcePropType,
  workerTools: require('./assets/worker-tools.png') as ImageSourcePropType,
}

type LottieAsset = {
  fr?: number
  h: number
  ip?: number
  markers?: Array<{ cm?: string; dr?: number; tm?: number }>
  nm?: string
  op?: number
  w: number
}

const auroraNestLogoLottie = require('@/assets/lottie/nestscout-aurora-nest-north-star-awakening.json') as LottieAsset
const auroraNestLogoStatic = require('@/assets/nestscout-aurora-nest-appstore-1024.png') as ImageSourcePropType

const defaultFeatures: EntryAccessFeatureFlags = {
  customerFacebook: true,
  customerGmail: true,
  customerGoogle: true,
  customerRegistration: true,
  workerRegistration: true,
}

const AURORA_NEST_SPLASH_DURATION_MS = 4200
const SPLASH_LOADER_SETTLE_OFFSET_MS = 260
const SPLASH_LOADER_WIDTH = 108

export function EntryBrandAccessFlow({
  actions,
  featureFlags,
  initialRole = 'customer',
  initialStep = 'splash',
  onRoleChange,
  onStepChange,
  splashDurationMs = AURORA_NEST_SPLASH_DURATION_MS,
}: EntryBrandAccessFlowProps) {
  const features = useMemo(() => ({ ...defaultFeatures, ...featureFlags }), [featureFlags])
  const [step, setStep] = useState<EntryAccessStep>(initialStep)
  const [role, setRole] = useState<EntryRole>(initialRole)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [remember, setRemember] = useState(true)
  const [acceptedTerms, setAcceptedTerms] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const go = useCallback((next: EntryAccessStep) => {
    setError(null)
    setStep(next)
    onStepChange?.(next)
  }, [onStepChange])

  const chooseRole = (nextRole: EntryRole) => {
    setRole(nextRole)
    setError(null)
    onRoleChange?.(nextRole)
  }

  useEffect(() => {
    if (step !== 'splash' || splashDurationMs <= 0) return
    const timeout = setTimeout(() => go('welcome'), splashDurationMs)
    return () => clearTimeout(timeout)
  }, [go, splashDurationMs, step])

  const submitLogin = async () => {
    setError(null)
    if (!email.trim() || !password) {
      setError('Vui lòng nhập email và mật khẩu.')
      return
    }
    setBusy(true)
    try {
      const result = await actions.onEmailLogin({ email: email.trim(), password, role })
      if (!result.success) {
        setError(result.error ?? 'Chưa thể đăng nhập. Vui lòng thử lại.')
        return
      }
      go('onboarding')
    } catch {
      setError('Không thể kết nối. Vui lòng thử lại.')
    } finally {
      setBusy(false)
    }
  }

  const submitRegister = async () => {
    setError(null)
    if (!fullName.trim() || !email.trim() || password.length < 8) {
      setError('Kiểm tra họ tên, email và mật khẩu tối thiểu 8 ký tự.')
      return
    }
    if (!acceptedTerms) {
      setError('Bạn cần đồng ý với điều khoản để tiếp tục.')
      return
    }
    setBusy(true)
    try {
      const result = await actions.onRegister({ email: email.trim(), fullName: fullName.trim(), password, role })
      if (!result.success) {
        setError(result.error ?? 'Chưa thể tạo tài khoản. Vui lòng thử lại.')
        return
      }
      go('onboarding')
    } catch {
      setError('Không thể kết nối. Vui lòng thử lại.')
    } finally {
      setBusy(false)
    }
  }

  const providerLogin = async (provider: ProviderBrand) => {
    const action = provider === 'google'
      ? actions.onGoogleLogin
      : provider === 'gmail'
        ? actions.onGmailLogin
        : actions.onFacebookLogin
    if (!action) {
      setError('Phương thức này chưa được cấu hình.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      if (!result.success) {
        setError(result.error ?? 'Chưa thể đăng nhập. Vui lòng thử lại.')
        return
      }
      go('onboarding')
    } catch {
      setError('Không thể kết nối. Vui lòng thử lại.')
    } finally {
      setBusy(false)
    }
  }

  const forgotPassword = async () => {
    setError(null)
    const result = await actions.onForgotPassword?.(email)
    if (result && !result.success) {
      setError(result.error ?? 'Đặt lại mật khẩu chưa sẵn sàng.')
    }
  }

  const completeOnboarding = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await actions.onCompleteOnboarding(role)
      if (!result.success) {
        setError(result.error ?? 'Chưa thể mở màn hình tiếp theo. Vui lòng thử lại.')
      }
    } catch {
      setError('Không thể kết nối. Vui lòng thử lại.')
    } finally {
      setBusy(false)
    }
  }

  const content = (() => {
    switch (step) {
      case 'splash':
        return <SplashScreen durationMs={splashDurationMs} />
      case 'welcome':
        return <WelcomeScreen onContinue={() => go('role-gate')} onExistingAccount={() => go('role-gate')} />
      case 'role-gate':
        return <RoleGateScreen onContinue={() => go('login')} onRoleChange={chooseRole} role={role} />
      case 'login':
        return (
          <LoginScreen
            busy={busy}
            canRegister={role === 'customer' ? features.customerRegistration : features.workerRegistration}
            email={email}
            error={error}
            features={features}
            onFacebook={() => providerLogin('facebook')}
            onBack={() => go('role-gate')}
            onEmailChange={setEmail}
            onForgotPassword={forgotPassword}
            onGmail={() => providerLogin('gmail')}
            onGoogle={() => providerLogin('google')}
            onPasswordChange={setPassword}
            onRegister={() => go('register')}
            onRemember={() => setRemember((current) => !current)}
            onSubmit={submitLogin}
            password={password}
            remember={remember}
            role={role}
          />
        )
      case 'register':
        return (
          <RegisterScreen
            acceptedTerms={acceptedTerms}
            busy={busy}
            email={email}
            error={error}
            fullName={fullName}
            onBack={() => go('login')}
            onEmailChange={setEmail}
            onFullNameChange={setFullName}
            onLogin={() => go('login')}
            onPasswordChange={setPassword}
            onSubmit={submitRegister}
            onToggleTerms={() => setAcceptedTerms((current) => !current)}
            password={password}
            role={role}
          />
        )
      case 'onboarding':
        return <OnboardingScreen busy={busy} error={error} onComplete={completeOnboarding} role={role} />
    }
  })()

  return (
    <View style={styles.root} testID={`auth-${step}-screen`}>
      <StatusBar style="dark" translucent />
      <PageAura />
      {content}
    </View>
  )
}

function Screen({ children }: { children: React.ReactNode }) {
  return <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>{children}</SafeAreaView>
}

function SplashScreen({ durationMs }: { durationMs: number }) {
  return (
    <Screen>
      <View style={[styles.screen, styles.centeredScreen]} testID="auth-splash-1-1">
        <SplashFormulaAura />
        <View style={styles.splashCenter}>
          <LottieLogoMark size={354} testID="auth-welcome-nestscout-logo" />
          <SplashBrandLockup />
        </View>
        <View style={styles.splashFoot}>
          <SplashLoadingBar durationMs={durationMs} />
          <Text style={styles.caption}>Kael đang chuẩn bị mọi thứ</Text>
        </View>
      </View>
    </Screen>
  )
}

function SplashBrandLockup() {
  return (
    <View style={styles.splashBrandLockup}>
      <View style={styles.splashWordmarkShell}>
        <View style={styles.splashSpark} testID="auth-splash-brand-spark">
          <Svg height={18} viewBox="0 0 24 24" width={18}>
            <Path d="M12 0 L14.8 9.2 L24 12 L14.8 14.8 L12 24 L9.2 14.8 L0 12 L9.2 9.2 Z" fill="#22CFC3" />
          </Svg>
        </View>
        <Text style={styles.splashName} testID="auth-splash-brand-wordmark">
          <Text style={styles.splashNameNest}>Nest</Text>
          <Text style={styles.splashNameScout}>Scout</Text>
        </Text>
      </View>
      <Text style={styles.splashTagline}>Dịch vụ gia đình đáng tin, trong tầm tay.</Text>
    </View>
  )
}

function SplashLoadingBar({ durationMs }: { durationMs: number }) {
  const { reduceMotion } = useEntryAccessibility()
  const fillProgress = useSharedValue(reduceMotion ? 0.64 : 0.16)
  const sheenProgress = useSharedValue(0)
  const loaderDurationMs = Math.max(1200, durationMs - SPLASH_LOADER_SETTLE_OFFSET_MS)
  const sheenDurationMs = Math.max(900, Math.round(loaderDurationMs * 0.78))

  useEffect(() => {
    if (reduceMotion) {
      fillProgress.value = 0.64
      sheenProgress.value = 0
      return
    }

    fillProgress.value = 0.16
    sheenProgress.value = 0
    fillProgress.value = withTiming(0.94, { duration: loaderDurationMs, easing: Easing.out(Easing.cubic) })
    sheenProgress.value = withTiming(1, { duration: sheenDurationMs, easing: Easing.inOut(Easing.quad) })
  }, [fillProgress, loaderDurationMs, reduceMotion, sheenDurationMs, sheenProgress])

  const fillStyle = useAnimatedStyle(() => ({
    width: SPLASH_LOADER_WIDTH * fillProgress.value,
  }))
  const sheenStyle = useAnimatedStyle(() => {
    const opacity = Math.sin(sheenProgress.value * Math.PI) * 0.48
    return {
      opacity,
      transform: [{ translateX: -24 + sheenProgress.value * (SPLASH_LOADER_WIDTH + 30) }],
    }
  })

  return (
    <View accessibilityRole="progressbar" style={styles.loaderTrack}>
      <Animated.View style={[styles.loaderFill, fillStyle]}>
        {!reduceMotion ? <Animated.View pointerEvents="none" style={[styles.loaderSheen, sheenStyle]} /> : null}
      </Animated.View>
    </View>
  )
}

function SplashFormulaAura() {
  const { reduceTransparency } = useEntryAccessibility()

  if (reduceTransparency) return null

  return (
    <View pointerEvents="none" style={styles.splashFormulaAura}>
      <Svg height="100%" preserveAspectRatio="xMidYMid slice" viewBox="0 0 390 844" width="100%">
        <Defs>
          <RadialGradient id="splashLogoMintAura" cx="50%" cy="40%" r="37%">
            <Stop offset="0" stopColor="#49CFC0" stopOpacity="0.16" />
            <Stop offset="0.58" stopColor="#24B3A1" stopOpacity="0.08" />
            <Stop offset="1" stopColor="#088779" stopOpacity="0" />
          </RadialGradient>
          <LinearGradient id="splashMintWave" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0" stopColor="#49CFC0" stopOpacity="0" />
            <Stop offset="0.26" stopColor="#49CFC0" stopOpacity="0.34" />
            <Stop offset="0.58" stopColor="#24B3A1" stopOpacity="0.28" />
            <Stop offset="1" stopColor="#088779" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="splashMintSheen" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.48" />
            <Stop offset="0.5" stopColor="#49CFC0" stopOpacity="0.16" />
            <Stop offset="1" stopColor="#088779" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Circle cx="195" cy="342" fill="url(#splashLogoMintAura)" r="150" />
        <Path d="M-24 322 C58 278 125 292 183 256 C249 215 309 231 414 174" fill="none" opacity="0.56" stroke="url(#splashMintWave)" strokeLinecap="round" strokeWidth="2.2" />
        <Path d="M-10 409 C66 371 132 389 184 352 C250 306 303 316 405 270" fill="none" opacity="0.34" stroke="url(#splashMintWave)" strokeLinecap="round" strokeWidth="1.4" />
        <Path d="M-20 684 C74 655 128 672 193 641 C263 608 322 612 411 577" fill="none" opacity="0.30" stroke="url(#splashMintWave)" strokeLinecap="round" strokeWidth="1.6" />
        <Path d="M323 228 C326 238 331 243 341 246 C331 249 326 254 323 264 C320 254 315 249 305 246 C315 243 320 238 323 228 Z" fill="#49CFC0" opacity="0.23" />
        <Path d="M91 275 C93 282 97 286 104 288 C97 290 93 294 91 301 C89 294 85 290 78 288 C85 286 89 282 91 275 Z" fill="#24B3A1" opacity="0.18" />
        <Path d="M294 565 C296 572 300 576 307 578 C300 580 296 584 294 591 C292 584 288 580 281 578 C288 576 292 572 294 565 Z" fill="#088779" opacity="0.14" />
        <Path d="M118 626 L156 604 C185 588 213 577 248 572" fill="none" opacity="0.30" stroke="url(#splashMintSheen)" strokeLinecap="round" strokeWidth="5" />
      </Svg>
    </View>
  )
}

function WelcomeScreen({ onContinue, onExistingAccount }: { onContinue: () => void; onExistingAccount: () => void }) {
  return (
    <Screen>
      <View style={styles.screen} testID="auth-welcome-1-2">
        <View style={styles.welcomeHead}>
          <Text style={[styles.h1, styles.centerText, styles.welcomeTitle]}>Xin chào!{`\n`}Mình là Kael.</Text>
          <Text style={[styles.lead, styles.centerText, styles.welcomeLead]}>Tìm đúng người, hiểu đúng việc và theo sát từng bước cùng bạn.</Text>
        </View>
        <View style={styles.flexCenter}><KaelMascot source={assets.kael} /></View>
        <View style={styles.actionStack}>
          <PrimaryButton label="Tiếp tục" onPress={onContinue} testID="auth-welcome-continue" />
          <TextAction label="Tôi đã có tài khoản" onPress={onExistingAccount} testID="auth-welcome-existing-account" />
        </View>
      </View>
    </Screen>
  )
}

function RoleGateScreen({ onContinue, onRoleChange, role }: { onContinue: () => void; onRoleChange: (role: EntryRole) => void; role: EntryRole }) {
  return (
    <Screen>
      <View style={styles.screen} testID="auth-role-gate-content">
        <View style={styles.gateHead}>
          <Text style={[styles.h1, { marginTop: 0 }]}>Bạn đang cần điều gì hôm nay?</Text>
          <Text style={[styles.lead, { marginTop: 7 }]}>Chọn vai trò để Kael mở đúng trải nghiệm cho bạn.</Text>
        </View>
        <GlassPanel style={styles.signatureRail}>
          <View style={styles.sparkTile}><EntryIcon color={entryTheme.color.mint.mint700} name="spark" size={16} /></View>
          <Text style={styles.signatureText}>Đúng người, đúng việc, đúng lúc nhà cần.</Text>
        </GlassPanel>
        <View style={styles.roleList}>
          <RoleCard
            badge="Phổ biến"
            description="Đặt dịch vụ, chat cùng Kael và theo dõi tiến độ."
            meta="Google · Gmail · Facebook"
            onPress={() => onRoleChange('customer')}
            selected={role === 'customer'}
            source={assets.customerHome}
            testID="auth-entry-role-customer"
            title="Khách hàng"
          />
          <RoleCard
            description="Nhận việc, quản lý lịch và theo dõi thu nhập."
            meta="Tài khoản thợ · Xác thực hồ sơ"
            onPress={() => onRoleChange('worker')}
            selected={role === 'worker'}
            source={assets.workerTools}
            testID="auth-entry-role-worker"
            title="Đối tác thợ"
          />
        </View>
        <View style={styles.gateBottom}>
          <PrimaryButton label={role === 'customer' ? 'Tiếp tục với Khách hàng' : 'Tiếp tục với Đối tác thợ'} onPress={onContinue} testID="auth-role-continue" />
          <Text style={[styles.caption, styles.gateFoot]}>Vai trò được cố định sau khi đăng nhập.{`\n`}Bạn có thể đổi trước khi xác thực.</Text>
        </View>
      </View>
    </Screen>
  )
}

function RoleCard({ badge, description, meta, onPress, selected, source, testID, title }: {
  badge?: string
  description: string
  meta: string
  onPress: () => void
  selected: boolean
  source: ImageSourcePropType
  testID: string
  title: string
}) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={({ pressed }: { pressed: boolean }) => [styles.roleCard, selected && styles.roleCardSelected, pressed && styles.pressed]} testID={testID}>
      <AssetTile source={source} />
      <View style={styles.roleCopy}>
        <View style={styles.roleTitleRow}>
          <Text style={styles.h3}>{title}</Text>
          {badge ? <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{badge}</Text></View> : null}
        </View>
        <Text style={styles.roleDescription}>{description}</Text>
        <Text style={styles.roleMeta}>{meta}</Text>
      </View>
      <View style={styles.roleArrow}><EntryIcon color={entryTheme.color.mint.mint700} name="arrow-right" size={13} /></View>
    </Pressable>
  )
}

function AuthTopBar({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={styles.topbar}>
      <IconButton label="Quay lại" onPress={onBack} />
      <Text style={styles.topbarTitle}>{title}</Text>
      <View style={styles.topbarSpacer} />
    </View>
  )
}

function normalizeTitleBreaks(value: string) {
  return value.replace(/\\n/g, '\n')
}

function FormHeader({ lead, title }: { lead: string; title: string }) {
  return (
    <View style={styles.formHead}>
      <View style={styles.formHeadRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.formTitle}>{normalizeTitleBreaks(title)}</Text>
          <Text style={[styles.lead, { marginTop: 6 }]}>{lead}</Text>
        </View>
        <KaelStatus source={assets.kael} />
      </View>
    </View>
  )
}

function LoginScreen(props: {
  busy: boolean
  canRegister: boolean
  email: string
  error: string | null
  features: EntryAccessFeatureFlags
  onFacebook: () => void
  onBack: () => void
  onEmailChange: (value: string) => void
  onForgotPassword: () => void
  onGmail: () => void
  onGoogle: () => void
  onPasswordChange: (value: string) => void
  onRegister: () => void
  onRemember: () => void
  onSubmit: () => void
  password: string
  remember: boolean
  role: EntryRole
}) {
  const showProviders = props.role === 'customer' && (props.features.customerGoogle || props.features.customerGmail || props.features.customerFacebook)
  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <ScrollView bounces={false} contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AuthTopBar onBack={props.onBack} title="Đăng nhập" />
          <FormHeader lead="Tiếp tục nơi bạn đã dừng cùng Kael." title="Chào mừng\ntrở lại." />
          <GlassPanel style={styles.formPanel} testID="auth-login-1-4">
            <EntryTextField icon="mail" keyboardType="email-address" label="Email" onChangeText={props.onEmailChange} placeholder="email@example.com" testID="auth-login-email-input" textContentType="emailAddress" value={props.email} />
            <EntryTextField icon="lock" label="Mật khẩu" onChangeText={props.onPasswordChange} placeholder="Nhập mật khẩu" secureTextEntry testID="auth-login-password-input" textContentType="password" value={props.password} />
            <View style={styles.formUtils}>
              <CheckRow checked={props.remember} label="Ghi nhớ tôi" onPress={props.onRemember} testID="auth-login-remember" />
              <Pressable hitSlop={8} onPress={props.onForgotPassword} testID="auth-customer-forgot-password"><Text style={styles.link}>Quên mật khẩu?</Text></Pressable>
            </View>
            {props.error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{props.error}</Text> : null}
            <PrimaryButton disabled={props.busy} label={props.busy ? 'Đang xử lý…' : 'Đăng nhập'} onPress={props.onSubmit} testID="auth-login-submit" />
            {showProviders ? (
              <>
                <Divider label="hoặc tiếp tục với" />
                <View style={styles.providerRow}>
                  {props.features.customerGoogle ? <ProviderButton label="Google" onPress={props.onGoogle} provider="google" testID="auth-client-google-primary" /> : null}
                  {props.features.customerGmail ? <ProviderButton label="Gmail" onPress={props.onGmail} provider="gmail" testID="auth-client-gmail-secondary" /> : null}
                  {props.features.customerFacebook ? <ProviderButton label="Facebook" onPress={props.onFacebook} provider="facebook" testID="auth-client-facebook-secondary" /> : null}
                </View>
              </>
            ) : null}
            {props.canRegister ? <Text style={styles.formSwitch}>Chưa có tài khoản? <Text onPress={props.onRegister} style={styles.formSwitchLink} testID="auth-client-register-email">Đăng ký</Text></Text> : null}
          </GlassPanel>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

function RegisterScreen(props: {
  acceptedTerms: boolean
  busy: boolean
  email: string
  error: string | null
  fullName: string
  onBack: () => void
  onEmailChange: (value: string) => void
  onFullNameChange: (value: string) => void
  onLogin: () => void
  onPasswordChange: (value: string) => void
  onSubmit: () => void
  onToggleTerms: () => void
  password: string
  role: EntryRole
}) {
  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <ScrollView bounces={false} contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AuthTopBar onBack={props.onBack} title="Đăng ký" />
          <FormHeader lead={props.role === 'customer' ? 'Chỉ mất chưa đến một phút.' : 'Tạo tài khoản trước khi gửi hồ sơ xác thực.'} title={props.role === 'customer' ? 'Tạo tài khoản\ncủa bạn.' : 'Tạo hồ sơ\nđối tác.'} />
          <GlassPanel style={styles.formPanel} testID="auth-register-1-5">
            <EntryTextField autoCapitalize="words" icon="user" label="Họ và tên" onChangeText={props.onFullNameChange} placeholder="Nguyễn Hoàng Minh" testID="auth-register-name-input" textContentType="name" value={props.fullName} />
            <EntryTextField icon="mail" keyboardType="email-address" label="Email" onChangeText={props.onEmailChange} placeholder="email@example.com" testID="auth-register-email-input" textContentType="emailAddress" value={props.email} />
            <EntryTextField icon="lock" label="Mật khẩu" onChangeText={props.onPasswordChange} placeholder="Tối thiểu 8 ký tự" secureTextEntry testID="auth-register-password-input" textContentType="newPassword" value={props.password} />
            <View style={styles.termsRow}>
              <CheckRow checked={props.acceptedTerms} label="Tôi đồng ý với Điều khoản sử dụng và Chính sách bảo mật của NestScout." onPress={props.onToggleTerms} testID="auth-register-terms" />
            </View>
            {props.error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{props.error}</Text> : null}
            <PrimaryButton disabled={props.busy} label={props.busy ? 'Đang xử lý…' : props.role === 'customer' ? 'Đăng ký' : 'Tạo tài khoản thợ'} onPress={props.onSubmit} testID="auth-register-submit" />
            <Text style={styles.formSwitch}>Đã có tài khoản? <Text onPress={props.onLogin} style={styles.formSwitchLink}>Đăng nhập</Text></Text>
          </GlassPanel>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

function Divider({ label }: { label: string }) {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>{label}</Text>
      <View style={styles.dividerLine} />
    </View>
  )
}

function ProviderButton({ label, onPress, provider, testID }: { label: string; onPress: () => void; provider: ProviderBrand; testID: string }) {
  return (
    <Pressable
      accessibilityLabel={`Tiếp tục với ${label}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [styles.providerButton, pressed && styles.pressed]}
      testID={testID}
    >
      <View style={styles.providerMark}><ProviderBrandIcon provider={provider} size={18} /></View>
      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={styles.providerLabel}>{label}</Text>
    </Pressable>
  )
}

function OnboardingScreen({ busy, error, onComplete, role }: { busy: boolean; error: string | null; onComplete: () => void; role: EntryRole }) {
  return (
    <Screen>
      <View style={styles.screen} testID="auth-onboarding-1-6">
        <View style={styles.onboardingHead}>
          <Text style={[styles.h1, styles.onboardingTitle]}>Chào mừng{`\n`}về nhà.</Text>
          <Text style={[styles.lead, styles.onboardingLead]}>{role === 'customer' ? 'Kael sẽ đồng hành từ yêu cầu đầu tiên đến khi công việc hoàn tất.' : 'Kael sẽ hướng dẫn bạn hoàn thiện hồ sơ và bắt đầu nhận việc minh bạch.'}</Text>
        </View>
        <KaelMascot compact source={assets.kael} />
        <View style={styles.benefitRow}>
          <BenefitCard label="Hiểu đúng yêu cầu" meta="Gợi ý rõ ràng" source={assets.identity} />
          <BenefitCard label="Theo dõi minh bạch" meta="Mọi bước đều rõ" source={assets.activity} />
          <BenefitCard label="An tâm sử dụng" meta="Quy trình bảo vệ" source={assets.shield} />
        </View>
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        <View style={styles.onboardingBottom}>
          <PrimaryButton disabled={busy} label="Bắt đầu sử dụng" onPress={onComplete} testID="auth-onboarding-start" />
          <View style={styles.pager}><View style={styles.pagerDot} /><View style={styles.pagerDot} /><View style={styles.pagerActive} /></View>
        </View>
      </View>
    </Screen>
  )
}

function BenefitCard({ label, meta, source }: { label: string; meta: string; source: ImageSourcePropType }) {
  return (
    <GlassPanel style={styles.benefitCard}>
      <Image resizeMode="contain" source={source} style={styles.benefitIcon} />
      <Text style={styles.benefitLabel}>{label}</Text>
      <Text style={styles.benefitMeta}>{meta}</Text>
    </GlassPanel>
  )
}

function lottieDurationSeconds(asset: LottieAsset) {
  if (!asset.fr || asset.fr <= 0 || typeof asset.ip !== 'number' || typeof asset.op !== 'number') return null
  return Number(((asset.op - asset.ip) / asset.fr).toFixed(1))
}

function LottieLogoMark({ size, testID }: { size: number; testID: string }) {
  const { reduceMotion } = useEntryAccessibility()
  const logoHeight = Math.round(size * (auroraNestLogoLottie.h / auroraNestLogoLottie.w))
  const duration = lottieDurationSeconds(auroraNestLogoLottie)
  const shouldAnimate = kaelLottieRendererKind !== 'fallback' && !reduceMotion
  const assetLabel = `${auroraNestLogoLottie.nm ?? 'NestScout Aurora Nest'} ${auroraNestLogoLottie.w}x${auroraNestLogoLottie.h}${duration ? ` ${duration}s` : ''}`

  return (
    <View accessibilityLabel={assetLabel} style={[styles.logoMotion, { height: logoHeight, width: size }]} testID={testID}>
      {shouldAnimate ? (
        <KaelLottieView
          autoPlay
          loop
          resizeMode="contain"
          source={auroraNestLogoLottie}
          style={styles.logoExactImage}
          testID={`${testID}-lottie`}
        />
      ) : (
        <Image
          resizeMode="contain"
          source={auroraNestLogoStatic}
          style={styles.logoExactImage}
          testID={`${testID}-static`}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  actionStack: { gap: 7, paddingBottom: 4 },
  benefitCard: { alignItems: 'center', borderRadius: 23, flex: 1, minHeight: 101, paddingHorizontal: 7, paddingVertical: 10 },
  benefitIcon: { height: 47, marginBottom: 4, width: 47 },
  benefitLabel: { color: entryTheme.color.text.strong, fontSize: 10.5, fontWeight: '700', lineHeight: 14, textAlign: 'center' },
  benefitMeta: { color: entryTheme.color.text.muted, fontSize: 8.5, lineHeight: 12, marginTop: 2, textAlign: 'center' },
  benefitRow: { flexDirection: 'row', gap: 9, marginBottom: 16, marginTop: 48 },
  caption: { ...entryTheme.typography.caption, color: entryTheme.color.text.muted },
  centeredScreen: { alignItems: 'center' },
  divider: { alignItems: 'center', flexDirection: 'row', gap: 11, marginHorizontal: 2, marginVertical: 12 },
  dividerLine: { backgroundColor: entryTheme.color.surface.stroke, flex: 1, height: 1 },
  dividerText: { color: entryTheme.color.text.muted, fontSize: 10 },
  error: { color: entryTheme.color.accent.destructive, fontSize: 11, lineHeight: 16, marginBottom: 10, marginTop: -2 },
  flexCenter: { alignItems: 'center', flex: 1, justifyContent: 'center', marginHorizontal: -10 },
  centerText: { textAlign: 'center' },
  formHead: { paddingBottom: 12, paddingHorizontal: 3, paddingTop: 6 },
  formHeadRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  formPanel: { borderRadius: entryTheme.radius.sheet, paddingBottom: 15, paddingHorizontal: 15, paddingTop: 17 },
  formScroll: { flexGrow: 1, paddingBottom: 18, paddingHorizontal: entryTheme.spacing.screenX },
  formSwitch: { color: entryTheme.color.text.secondary, fontSize: 11.5, marginTop: 14, textAlign: 'center' },
  formSwitchLink: { color: entryTheme.color.mint.mint700, fontWeight: '700' },
  formTitle: { color: entryTheme.color.text.strong, fontSize: 29, fontWeight: '700', letterSpacing: 0, lineHeight: 35 },
  formUtils: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9, marginHorizontal: 2, marginTop: -2, minHeight: 28 },
  gateBottom: { marginTop: 'auto', paddingTop: 12 },
  gateFoot: { marginTop: 10, textAlign: 'center' },
  gateHead: { paddingHorizontal: 4, paddingTop: 8 },
  h1: { ...entryTheme.typography.h1, color: entryTheme.color.text.strong },
  h3: { ...entryTheme.typography.h3, color: entryTheme.color.text.strong },
  keyboard: { flex: 1 },
  lead: { ...entryTheme.typography.body, color: entryTheme.color.text.secondary },
  link: { color: entryTheme.color.mint.mint700, fontSize: 11, fontWeight: '700' },
  loaderFill: { backgroundColor: entryTheme.color.mint.mint600, borderRadius: 999, bottom: 0, left: 0, overflow: 'hidden', position: 'absolute', top: 0 },
  loaderSheen: { backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 999, bottom: 0, position: 'absolute', top: 0, width: 22 },
  loaderTrack: { backgroundColor: 'rgba(13,174,154,0.12)', borderRadius: 999, height: 4, overflow: 'hidden', position: 'relative', width: SPLASH_LOADER_WIDTH },
  logoExactImage: {
    height: '100%',
    width: '100%',
  },
  logoMotion: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  onboardingBottom: { marginTop: 'auto' },
  onboardingHead: { alignItems: 'center', paddingHorizontal: 8, paddingTop: 18 },
  onboardingLead: { marginTop: 7, textAlign: 'center' },
  onboardingTitle: { marginTop: 11, textAlign: 'center' },
  pager: { alignItems: 'center', flexDirection: 'row', gap: 6, height: 25, justifyContent: 'center', marginTop: 8 },
  pagerActive: { backgroundColor: entryTheme.color.mint.mint600, borderRadius: 999, height: 5, width: 18 },
  pagerDot: { backgroundColor: '#BDD8D3', borderRadius: 999, height: 5, width: 5 },
  pressed: { opacity: 0.78 },
  providerButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.90)', borderColor: entryTheme.color.surface.stroke, borderRadius: 18, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 6, height: 46, justifyContent: 'center', minWidth: 0, paddingHorizontal: 6 },
  providerLabel: { color: entryTheme.color.text.strong, flexShrink: 1, fontSize: 11, fontWeight: '700', letterSpacing: 0 },
  providerMark: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 8, height: 22, justifyContent: 'center', width: 22, ...entryTheme.shadow.soft },
  providerRow: { flexDirection: 'row', gap: 8 },
  roleArrow: { alignItems: 'center', backgroundColor: 'rgba(230,251,243,0.76)', borderRadius: 12, height: 24, justifyContent: 'center', width: 24 },
  roleBadge: { backgroundColor: entryTheme.color.mint.mint50, borderColor: entryTheme.color.surface.strokeStrong, borderRadius: 999, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  roleBadgeText: { color: entryTheme.color.mint.mint700, fontSize: 9, fontWeight: '700', letterSpacing: 0, textTransform: 'uppercase' },
  roleCard: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.87)', borderColor: entryTheme.color.surface.stroke, borderRadius: entryTheme.radius.card, borderWidth: 1, flexDirection: 'row', gap: 13, minHeight: 144, paddingHorizontal: 15, paddingVertical: 16, ...entryTheme.shadow.soft },
  roleCardSelected: { backgroundColor: 'rgba(241,251,248,0.96)', borderColor: 'rgba(36,179,161,0.54)', shadowColor: '#088779', shadowOpacity: 0.13, shadowRadius: 17, shadowOffset: { width: 0, height: 16 } },
  roleCopy: { flex: 1 },
  roleDescription: { color: entryTheme.color.text.secondary, fontSize: 12.5, lineHeight: 18, marginTop: 5 },
  roleList: { gap: 12 },
  roleMeta: { color: entryTheme.color.text.muted, fontSize: 10, lineHeight: 14, marginTop: 7 },
  roleTitleRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  root: { backgroundColor: entryTheme.color.mint.white, flex: 1 },
  safe: { flex: 1 },
  screen: { flex: 1, paddingBottom: 18, paddingHorizontal: entryTheme.spacing.screenX, paddingTop: 8 },
  signatureRail: { alignItems: 'center', borderRadius: 19, flexDirection: 'row', gap: 9, marginBottom: 14, marginTop: 7, minHeight: 42, paddingHorizontal: 13, paddingVertical: 10 },
  signatureText: { color: entryTheme.color.mint.mint800, flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 16 },
  sparkTile: { alignItems: 'center', backgroundColor: entryTheme.color.mint.mint50, borderRadius: 10, height: 23, justifyContent: 'center', width: 23 },
  splashBrandLockup: { alignItems: 'center', alignSelf: 'stretch', marginTop: 28 },
  splashCenter: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingBottom: 48 },
  splashFormulaAura: { bottom: 0, left: -entryTheme.spacing.screenX, position: 'absolute', right: -entryTheme.spacing.screenX, top: 0 },
  splashFoot: { alignItems: 'center', gap: 11, paddingBottom: 14 },
  splashName: { alignSelf: 'center', fontSize: 31, fontWeight: '700', letterSpacing: 0, lineHeight: 34, textAlign: 'center' },
  splashNameNest: { color: '#20BFD4' },
  splashNameScout: { color: '#8B72FF' },
  splashSpark: { height: 18, left: -24, position: 'absolute', top: -8, width: 18 },
  splashTagline: { color: '#7792A8', fontSize: 11, fontWeight: '500', letterSpacing: 0, lineHeight: 16, marginTop: 4, textAlign: 'center' },
  splashWordmarkShell: { alignSelf: 'center', position: 'relative' },
  termsRow: { marginBottom: 12, marginHorizontal: 2, marginTop: 2 },
  topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: -3, marginBottom: 6, minHeight: 48 },
  topbarSpacer: { width: 42 },
  topbarTitle: { color: entryTheme.color.text.primary, fontSize: 15, fontWeight: '700', letterSpacing: 0 },
  welcomeHead: { alignItems: 'center', paddingHorizontal: 4, paddingTop: 12 },
  welcomeLead: { marginTop: 8, maxWidth: 340 },
  welcomeTitle: { marginTop: 0, maxWidth: 340 },
})
