import type { AppLanguage } from '../app-language'

export type WorkflowErrorContext = 'cash_payment_confirmation'

const workflowErrorCopy: Record<AppLanguage, Record<string, string>> = {
  vi: {
    noRequestRefresh: 'Chưa có yêu cầu để tải lại',
    missingService: 'Chọn một trong sáu dịch vụ NestScout hỗ trợ trước khi tạo yêu cầu',
    missingProblem: 'Chọn ít nhất một vấn đề cần xử lý',
    shortDescription: 'Mô tả cần rõ hơn trước khi gửi yêu cầu',
    missingDistrict: 'Địa chỉ cần có quận TP.HCM rõ ràng',
    noRequestSearch: 'Chưa có yêu cầu để tìm thợ',
    noInviteAccept: 'Không có lời mời việc để nhận',
    noInviteDecline: 'Không có lời mời việc để từ chối',
    noRequestUpdate: 'Không có yêu cầu để cập nhật',
    noRequestScope: 'Không có yêu cầu để đổi phạm vi',
    noRequestCancel: 'Không có yêu cầu để hủy',
    noRequestConfirm: 'Không có yêu cầu để xác nhận hoàn tất',
    noRequestReview: 'Không có yêu cầu để đánh giá',
    noRequestIncident: 'Không có yêu cầu để mở Kael Công việc',
    noRequestProposal: 'Không có yêu cầu để tạo đề xuất',
    noRequestAccess: 'Không có yêu cầu để mở quyền vào căn hộ',
    memoryAuth: 'Bạn cần đăng nhập để cập nhật bộ nhớ Kael',
    memoryConfirm: 'Không thể xác nhận cập nhật bộ nhớ Kael',
    authRequired: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    jobForbidden: 'Bạn không thể tải công việc này.',
    jobMissing: 'Công việc không còn khả dụng.',
    network: 'Không thể kết nối đến hệ thống. Vui lòng thử lại.',
    timeout: 'Kết nối quá chậm. Vui lòng thử lại.',
    invalidResponse: 'Dữ liệu công việc chưa hợp lệ. Vui lòng thử lại.',
    cashConfirmationUnavailable: 'Chức năng xác nhận tiền mặt chưa sẵn sàng. Vui lòng thử lại sau.',
    cashConfirmationFailed: 'Chưa thể ghi nhận thanh toán tiền mặt. Vui lòng thử lại.',
    statusChanged: 'Trạng thái công việc đã thay đổi. Hãy tải lại rồi thử lại.',
    fallback: 'Không thể cập nhật yêu cầu. Vui lòng thử lại.',
  },
  en: {
    noRequestRefresh: 'No request to refresh',
    missingService: 'Choose one of the six NestScout services before creating a request',
    missingProblem: 'Choose at least one problem to handle',
    shortDescription: 'Describe the issue more clearly before sending',
    missingDistrict: 'Enter a clear HCMC district',
    noRequestSearch: 'No request to send to workers',
    noInviteAccept: 'No job invite to accept',
    noInviteDecline: 'No job invite to skip',
    noRequestUpdate: 'No request to update',
    noRequestScope: 'No request for scope change',
    noRequestCancel: 'No request to cancel',
    noRequestConfirm: 'No request to confirm completion',
    noRequestReview: 'No request to review',
    noRequestIncident: 'No request for Kael Work',
    noRequestProposal: 'No request for a proposal',
    noRequestAccess: 'No request for apartment access',
    memoryAuth: 'Sign in to update Kael memory',
    memoryConfirm: 'Could not confirm the Kael memory update',
    authRequired: 'Your sign-in session has expired. Sign in again.',
    jobForbidden: 'You cannot load this job.',
    jobMissing: 'This job is no longer available.',
    network: 'Could not connect to the system. Try again.',
    timeout: 'The connection is too slow. Try again.',
    invalidResponse: 'The job data is not valid. Try again.',
    cashConfirmationUnavailable: 'Cash confirmation is not ready yet. Try again later.',
    cashConfirmationFailed: 'Cash payment could not be recorded. Try again.',
    statusChanged: 'The job status changed. Refresh and try again.',
    fallback: 'Could not update the request. Try again.',
  },
}

const workflowErrorKeyByViMessage = createWorkflowErrorLookup()

function createWorkflowErrorLookup() {
  const lookup = new Map<string, keyof typeof workflowErrorCopy.vi>()
  for (const [key, value] of Object.entries(workflowErrorCopy.vi)) {
    if (key !== 'fallback') lookup.set(value, key as keyof typeof workflowErrorCopy.vi)
  }
  return lookup
}
export function localizeWorkflowError(
  error: string,
  language: AppLanguage,
  code?: string,
  context?: WorkflowErrorContext,
) {
  const codeKey = code === 'AUTH_REQUIRED' || code === 'HTTP_401'
    ? 'authRequired'
    : code === 'HTTP_403'
      ? 'jobForbidden'
      : code === 'HTTP_404'
        ? 'jobMissing'
        : code === 'NETWORK_ERROR'
          ? 'network'
          : code === 'TIMEOUT'
            ? 'timeout'
            : code === 'INVALID_RESPONSE' || code === 'RESPONSE_TOO_LARGE'
              ? 'invalidResponse'
              : code === 'STATUS_CHANGED'
                ? 'statusChanged'
                : context === 'cash_payment_confirmation' && code === 'ROUTE_NOT_FOUND'
                  ? 'cashConfirmationUnavailable'
                  : context === 'cash_payment_confirmation' && code === 'DB_ERROR'
                    ? 'cashConfirmationFailed'
              : null
  if (codeKey) return workflowErrorCopy[language][codeKey]
  const mappedKey = workflowErrorKeyByViMessage.get(error)
  if (mappedKey) return workflowErrorCopy[language][mappedKey]
  return workflowErrorCopy[language].fallback
}
