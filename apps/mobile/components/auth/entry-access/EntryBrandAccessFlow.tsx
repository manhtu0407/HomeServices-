import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Image } from 'expo-image'
import { StatusBar } from 'expo-status-bar'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg'
import { useAppLanguage, type AppLanguage } from '@/lib/app-language'
import { parseAuthIdentifier, validateAuthIdentifier } from '@/lib/auth-identifier'
import { clearRememberedAuthIdentifier, getRememberedAuthIdentifier, rememberAuthIdentifier } from '@/lib/remembered-auth-identifier'
import { mobileRuntimeConfig } from '@/lib/runtime-config'
import { GlassPanel, IconButton, KaelCoreHero, NativeSafeGlassPanel, PageAura, PrimaryButton, useEntryAccessibility } from './components/materials'
import { CheckRow, EntryTextField } from './components/fields'
import { ProviderButton } from './components/provider-button'
import { entryAccessCopy, localizeEntryAuthError, type EntryAccessCopy } from './copy'
import { useEntryAccessState } from './entry-access-state'
import { identifierAvailabilityError, identifierFieldProps, localizeIdentifierAvailabilityError, registrationIdentifierFieldProps, validateIdentifierForRole, validateRegistrationIdentifier } from './entry-identifier-fields'
import { entryBrandAccessFlowStyles as styles, SPLASH_LOADER_WIDTH } from './entry-brand-access-flow-styles'
import { LottieLogoMark } from './lottie-logo-mark'
import { PasswordRecoveryScreen, PasswordResetScreen } from './password-recovery-screen'
import { RoleGateScreen } from './role-gate-screen'
import { selectRoleGateGreeting } from './role-gate-greeting'
import type {
  EntryAccessFeatureFlags,
  EntryAccessStep,
  EntryBrandAccessFlowProps,
  EntryRole,
} from './types'
const assets = {
  activity: require('./assets/activity.png') as ImageSourcePropType,
  identity: require('./assets/identity.png') as ImageSourcePropType,
  shield: require('./assets/shield.png') as ImageSourcePropType,
}

const defaultFeatures: EntryAccessFeatureFlags = {
  customerGoogle: true,
  customerRegistration: true,
  workerRegistration: true,
}

const AURORA_NEST_SPLASH_DURATION_MS = 4200
const SPLASH_LOADER_SETTLE_OFFSET_MS = 260

