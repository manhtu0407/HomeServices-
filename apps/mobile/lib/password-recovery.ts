import { parseAuthIdentifier } from './auth-identifier'
import { getPasswordRecoveryRedirectUrl } from './auth-callback'
import { supabase } from './supabase'

export async function requestPasswordRecoveryEmail(emailInput: string) {
  if (!supabase) {
    return { success: false, error: 'Dịch vụ khôi phục mật khẩu chưa sẵn sàng. Vui lòng thử lại sau.' }
  }

  const identifier = parseAuthIdentifier(emailInput)
  if (!identifier || identifier.kind !== 'email') {
    return { success: false, error: 'Email chưa đúng định dạng.' }
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(identifier.value, {
      redirectTo: getPasswordRecoveryRedirectUrl(),
    })
    if (error) {
      return { success: false, error: 'Chưa thể gửi liên kết đặt lại mật khẩu. Vui lòng thử lại sau.' }
    }
    return { success: true }
  } catch {
    return { success: false, error: 'Không thể kết nối dịch vụ khôi phục mật khẩu. Vui lòng thử lại sau.' }
  }
}

export async function updateRecoveredPassword(newPassword: string) {
  if (!supabase) {
    return { success: false, error: 'Dịch vụ đặt lại mật khẩu chưa sẵn sàng. Vui lòng thử lại sau.' }
  }
  if (newPassword.length < 8) {
    return { success: false, error: 'Mật khẩu mới cần ít nhất 8 ký tự.' }
  }

  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      return { success: false, error: 'Chưa thể cập nhật mật khẩu. Liên kết có thể đã hết hạn.' }
    }
    return { success: true }
  } catch {
    return { success: false, error: 'Không thể kết nối dịch vụ đặt lại mật khẩu. Vui lòng thử lại sau.' }
  }
}
