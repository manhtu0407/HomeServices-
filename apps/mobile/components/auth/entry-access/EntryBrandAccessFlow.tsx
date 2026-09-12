import { useEffect, useMemo, useState } from 'react'
import { Image } from 'expo-image'
import { StatusBar } from 'expo-status-bar'
import {
  Appearance,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAppLanguage, type AppLanguage } from '@/lib/app-language'
import { getRememberedAuthCredentials } from '@/lib/remembered-auth-credentials'
import { getRememberedAuthIdentifier } from '@/lib/remembered-auth-identifier'
import { LiquidBackButton } from '@/components/ui/liquid-back-button'
import { PublicPrivacyPolicyLink } from '@/components/ui/public-privacy-policy-link'
import { GlassPanel, KaelCoreHero, NativeSafeGlassPanel, PageAura, PrimaryButton } from './components/materials'
import { CheckRow, EntryTextField } from './components/fields'
import { ProviderButton } from './components/provider-button'
import { entryAccessCopy, localizeEntryAuthError, type EntryAccessCopy } from './copy'
import { useEntryAccessState } from './entry-access-state'
import { identifierFieldProps, localizeIdentifierAvailabilityError, registrationIdentifierFieldProps } from './entry-identifier-fields'
import { entryBrandAccessFlowStyles as styles } from './entry-brand-access-flow-styles'
import { NestScoutLogoMotionMark, NESTSCOUT_LOGO_MOTION_DURATION_MS } from './nestscout-logo-motion-mark'
import { PasswordRecoveryScreen, PasswordResetScreen } from './password-recovery-screen'
import { RoleGateScreen } from './role-gate-screen'
import { selectRoleGateGreeting } from './role-gate-greeting'
import { useEntryBrandAccessActions } from './use-entry-brand-access-actions'
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
  customerApple: true,
  customerGoogle: true,
  customerRegistration: true,
  workerRegistration: true,
}

export function EntryBrandAccessFlow({
  actions,
  featureFlags,
  initialRole = 'customer',
  initialStep = 'splash',
  restoreRememberedRole = true,
  onRoleChange,
  onStepChange,
  splashDurationMs = NESTSCOUT_LOGO_MOTION_DURATION_MS,
  workerApplication,
}: EntryBrandAccessFlowProps) {
  const language = useAppLanguage()
  const copy = entryAccessCopy[language]
  const features = useMemo(() => ({ ...defaultFeatures, ...featureFlags }), [featureFlags])
  const [notice, setNotice] = useState<string | null>(null)
  const entryAccessState = useEntryAccessState(initialRole, initialStep)
  const {
    acceptedTerms,
    busy,
    error,
    fullName,
    identifier,
    password,
    passwordConfirmation,
    remember,
    role,
    setAcceptedTerms,
    setFullName,
    setIdentifier,
    setPassword,
    setPasswordConfirmation,
    setRemember,
    step,
    updateState,
  } = entryAccessState
  const localizedError = error
    ? localizeIdentifierAvailabilityError(error, language) ?? localizeEntryAuthError(error, language, 'connectionFailed')
    : null
  const [roleGateGreetingSelection] = useState(() => ({ now: new Date(), random: Math.random() }))
  const roleGateGreeting = useMemo(
    () => selectRoleGateGreeting(roleGateGreetingSelection.now, () => roleGateGreetingSelection.random, language),
    [language, roleGateGreetingSelection],
  )
  useEffect(() => {
    StatusBar.setStyle('dark')
    return () => {
      StatusBar.setStyle(Appearance.getColorScheme() === 'dark' ? 'light' : 'dark')
    }
  }, [])

  useEffect(() => {
    let active = true
    if (step !== 'login' || identifier || password) return () => {
      active = false
    }

    void getRememberedAuthCredentials().then(async (rememberedCredentials) => {
      if (!active) return
      if (rememberedCredentials) {
        updateState({
          identifier: rememberedCredentials.identifier,
          password: rememberedCredentials.password,
          ...(restoreRememberedRole ? { role: rememberedCredentials.role } : {}),
        })
        return
      }

      const rememberedIdentifier = await getRememberedAuthIdentifier()
      if (active && rememberedIdentifier) setIdentifier(rememberedIdentifier)
    })
    return () => {
      active = false
    }
  }, [identifier, password, restoreRememberedRole, setIdentifier, step, updateState])
  const {
    chooseRole,
    completeOnboarding,
    go,
    providerLogin,
    submitLogin,
    submitPasswordRecovery,
    submitRegister,
  } = useEntryBrandAccessActions({
    actions,
    controller: entryAccessState,
    copy,
    language,
    onRoleChange,
    onStepChange,
    setNotice,
    splashDurationMs,
  })

  return (
    <View style={styles.root} testID={`auth-${step}-screen`}>
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
        passwordConfirmation={passwordConfirmation}
        providerLogin={providerLogin}
        remember={remember}
        role={role}
        roleGateGreeting={roleGateGreeting}
        setAcceptedTerms={setAcceptedTerms}
        setFullName={setFullName}
        setIdentifier={setIdentifier}
        setPassword={setPassword}
        setPasswordConfirmation={setPasswordConfirmation}
        setRemember={setRemember}
        step={step}
        submitLogin={submitLogin}
        submitPasswordRecovery={submitPasswordRecovery}
        submitRegister={submitRegister}
        workerApplication={workerApplication}
      />
    </View>
  )
}

