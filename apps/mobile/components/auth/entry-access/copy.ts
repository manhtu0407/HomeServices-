import type { AppLanguage } from '@/lib/app-language'

export type EntryAuthErrorKey =
  | 'accountExists'
  | 'accountNotReady'
  | 'appleSignInFailed'
  | 'connectionFailed'
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
  | 'signupPasswordLong'
  | 'signupPasswordShort'
  | 'termsRequired'
  | 'tryAgainLater'
  | 'workerApplicationContact'
  | 'workerApplicationFailed'
  | 'workerApplicationNotSubmitted'
  | 'workerReviewPending'

export type RoleGateGreeting = Readonly<{
  headline: string
  lead: string
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
    terms: string
    topbar: string
    workerLead: string
    workerSubmit: string
    workerTitle: string
  }>
  roleGate: Readonly<{
    chooseRole: string
    continueCustomer: string
    continueWorker: string
    customer: RoleCardCopy
    footer: string
    worker: RoleCardCopy
  }>
  splash: Readonly<{
    preparing: string
    tagline: string
  }>
}>

const viCopy: EntryAccessCopy = {
  accessibility: {
    back: 'Quay lại',
    continueWithProvider: 'Tiếp tục với',
    hidePassword: 'Ẩn mật khẩu',
    kaelAssistant: 'Kael, trợ lý gia đình',
    logo: 'Biểu trưng NestScout Aurora Nest',
    showPassword: 'Hiện mật khẩu',
  },
  errors: {
    accountExists: 'Tài khoản này đã tồn tại. Hãy đăng nhập hoặc dùng thông tin khác.',
    accountNotReady: 'Tài khoản chưa sẵn sàng để vào ứng dụng. Vui lòng hoàn tất đăng nhập trước.',
    appleSignInFailed: 'Chưa thể đăng nhập bằng Apple. Vui lòng thử lại.',
    connectionFailed: 'Không thể kết nối. Vui lòng thử lại.',
    fullNameRequired: 'Nhập họ tên để tạo tài khoản.',
    googleSignInFailed: 'Chưa thể đăng nhập bằng Google. Vui lòng thử lại.',
    invalidCredentials: 'Thư điện tử hoặc SĐT hoặc mật khẩu không đúng.',
    invalidEmail: 'Địa chỉ thư điện tử chưa đúng định dạng.',
    invalidIdentifier: 'Nhập thư điện tử hoặc SĐT để tiếp tục.',
    loginDetails: 'Vui lòng nhập thư điện tử hoặc SĐT và mật khẩu.',
    invalidLoginPassword: 'Mật khẩu đăng nhập không hợp lệ.',
    invalidPhone: 'SĐT Việt Nam chưa đúng định dạng.',
    loginUnavailable: 'Dịch vụ đăng nhập chưa sẵn sàng. Vui lòng thử lại sau.',
    methodUnavailable: 'Phương thức này chưa được cấu hình.',
    nextScreenUnavailable: 'Chưa thể mở màn hình tiếp theo. Vui lòng thử lại.',
    recoveryEmail: 'Nhập thư điện tử khôi phục đúng định dạng.',
    recoveryPhone: 'Nhập SĐT khôi phục đúng định dạng.',
    recoveryPrimary: 'Nhập thư điện tử hoặc SĐT đã đăng ký để tiếp tục.',
    recoveryUnavailable: 'Khôi phục mật khẩu chưa sẵn sàng.',
    recoveryVerificationPending: 'Khôi phục mật khẩu sẽ hoàn tất sau khi kênh liên hệ thay thế được xác minh.',
    registrationDetails: 'Kiểm tra họ tên, thư điện tử hoặc SĐT và mật khẩu tối thiểu 8 ký tự.',
    roleUnavailable: 'Không thể tải vai trò tài khoản.',
    signInFailed: 'Chưa thể đăng nhập. Vui lòng thử lại.',
    signupFailed: 'Chưa thể tạo tài khoản. Vui lòng thử lại.',
    signupPasswordLong: 'Mật khẩu không được dài quá 128 ký tự.',
    signupPasswordShort: 'Mật khẩu cần ít nhất 8 ký tự.',
    termsRequired: 'Bạn cần đồng ý với điều khoản để tiếp tục.',
    tryAgainLater: 'Yêu cầu đang bị giới hạn. Vui lòng thử lại sau.',
    workerApplicationContact: 'Nhập thư điện tử hoặc số điện thoại để gửi xét duyệt.',
    workerApplicationFailed: 'Không thể gửi hồ sơ xét duyệt lúc này. Vui lòng thử lại.',
    workerApplicationNotSubmitted: 'Tài khoản đã được xác nhận, nhưng hồ sơ thợ chưa được gửi. Vui lòng thử lại sau.',
    workerReviewPending: 'Hồ sơ thợ đã được gửi xét duyệt. NestScout sẽ liên hệ trước khi cấp quyền thợ.',
  },
  fields: {
    customerIdentifierLabel: 'Thư điện tử hoặc SĐT',
    customerIdentifierPlaceholder: 'ten@vidu.vn hoặc 090 123 4567',
    workerIdentifierLabel: 'Thư điện tử',
    workerIdentifierPlaceholder: 'ten@vidu.vn',
  },
  login: {
    busy: 'Đang xử lý…',
    forgotPassword: 'Quên mật khẩu?',
    lead: 'Tiếp tục nơi bạn đã dừng cùng Kael.',
    noAccount: 'Chưa có tài khoản?',
    passwordLabel: 'Mật khẩu',
    passwordPlaceholder: 'Nhập mật khẩu',
    providerDivider: 'hoặc tiếp tục với',
    register: 'Đăng ký',
    remember: 'Ghi nhớ đăng nhập',
    submit: 'Đăng nhập',
    title: 'Chào mừng\ntrở lại.',
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
    workerLead: 'Kael sẽ hướng dẫn bạn hoàn thiện hồ sơ và bắt đầu nhận việc minh bạch.',
  },
  recovery: {
    busy: 'Đang xử lý…',
    emailLabel: 'Thư điện tử khôi phục',
    lead: 'Dùng kênh liên hệ thay thế để tiếp tục.',
    phoneLabel: 'SĐT khôi phục',
    primaryLabel: 'Thư điện tử hoặc SĐT đã đăng ký',
    submit: 'Tiếp tục',
    title: 'Lấy lại\nmật khẩu.',
    topbar: 'Khôi phục mật khẩu',
  },
  register: {
    accountExists: 'Đã có tài khoản?',
    busy: 'Đang xử lý…',
    customerLead: 'Chỉ mất chưa đến một phút.',
    customerSubmit: 'Đăng ký',
    customerTitle: 'Tạo tài khoản\ncủa bạn.',
    fullNameLabel: 'Họ và tên',
    fullNamePlaceholder: 'Nguyễn Hoàng Minh',
    login: 'Đăng nhập',
    passwordLabel: 'Mật khẩu',
    passwordPlaceholder: 'Tối thiểu 8 ký tự',
    terms: 'Tôi đồng ý với Điều khoản sử dụng và Chính sách bảo mật của NestScout.',
    topbar: 'Đăng ký',
    workerLead: 'Tạo tài khoản trước khi gửi hồ sơ xác thực.',
    workerSubmit: 'Tạo tài khoản thợ',
    workerTitle: 'Tạo hồ sơ\nđối tác.',
  },
  roleGate: {
    chooseRole: 'Chọn vai trò',
    continueCustomer: 'Tiếp tục với Khách hàng',
    continueWorker: 'Tiếp tục với Đối tác thợ',
    customer: {
      description: 'Đặt dịch vụ, trò chuyện cùng Kael và theo dõi tiến độ.',
      meta: 'Google · Apple · Thư điện tử/SĐT',
      title: 'Khách hàng',
    },
    footer: 'Vai trò được cố định sau khi đăng nhập.\nBạn có thể đổi trước khi xác thực.',
    worker: {
      description: 'Nhận việc, quản lý lịch và theo dõi thu nhập.',
      meta: 'Tài khoản thợ · Xác thực hồ sơ',
      title: 'Đối tác thợ',
    },
  },
  splash: {
    preparing: 'Kael đang chuẩn bị mọi thứ',
    tagline: 'Dịch vụ gia đình đáng tin, trong tầm tay.',
  },
}

