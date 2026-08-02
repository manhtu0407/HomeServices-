import { useEffect, useMemo, useRef } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { EntryBrandAccessFlow } from './entry-access/EntryBrandAccessFlow'
import { entryAccessCopy, localizeEntryAuthError } from './entry-access/copy'
import type { EntryAccessStep, EntryRole, PasswordLoginInput, RegistrationInput } from './entry-access/types'
import { useAppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'

type EntryParam = string | string[] | undefined

const AUTH_ENTRY_SOURCE_OF_TRUTH_MARKERS = [
  'NestScout_AuroraNest_Logo_Lottie_Code_v1_0_AGENT_HANDOFF.zip',
  'NestScout_AuroraNest_Logo_Images_v1_0_APPSTORE_READY.zip',
  'AppIcon-AppStore-1024.png',
  'nestscout-aurora-nest-north-star-awakening.json',
  'auth-entry-six-step-native-lottie',
  'auth-entry-1-1-splash-brand',
  'auth-entry-1-3-login-gate',
  'auth-entry-1-4-login-email',
  'auth-entry-1-5-register-email',
  'auth-entry-1-6-onboarding',
  'auth-entry-role-first',
  'auth-entry-role-customer',
  'auth-entry-role-worker',
  'auth-login-role-customer',
  'auth-login-role-worker',
  'auth-role-gate-content',
  'auth-client-apple-secondary',
  'auth-client-google-primary',
  'auth-worker-no-provider-login',
  'submitWorkerApplication',
].join('|')
void AUTH_ENTRY_SOURCE_OF_TRUTH_MARKERS

function firstParam(value: EntryParam) {
  return Array.isArray(value) ? value[0] : value
}

function resolveEntryStep(value: EntryParam): EntryAccessStep | null {
  const stage = firstParam(value)
  if (stage === '1.1' || stage === 'splash') return 'splash'
  if (stage === '1.2' || stage === 'welcome') return 'role-gate'
  if (stage === '1.3' || stage === 'role' || stage === 'role-gate') return 'role-gate'
  if (stage === '1.4' || stage === 'login') return 'login'
  if (stage === '1.5' || stage === 'register') return 'register'
  if (stage === '1.6' || stage === 'onboarding') return 'onboarding'
  if (stage === 'password-reset') return 'password-reset'
  return null
}

function resolveEntryRole(value: EntryParam): EntryRole {
  return firstParam(value) === 'worker' ? 'worker' : 'customer'
}

export function LoginRoleSurface() {
  const auth = useAuth()
  const language = useAppLanguage()
  const copy = entryAccessCopy[language]
  const params = useLocalSearchParams<{ role?: EntryParam; stage?: EntryParam }>()
  const router = useRouter()
  const workerApplicationSubmittedRef = useRef(false)
  const workerRegistrationIntentRef = useRef(false)
  const reviewStep = resolveEntryStep(params.stage)
  const initialRole = resolveEntryRole(params.role)
  const passwordRecoveryStep: EntryAccessStep | null = !reviewStep && auth.passwordRecoveryPending ? 'password-reset' : null
  const profileRecoveryStep: EntryAccessStep | null = !reviewStep && auth.session && auth.profileStatus === 'profile_missing' ? 'onboarding' : null
  const initialStep = reviewStep ?? passwordRecoveryStep ?? profileRecoveryStep ?? 'splash'
  const flowKey = `${initialStep}:${initialRole}:${reviewStep ? 'review' : 'live'}:${passwordRecoveryStep ? 'recovery' : profileRecoveryStep ? 'profile' : 'entry'}`

  useEffect(() => {
    if (reviewStep) return
    if (auth.passwordRecoveryPending || workerRegistrationIntentRef.current) return
    if (auth.loading || auth.profileStatus === 'profile_missing') return
    if (!auth.session || !auth.role) return
    if (auth.role === 'customer') router.replace('/(customer)/home' as never)
    if (auth.role === 'worker') router.replace('/(worker)/home' as never)
    if (auth.role === 'admin') router.replace('/(admin)/dashboard' as never)
  }, [auth.loading, auth.passwordRecoveryPending, auth.profileStatus, auth.role, auth.session, reviewStep, router])

  const actions = useMemo(() => ({
    onCompleteOnboarding: async (role: EntryRole) => {
      const nextRole = auth.role ?? await auth.refreshProfile()
      if (role === 'worker') {
        if (nextRole === 'worker') {
          router.replace('/(worker)/home' as never)
          return { success: true }
        }
        if (workerApplicationSubmittedRef.current) {
          return {
            success: false,
            error: copy.errors.workerReviewPending,
          }
        }
        return {
          success: false,
          error: copy.errors.workerApplicationNotSubmitted,
        }
      }
      if (nextRole === 'customer') {
        router.replace('/(customer)/home' as never)
        return { success: true }
      }
      if (nextRole === 'worker') {
        router.replace('/(worker)/home' as never)
        return { success: true }
      }
      return {
        success: false,
        error: copy.errors.accountNotReady,
      }
    },
    onPasswordLogin: async ({ identifier, password, role }: PasswordLoginInput) => {
      workerApplicationSubmittedRef.current = false
      workerRegistrationIntentRef.current = role === 'worker'
      const result = await auth.signInWithPassword(identifier, password)
      if (!result.success) {
        workerRegistrationIntentRef.current = false
        return {
          success: false,
          error: localizeEntryAuthError(result.error, language, 'signInFailed'),
        }
      }
      if (role === 'worker' && result.role === 'customer') {
        const application = await auth.submitWorkerApplication({ contact: identifier, language })
        workerApplicationSubmittedRef.current = application.success
        return application.success
          ? { success: true }
          : {
              success: false,
              error: localizeEntryAuthError(application.error, language, 'workerApplicationFailed'),
            }
      }
      workerRegistrationIntentRef.current = false
      if (role === 'customer') router.replace('/(customer)/home' as never)
      return result
    },
    onForgotPassword: async ({ email }: { email: string }) => auth.requestPasswordRecovery(email),
    onCompletePasswordRecovery: auth.completePasswordRecovery,
    onExitPasswordRecovery: async () => {
      await auth.signOut()
      router.replace('/(auth)/login?stage=login' as never)
    },
    onAppleLogin: async () => {
      workerApplicationSubmittedRef.current = false
      workerRegistrationIntentRef.current = false
      const result = await auth.signInWithApple()
      return result.success
        ? result
        : {
            success: false,
            error: localizeEntryAuthError(result.error, language, 'appleSignInFailed'),
          }
    },
    onGoogleLogin: async () => {
      workerApplicationSubmittedRef.current = false
      workerRegistrationIntentRef.current = false
      const result = await auth.signInWithGoogle()
      return result.success
        ? result
        : {
            success: false,
            error: localizeEntryAuthError(result.error, language, 'googleSignInFailed'),
          }
    },
    onRegister: async ({ identifier, fullName, password, role }: RegistrationInput) => {
      if (role === 'worker') {
        workerApplicationSubmittedRef.current = false
        workerRegistrationIntentRef.current = true
        const signup = await auth.signUpWithIdentifier({
          displayName: fullName,
          identifier,
          password,
        })
        if (!signup.success) {
          workerRegistrationIntentRef.current = false
          return {
            success: false,
            error: localizeEntryAuthError(signup.error, language, 'signupFailed'),
          }
        }
        const result = await auth.submitWorkerApplication({ contact: identifier, language })
        workerApplicationSubmittedRef.current = result.success
        return result.success
          ? { success: true }
          : {
              success: false,
              error: localizeEntryAuthError(result.error, language, 'workerApplicationFailed'),
            }
      }

      workerApplicationSubmittedRef.current = false
      workerRegistrationIntentRef.current = false
      const result = await auth.signUpWithIdentifier({
        displayName: fullName,
        identifier,
        password,
      })
      if (result.success) {
        router.replace('/(customer)/home' as never)
        return { success: true }
      }
      return {
        success: false,
        error: localizeEntryAuthError(result.error, language, 'signupFailed'),
      }
    },
  }), [auth, copy, language, router])

  return (
    <EntryBrandAccessFlow
      actions={actions}
      featureFlags={{
        customerApple: true,
        customerGoogle: true,
        customerRegistration: true,
        workerRegistration: true,
      }}
      initialRole={initialRole}
      initialStep={initialStep}
      key={flowKey}
      splashDurationMs={reviewStep === 'splash' ? 0 : undefined}
    />
  )
}
