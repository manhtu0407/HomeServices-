import type { AppLanguage } from '@/lib/app-language'

type EntryAuthErrorKey =
  | 'accountExists'
  | 'accountNotReady'
  | 'appleSignInFailed'
  | 'connectionFailed'
  | 'emailConfirmationRequired'
  | 'fullNameRequired'
  | 'googleSignInFailed'
  | 'invalidCredentials'
  | 'invalidEmail'
  | 'invalidIdentifier'
  | 'loginDetails'
  | 'invalidLoginPassword'
  | 'invalidPhone'
  | 'loginUnavailable'
  | 'methodUnavailable'
  | 'nextScreenUnavailable'
  | 'recoveryEmail'
  | 'recoveryPhone'
  | 'recoveryPrimary'
  | 'recoveryUnavailable'
  | 'recoveryVerificationPending'
  | 'registrationDetails'
  | 'roleUnavailable'
  | 'signInFailed'
  | 'signupFailed'
  | 'signupConfirmationRequired'
  | 'passwordMismatch'
  | 'signupPasswordLong'
  | 'signupPasswordShort'
  | 'termsRequired'
  | 'tryAgainLater'
  | 'workerApplicationContact'
  | 'workerApplicationFailed'
  | 'workerApplicationNotSubmitted'
  | 'workerApplicationRejected'
  | 'workerChangesRequested'
  | 'workerEmailRequired'
  | 'workerReviewPending'

export type RoleGateGreeting = Readonly<{
  headline: string
}>

export type RoleGateGreetingPeriod = 'morning' | 'midday' | 'afternoon' | 'evening'

type RoleCardCopy = Readonly<{
  description: string
  meta: string
  title: string
}>

export type EntryAccessCopy = Readonly<{
  accessibility: Readonly<{
    back: string
    continueWithProvider: string
    hidePassword: string
    kaelAssistant: string
    logo: string
    showPassword: string
  }>
  errors: Readonly<Record<EntryAuthErrorKey, string>>
  emailConfirmation: Readonly<{
    lead: string
    login: string
    title: string
    topbar: string
  }>
  fields: Readonly<{
    customerIdentifierLabel: string
    customerIdentifierPlaceholder: string
    workerIdentifierLabel: string
    workerIdentifierPlaceholder: string
  }>
  login: Readonly<{
    busy: string
    forgotPassword: string
    lead: string
    noAccount: string
    passwordLabel: string
    passwordPlaceholder: string
    providerDivider: string
    register: string
    remember: string
    submit: string
    title: string
    topbar: string
  }>
  onboarding: Readonly<{
    benefits: readonly [
      Readonly<{ label: string; meta: string }>,
      Readonly<{ label: string; meta: string }>,
      Readonly<{ label: string; meta: string }>,
    ]
    customerLead: string
    submit: string
    title: string
    workerApprovedLead: string
    workerCheckStatus: string
    workerChangesRequestedLead: string
    workerPendingLead: string
    workerRejectedLead: string
    workerResubmit: string
    workerLead: string
  }>
  recovery: Readonly<{
    busy: string
    emailLabel: string
    lead: string
    phoneLabel: string
    primaryLabel: string
    submit: string
    title: string
    topbar: string
  }>
  register: Readonly<{
    accountExists: string
    busy: string
    customerLead: string
    customerSubmit: string
    customerTitle: string
    fullNameLabel: string
    fullNamePlaceholder: string
    login: string
    passwordLabel: string
    passwordPlaceholder: string
    passwordConfirmationLabel: string
    passwordConfirmationPlaceholder: string
    terms: string
    topbar: string
    workerSubmit: string
    workerTitle: string
  }>
  roleGate: Readonly<{
    chooseRole: string
    customer: RoleCardCopy
    footerCaption: string
    heading: string
    intro: string
    selectionHint: string
    worker: RoleCardCopy
  }>
}>