export function EntryBrandAccessFlow({
  actions,
  featureFlags,
  initialRole = 'customer',
  initialStep = 'splash',
  onRoleChange,
  onStepChange,
  splashDurationMs = AURORA_NEST_SPLASH_DURATION_MS,
}: EntryBrandAccessFlowProps) {
  const language = useAppLanguage()
  const copy = entryAccessCopy[language]
  const features = useMemo(() => ({ ...defaultFeatures, ...featureFlags }), [featureFlags])
  const [notice, setNotice] = useState<string | null>(null)
  const {
    acceptedTerms,
    busy,
    error,
    fullName,
    identifier,
    password,
    remember,
    role,
    setAcceptedTerms,
    setBusy,
    setError,
    setFullName,
    setIdentifier,
    setPassword,
    setRemember,
    step,
    updateState,
  } = useEntryAccessState(initialRole, initialStep)
  const localizedError = error
    ? localizeIdentifierAvailabilityError(error, language) ?? localizeEntryAuthError(error, language, 'connectionFailed')
    : null
  const [roleGateGreetingSelection] = useState(() => ({ now: new Date(), random: Math.random() }))
  const roleGateGreeting = useMemo(
    () => selectRoleGateGreeting(roleGateGreetingSelection.now, () => roleGateGreetingSelection.random, language),
    [language, roleGateGreetingSelection],
  )
  const onStepChangeRef = useRef(onStepChange)
  const actionVersionRef = useRef(0)
  const actionBusyRef = useRef(false)

  useEffect(() => {
    onStepChangeRef.current = onStepChange
  }, [onStepChange])

  useEffect(() => () => {
    actionVersionRef.current += 1
    actionBusyRef.current = false
  }, [])

  const go = useCallback((next: EntryAccessStep) => {
    actionVersionRef.current += 1
    actionBusyRef.current = false
    setNotice(null)
    updateState({ busy: false, error: null, step: next })
    onStepChangeRef.current?.(next)
  }, [updateState])

  const beginAction = () => {
    if (actionBusyRef.current) return null
    actionBusyRef.current = true
    const version = actionVersionRef.current + 1
    actionVersionRef.current = version
    setBusy(true)
    return version
  }

  const isCurrentAction = (version: number) => actionBusyRef.current && actionVersionRef.current === version

  const finishAction = (version: number) => {
    if (!isCurrentAction(version)) return
    actionBusyRef.current = false
    setBusy(false)
  }

  const chooseRole = (nextRole: EntryRole) => {
    updateState({ error: null, role: nextRole })
    onRoleChange?.(nextRole)
  }

  useEffect(() => {
    if (step !== 'splash' || splashDurationMs <= 0) return
    const timeout = setTimeout(() => {
      updateState({ error: null, step: 'role-gate' })
      onStepChangeRef.current?.('role-gate')
    }, splashDurationMs)
    return () => clearTimeout(timeout)
  }, [splashDurationMs, step, updateState])

  useEffect(() => {
    let active = true
    if (step !== 'login' || identifier) return () => {
      active = false
    }

    void getRememberedAuthIdentifier().then((remembered) => {
      if (active && remembered) setIdentifier(remembered)
    })
    return () => {
      active = false
    }
  }, [identifier, setIdentifier, step])

  const submitLogin = async () => {
    setError(null)
    const identifierError = validateIdentifierForRole(identifier, role, language)
    const parsedIdentifier = parseAuthIdentifier(identifier)
    if (identifierError || !parsedIdentifier || !password) {
      setError(identifierError ?? copy.errors.loginDetails)
      return
    }
    const actionVersion = beginAction()
    if (actionVersion === null) return
    try {
      // The action-version guard intentionally runs after I/O so a stale screen cannot commit its result.
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const result = await actions.onPasswordLogin({ identifier: parsedIdentifier.value, password, role })
      if (!isCurrentAction(actionVersion)) return
      if (!result.success) {
        setError(localizeEntryAuthError(result.error, language, 'signInFailed'))
        return
      }
      if (remember) {
        await rememberAuthIdentifier(identifier)
      } else {
        await clearRememberedAuthIdentifier()
      }
      if (!isCurrentAction(actionVersion)) return
      if (role === 'worker') go('onboarding')
    } catch {
      if (isCurrentAction(actionVersion)) setError(copy.errors.connectionFailed)
    } finally {
      finishAction(actionVersion)
    }
  }

  const submitRegister = async () => {
    setError(null)
    setNotice(null)
    const identifierError = validateRegistrationIdentifier(identifier, language)
    if (!fullName.trim() || identifierError || password.length < 8) {
      setError(identifierError ?? copy.errors.registrationDetails)
      return
    }
    if (!acceptedTerms) {
      setError(copy.errors.termsRequired)
      return
    }
    const actionVersion = beginAction()
    if (actionVersion === null) return
    try {
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const result = await actions.onRegister({ identifier: identifier.trim(), fullName: fullName.trim(), password, role })
      if (!isCurrentAction(actionVersion)) return
      if (!result.success) {
        setError(localizeEntryAuthError(result.error, language, 'signupFailed'))
        return
      }
      setPassword('')
      if (result.nextStep) go(result.nextStep)
      else if (role === 'worker') go('onboarding')
    } catch {
      if (isCurrentAction(actionVersion)) setError(copy.errors.connectionFailed)
    } finally {
      finishAction(actionVersion)
    }
  }

  const providerLogin = async () => {
    const action = actions.onGoogleLogin
    if (!action) {
      setError(copy.errors.methodUnavailable)
      return
    }
    const actionVersion = beginAction()
    if (actionVersion === null) return
    setError(null)
    try {
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const result = await action()
      if (!isCurrentAction(actionVersion)) return
      if (!result.success) {
        setError(localizeEntryAuthError(result.error, language, 'googleSignInFailed'))
        return
      }
      if (role === 'worker') go('onboarding')
    } catch {
      if (isCurrentAction(actionVersion)) setError(copy.errors.connectionFailed)
    } finally {
      finishAction(actionVersion)
    }
  }

  const submitPasswordRecovery = async () => {
    setError(null)
    setNotice(null)
    const account = parseAuthIdentifier(identifier)
    const identifierError = validateAuthIdentifier(identifier)
    if (!account || identifierError) {
      setError(identifierError
        ? localizeEntryAuthError(identifierError, language, 'recoveryEmail')
        : copy.errors.recoveryEmail)
      return
    }
    if (account.kind === 'phone') {
      setError(identifierAvailabilityError('phoneRecovery', language))
      return
    }
    if (!actions.onForgotPassword) {
      setError(copy.errors.recoveryUnavailable)
      return
    }

    const actionVersion = beginAction()
    if (actionVersion === null) return
    try {
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const result = await actions.onForgotPassword({ email: account.value })
      if (!isCurrentAction(actionVersion)) return
      if (!result.success) {
        setError(localizeEntryAuthError(result.error, language, 'recoveryUnavailable'))
      } else {
        setNotice(language === 'vi'
          ? 'Nếu email thuộc một tài khoản NestScout, liên kết đặt lại mật khẩu đã được gửi.'
          : 'If the email belongs to a NestScout account, a password-reset link has been sent.')
      }
    } catch {
      if (isCurrentAction(actionVersion)) setError(copy.errors.connectionFailed)
    } finally {
      finishAction(actionVersion)
    }
  }

  const completeOnboarding = async () => {
    const actionVersion = beginAction()
    if (actionVersion === null) return
    setError(null)
    try {
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const result = await actions.onCompleteOnboarding(role)
      if (!isCurrentAction(actionVersion)) return
      if (!result.success) {
        setError(localizeEntryAuthError(result.error, language, 'nextScreenUnavailable'))
      }
    } catch {
      if (isCurrentAction(actionVersion)) setError(copy.errors.connectionFailed)
    } finally {
      finishAction(actionVersion)
    }
  }

  return (
    <View style={styles.root} testID={`auth-${step}-screen`}>
      <StatusBar style="dark" />
      <PageAura />
      <EntryAccessStepContent
        acceptedTerms={acceptedTerms}
        busy={busy}
        chooseRole={chooseRole}
        completeOnboarding={completeOnboarding}
        copy={copy}
        error={localizedError}
        features={features}
        fullName={fullName}
        go={go}
        identifier={identifier}
        language={language}
        notice={notice}
        onCompletePasswordRecovery={actions.onCompletePasswordRecovery}
        onExitPasswordRecovery={actions.onExitPasswordRecovery}
        password={password}
        providerLogin={providerLogin}
        remember={remember}
        role={role}
        roleGateGreeting={roleGateGreeting}
        setAcceptedTerms={setAcceptedTerms}
        setFullName={setFullName}
        setIdentifier={setIdentifier}
        setPassword={setPassword}
        setRemember={setRemember}
        splashDurationMs={splashDurationMs}
        step={step}
        submitLogin={submitLogin}
        submitPasswordRecovery={submitPasswordRecovery}
        submitRegister={submitRegister}
      />
      <RuntimeBuildMarker copy={copy} />
    </View>
  )
}

