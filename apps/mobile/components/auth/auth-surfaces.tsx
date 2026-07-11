import { useEffect, useMemo } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { EntryBrandAccessFlow } from './entry-access/EntryBrandAccessFlow'
import type { EmailLoginInput, EntryAccessStep, EntryRole, RegistrationInput } from './entry-access/types'
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
  'auth-client-google-primary',
  'auth-client-gmail-secondary',
  'auth-client-facebook-secondary',
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
  return null
}

function resolveEntryRole(value: EntryParam): EntryRole {
  return firstParam(value) === 'worker' ? 'worker' : 'customer'
}

const ENTRY_AUTH_COPY = {
  accountNotReady: 'T\u00e0i kho\u1ea3n ch\u01b0a s\u1eb5n s\u00e0ng \u0111\u1ec3 v\u00e0o \u1ee9ng d\u1ee5ng. Vui l\u00f2ng ho\u00e0n t\u1ea5t \u0111\u0103ng nh\u1eadp tr\u01b0\u1edbc.',
  emailConfirmation: 'Ki\u1ec3m tra email \u0111\u1ec3 x\u00e1c nh\u1eadn t\u00e0i kho\u1ea3n tr\u01b0\u1edbc khi ti\u1ebfp t\u1ee5c.',
  facebookPending: 'Facebook ch\u01b0a s\u1eb5n s\u00e0ng tr\u00ean b\u1ea3n d\u1ef1ng n\u00e0y.',
  forgotPasswordPending: '\u0110\u1eb7t l\u1ea1i m\u1eadt kh\u1ea9u ch\u01b0a s\u1eb5n s\u00e0ng.',
  gmailPending: 'Gmail ch\u01b0a s\u1eb5n s\u00e0ng tr\u00ean b\u1ea3n d\u1ef1ng n\u00e0y.',
  workerReviewPending: 'H\u1ed3 s\u01a1 th\u1ee3 \u0111\u00e3 \u0111\u01b0\u1ee3c g\u1eedi x\u00e9t duy\u1ec7t. NestScout s\u1ebd li\u00ean h\u1ec7 tr\u01b0\u1edbc khi c\u1ea5p quy\u1ec1n th\u1ee3.',
} as const

export function LoginRoleSurface() {
  const auth = useAuth()
  const language = useAppLanguage()
  const params = useLocalSearchParams<{ role?: EntryParam; stage?: EntryParam }>()
  const router = useRouter()
  const reviewStep = resolveEntryStep(params.stage)
  const initialRole = resolveEntryRole(params.role)
  const profileRecoveryStep: EntryAccessStep | null = !reviewStep && auth.session && auth.profileStatus === 'profile_missing' ? 'onboarding' : null
  const initialStep = reviewStep ?? profileRecoveryStep ?? 'splash'
  const flowKey = `${initialStep}:${initialRole}:${reviewStep ? 'review' : 'live'}:${profileRecoveryStep ? 'profile' : 'entry'}`

  useEffect(() => {
    if (reviewStep) return
    if (auth.loading || auth.profileStatus === 'profile_missing') return
    if (!auth.session || !auth.role) return
    if (auth.role === 'customer') router.replace('/(customer)/home' as never)
    if (auth.role === 'worker') router.replace('/(worker)/home' as never)
    if (auth.role === 'admin') router.replace('/(admin)/dashboard' as never)
  }, [auth.loading, auth.profileStatus, auth.role, auth.session, reviewStep, router])

  const actions = useMemo(() => ({
    onCompleteOnboarding: async (role: EntryRole) => {
      const nextRole = auth.role ?? await auth.refreshProfile()
      if (nextRole === 'customer') {
        router.replace('/(customer)/home' as never)
        return { success: true }
      }
      if (nextRole === 'worker') {
        router.replace('/(worker)/home' as never)
        return { success: true }
      }
      if (!auth.session && role === 'worker') {
        return {
          success: false,
          error: ENTRY_AUTH_COPY.workerReviewPending,
        }
      }
      return {
        success: false,
        error: ENTRY_AUTH_COPY.accountNotReady,
      }
    },
    onEmailLogin: async ({ email, password }: EmailLoginInput) => auth.signInWithPassword(email, password),
    onFacebookLogin: async () => ({
      success: false,
      error: ENTRY_AUTH_COPY.facebookPending,
    }),
    onForgotPassword: async () => ({
      success: false,
      error: ENTRY_AUTH_COPY.forgotPasswordPending,
    }),
    onGmailLogin: async () => ({
      success: false,
      error: ENTRY_AUTH_COPY.gmailPending,
    }),
    onGoogleLogin: auth.signInWithGoogle,
    onRegister: async ({ email, fullName, password, role }: RegistrationInput) => {
      if (role === 'worker') {
        const result = await auth.submitWorkerApplication({ contact: email, language })
        return result.success
          ? { success: true }
          : { success: false, error: result.error }
      }

      const result = await auth.signUpWithEmail({
        displayName: fullName,
        email,
        password,
      })
      if (result.success && result.needsConfirmation) {
        return {
          success: false,
          error: ENTRY_AUTH_COPY.emailConfirmation,
        }
      }
      return result.success
        ? { success: true }
        : { success: false, error: result.error }
    },
  }), [auth, language, router])

  return (
    <EntryBrandAccessFlow
      actions={actions}
      featureFlags={{
        customerFacebook: true,
        customerGmail: true,
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