const viCopy: EntryAccessCopy = {
  accessibility: {
    back: 'Quay lại',
    continueWithProvider: 'Tiếp tục với',
    hidePassword: 'Ẩn mật khẩu',
    kaelAssistant: 'Kael, trợ lý gia đình',
    logo: 'Biểu trưng NestScout',
    showPassword: 'Hiện mật khẩu',
  },
  errors: {
    accountExists: 'Tài khoản này đã tồn tại. Hãy đăng nhập hoặc dùng thông tin khác.',
    accountNotReady: 'Tài khoản chưa sẵn sàng để vào ứng dụng. Vui lòng hoàn tất đăng nhập trước.',
    appleSignInFailed: 'Chưa thể đăng nhập bằng Apple. Vui lòng thử lại.',
    connectionFailed: 'Không thể kết nối. Vui lòng thử lại.',
    emailConfirmationRequired: 'Thư điện tử chưa được xác nhận. Hãy kiểm tra email rồi đăng nhập lại.',
    fullNameRequired: 'Nhập họ tên để tạo tài khoản.',
    googleSignInFailed: 'Chưa thể đăng nhập bằng Google. Vui lòng thử lại.',
    invalidCredentials: 'Gmail hoặc SĐT hoặc mật khẩu không đúng.',
    invalidEmail: 'Địa chỉ thư điện tử chưa đúng định dạng.',
    invalidIdentifier: 'Nhập thư điện tử hoặc SĐT để tiếp tục.',
    loginDetails: 'Vui lòng nhập thư điện tử hoặc SĐT và mật khẩu.',
    invalidLoginPassword: 'Mật khẩu đăng nhập không hợp lệ.',
    invalidPhone: 'SĐT Việt Nam chưa đúng định dạng.',
    loginUnavailable: 'Dịch vụ đăng nhập chưa sẵn sàng. Vui lòng thử lại sau.',
    methodUnavailable: 'Phương thức này chưa được cấu hình.',
    nextScreenUnavailable: 'Chưa thể mở màn hình tiếp theo. Vui lòng thử lại.',
    passwordMismatch: 'Mật khẩu nhập lại không khớp.',
    recoveryEmail: 'Nhập thư điện tử khôi phục đúng định dạng.',
    recoveryPhone: 'Nhập SĐT khôi phục đúng định dạng.',
    recoveryPrimary: 'Nhập thư điện tử hoặc SĐT đã đăng ký để tiếp tục.',
    recoveryUnavailable: 'Khôi phục mật khẩu chưa sẵn sàng.',
    recoveryVerificationPending: 'Khôi phục mật khẩu sẽ hoàn tất sau khi kênh liên hệ thay thế được xác minh.',
    registrationDetails: 'Kiểm tra họ tên, thư điện tử hoặc SĐT và mật khẩu tối thiểu 8 ký tự.',
    roleUnavailable: 'Không thể tải vai trò tài khoản.',
    signInFailed: 'Chưa thể đăng nhập. Vui lòng thử lại.',
    signupFailed: 'Chưa thể tạo tài khoản. Vui lòng thử lại.',
    signupConfirmationRequired: 'Đăng ký chưa sẵn sàng vì hệ thống vẫn yêu cầu xác minh. Vui lòng thử lại sau.',
    signupPasswordLong: 'Mật khẩu không được dài quá 128 ký tự.',
    signupPasswordShort: 'Mật khẩu cần ít nhất 8 ký tự.',
    termsRequired: 'Bạn cần đồng ý với điều khoản để tiếp tục.',
    tryAgainLater: 'Yêu cầu đang bị giới hạn. Vui lòng thử lại sau.',
    workerApplicationContact: 'Nhập thư điện tử để gửi xét duyệt.',
    workerApplicationFailed: 'Không thể gửi hồ sơ xét duyệt lúc này. Vui lòng thử lại.',
    workerApplicationNotSubmitted: 'Tài khoản đã được xác nhận, nhưng hồ sơ thợ chưa được gửi. Vui lòng thử lại sau.',
    workerApplicationRejected: 'Hồ sơ ứng tuyển thợ đã bị từ chối. Liên hệ hỗ trợ nếu bạn cần làm rõ.',
    workerChangesRequested: 'Hồ sơ ứng tuyển cần được bổ sung trước khi gửi lại.',
    workerEmailRequired: 'Tài khoản thợ chỉ hỗ trợ thư điện tử và mật khẩu.',
    workerReviewPending: 'Hồ sơ thợ đã được gửi xét duyệt. NestScout sẽ liên hệ trước khi cấp quyền thợ.',
  },
  emailConfirmation: {
    lead: 'Tài khoản đã được tạo. Mở thư điện tử để xác nhận, rồi quay lại đăng nhập.',
    login: 'Đến đăng nhập',
    title: 'Kiểm tra\nthư điện tử.',
    topbar: 'Xác nhận thư điện tử',
  },
  fields: {
    customerIdentifierLabel: 'Gmail hoặc SĐT',
    customerIdentifierPlaceholder: 'ten@vidu.vn hoặc 090 123 4567',
    workerIdentifierLabel: 'Thư điện tử',
    workerIdentifierPlaceholder: 'ten@vidu.vn',
  },
  login: {
    busy: 'Đang xử lý…',
    forgotPassword: 'Quên mật khẩu?',
    lead: '',
    noAccount: 'Chưa có tài khoản?',
    passwordLabel: 'Mật khẩu',
    passwordPlaceholder: 'Nhập mật khẩu',
    providerDivider: 'hoặc tiếp tục với',
    register: 'Đăng ký',
    remember: 'Ghi nhớ đăng nhập',
    submit: 'Đăng nhập',
    title: 'Chào mừng trở lại!',
    topbar: 'Đăng nhập',
  },
  onboarding: {
    benefits: [
      { label: 'Hiểu đúng yêu cầu', meta: 'Gợi ý rõ ràng' },
      { label: 'Theo dõi minh bạch', meta: 'Mọi bước đều rõ' },
      { label: 'An tâm sử dụng', meta: 'Quy trình bảo vệ' },
    ],
    customerLead: 'Kael sẽ đồng hành từ yêu cầu đầu tiên đến khi công việc hoàn tất.',
    submit: 'Bắt đầu sử dụng',
    title: 'Chào mừng\nvề nhà.',
    workerApprovedLead: 'Hồ sơ ứng tuyển đã được duyệt. Kiểm tra lại quyền truy cập để tiếp tục.',
    workerCheckStatus: 'Kiểm tra trạng thái',
    workerChangesRequestedLead: 'Hồ sơ ứng tuyển cần được bổ sung. Chỉ gửi lại khi bạn chủ động xác nhận.',
    workerPendingLead: 'Hồ sơ ứng tuyển đang được xem xét. Hệ thống sẽ không tự gửi thêm hồ sơ trùng lặp.',
    workerRejectedLead: 'Hồ sơ ứng tuyển đã bị từ chối. Liên hệ hỗ trợ nếu bạn cần làm rõ quyết định.',
    workerResubmit: 'Gửi lại hồ sơ xét duyệt',
    workerLead: 'Kael sẽ hướng dẫn bạn hoàn thiện hồ sơ và bắt đầu nhận việc minh bạch.',
  },
  recovery: {
    busy: 'Đang xử lý…',
    emailLabel: 'Thư điện tử khôi phục',
    lead: 'Dùng kênh liên hệ thay thế để tiếp tục.',
    phoneLabel: 'SĐT khôi phục',
    primaryLabel: 'Thư điện tử hoặc SĐT đã đăng ký',
    submit: 'Tiếp tục',
    title: 'Lấy lại mật khẩu.',
    topbar: 'Khôi phục mật khẩu',
  },
  register: {
    accountExists: 'Đã có tài khoản?',
    busy: 'Đang xử lý…',
    customerLead: '',
    customerSubmit: 'Đăng ký',
    customerTitle: 'Tạo tài khoản của bạn.',
    fullNameLabel: 'Họ và tên',
    fullNamePlaceholder: 'Nguyễn Hoàng Minh',
    login: 'Đăng nhập',
    passwordLabel: 'Mật khẩu',
    passwordPlaceholder: 'Tối thiểu 8 ký tự',
    passwordConfirmationLabel: 'Xác nhận mật khẩu',
    passwordConfirmationPlaceholder: 'Xác nhận mật khẩu',
    terms: 'Tôi đồng ý với Điều khoản sử dụng và Chính sách bảo mật của NestScout.',
    topbar: 'Đăng ký',
    workerSubmit: 'Tạo tài khoản thợ',
    workerTitle: 'Tạo hồ sơ đối tác.',
  },
  roleGate: {
    chooseRole: 'Chọn vai trò',
    customer: {
      description: 'Đặt dịch vụ,\nnhà luôn gọn gàng.',
      meta: 'Google · Apple · Thư điện tử/SĐT',
      title: 'Khách hàng',
    },
    footerCaption: 'DỊCH VỤ NHÀ  •  CUỘC SỐNG TỐT HƠN',
    heading: 'Chọn lối vào',
    intro: 'Cùng nhau, ngôi nhà luôn ổn.',
    selectionHint: 'Chạm để tiếp tục với vai trò này.',
    worker: {
      description: 'Nhận việc linh hoạt,\ngia tăng thu nhập.',
      meta: 'Tài khoản thợ · Xác thực hồ sơ',
      title: 'Đối tác thợ',
    },
  },
}

