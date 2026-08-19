import { useCallback, useEffect, useRef } from 'react'

import type { AppLanguage } from '@/lib/app-language'
import { parseAuthIdentifier, validateAuthIdentifier } from '@/lib/auth-identifier'
import { clearRememberedAuthCredentials, rememberAuthCredentials } from '@/lib/remembered-auth-credentials'
import { clearRememberedAuthIdentifier, rememberAuthIdentifier } from '@/lib/remembered-auth-identifier'

import { identifierAvailabilityError, validateIdentifierForRole, validateRegistrationIdentifier } from './entry-identifier-fields'
import type { EntryAccessCopy } from './copy'
import { localizeEntryAuthError } from './copy'
import type { EntryAccessState } from './entry-access-state'
import type { EntryAccessStep, EntryBrandAccessFlowProps, EntryRole } from './types'

type EntryAccessStateController = EntryAccessState & {
  setAcceptedTerms: () => void
  setBusy: (busy: boolean) => void
  setError: (error: string | null) => void
  setFullName: (fullName: string) => void
  setIdentifier: (identifier: string) => void
  setPassword: (password: string) => void
  setPasswordConfirmation: (passwordConfirmation: string) => void
  setRemember: () => void
  updateState: (patch: Partial<EntryAccessState>) => void
}

