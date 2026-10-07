import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { WorkerApplicationStatus } from '@nestscout/shared'
import { EntryBrandAccessFlow } from './entry-access/EntryBrandAccessFlow'
import { entryAccessCopy, localizeEntryAuthError } from './entry-access/copy'
import { localizeIdentifierAvailabilityError } from './entry-access/entry-identifier-fields'
import type { EntryAccessStep, EntryRole, PasswordLoginInput, RegistrationInput } from './entry-access/types'
import { useAppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { clearRememberedAuthCredentials } from '@/lib/remembered-auth-credentials'
import {
  getWorkerRegistrationHandoff,
  setWorkerRegistrationHandoff,
  subscribeWorkerRegistrationHandoff,
} from '@/lib/worker-registration-handoff'

type EntryParam = string | string[] | undefined

const AUTH_ENTRY_SOURCE_OF_TRUTH_MARKERS = [
  'AppIcon-AppStore-1024.png',
  'nestscout-horizontal-lockup.png',
  'nestscout-symbol-transparent-1024.png',
  'auth-entry-six-step-logo-motion',
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
  const workerRegistrationIntentRef = useRef(false)
  const workerIdentifierRef = useRef<string | null>(null)
  const [workerApplication, setWorkerApplication] = useState<{
    applicationId: string | null
    reason: string | null
    status: WorkerApplicationStatus
  } | null>(null)
  const handoff = useSyncExternalStore(subscribeWorkerRegistrationHandoff, getWorkerRegistrationHandoff, getWorkerRegistrationHandoff)
  const reviewStep = resolveEntryStep(params.stage)
  const routeRole = resolveEntryRole(params.role)
  const initialRole = handoff ? 'worker' : routeRole
  const hasExplicitRole = firstParam(params.role) !== undefined
  const passwordRecoveryStep: EntryAccessStep | null = !reviewStep && auth.passwordRecoveryPending ? 'password-reset' : null
  const profileRecoveryStep: EntryAccessStep | null = !reviewStep && auth.session && auth.profileStatus === 'profile_missing' ? 'onboarding' : null
  // A recovery callback outranks a leftover worker handoff; otherwise the valid recovery session never reaches the reset screen.
  const activeHandoff = passwordRecoveryStep ? null : handoff
  const handoffStep: EntryAccessStep | null = !activeHandoff
    ? null
    : activeHandoff.phase === 'submitted' || activeHandoff.phase === 'signing-in' || activeHandoff.phase === 'login-failed' || activeHandoff.phase === 'login-notice'
      ? 'login'
      : activeHandoff.phase === 'pending'
        ? 'onboarding'
        : 'register'
  const baseStep = reviewStep ?? passwordRecoveryStep ?? profileRecoveryStep ?? 'splash'
  const initialStep = handoffStep ?? baseStep
  // The key must not follow the handoff: a phase change inside one flow would rebuild the screen
  // and drop it back to the role gate. A rebuilt screen reads the handoff for its initial values.
  const flowKey = `${baseStep}:${routeRole}:${reviewStep ? 'review' : 'live'}:${passwordRecoveryStep ? 'recovery' : profileRecoveryStep ? 'profile' : 'entry'}`
  const handoffApplication = activeHandoff && 'application' in activeHandoff ? activeHandoff.application : null
  const resume = useMemo(() => {
    if (!activeHandoff) return null
    switch (activeHandoff.phase) {
      case 'submitted':
        return { identifier: activeHandoff.identifier, notice: copy.register.workerSubmitted, step: 'login' as const }
      case 'login-notice':
        return { identifier: activeHandoff.identifier, notice: activeHandoff.notice, step: 'login' as const }
      case 'login-failed':
        return { error: activeHandoff.error, identifier: activeHandoff.identifier, step: 'login' as const }
      case 'failed':
        return { error: activeHandoff.error, identifier: activeHandoff.identifier, step: 'register' as const }
      case 'pending':
        return { identifier: activeHandoff.identifier, step: 'onboarding' as const }
      default:
        return null
    }
  }, [copy, activeHandoff])
  const initialState = activeHandoff
    ? {
        error: activeHandoff.phase === 'failed' || activeHandoff.phase === 'login-failed' ? activeHandoff.error : null,
        identifier: activeHandoff.identifier,
        notice: activeHandoff.phase === 'submitted'
          ? copy.register.workerSubmitted
          : activeHandoff.phase === 'login-notice'
            ? activeHandoff.notice
            : null,
      }
    : undefined

  useEffect(() => {
    if (reviewStep) return
    if (auth.passwordRecoveryPending) return
    if (auth.loading || auth.profileStatus === 'profile_missing') return
    if (!auth.session || !auth.role) return
    if (auth.role === 'worker') {
      setWorkerRegistrationHandoff(null)
      router.replace('/(worker)/(tabs)/home' as never)
      return
    }
    if (auth.role === 'admin' || auth.role === 'admin_operator') {
      router.replace('/(admin)/sections' as never)
      return
    }
    // A worker applicant holds a customer-role session until review passes. The screen is rebuilt
    // when that session appears, so the handoff record, not component memory, blocks Customer Home.
    if (workerRegistrationIntentRef.current || handoff) return
    router.replace('/(customer)/home' as never)
  }, [auth.loading, auth.passwordRecoveryPending, auth.profileStatus, auth.role, auth.session, handoff, reviewStep, router])

  const actions = useMemo(() => ({
    onCompleteOnboarding: async (role: EntryRole) => {
      const nextRole = auth.role ?? await auth.refreshProfile()
      if (role === 'worker') {
        if (nextRole === 'worker') {
          router.replace('/(worker)/(tabs)/home' as never)
          return { success: true }
        }
        const readiness = await auth.getWorkerReadiness()
        if (!readiness.success || !readiness.readiness) {
          return { success: false, error: readiness.error ?? copy.errors.workerApplicationFailed }
        }
        const currentApplication = readiness.readiness.application
        setWorkerApplication({
          applicationId: currentApplication.application_id,
          reason: currentApplication.reason,
          status: currentApplication.status,
        })
        if (currentApplication.status === 'changes_requested') {
          const contact = auth.session?.user.email ?? workerIdentifierRef.current
          if (!contact || !currentApplication.application_id) {
            return { success: false, error: copy.errors.workerEmailRequired }
          }
          const revision = await auth.submitWorkerApplication({
            contact,
            language,
            revisionOfApplicationId: currentApplication.application_id,
          })
          if (!revision.success) {
            return { success: false, error: localizeEntryAuthError(revision.error, language, 'workerApplicationFailed') }
          }
          setWorkerApplication({
            applicationId: revision.applicationId ?? null,
            reason: null,
            status: revision.status ?? 'pending_review',
          })
          return { success: true }
        }
        if (currentApplication.status === 'pending_review' || currentApplication.status === 'approved') return { success: true }
        if (currentApplication.status === 'rejected') return { success: false, error: copy.errors.workerApplicationRejected }
        return { success: false, error: copy.errors.workerApplicationNotSubmitted }
      }
      if (nextRole === 'customer') {
        router.replace('/(customer)/home' as never)
        return { success: true }
      }
      if (nextRole === 'worker') {
        router.replace('/(worker)/(tabs)/home' as never)
        return { success: true }
      }
      return {
        success: false,
        error: copy.errors.accountNotReady,
      }
    },
    onPasswordLogin: async ({ identifier, password, role }: PasswordLoginInput) => {
      workerRegistrationIntentRef.current = role === 'worker'
      workerIdentifierRef.current = role === 'worker' ? identifier : null
      setWorkerRegistrationHandoff(role === 'worker' ? { phase: 'signing-in', identifier } : null)
      // The sign-in produced only a customer session. Ending it keeps the next app open from landing
      // on Customer Home; the handoff record (written first) carries the error to the rebuilt screen.
      // A worker whose application is still under review holds a customer-role session, and the
      // Workers area only opens for the worker role. They stay on the worker sign-in with the status
      // instead of a separate waiting screen.
      const holdAtWorkerLogin = async (notice: string) => {
        setWorkerRegistrationHandoff({ phase: 'login-notice', identifier, notice })
        await auth.signOut()
        return { success: true, nextStep: 'login' as const, notice }
      }
      const failWorkerLogin = async (error: string) => {
        setWorkerRegistrationHandoff({ phase: 'login-failed', identifier, error })
        await auth.signOut()
        return { success: false, error, nextStep: 'login' as const }
      }
      const result = await auth.signInWithPassword(identifier, password)
      if (!result.success) {
        workerRegistrationIntentRef.current = false
        setWorkerRegistrationHandoff(null)
        return {
          success: false,
          error: localizeEntryAuthError(result.error, language, 'signInFailed'),
        }
      }
      if (role === 'worker' && result.role === 'customer') {
        const readiness = await auth.getWorkerReadiness()
        if (!readiness.success || !readiness.readiness) {
          return await failWorkerLogin(readiness.error ?? copy.errors.workerApplicationFailed)
        }
        const applicationStatus = readiness.readiness.application.status
        const readinessApplication = {
          applicationId: readiness.readiness.application.application_id,
          reason: readiness.readiness.application.reason,
          status: applicationStatus,
        }
        setWorkerApplication(readinessApplication)
        if (applicationStatus === 'changes_requested') {
          // Resubmitting needs an explicit confirmation, which the onboarding screen owns.
          setWorkerRegistrationHandoff({ phase: 'pending', identifier, application: readinessApplication })
          return { success: true, nextStep: 'onboarding' as const }
        }
        if (applicationStatus !== 'not_submitted') {
          return await holdAtWorkerLogin(
            applicationStatus === 'rejected'
              ? copy.onboarding.workerRejectedLead
              : applicationStatus === 'approved'
                ? copy.onboarding.workerApprovedLead
                : copy.onboarding.workerPendingLead,
          )
        }
        const application = await auth.submitWorkerApplication({ contact: identifier, language })
        if (!application.success) {
          return await failWorkerLogin(localizeEntryAuthError(application.error, language, 'workerApplicationFailed'))
        }
        return await holdAtWorkerLogin(copy.onboarding.workerPendingLead)
      }
      workerRegistrationIntentRef.current = false
      setWorkerRegistrationHandoff(null)
      if (result.role === 'admin') router.replace('/(admin)/sections' as never)
      else if (result.role === 'admin_operator') router.replace('/(admin)/sections' as never)
      else if (result.role === 'worker') router.replace('/(worker)/(tabs)/home' as never)
      else if (result.role === 'customer') router.replace('/(customer)/home' as never)
      return result
    },
    onForgotPassword: async ({ email }: { email: string }) => auth.requestPasswordRecovery(email),
    onCompletePasswordRecovery: async (password: string) => {
      const result = await auth.completePasswordRecovery(password)
      if (result.success) await clearRememberedAuthCredentials()
      return result
    },
    onExitPasswordRecovery: async () => {
      await auth.signOut()
      router.replace('/(auth)/login?stage=login' as never)
    },
    onAppleLogin: async () => {
      workerRegistrationIntentRef.current = false
      setWorkerRegistrationHandoff(null)
      const result = await auth.signInWithApple()
      return result.success
        ? result
        : {
            success: false,
            error: localizeEntryAuthError(result.error, language, 'appleSignInFailed'),
          }
    },
    onGoogleLogin: async () => {
      workerRegistrationIntentRef.current = false
      setWorkerRegistrationHandoff(null)
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
        workerRegistrationIntentRef.current = true
        workerIdentifierRef.current = identifier
        setWorkerRegistrationHandoff({ phase: 'registering', identifier })
        const failRegistration = (error: string) => {
          setWorkerRegistrationHandoff({ phase: 'failed', identifier, error })
          return { success: false, error }
        }
        // A retry after a failed application must not sign up again: the account already exists and
        // Supabase would answer "already registered", stranding the applicant as a plain customer.
        const accountAlreadyCreated = auth.session?.user.email?.trim().toLowerCase() === identifier.toLowerCase()
        const signup = accountAlreadyCreated
          ? { success: true as const, error: undefined }
          : await auth.signUpWithIdentifier({
              displayName: fullName,
              identifier,
              password,
            })
        if (!signup.success) {
          workerRegistrationIntentRef.current = false
          return failRegistration(
            localizeIdentifierAvailabilityError(signup.error ?? '', language) ?? localizeEntryAuthError(signup.error, language, 'signupFailed'),
          )
        }
        const result = await auth.submitWorkerApplication({ contact: identifier, language })
        if (result.success) {
          const application = {
            applicationId: result.applicationId ?? null,
            reason: null,
            status: result.status ?? 'pending_review',
          }
          setWorkerApplication(application)
          // The handoff is written before sign-out: ending the registration session rebuilds this
          // screen, and the rebuilt one resumes at the worker sign-in from this record. The Workers
          // area opens only after a worker login resolves the worker role.
          setWorkerRegistrationHandoff({ phase: 'submitted', identifier, application })
          await auth.signOut()
          return { success: true, nextStep: 'login' as const, notice: copy.register.workerSubmitted }
        }
        // The account exists but only as a customer. Ending that session and returning to the worker
        // sign-in lets the deferred submit at login send the application, and keeps the next app open
        // from landing on Customer Home.
        const updateRequired = localizeEntryAuthError(result.error, language, 'workerApplicationFailed') === copy.errors.workerApplicationUpdateRequired
        const error = updateRequired ? copy.errors.workerApplicationUpdateRequired : copy.errors.workerApplicationRetryByLogin
        setWorkerRegistrationHandoff({ phase: 'login-failed', identifier, error })
        await auth.signOut()
        return { success: false, error, nextStep: 'login' as const }
      }

      workerRegistrationIntentRef.current = false
      setWorkerRegistrationHandoff(null)
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
        error: localizeIdentifierAvailabilityError(result.error ?? '', language) ?? localizeEntryAuthError(result.error, language, 'signupFailed'),
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
      initialState={initialState}
      resume={resume}
      initialStep={initialStep}
      onStepChange={(step) => {
        if (step === 'role-gate') setWorkerRegistrationHandoff(null)
      }}
      key={flowKey}
      restoreRememberedRole={!hasExplicitRole}
      splashDurationMs={reviewStep === 'splash' ? 0 : undefined}
      workerApplication={workerApplication ?? handoffApplication}
    />
  )
}
