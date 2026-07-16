import { localizeAccountMutationError } from '../account-mutation-error'

describe('localizeAccountMutationError', () => {
  it('localizes known password validation failures in both directions', () => {
    expect(localizeAccountMutationError(
      'Mật khẩu hiện tại không đúng.',
      'en',
      'password',
    )).toBe('The current password is incorrect.')
    expect(localizeAccountMutationError(
      'The new password cannot exceed 128 characters.',
      'vi',
      'password',
    )).toBe('Mật khẩu mới không được dài quá 128 ký tự.')
  })

  it('does not expose unknown provider details', () => {
    expect(localizeAccountMutationError('private provider detail 42', 'en', 'profile'))
      .toBe('Could not save the changes. Try again later.')
    expect(localizeAccountMutationError('Lỗi nhà cung cấp riêng 42', 'vi', 'password'))
      .toBe('Dịch vụ tài khoản chưa sẵn sàng. Vui lòng thử lại sau.')
  })

  it('localizes account ownership changes', () => {
    expect(localizeAccountMutationError(
      'Phiên tài khoản đã thay đổi. Vui lòng thử lại.',
      'en',
      'profile',
    )).toBe('The active account changed. Try again.')
  })
})