type EntryAccessStepContentProps = {
  acceptedTerms: boolean; busy: boolean; error: string | null; remember: boolean
  chooseRole: (role: EntryRole) => void; completeOnboarding: () => void; providerLogin: () => void
  copy: EntryAccessCopy; features: EntryAccessFeatureFlags; roleGateGreeting: ReturnType<typeof selectRoleGateGreeting>
  fullName: string; identifier: string; notice: string | null; password: string
  go: (step: EntryAccessStep) => void; setAcceptedTerms: () => void; setRemember: () => void
  language: AppLanguage; role: EntryRole; splashDurationMs: number; step: EntryAccessStep
  onCompletePasswordRecovery?: (password: string) => Promise<{ success: boolean; error?: string }>
  onExitPasswordRecovery?: () => Promise<void> | void
  setFullName: (value: string) => void; setIdentifier: (value: string) => void; setPassword: (value: string) => void
  submitLogin: () => void; submitPasswordRecovery: () => void; submitRegister: () => void
}

function EntryAccessStepContent(props: EntryAccessStepContentProps) {
  switch (props.step) {
    case 'splash':
      return <SplashScreen copy={props.copy} durationMs={props.splashDurationMs} />
    case 'role-gate':
      return <RoleGateScreen copy={props.copy.roleGate} greeting={props.roleGateGreeting} onContinue={() => props.go('login')} onRoleChange={props.chooseRole} role={props.role} />
    case 'login':
      return (
        <LoginScreen
          busy={props.busy}
          canRegister={props.role === 'customer' ? props.features.customerRegistration : props.features.workerRegistration}
          copy={props.copy}
          identifier={props.identifier}
          language={props.language}
          error={props.error}
          features={props.features}
          onBack={() => props.go('role-gate')}
          onIdentifierChange={props.setIdentifier}
          onForgotPassword={() => props.go('password-recovery')}
          onGoogle={props.providerLogin}
          onPasswordChange={props.setPassword}
          onRegister={() => props.go('register')}
          onRemember={props.setRemember}
          onSubmit={props.submitLogin}
          password={props.password}
          remember={props.remember}
          role={props.role}
        />
      )
    case 'register':
      return (
        <RegisterScreen
          acceptedTerms={props.acceptedTerms}
          busy={props.busy}
          copy={props.copy}
          identifier={props.identifier}
          language={props.language}
          error={props.error}
          fullName={props.fullName}
          onBack={() => props.go('login')}
          onIdentifierChange={props.setIdentifier}
          onFullNameChange={props.setFullName}
          onLogin={() => props.go('login')}
          onPasswordChange={props.setPassword}
          onSubmit={props.submitRegister}
          onToggleTerms={props.setAcceptedTerms}
          password={props.password}
          role={props.role}
        />
      )
    case 'password-recovery':
      return (
        <PasswordRecoveryScreen
          busy={props.busy}
          error={props.error}
          identifier={props.identifier}
          language={props.language}
          notice={props.notice}
          onBack={() => props.go('login')}
          onIdentifierChange={props.setIdentifier}
          onSubmit={props.submitPasswordRecovery}
        />
      )
    case 'password-reset':
      return (
        <PasswordResetScreen
          language={props.language}
          onComplete={async (newPassword) => {
            if (!props.onCompletePasswordRecovery) {
              return {
                success: false,
                error: props.copy.errors.recoveryUnavailable,
              }
            }
            return props.onCompletePasswordRecovery(newPassword)
          }}
          onExit={async () => {
            if (props.onExitPasswordRecovery) {
              await props.onExitPasswordRecovery()
              return
            }
            props.go('login')
          }}
        />
      )
    case 'onboarding':
      return <OnboardingScreen busy={props.busy} copy={props.copy} error={props.error} onComplete={props.completeOnboarding} role={props.role} />
  }
}