export function useEntryBrandAccessActions({
  actions,
  controller,
  copy,
  language,
  onRoleChange,
  onStepChange,
  setNotice,
  splashDurationMs,
}: {
  actions: EntryBrandAccessFlowProps['actions']
  controller: EntryAccessStateController
  copy: EntryAccessCopy
  language: AppLanguage
  onRoleChange?: (role: EntryRole) => void
  onStepChange?: (step: EntryAccessStep) => void
  setNotice: (notice: string | null) => void
  splashDurationMs: number
}) {
  const onStepChangeRef = useRef(onStepChange)
  const actionVersionRef = useRef(0)
  const actionBusyRef = useRef(false)
  const { step: controllerStep, updateState } = controller

  useEffect(() => {
    onStepChangeRef.current = onStepChange
  }, [onStepChange])

  useEffect(() => () => {
    actionVersionRef.current += 1
    actionBusyRef.current = false
  }, [])

  const go = useCallback((nextStep: EntryAccessStep) => {
    actionVersionRef.current += 1
    actionBusyRef.current = false
    setNotice(null)
    controller.updateState({ busy: false, error: null, step: nextStep })
    onStepChangeRef.current?.(nextStep)
  }, [controller, setNotice])

  const beginAction = () => {
    if (actionBusyRef.current) return null
    actionBusyRef.current = true
    const version = actionVersionRef.current + 1
    actionVersionRef.current = version
    controller.setBusy(true)
    return version
  }

  const isCurrentAction = (version: number) => actionBusyRef.current && actionVersionRef.current === version

  const finishAction = (version: number) => {
    if (!isCurrentAction(version)) return
    actionBusyRef.current = false
    controller.setBusy(false)
  }

  const chooseRole = (nextRole: EntryRole) => {
    controller.updateState({ error: null, role: nextRole })
    onRoleChange?.(nextRole)
  }

  useEffect(() => {
    if (controllerStep !== 'splash' || splashDurationMs <= 0) return
    const timeout = setTimeout(() => {
      updateState({ error: null, step: 'role-gate' })
      onStepChangeRef.current?.('role-gate')
    }, splashDurationMs)
    return () => clearTimeout(timeout)
  }, [controllerStep, splashDurationMs, updateState])

  const submitLogin = async () => {
    controller.setError(null)
    const identifierError = validateIdentifierForRole(controller.identifier, controller.role, language)
    const parsedIdentifier = parseAuthIdentifier(controller.identifier)
    if (identifierError || !parsedIdentifier || !controller.password) {
      controller.setError(identifierError ?? copy.errors.loginDetails)
      return
    }
    const actionVersion = beginAction()
    if (actionVersion === null) return
    try {
      // The action-version guard intentionally runs after I/O so a stale screen cannot commit its result.
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const result = await actions.onPasswordLogin({ identifier: parsedIdentifier.value, password: controller.password, role: controller.role })
      if (!isCurrentAction(actionVersion)) return
      if (!result.success) {
        controller.setError(localizeEntryAuthError(result.error, language, 'signInFailed'))
        return
      }
      if (controller.remember) {
        await Promise.all([
          rememberAuthIdentifier(controller.identifier),
          rememberAuthCredentials(controller.identifier, controller.password, controller.role),
        ])
      } else {
        await Promise.all([
          clearRememberedAuthIdentifier(),
          clearRememberedAuthCredentials(),
        ])
      }
      if (!isCurrentAction(actionVersion)) return
      if (controller.role === 'worker') go('onboarding')
    } catch {
      if (isCurrentAction(actionVersion)) controller.setError(copy.errors.connectionFailed)
    } finally {
      finishAction(actionVersion)
    }
  }

  const submitRegister = async () => {
    controller.setError(null)
    setNotice(null)
    const identifierError = validateRegistrationIdentifier(controller.identifier, controller.role, language)
    if (!controller.fullName.trim() || identifierError || controller.password.length < 8) {
      controller.setError(identifierError ?? copy.errors.registrationDetails)
      return
    }
    if (controller.password !== controller.passwordConfirmation) {
      controller.setError(copy.errors.passwordMismatch)
      return
    }
    if (!controller.acceptedTerms) {
      controller.setError(copy.errors.termsRequired)
      return
    }
    const actionVersion = beginAction()
    if (actionVersion === null) return
    try {
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const result = await actions.onRegister({ identifier: controller.identifier.trim(), fullName: controller.fullName.trim(), password: controller.password, role: controller.role })
      if (!isCurrentAction(actionVersion)) return
      if (!result.success) {
        controller.setError(localizeEntryAuthError(result.error, language, 'signupFailed'))
        return
      }
      controller.setPassword('')
      controller.setPasswordConfirmation('')
      if (result.nextStep) go(result.nextStep)
      else if (controller.role === 'worker') go('onboarding')
    } catch {
      if (isCurrentAction(actionVersion)) controller.setError(copy.errors.connectionFailed)
    } finally {
      finishAction(actionVersion)
    }
  }

  const providerLogin = async (provider: 'apple' | 'google') => {
    const action = provider === 'apple' ? actions.onAppleLogin : actions.onGoogleLogin
    const fallback = provider === 'apple' ? 'appleSignInFailed' : 'googleSignInFailed'
    if (!action) {
      controller.setError(copy.errors.methodUnavailable)
      return
    }
    const actionVersion = beginAction()
    if (actionVersion === null) return
    controller.setError(null)
    try {
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const result = await action()
      if (!isCurrentAction(actionVersion)) return
      if (!result.success) {
        controller.setError(localizeEntryAuthError(result.error, language, fallback))
        return
      }
      if (controller.role === 'worker') go('onboarding')
    } catch {
      if (isCurrentAction(actionVersion)) controller.setError(copy.errors.connectionFailed)
    } finally {
      finishAction(actionVersion)
    }
  }

  const submitPasswordRecovery = async () => {
    controller.setError(null)
    setNotice(null)
    const account = parseAuthIdentifier(controller.identifier)
    const identifierError = validateAuthIdentifier(controller.identifier)
    if (!account || identifierError) {
      controller.setError(identifierError
        ? localizeEntryAuthError(identifierError, language, 'recoveryEmail')
        : copy.errors.recoveryEmail)
      return
    }
    if (account.kind === 'phone') {
      controller.setError(identifierAvailabilityError('phoneRecovery', language))
      return
    }
    if (!actions.onForgotPassword) {
      controller.setError(copy.errors.recoveryUnavailable)
      return
    }

    const actionVersion = beginAction()
    if (actionVersion === null) return
    try {
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const result = await actions.onForgotPassword({ email: account.value })
      if (!isCurrentAction(actionVersion)) return
      if (!result.success) {
        controller.setError(localizeEntryAuthError(result.error, language, 'recoveryUnavailable'))
      } else {
        setNotice(language === 'vi'
          ? 'Nếu email thuộc một tài khoản NestScout, liên kết đặt lại mật khẩu đã được gửi.'
          : 'If the email belongs to a NestScout account, a password-reset link has been sent.')
      }
    } catch {
      if (isCurrentAction(actionVersion)) controller.setError(copy.errors.connectionFailed)
    } finally {
      finishAction(actionVersion)
    }
  }

  const completeOnboarding = async () => {
    const actionVersion = beginAction()
    if (actionVersion === null) return
    controller.setError(null)
    try {
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const result = await actions.onCompleteOnboarding(controller.role)
      if (!isCurrentAction(actionVersion)) return
      if (!result.success) {
        controller.setError(localizeEntryAuthError(result.error, language, 'nextScreenUnavailable'))
      }
    } catch {
      if (isCurrentAction(actionVersion)) controller.setError(copy.errors.connectionFailed)
    } finally {
      finishAction(actionVersion)
    }
  }

  return { chooseRole, completeOnboarding, go, providerLogin, submitLogin, submitPasswordRecovery, submitRegister }
}