const enCopy: EntryAccessCopy = {
  accessibility: {
    back: 'Go back',
    continueWithProvider: 'Continue with',
    hidePassword: 'Hide password',
    kaelAssistant: 'Kael, your home assistant',
    logo: 'NestScout logo',
    showPassword: 'Show password',
  },
  errors: {
    accountExists: 'This account already exists. Sign in or use different details.',
    accountNotReady: 'Your account is not ready to enter the app. Complete sign-in first.',
    appleSignInFailed: 'Unable to sign in with Apple. Please try again.',
    connectionFailed: 'Unable to connect. Please try again.',
    emailConfirmationRequired: 'Your email has not been confirmed. Check your email, then sign in again.',
    fullNameRequired: 'Enter your full name to create an account.',
    googleSignInFailed: 'Unable to sign in with Google. Please try again.',
    invalidCredentials: 'Email/phone or password is incorrect.',
    invalidEmail: 'Enter a valid email address.',
    invalidIdentifier: 'Enter an email address or phone number to continue.',
    loginDetails: 'Enter your email/phone and password.',
    invalidLoginPassword: 'Enter a valid password.',
    invalidPhone: 'Enter a valid Vietnamese mobile number.',
    loginUnavailable: 'Sign-in is not available right now. Please try again later.',
    methodUnavailable: 'This sign-in method is not configured.',
    nextScreenUnavailable: 'Unable to open the next screen. Please try again.',
    passwordMismatch: 'Passwords do not match.',
    recoveryEmail: 'Enter a valid recovery email address.',
    recoveryPhone: 'Enter a valid recovery phone number.',
    recoveryPrimary: 'Enter the email or phone number registered to your account.',
    recoveryUnavailable: 'Password recovery is not available yet.',
    recoveryVerificationPending: 'Password recovery can continue after the alternate contact channel is verified.',
    registrationDetails: 'Check your name, email/phone, and password of at least 8 characters.',
    roleUnavailable: 'Unable to load the account role.',
    signInFailed: 'Unable to sign in. Please try again.',
    signupFailed: 'Unable to create your account. Please try again.',
    signupConfirmationRequired: 'Sign-up is not ready because verification is still required. Please try again later.',
    signupPasswordLong: 'Password cannot exceed 128 characters.',
    signupPasswordShort: 'Password must be at least 8 characters.',
    termsRequired: 'Accept the terms to continue.',
    tryAgainLater: 'Too many requests. Please try again later.',
    workerApplicationContact: 'Enter an email address for the application.',
    workerApplicationFailed: 'Unable to submit the worker application. Please try again.',
    workerApplicationNotSubmitted: 'Your account is confirmed, but the worker application was not submitted. Please try again later.',
    workerApplicationRejected: 'Your worker application was rejected. Contact support if you need clarification.',
    workerChangesRequested: 'Your worker application needs changes before it can be resubmitted.',
    workerEmailRequired: 'Worker accounts support email and password only.',
    workerReviewPending: 'Your worker application was submitted for review. NestScout will contact you before enabling worker access.',
  },
  emailConfirmation: {
    lead: 'Your account has been created. Confirm your email, then return here to sign in.',
    login: 'Go to sign in',
    title: 'Check your\nemail.',
    topbar: 'Confirm your email',
  },
  fields: {
    customerIdentifierLabel: 'Email/phone',
    customerIdentifierPlaceholder: 'email@example.com or 090 123 4567',
    workerIdentifierLabel: 'Email',
    workerIdentifierPlaceholder: 'email@example.com',
  },
  login: {
    busy: 'Working…',
    forgotPassword: 'Forgot password?',
    lead: '',
    noAccount: 'New to NestScout?',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter your password',
    providerDivider: 'or continue with',
    register: 'Create account',
    remember: 'Remember me',
    submit: 'Sign in',
    title: 'Welcome Back..!',
    topbar: 'Sign in',
  },
  onboarding: {
    benefits: [
      { label: 'Clear understanding', meta: 'Helpful guidance' },
      { label: 'Transparent tracking', meta: 'Every step is clear' },
      { label: 'Service with confidence', meta: 'A protected process' },
    ],
    customerLead: 'Kael will stay with you from the first request until the work is complete.',
    submit: 'Get started',
    title: 'Welcome\nhome.',
    workerApprovedLead: 'Your application was approved. Check access again to continue.',
    workerCheckStatus: 'Check status',
    workerChangesRequestedLead: 'Your application needs changes. It is resubmitted only when you explicitly confirm.',
    workerPendingLead: 'Your application is under review. The system will not create duplicate submissions.',
    workerRejectedLead: 'Your application was rejected. Contact support if you need clarification.',
    workerResubmit: 'Resubmit application',
    workerLead: 'Kael will guide you through profile verification and a transparent start to receiving work.',
  },
  recovery: {
    busy: 'Working…',
    emailLabel: 'Recovery email',
    lead: 'Use the alternate contact channel to continue.',
    phoneLabel: 'Recovery phone',
    primaryLabel: 'Registered email/phone',
    submit: 'Continue',
    title: 'Recover your password.',
    topbar: 'Password recovery',
  },
  register: {
    accountExists: 'Already have an account?',
    busy: 'Working…',
    customerLead: '',
    customerSubmit: 'Create account',
    customerTitle: 'Create your account.',
    fullNameLabel: 'Full name',
    fullNamePlaceholder: 'Alex Nguyen',
    login: 'Sign in',
    passwordLabel: 'Password',
    passwordPlaceholder: 'At least 8 characters',
    passwordConfirmationLabel: 'Confirm password',
    passwordConfirmationPlaceholder: 'Re-enter your password',
    terms: 'I agree to the NestScout Terms of Use and Privacy Policy.',
    topbar: 'Create account',
    workerSubmit: 'Create worker account',
    workerTitle: 'Create your partner profile.',
  },
  roleGate: {
    chooseRole: 'Choose your role',
    customer: {
      description: 'Book services,\nkeep home in order.',
      meta: 'Google · Apple · Email/phone',
      title: 'Customer',
    },
    footerCaption: 'HOME SERVICES  •  BETTER LIVING',
    heading: 'Choose your path',
    intro: 'Together, your home stays well.',
    selectionHint: 'Tap to continue with this role.',
    worker: {
      description: 'Take flexible jobs,\ngrow your income.',
      meta: 'Worker account · Profile verification',
      title: 'Service partner',
    },
  },
}