function Screen({ children }: { children: React.ReactNode }) {
  return <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>{children}</SafeAreaView>
}

function runtimeBuildMarkerText(copy: EntryAccessCopy['runtime']) {
  const info = mobileRuntimeConfig.runtimeBuildInfo
  const sha = info.gitShortSha || (info.gitSha ? info.gitSha.slice(0, 12) : '') || copy.unknown
  const parts = [`SHA ${sha}`]

  if (info.gitBranch) parts.push(`${copy.branch} ${info.gitBranch}`)
  if (info.easBuildProfile) parts.push(`${copy.profile} ${info.easBuildProfile}`)
  if (info.easBuildPlatform) parts.push(`${copy.platform} ${info.easBuildPlatform}`)
  if (info.easBuildId) parts.push(`${copy.build} ${info.easBuildId}`)
  if (info.builtAt) parts.push(`${copy.builtAt} ${info.builtAt}`)

  return parts.join(' | ')
}

function RuntimeBuildMarker({ copy }: { copy: EntryAccessCopy }) {
  const [visible, setVisible] = useState(false)
  const marker = useMemo(() => runtimeBuildMarkerText(copy.runtime), [copy.runtime])

  return (
    <>
      <Pressable
        accessibilityLabel={`${copy.accessibility.runtimeMarker}: ${marker}`}
        accessibilityRole="button"
        hitSlop={6}
        onLongPress={() => setVisible(true)}
        onPress={() => visible && setVisible(false)}
        style={styles.runtimeMarkerHotspot}
        testID="auth-runtime-marker-hotspot"
      />
      {visible ? (
        <View pointerEvents="none" style={styles.runtimeMarkerPill} testID="auth-runtime-marker">
          <Text selectable style={styles.runtimeMarkerText}>{marker}</Text>
        </View>
      ) : null}
    </>
  )
}

