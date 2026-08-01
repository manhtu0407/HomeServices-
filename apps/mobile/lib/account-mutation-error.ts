import type { AppLanguage } from './app-language'

type AccountMutationKind = 'password' | 'profile'

type AccountMutationErrorKey =
  | 'connection'
  | 'currentPassword'
  | 'invalidProfile'
  | 'newPasswordLong'
  | 'newPasswordSame'
  | 'newPasswordShort'
  | 'passwordDetails'
  | 'passwordUnsupported'
  | 'save'
  | 'sessionChanged'
  | 'unavailable'

const copy: Record<AppLanguage, Record<AccountMutationErrorKey, string>> = {
  vi: {
    connection: 'Không thể kết nối dịch vụ tài khoản. Vui lòng thử lại sau.',
    currentPassword: 'Mật khẩu hiện tại không đúng.',
    invalidProfile: 'Thông tin hồ sơ chưa hợp lệ.',
    newPasswordLong: 'Mật khẩu mới không được dài quá 128 ký tự.',
    newPasswordSame: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
    newPasswordShort: 'Mật khẩu mới cần ít nhất 8 ký tự.',
    passwordDetails: 'Nhập mật khẩu hiện tại và mật khẩu mới để tiếp tục.',
    passwordUnsupported: 'Tài khoản này chưa hỗ trợ đổi mật khẩu bằng mật khẩu hiện tại.',
    save: 'Không thể lưu thay đổi. Vui lòng thử lại sau.',
    sessionChanged: 'Phiên tài khoản đã thay đổi. Vui lòng thử lại.',
    unavailable: 'Dịch vụ tài khoản chưa sẵn sàng. Vui lòng thử lại sau.',
  },
  en: {
    connection: 'Could not connect to the account service. Try again later.',
    currentPassword: 'The current password is incorrect.',
    invalidProfile: 'Check the profile details.',
    newPasswordLong: 'The new password cannot exceed 128 characters.',
    newPasswordSame: 'The new password must differ from the current password.',
    newPasswordShort: 'The new password must contain at least 8 characters.',
    passwordDetails: 'Enter the current and new passwords to continue.',
    passwordUnsupported: 'This account cannot change its password using a current password.',
    save: 'Could not save the changes. Try again later.',
    sessionChanged: 'The active account changed. Try again.',
    unavailable: 'The account service is not available. Try again later.',
  },
}

const matchers: readonly Readonly<{
  key: AccountMutationErrorKey
  pattern: RegExp
}>[] = [
  { key: 'sessionChanged', pattern: /phiên tài khoản đã thay đổi|active account changed/i },
  { key: 'invalidProfile', pattern: /thông tin hồ sơ chưa hợp lệ|invalid profile/i },
  { key: 'passwordUnsupported', pattern: /chưa hỗ trợ đổi mật khẩu|cannot change.*password/i },
  { key: 'passwordDetails', pattern: /nhập mật khẩu hiện tại.*mật khẩu mới|enter.*current.*new password/i },
  { key: 'newPasswordShort', pattern: /mật khẩu mới.*ít nhất 8|new password.*at least 8/i },
  { key: 'newPasswordLong', pattern: /mật khẩu mới.*128|new password.*128/i },
  { key: 'newPasswordSame', pattern: /mật khẩu mới phải khác|new password.*differ/i },
  { key: 'currentPassword', pattern: /mật khẩu hiện tại không đúng|current password.*incorrect/i },
  { key: 'unavailable', pattern: /dịch vụ (?:hồ sơ khách|tài khoản) chưa sẵn sàng|(?:profile|account) service.*not available/i },
  { key: 'connection', pattern: /không thể kết nối dịch vụ (?:hồ sơ|tài khoản)|could not connect.*(?:profile|account)/i },
  { key: 'save', pattern: /không thể (?:lưu hồ sơ|cập nhật mật khẩu)|could not (?:save|update)/i },
]

export function localizeAccountMutationError(
  error: unknown,
  language: AppLanguage,
  kind: AccountMutationKind,
) {
  const normalized = typeof error === 'string' ? error.trim().replace(/\s+/g, ' ') : ''
  const match = normalized
    ? matchers.find(({ pattern }) => pattern.test(normalized))
    : null
  if (match) return copy[language][match.key]
  return copy[language][kind === 'password' ? 'unavailable' : 'save']
}