export const entryAccessCopy: Readonly<Record<AppLanguage, EntryAccessCopy>> = {
  en: enCopy,
  vi: viCopy,
}

const englishRoleGateGreetingVariants: Readonly<
  Record<RoleGateGreetingPeriod, readonly RoleGateGreeting[]>
> = {
  morning: [
    { headline: 'Morning, let’s begin...!' },
    { headline: 'Good morning, welcome in!' },
    { headline: 'A fresh start, right here!' },
    { headline: 'Let’s make today lighter!' },
    { headline: 'Ready when you are...!' },
  ],
  midday: [
    { headline: 'A little time for what matters...!' },
    { headline: 'One thing at a time!' },
    { headline: 'A small step, a lighter day!' },
    { headline: 'Let’s make room for better!' },
    { headline: 'What shall we sort out...!' },
  ],
  afternoon: [
    { headline: 'Afternoon, let’s begin...!' },
    { headline: 'Good to see you here!' },
    { headline: 'Let’s make something easier!' },
    { headline: 'One good step from here!' },
    { headline: 'Where shall we begin...!' },
  ],
  evening: [
    { headline: 'Good evening, take it easy!' },
    { headline: 'A lighter evening starts here!' },
    { headline: 'Let’s wrap up one thing...!' },
    { headline: 'Quiet time for what matters!' },
    { headline: 'Kael is here when you need help...!' },
  ],
}