const enCopy: EntryAccessCopy = {
  accessibility: {
    back: 'Go back',
    continueWithProvider: 'Continue with',
    hidePassword: 'Hide password',
    kaelAssistant: 'Kael, your home assistant',
    logo: 'NestScout Aurora Nest logo',
    showPassword: 'Show password',
  },
  errors: {
    accountExists: 'This account already exists. Sign in or use different details.',
    accountNotReady: 'Your account is not ready to enter the app. Complete sign-in first.',
    appleSignInFailed: 'Unable to sign in with Apple. Please try again.',
    connectionFailed: 'Unable to connect. Please try again.',
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
    recoveryEmail: 'Enter a valid recovery email address.',
    recoveryPhone: 'Enter a valid recovery phone number.',
    recoveryPrimary: 'Enter the email or phone number registered to your account.',
    recoveryUnavailable: 'Password recovery is not available yet.',
    recoveryVerificationPending: 'Password recovery can continue after the alternate contact channel is verified.',
    registrationDetails: 'Check your name, email/phone, and password of at least 8 characters.',
    roleUnavailable: 'Unable to load the account role.',
    signInFailed: 'Unable to sign in. Please try again.',
    signupFailed: 'Unable to create your account. Please try again.',
    signupPasswordLong: 'Password cannot exceed 128 characters.',
    signupPasswordShort: 'Password must be at least 8 characters.',
    termsRequired: 'Accept the terms to continue.',
    tryAgainLater: 'Too many requests. Please try again later.',
    workerApplicationContact: 'Enter an email address or phone number for the application.',
    workerApplicationFailed: 'Unable to submit the worker application. Please try again.',
    workerApplicationNotSubmitted: 'Your account is confirmed, but the worker application was not submitted. Please try again later.',
    workerReviewPending: 'Your worker application was submitted for review. NestScout will contact you before enabling worker access.',
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
    lead: 'Continue where you left off with Kael.',
    noAccount: 'New to NestScout?',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter your password',
    providerDivider: 'or continue with',
    register: 'Create account',
    remember: 'Remember me',
    submit: 'Sign in',
    title: 'Welcome\nback.',
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
    workerLead: 'Kael will guide you through profile verification and a transparent start to receiving work.',
  },
  recovery: {
    busy: 'Working…',
    emailLabel: 'Recovery email',
    lead: 'Use the alternate contact channel to continue.',
    phoneLabel: 'Recovery phone',
    primaryLabel: 'Registered email/phone',
    submit: 'Continue',
    title: 'Recover your\npassword.',
    topbar: 'Password recovery',
  },
  register: {
    accountExists: 'Already have an account?',
    busy: 'Working…',
    customerLead: 'It takes less than a minute.',
    customerSubmit: 'Create account',
    customerTitle: 'Create your\naccount.',
    fullNameLabel: 'Full name',
    fullNamePlaceholder: 'Alex Nguyen',
    login: 'Sign in',
    passwordLabel: 'Password',
    passwordPlaceholder: 'At least 8 characters',
    terms: 'I agree to the NestScout Terms of Use and Privacy Policy.',
    topbar: 'Create account',
    workerLead: 'Create an account before submitting your verification profile.',
    workerSubmit: 'Create worker account',
    workerTitle: 'Create your\npartner profile.',
  },
  roleGate: {
    chooseRole: 'Choose your role',
    continueCustomer: 'Continue as Customer',
    continueWorker: 'Continue as Service partner',
    customer: {
      description: 'Book services, chat with Kael, and track progress.',
      meta: 'Google · Apple · Email/phone',
      title: 'Customer',
    },
    footer: 'Your role is fixed after sign-in.\nYou can change it before authentication.',
    worker: {
      description: 'Receive work, manage your schedule, and track earnings.',
      meta: 'Worker account · Profile verification',
      title: 'Service partner',
    },
  },
  splash: {
    preparing: 'Kael is getting everything ready',
    tagline: 'Trusted home services, within reach.',
  },
}