type EntryAccessStepContentProps = {
  acceptedTerms: boolean; busy: boolean; error: string | null; remember: boolean
  chooseRole: (role: EntryRole) => void; completeOnboarding: () => void; providerLogin: (provider: 'apple' | 'google') => Promise<void>
  copy: EntryAccessCopy; features: EntryAccessFeatureFlags; roleGateGreeting: ReturnType<typeof selectRoleGateGreeting>
  fullName: string; identifier: string; notice: string | null; password: string; passwordConfirmation: string
  go: (step: EntryAccessStep) => void; setAcceptedTerms: () => void; setRemember: () => void
  language: AppLanguage; role: EntryRole; step: EntryAccessStep
  onCompletePasswordRecovery?: (password: string) => Promise<{ success: boolean; error?: string }>
  onExitPasswordRecovery?: () => Promise<void> | void
  setFullName: (value: string) => void; setIdentifier: (value: string) => void; setPassword: (value: string) => void; setPasswordConfirmation: (value: string) => void
  submitLogin: () => void; submitPasswordRecovery: () => void; submitRegister: () => void
  workerApplication: EntryBrandAccessFlowProps['workerApplication']
}

function EntryAccessStepContent(props: EntryAccessStepContentProps) {
  switch (props.step) {
    case 'splash':
      return <SplashScreen copy={props.copy} />
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
          onApple={() => { void props.providerLogin('apple') }}
          onGoogle={() => { void props.providerLogin('google') }}
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
          passwordConfirmation={props.passwordConfirmation}
          role={props.role}
          onPasswordConfirmationChange={props.setPasswordConfirmation}
        />
      )
    case 'email-confirmation':
      return <EmailConfirmationScreen copy={props.copy} onLogin={() => props.go('login')} />
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
      return <OnboardingScreen busy={props.busy} copy={props.copy} error={props.error} onComplete={props.completeOnboarding} role={props.role} workerApplication={props.workerApplication} />
  }
}

function Screen({ children }: { children: React.ReactNode }) {
  return <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>{children}</SafeAreaView>
}

function SplashScreen({ copy }: { copy: EntryAccessCopy }) {
  return (
    <Screen>
      <View style={[styles.screen, styles.centeredScreen]} testID="auth-splash-1-1">
        <View style={styles.splashCenter}>
          <NestScoutLogoMotionMark accessibilityLabel={copy.accessibility.logo} testID="auth-welcome-nestscout-logo" />
        </View>
      </View>
    </Screen>
  )
}

function AuthTopBar({ backLabel, onBack, title }: { backLabel: string; onBack: () => void; title: string }) {
  return (
    <View style={styles.topbar}>
      <LiquidBackButton label={backLabel} onPress={onBack} testID="auth-entry-back-button" />
      <Text style={styles.topbarTitle}>{title}</Text>
      <View style={styles.topbarSpacer} />
    </View>
  )
}

function normalizeTitleBreaks(value: string) {
  return value.replace(/\\n/g, '\n')
}

function FormHeader({ lead, singleLineTitle = false, title }: { lead: string; singleLineTitle?: boolean; title: string }) {
  return (
    <View style={styles.formHead}>
      <View style={styles.formHeadRow}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={singleLineTitle ? 1 : undefined} style={styles.formTitle}>{normalizeTitleBreaks(title)}</Text>
          {lead ? <Text style={[styles.lead, { marginTop: 6 }]}>{lead}</Text> : null}
        </View>
      </View>
    </View>
  )
}