const vietnameseRoleGateGreetingVariants: Readonly<
  Record<RoleGateGreetingPeriod, readonly RoleGateGreeting[]>
> = {
  morning: [
    { headline: 'Chào buổi sáng, mình bắt đầu nhé!' },
    { headline: 'Một ngày mới nhẹ nhàng hơn!' },
    { headline: 'Sẵn sàng khi bạn sẵn sàng!' },
    { headline: 'Cùng xử lý việc cần thiết nhé!' },
    { headline: 'Kael ở đây để hỗ trợ bạn!' },
  ],
  midday: [
    { headline: 'Mình cùng giải quyết từng việc nhé!' },
    { headline: 'Một bước nhỏ cho ngày nhẹ hơn!' },
    { headline: 'Hôm nay bạn cần hỗ trợ việc gì?' },
    { headline: 'Cùng dành chỗ cho điều tốt hơn!' },
    { headline: 'Bắt đầu từ điều quan trọng nhất nhé!' },
  ],
  afternoon: [
    { headline: 'Chào buổi chiều, mình bắt đầu nhé!' },
    { headline: 'Rất vui được gặp bạn!' },
    { headline: 'Cùng làm mọi việc dễ dàng hơn!' },
    { headline: 'Một bước tốt đẹp bắt đầu từ đây!' },
    { headline: 'Mình nên bắt đầu từ đâu nhỉ?' },
  ],
  evening: [
    { headline: 'Chào buổi tối, cứ thong thả nhé!' },
    { headline: 'Một buổi tối nhẹ nhàng hơn!' },
    { headline: 'Cùng hoàn tất một việc nhé!' },
    { headline: 'Khoảng lặng cho điều quan trọng!' },
    { headline: 'Kael luôn sẵn sàng hỗ trợ bạn!' },
  ],
}

