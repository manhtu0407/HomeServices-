const MIN_PASSWORD_LENGTH = 8
const MAX_NEW_PASSWORD_LENGTH = 128
const MAX_LOGIN_PASSWORD_LENGTH = 1_024

export function isBoundedLoginPassword(password: string) {
  return typeof password === 'string'
    && password.length > 0
    && password.length <= MAX_LOGIN_PASSWORD_LENGTH
}

export function validateSignupPassword(password: string) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return 'Mật khẩu cần ít nhất 8 ký tự.'
  }
  if (password.length > MAX_NEW_PASSWORD_LENGTH) {
    return 'Mật khẩu không được dài quá 128 ký tự.'
  }
  return null
}

export function validateNewPassword(currentPassword: string, newPassword: string) {
  if (!isBoundedLoginPassword(currentPassword)) {
    return 'Nhập mật khẩu hiện tại và mật khẩu mới để tiếp tục.'
  }
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    return 'Mật khẩu mới cần ít nhất 8 ký tự.'
  }
  if (newPassword.length > MAX_NEW_PASSWORD_LENGTH) {
    return 'Mật khẩu mới không được dài quá 128 ký tự.'
  }
  if (newPassword === currentPassword) {
    return 'Mật khẩu mới phải khác mật khẩu hiện tại.'
  }
  return null
}