export const entryAccessCopy: Readonly<Record<AppLanguage, EntryAccessCopy>> = {
  en: enCopy,
  vi: viCopy,
}

export const roleGateGreetingVariants: Readonly<
  Record<AppLanguage, Readonly<Record<RoleGateGreetingPeriod, readonly RoleGateGreeting[]>>>
> = {
  vi: {
    morning: [
      { headline: 'Chào buổi sáng, mình bắt đầu thật nhẹ nhàng nhé.', lead: 'Bạn đến để tìm người hỗ trợ, hay để nhận một việc phù hợp?' },
      { headline: 'Buổi sáng yên, mình cùng sắp xếp một việc nhỏ nhé.', lead: 'Mình chọn vai trò phù hợp để bắt đầu thật rõ ràng.' },
      { headline: 'Chào ngày mới, Kael ở đây để việc nhà bớt nặng.', lead: 'Bạn muốn tìm người hỗ trợ, hay mang tay nghề của mình đến nơi cần?' },
      { headline: 'Sáng nay, căn nhà mình đang cần điều gì?', lead: 'Hôm nay, bạn muốn tìm hỗ trợ hay sẵn sàng nhận một việc phù hợp?' },
      { headline: 'Một buổi sáng dịu, mình bắt đầu từ điều cần nhất nhé.', lead: 'Bạn muốn nhờ hỗ trợ, hay sẵn sàng mang kỹ năng đến một ngôi nhà?' },
    ],
    midday: [
      { headline: 'Giữa trưa, mình dành một chút thời gian cho việc đang chờ nhé.', lead: 'Mình chọn cách đồng hành phù hợp, rồi bắt đầu từ việc cần nhất.' },
      { headline: 'Trưa nay, có việc nào ở nhà bạn muốn gỡ trước không?', lead: 'Bạn muốn tìm sự hỗ trợ, hay sẵn sàng nhận một việc phù hợp?' },
      { headline: 'Khoảng nghỉ ngắn, một khởi đầu gọn gàng.', lead: 'Chỉ cần chọn cách mình muốn bắt đầu, phần còn lại sẽ rõ ràng hơn.' },
      { headline: 'Trưa rồi, Kael sẵn sàng cùng bạn sắp xếp từng việc.', lead: 'Khách hàng hay Đối tác thợ — mỗi bên đều có một điểm bắt đầu.' },
      { headline: 'Một chút thời gian cho ngôi nhà cũng đủ làm mọi thứ nhẹ hơn.', lead: 'Dành vài giây để chọn đúng vai trò cho mình.' },
    ],
    afternoon: [
      { headline: 'Chiều nay, mình cùng hoàn thành một việc cho ngôi nhà nhé.', lead: 'Mình chọn cách bạn muốn bắt đầu, Kael sẽ đồng hành đúng nhịp.' },
      { headline: 'Buổi chiều dịu lại, việc cần làm cũng có thể nhẹ đi.', lead: 'Bạn đến để nhờ hỗ trợ, hay để mang kỹ năng của mình đến nơi cần?' },
      { headline: 'Chiều rồi, bạn muốn Kael bắt đầu từ đâu?', lead: 'Bạn cần một người hỗ trợ, hay đang sẵn sàng nhận một việc?' },
      { headline: 'Thêm một chút chủ động cho căn nhà của mình.', lead: 'Mỗi vai trò có một hành trình riêng, mình chọn trước nhé.' },
      { headline: 'Chiều nay, tìm đúng người cho đúng việc nhé.', lead: 'Chỉ cần một lựa chọn, phần còn lại sẽ rõ ràng hơn.' },
    ],
    evening: [
      { headline: 'Tối nay, mình khép lại việc còn dang dở thật nhẹ nhàng nhé.', lead: 'Mình chọn cách bắt đầu để phần việc còn lại rõ ràng hơn.' },
      { headline: 'Buổi tối yên, Kael vẫn ở đây khi bạn cần.', lead: 'Bạn muốn nhờ một người phù hợp, hay sẵn sàng nhận một việc gần nhà?' },
      { headline: 'Đêm xuống rồi, một việc nhỏ cũng đáng được giải quyết.', lead: 'Bạn đến để nhờ hỗ trợ, hay để nhận một việc phù hợp?' },
      { headline: 'Tối nay, bạn muốn tìm người hỗ trợ hay bắt đầu nhận việc?', lead: 'Mình bắt đầu bằng việc chọn đúng chỗ đứng của mình nhé.' },
      { headline: 'Nhà mình cần được chăm chút, từng việc một.', lead: 'Một lựa chọn nhỏ để buổi tối nhẹ hơn.' },
    ],
  },
  en: {
    morning: [
      { headline: 'Good morning. Let’s begin gently.', lead: 'Are you here to find help or receive suitable work?' },
      { headline: 'A quiet morning is a good time to sort one thing out.', lead: 'Choose the role that gives you a clear starting point.' },
      { headline: 'Good morning. Kael is here to make home care feel lighter.', lead: 'Would you like to find help or bring your skills where they are needed?' },
      { headline: 'What does your home need this morning?', lead: 'Would you like support or are you ready for suitable work?' },
      { headline: 'A calm morning starts with what matters most.', lead: 'Would you like help or are you ready to bring your skills to a home?' },
    ],
    midday: [
      { headline: 'Let’s make a little time for the task waiting at midday.', lead: 'Choose how you would like Kael to help, then start with what matters most.' },
      { headline: 'Is there something at home you would like to solve first?', lead: 'Would you like support or are you ready for suitable work?' },
      { headline: 'A short break can be a clear new start.', lead: 'Choose how you want to begin and the next step will become clearer.' },
      { headline: 'Kael is ready to help you organize each task.', lead: 'Customers and service partners each have a clear place to begin.' },
      { headline: 'A moment for your home can make the rest feel lighter.', lead: 'Take a few seconds to choose the role that fits you.' },
    ],
    afternoon: [
      { headline: 'Let’s complete one thing for your home this afternoon.', lead: 'Choose how you want to begin and Kael will keep pace with you.' },
      { headline: 'As the afternoon softens, the task can feel lighter too.', lead: 'Are you here for support or to bring your skills where they are needed?' },
      { headline: 'Where would you like Kael to begin this afternoon?', lead: 'Do you need support, or are you ready to receive work?' },
      { headline: 'Take one more active step for your home.', lead: 'Each role has its own journey, so choose yours first.' },
      { headline: 'Let’s find the right person for the right task.', lead: 'One choice is enough to make the next step clearer.' },
    ],
    evening: [
      { headline: 'Let’s gently close out what is still unfinished tonight.', lead: 'Choose how to begin so the remaining work feels clearer.' },
      { headline: 'It is a quiet evening, and Kael is still here when you need help.', lead: 'Would you like the right person to help, or are you ready for nearby work?' },
      { headline: 'Night has fallen, but one small task is still worth solving.', lead: 'Are you here to find help or receive suitable work?' },
      { headline: 'Would you like to find help or start receiving work tonight?', lead: 'Begin by choosing the place that fits you.' },
      { headline: 'A home is cared for one task at a time.', lead: 'One small choice can make the evening lighter.' },
    ],
  },
}

const errorMatchers: readonly Readonly<{
  key: EntryAuthErrorKey
  patterns: readonly RegExp[]
}>[] = [
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
  { key: 'tryAgainLater', patterns: [/rate.?limit/i, /too many requests/i, /bị giới hạn/i] },
  { key: 'appleSignInFailed', patterns: [/đăng nhập apple/i, /apple.*sign.?in/i] },
  { key: 'googleSignInFailed', patterns: [/đăng nhập google/i, /google.*sign.?in/i] },
  { key: 'loginUnavailable', patterns: [/dịch vụ đăng nhập chưa sẵn sàng/i, /sign.?in.*not available/i, /auth.*config/i] },
  { key: 'connectionFailed', patterns: [/không thể kết nối/i, /network/i, /timeout/i, /unable to connect/i] },
  { key: 'signupFailed', patterns: [/không thể tạo tài khoản/i, /unable to create.*account/i] },
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
