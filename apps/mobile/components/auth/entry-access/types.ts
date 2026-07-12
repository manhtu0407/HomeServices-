export type EntryAccessStep =
  | 'splash'
  | 'role-gate'
  | 'login'
  | 'register'
  | 'password-recovery'
  | 'onboarding'

export type EntryRole = 'customer' | 'worker'

export type PasswordLoginInput = {
  role: EntryRole
  identifier: string
  password: string
}

export type RegistrationInput = {
  role: EntryRole
  fullName: string
  identifier: string
  password: string
}

export type PasswordRecoveryInput = {
  identifier: string
  recoveryIdentifier: string
}

export type EntryActionResult = {
  success: boolean
  error?: string
}

export type EntryAccessFeatureFlags = {
  customerGoogle: boolean
  customerRegistration: boolean
  workerRegistration: boolean
}

export type EntryAccessActions = {
  onPasswordLogin: (input: PasswordLoginInput) => Promise<EntryActionResult>
  onRegister: (input: RegistrationInput) => Promise<EntryActionResult>
  onGoogleLogin?: () => Promise<EntryActionResult>
  onForgotPassword?: (input: PasswordRecoveryInput) => Promise<EntryActionResult>
  onCompleteOnboarding: (role: EntryRole) => Promise<EntryActionResult> | EntryActionResult
}

export type EntryBrandAccessFlowProps = {
  actions: EntryAccessActions
  featureFlags?: Partial<EntryAccessFeatureFlags>
  initialRole?: EntryRole
  initialStep?: EntryAccessStep
  onStepChange?: (step: EntryAccessStep) => void
  onRoleChange?: (role: EntryRole) => void
  splashDurationMs?: number
}
