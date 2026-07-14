import { parseAuthIdentifier } from './auth-identifier'
import { supabase } from './supabase'

export async function resendSignupConfirmationEmail(emailInput: string) {
  if (!supabase) {
    return { success: false, error: 'Dịch vụ xác nhận tài khoản chưa sẵn sàng. Vui lòng thử lại sau.' }
  }

  const identifier = parseAuthIdentifier(emailInput)
  if (!identifier || identifier.kind !== 'email') {
    return { success: false, error: 'Email chưa đúng định dạng.' }
  }

  try {
    const { error } = await supabase.auth.resend({
      email: identifier.value,
      type: 'signup',
    })
    if (error) {
      return { success: false, error: 'Chưa thể gửi lại email xác nhận. Vui lòng thử lại sau.' }
    }
    return { success: true }
  } catch {
    return { success: false, error: 'Không thể kết nối dịch vụ xác nhận. Vui lòng thử lại sau.' }
  }
}
