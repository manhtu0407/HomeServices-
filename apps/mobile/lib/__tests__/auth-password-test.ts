import {
  isBoundedLoginPassword,
  validateNewPassword,
  validateSignupPassword,
} from '../auth-password'

describe('auth password boundaries', () => {
  it('aligns signup with the eight-character product policy', () => {
    expect(validateSignupPassword('1234567')).toBe('Mật khẩu cần ít nhất 8 ký tự.')
    expect(validateSignupPassword('12345678')).toBeNull()
    expect(validateSignupPassword('x'.repeat(129))).toBe('Mật khẩu không được dài quá 128 ký tự.')
  })

  it('rejects an unchanged or unbounded new password', () => {
    expect(validateNewPassword('Current123', 'Current123')).toBe('Mật khẩu mới phải khác mật khẩu hiện tại.')
    expect(validateNewPassword('Current123', 'short')).toBe('Mật khẩu mới cần ít nhất 8 ký tự.')
    expect(validateNewPassword('Current123', 'x'.repeat(129))).toBe('Mật khẩu mới không được dài quá 128 ký tự.')
    expect(validateNewPassword('Current123', 'Different123')).toBeNull()
  })

  it('bounds login input without breaking long existing passwords', () => {
    expect(isBoundedLoginPassword('x'.repeat(1_024))).toBe(true)
    expect(isBoundedLoginPassword('x'.repeat(1_025))).toBe(false)
    expect(isBoundedLoginPassword('')).toBe(false)
    expect(isBoundedLoginPassword(null as unknown as string)).toBe(false)
  })
})
