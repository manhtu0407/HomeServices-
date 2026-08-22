import type { AccountDeletionInput, AccountDeletionResponse } from './api-types'
import { api } from './api'
import type { ApiResult } from './api'
import type { AppLanguage } from './app-language'

type AccountDeletionFailure = Extract<ApiResult<AccountDeletionResponse>, { success: false }>

const ACCOUNT_DELETION_ERROR_COPY: Record<string, { en: string; vi: string }> = {
  ACCOUNT_DELETION_ALREADY_PROCESSING: {
    en: 'An account deletion request is already being processed. Please try again later.',
    vi: 'Một yêu cầu xóa tài khoản đang được xử lý. Vui lòng thử lại sau.',
  },
  ACCOUNT_DELETION_BLOCKED_ACTIVE_JOB: {
    en: 'Finish or cancel your active job before deleting the account.',
    vi: 'Hãy hoàn tất hoặc hủy công việc đang hoạt động trước khi xóa tài khoản.',
  },
  ACCOUNT_DELETION_BLOCKED_DISPUTE: {
    en: 'Resolve the open dispute before deleting the account.',
    vi: 'Hãy hoàn tất yêu cầu giải quyết đang mở trước khi xóa tài khoản.',
  },
  ACCOUNT_DELETION_BLOCKED_PAYMENT: {
    en: 'Wait for the pending payment to finish before deleting the account.',
    vi: 'Hãy chờ khoản thanh toán đang xử lý hoàn tất trước khi xóa tài khoản.',
  },
  ACCOUNT_DELETION_BLOCKED_SETTLEMENT: {
    en: 'Wait for the pending settlement or withdrawal to finish before deleting the account.',
    vi: 'Hãy chờ khoản đối soát hoặc rút tiền đang xử lý hoàn tất trước khi xóa tài khoản.',
  },
  ACCOUNT_DELETION_PROCESSING: {
    en: 'The deletion request is secured but could not finish yet. Please try again.',
    vi: 'Yêu cầu xóa đã được khóa an toàn nhưng chưa thể hoàn tất. Vui lòng thử lại.',
  },
  ACCOUNT_NOT_FOUND: {
    en: 'This account is no longer available.',
    vi: 'Tài khoản này không còn khả dụng.',
  },
  AUTH_REQUIRED: {
    en: 'Your session expired. Sign in again and retry.',
    vi: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi thử tiếp.',
  },
  REAUTH_REQUIRED: {
    en: 'For your security, sign in again before deleting the account.',
    vi: 'Để bảo vệ tài khoản, hãy đăng nhập lại trước khi xóa tài khoản.',
  },
}

export function accountDeletionErrorMessage(
  language: AppLanguage,
  failure: AccountDeletionFailure,
) {
  const copy = ACCOUNT_DELETION_ERROR_COPY[failure.code]
  if (copy) return copy[language]
  return language === 'vi'
    ? 'Chưa thể xóa tài khoản. Vui lòng thử lại.'
    : 'We could not delete the account. Please try again.'
}

export const accountDeletionService = {
  deleteAccount(input: AccountDeletionInput, accessToken: string) {
    return api.postAuthenticated<AccountDeletionResponse>(
      '/me/account-deletion',
      input,
      accessToken,
    )
  },
}