export const roleGateGreetingVariants: Readonly<
  Record<AppLanguage, Readonly<Record<RoleGateGreetingPeriod, readonly RoleGateGreeting[]>>>
> = {
  vi: vietnameseRoleGateGreetingVariants,
  en: englishRoleGateGreetingVariants,
}

const errorMatchers: readonly Readonly<{
  key: EntryAuthErrorKey
  patterns: readonly RegExp[]
}>[] = [
  { key: 'emailConfirmationRequired', patterns: [/email not confirmed/i, /thư điện tử chưa được xác nhận/i] },
  { key: 'invalidCredentials', patterns: [/invalid login credentials/i, /email\/sdt.*mật khẩu.*không đúng/i] },
  { key: 'invalidEmail', patterns: [/email.*chưa đúng định dạng/i, /invalid email/i, /valid email address/i] },
  { key: 'invalidPhone', patterns: [/sdt.*chưa đúng định dạng/i, /invalid phone/i, /valid vietnamese mobile/i] },
  { key: 'invalidIdentifier', patterns: [/nhập email.*sdt.*tiếp tục/i, /enter an email.*phone.*continue/i] },
  { key: 'invalidLoginPassword', patterns: [/mật khẩu đăng nhập không hợp lệ/i, /invalid password/i] },
  { key: 'signupPasswordShort', patterns: [/mật khẩu.*ít nhất 8/i, /password.*at least 8/i] },
  { key: 'signupPasswordLong', patterns: [/mật khẩu.*dài quá 128/i, /password.*128/i] },
  { key: 'fullNameRequired', patterns: [/nhập họ tên/i, /enter.*full name/i] },
  { key: 'accountExists', patterns: [/user already registered/i, /already exists/i, /tài khoản.*đã tồn tại/i] },
  { key: 'roleUnavailable', patterns: [/không thể tải vai trò/i, /load.*account role/i] },
  { key: 'workerApplicationContact', patterns: [/nhập email.*số điện thoại.*xét duyệt/i, /email.*phone.*application/i] },
  { key: 'workerApplicationFailed', patterns: [/không thể gửi.*xét duyệt/i, /không thể gửi hồ sơ/i, /submit.*worker application/i] },
  { key: 'workerEmailRequired', patterns: [/tài khoản thợ.*thư điện tử.*mật khẩu/i, /worker accounts?.*email.*password/i, /worker applications? require an email/i] },
  { key: 'tryAgainLater', patterns: [/rate.?limit/i, /too many requests/i, /bị giới hạn/i] },
  { key: 'appleSignInFailed', patterns: [/đăng nhập apple/i, /apple.*sign.?in/i] },
  { key: 'googleSignInFailed', patterns: [/đăng nhập google/i, /google.*sign.?in/i] },
  { key: 'loginUnavailable', patterns: [/dịch vụ đăng nhập chưa sẵn sàng/i, /sign.?in.*not available/i, /auth.*config/i] },
  { key: 'connectionFailed', patterns: [/không thể kết nối/i, /network/i, /timeout/i, /unable to connect/i] },
  { key: 'signupFailed', patterns: [/không thể tạo tài khoản/i, /unable to create.*account/i] },
  { key: 'signupConfirmationRequired', patterns: [/hệ thống vẫn yêu cầu xác minh/i, /verification is still required/i] },
]

const errorKeys = Object.keys(viCopy.errors) as EntryAuthErrorKey[]

export function localizeEntryAuthError(
  error: unknown,
  language: AppLanguage,
  fallback: EntryAuthErrorKey,
) {
  const normalized = normalizeError(error)
  if (!normalized) return entryAccessCopy[language].errors[fallback]

  const exactKey = errorKeys.find((key) => (
    normalizeError(viCopy.errors[key]) === normalized
    || normalizeError(enCopy.errors[key]) === normalized
  ))
  if (exactKey) return entryAccessCopy[language].errors[exactKey]

  const matched = errorMatchers.find(({ patterns }) => patterns.some((pattern) => pattern.test(normalized)))
  return entryAccessCopy[language].errors[matched?.key ?? fallback]
}

function normalizeError(error: unknown) {
  if (typeof error !== 'string') return ''
  return error
    .trim()
    .toLocaleLowerCase('vi')
    .replace(/[.!?…]+$/u, '')
    .replace(/\s+/g, ' ')
}