function SplashScreen({ copy, durationMs }: { copy: EntryAccessCopy; durationMs: number }) {
  return (
    <Screen>
      <View style={[styles.screen, styles.centeredScreen]} testID="auth-splash-1-1">
        <SplashFormulaAura />
        <View style={styles.splashCenter}>
          <LottieLogoMark size={354} testID="auth-welcome-nestscout-logo" />
          <SplashBrandLockup copy={copy} />
        </View>
        <View style={styles.splashFoot}>
          <SplashLoadingBar durationMs={durationMs} />
          <Text style={styles.caption}>{copy.splash.preparing}</Text>
        </View>
      </View>
    </Screen>
  )
}

function SplashBrandLockup({ copy }: { copy: EntryAccessCopy }) {
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
      <Text style={styles.splashTagline}>{copy.splash.tagline}</Text>
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

  if (reduceTransparency || Platform.OS !== 'web') return null

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

function AuthTopBar({ backLabel, onBack, title }: { backLabel: string; onBack: () => void; title: string }) {
  return (
    <View style={styles.topbar}>
      <IconButton label={backLabel} onPress={onBack} />
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
      </View>
    </View>
  )
}

function LoginScreen(props: {
  busy: boolean; canRegister: boolean; error: string | null; remember: boolean
  copy: EntryAccessCopy; features: EntryAccessFeatureFlags
  identifier: string; language: AppLanguage; password: string; role: EntryRole
  onBack: () => void; onForgotPassword: () => void; onGoogle: () => void
  onIdentifierChange: (value: string) => void; onPasswordChange: (value: string) => void
  onRegister: () => void; onRemember: () => void; onSubmit: () => void
}) {
  const identifierProps = identifierFieldProps(props.identifier, props.role, props.language)
  const showProviders = props.role === 'customer' && props.features.customerGoogle
  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <ScrollView bounces={false} contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AuthTopBar backLabel={props.copy.accessibility.back} onBack={props.onBack} title={props.copy.login.topbar} />
          <FormHeader lead={props.copy.login.lead} title={props.copy.login.title} />
          <NativeSafeGlassPanel style={styles.formPanel} testID="auth-login-1-4">
            <EntryTextField {...identifierProps} onChangeText={props.onIdentifierChange} testID="auth-login-email-input" value={props.identifier} />
            <EntryTextField icon="lock" label={props.copy.login.passwordLabel} onChangeText={props.onPasswordChange} placeholder={props.copy.login.passwordPlaceholder} secureTextEntry testID="auth-login-password-input" textContentType="password" value={props.password} />
            <View style={styles.formUtils}>
              <CheckRow checked={props.remember} label={props.copy.login.remember} onPress={props.onRemember} testID="auth-login-remember" />
              {props.role === 'customer' ? <Pressable accessibilityRole="link" hitSlop={8} onPress={props.onForgotPassword} testID="auth-customer-forgot-password"><Text style={styles.link}>{props.copy.login.forgotPassword}</Text></Pressable> : <View />}
            </View>
            {props.error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{props.error}</Text> : null}
            <PrimaryButton disabled={props.busy} label={props.busy ? props.copy.login.busy : props.copy.login.submit} onPress={props.onSubmit} testID="auth-login-submit" />
            {showProviders ? (
              <>
                <Divider label={props.copy.login.providerDivider} />
                <View style={styles.providerRow}>
                  {props.features.customerGoogle ? <ProviderButton accessibilityLabel={`${props.copy.accessibility.continueWithProvider} Google`} disabled={props.busy} label="Google" onPress={props.onGoogle} testID="auth-client-google-primary" /> : null}
                </View>
              </>
            ) : null}
            {props.canRegister ? <Text style={styles.formSwitch}>{props.copy.login.noAccount} <Text accessibilityRole="link" onPress={props.onRegister} style={styles.formSwitchLink} testID="auth-client-register-email">{props.copy.login.register}</Text></Text> : null}
          </NativeSafeGlassPanel>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

function RegisterScreen(props: {
  acceptedTerms: boolean; busy: boolean; error: string | null
  copy: EntryAccessCopy; language: AppLanguage; role: EntryRole
  fullName: string; identifier: string; password: string
  onBack: () => void; onLogin: () => void; onSubmit: () => void; onToggleTerms: () => void
  onFullNameChange: (value: string) => void; onIdentifierChange: (value: string) => void; onPasswordChange: (value: string) => void
}) {
  const identifierProps = registrationIdentifierFieldProps()
  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <ScrollView bounces={false} contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AuthTopBar backLabel={props.copy.accessibility.back} onBack={props.onBack} title={props.copy.register.topbar} />
          <FormHeader lead={props.role === 'customer' ? props.copy.register.customerLead : props.copy.register.workerLead} title={props.role === 'customer' ? props.copy.register.customerTitle : props.copy.register.workerTitle} />
          <NativeSafeGlassPanel style={styles.formPanel} testID="auth-register-1-5">
            <EntryTextField autoCapitalize="words" icon="user" label={props.copy.register.fullNameLabel} onChangeText={props.onFullNameChange} placeholder={props.copy.register.fullNamePlaceholder} testID="auth-register-name-input" textContentType="name" value={props.fullName} />
            <EntryTextField {...identifierProps} onChangeText={props.onIdentifierChange} testID="auth-register-email-input" value={props.identifier} />
            <EntryTextField icon="lock" label={props.copy.register.passwordLabel} onChangeText={props.onPasswordChange} placeholder={props.copy.register.passwordPlaceholder} secureTextEntry testID="auth-register-password-input" textContentType="newPassword" value={props.password} />
            <View style={styles.termsRow}>
              <CheckRow checked={props.acceptedTerms} label={props.copy.register.terms} onPress={props.onToggleTerms} testID="auth-register-terms" />
            </View>
            {props.error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{props.error}</Text> : null}
            <PrimaryButton disabled={props.busy} label={props.busy ? props.copy.register.busy : props.role === 'customer' ? props.copy.register.customerSubmit : props.copy.register.workerSubmit} onPress={props.onSubmit} testID="auth-register-submit" />
            <Text style={styles.formSwitch}>{props.copy.register.accountExists} <Text accessibilityRole="link" onPress={props.onLogin} style={styles.formSwitchLink}>{props.copy.register.login}</Text></Text>
          </NativeSafeGlassPanel>
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

function OnboardingScreen({ busy, copy, error, onComplete, role }: { busy: boolean; copy: EntryAccessCopy; error: string | null; onComplete: () => void; role: EntryRole }) {
  const [identity, activity, shield] = copy.onboarding.benefits
  return (
    <Screen>
      <View style={styles.screen} testID="auth-onboarding-1-6">
        <View style={styles.onboardingHead}>
          <Text style={[styles.h1, styles.onboardingTitle]}>{normalizeTitleBreaks(copy.onboarding.title)}</Text>
          <Text style={[styles.lead, styles.onboardingLead]}>{role === 'customer' ? copy.onboarding.customerLead : copy.onboarding.workerLead}</Text>
        </View>
        <KaelCoreHero compact />
        <View style={styles.benefitRow}>
          <BenefitCard label={identity.label} meta={identity.meta} source={assets.identity} />
          <BenefitCard label={activity.label} meta={activity.meta} source={assets.activity} />
          <BenefitCard label={shield.label} meta={shield.meta} source={assets.shield} />
        </View>
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        <View style={styles.onboardingBottom}>
          <PrimaryButton disabled={busy} label={copy.onboarding.submit} onPress={onComplete} testID="auth-onboarding-start" />
          <View style={styles.pager}><View style={styles.pagerDot} /><View style={styles.pagerDot} /><View style={styles.pagerActive} /></View>
        </View>
      </View>
    </Screen>
  )
}

function BenefitCard({ label, meta, source }: { label: string; meta: string; source: ImageSourcePropType }) {
  return (
    <GlassPanel style={styles.benefitCard}>
      <Image contentFit="contain" source={source} style={styles.benefitIcon} />
      <Text style={styles.benefitLabel}>{label}</Text>
      <Text style={styles.benefitMeta}>{meta}</Text>
    </GlassPanel>
  )
}
