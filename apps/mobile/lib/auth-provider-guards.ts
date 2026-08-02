export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function staleAccountMutation() {
  return {
    success: false as const,
    error: 'Phiên tài khoản đã thay đổi. Vui lòng thử lại.',
  }
}