function LoginScreen(props: {
  busy: boolean; canRegister: boolean; error: string | null; remember: boolean
  copy: EntryAccessCopy; features: EntryAccessFeatureFlags
  identifier: string; language: AppLanguage; password: string; role: EntryRole
  onApple: () => void; onBack: () => void; onForgotPassword: () => void; onGoogle: () => void
  onIdentifierChange: (value: string) => void; onPasswordChange: (value: string) => void
  onRegister: () => void; onRemember: () => void; onSubmit: () => void
}) {
  const identifierProps = identifierFieldProps(props.identifier, props.role, props.language)
  const showProviders = props.role === 'customer' && (props.features.customerApple || props.features.customerGoogle)
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
                <View style={styles.providerStack} testID="auth-provider-options">
                  {props.features.customerGoogle ? <ProviderButton accessibilityLabel={`${props.copy.accessibility.continueWithProvider} Google`} disabled={props.busy} label="Google" onPress={props.onGoogle} provider="google" testID="auth-client-google-primary" /> : null}
                  {props.features.customerApple ? <ProviderButton accessibilityLabel={`${props.copy.accessibility.continueWithProvider} Apple`} disabled={props.busy} label="Apple" onPress={props.onApple} provider="apple" testID="auth-client-apple-secondary" /> : null}
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
  fullName: string; identifier: string; password: string; passwordConfirmation: string
  onBack: () => void; onLogin: () => void; onSubmit: () => void; onToggleTerms: () => void
  onFullNameChange: (value: string) => void; onIdentifierChange: (value: string) => void; onPasswordChange: (value: string) => void; onPasswordConfirmationChange: (value: string) => void
}) {
  const identifierProps = registrationIdentifierFieldProps(props.identifier, props.role, props.language)
  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <ScrollView bounces={false} contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AuthTopBar backLabel={props.copy.accessibility.back} onBack={props.onBack} title={props.copy.register.topbar} />
          <FormHeader
            lead={props.role === 'customer' ? props.copy.register.customerLead : ''}
            singleLineTitle
            title={props.role === 'customer' ? props.copy.register.customerTitle : props.copy.register.workerTitle}
          />
          <NativeSafeGlassPanel style={styles.formPanel} testID="auth-register-1-5">
            <EntryTextField autoCapitalize="words" icon="user" label={props.copy.register.fullNameLabel} onChangeText={props.onFullNameChange} placeholder={props.copy.register.fullNamePlaceholder} testID="auth-register-name-input" textContentType="name" value={props.fullName} />
            <EntryTextField {...identifierProps} onChangeText={props.onIdentifierChange} testID="auth-register-email-input" value={props.identifier} />
            <EntryTextField icon="lock" label={props.copy.register.passwordLabel} onChangeText={props.onPasswordChange} placeholder={props.copy.register.passwordPlaceholder} secureTextEntry testID="auth-register-password-input" textContentType="newPassword" value={props.password} />
            <EntryTextField icon="lock" label={props.copy.register.passwordConfirmationLabel} onChangeText={props.onPasswordConfirmationChange} placeholder={props.copy.register.passwordConfirmationPlaceholder} secureTextEntry testID="auth-register-password-confirmation-input" textContentType="newPassword" value={props.passwordConfirmation} />
            <View style={styles.termsRow}>
              <CheckRow checked={props.acceptedTerms} label={props.copy.register.terms} onPress={props.onToggleTerms} testID="auth-register-terms" />
              <PublicPrivacyPolicyLink language={props.language} testID="auth-register-privacy-policy" />
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

function EmailConfirmationScreen({ copy, onLogin }: { copy: EntryAccessCopy; onLogin: () => void }) {
  return (
    <Screen>
      <View style={styles.screen} testID="auth-signup-confirmation-screen">
        <AuthTopBar backLabel={copy.accessibility.back} onBack={onLogin} title={copy.emailConfirmation.topbar} />
        <FormHeader lead={copy.emailConfirmation.lead} title={copy.emailConfirmation.title} />
        <NativeSafeGlassPanel style={styles.formPanel}>
          <PrimaryButton label={copy.emailConfirmation.login} onPress={onLogin} testID="auth-signup-confirmation-login" />
        </NativeSafeGlassPanel>
      </View>
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

function OnboardingScreen({ busy, copy, error, onComplete, role, workerApplication }: { busy: boolean; copy: EntryAccessCopy; error: string | null; onComplete: () => void; role: EntryRole; workerApplication: EntryBrandAccessFlowProps['workerApplication'] }) {
  const [identity, activity, shield] = copy.onboarding.benefits
  const status = role === 'worker' ? workerApplication?.status : undefined
  const workerLead = status === 'pending_review'
    ? copy.onboarding.workerPendingLead
    : status === 'changes_requested'
      ? copy.onboarding.workerChangesRequestedLead
      : status === 'rejected'
        ? copy.onboarding.workerRejectedLead
        : status === 'approved'
          ? copy.onboarding.workerApprovedLead
          : copy.onboarding.workerLead
  const submitLabel = status === 'changes_requested'
    ? copy.onboarding.workerResubmit
    : status && status !== 'not_submitted'
      ? copy.onboarding.workerCheckStatus
      : copy.onboarding.submit
  return (
    <Screen>
      <View style={styles.screen} testID="auth-onboarding-1-6">
        <View style={styles.onboardingHead}>
          <Text style={[styles.h1, styles.onboardingTitle]}>{normalizeTitleBreaks(copy.onboarding.title)}</Text>
          <Text style={[styles.lead, styles.onboardingLead]}>{role === 'customer' ? copy.onboarding.customerLead : workerLead}</Text>
          {role === 'worker' && workerApplication?.reason ? (
            <Text accessibilityLiveRegion="polite" style={[styles.lead, styles.onboardingLead]} testID="auth-worker-application-reason">
              {workerApplication.reason}
            </Text>
          ) : null}
        </View>
        <KaelCoreHero compact />
        <View style={styles.benefitRow}>
          <BenefitCard label={identity.label} meta={identity.meta} source={assets.identity} />
          <BenefitCard label={activity.label} meta={activity.meta} source={assets.activity} />
          <BenefitCard label={shield.label} meta={shield.meta} source={assets.shield} />
        </View>
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        <View style={styles.onboardingBottom}>
          <PrimaryButton disabled={busy} label={submitLabel} onPress={onComplete} testID="auth-onboarding-start" />
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
