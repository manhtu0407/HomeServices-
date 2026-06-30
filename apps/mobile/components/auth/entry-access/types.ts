export type EntryAccessStep =
  | 'splash'
  | 'welcome'
  | 'role-gate'
  | 'login'
  | 'register'
  | 'onboarding'

export type EntryRole = 'customer' | 'worker'

export type EmailLoginInput = {
  role: EntryRole
  email: string
  password: string
}

export type RegistrationInput = {
  role: EntryRole
  fullName: string
  email: string
  password: string
}

export type EntryActionResult = {
  success: boolean
  error?: string
}

export type EntryAccessFeatureFlags = {
  customerGoogle: boolean
  customerGmail: boolean
  customerFacebook: boolean
  customerRegistration: boolean
  workerRegistration: boolean
}

export type EntryAccessActions = {
  onEmailLogin: (input: EmailLoginInput) => Promise<EntryActionResult>
  onRegister: (input: RegistrationInput) => Promise<EntryActionResult>
  onGoogleLogin?: () => Promise<EntryActionResult>
  onGmailLogin?: () => Promise<EntryActionResult>
  onFacebookLogin?: () => Promise<EntryActionResult>
  onForgotPassword?: (email: string) => Promise<EntryActionResult>
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
