import type { AppLanguage } from '../app-language'

export type WorkflowErrorContext = 'direct_payment_confirmation' | 'direct_payment_selection'

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
    receipt: 'Biên nhận xác nhận chưa hợp lệ. Hãy tải lại đề nghị rồi thử lại.',
    schedule: 'Khung giờ dịch vụ chưa hợp lệ. Hãy chọn lại thời gian.',
    policy: 'Yêu cầu chưa đáp ứng chính sách tiếp nhận hiện tại. Hãy kiểm tra thông tin bắt buộc.',
    releaseMismatch: 'Phiên bản ứng dụng chưa khớp với dịch vụ. Hãy cập nhật hoặc mở lại ứng dụng.',
    noWorker: 'Chưa có thợ phù hợp đang hoạt động. Yêu cầu vẫn được giữ để thử lại.',
    recovery: 'Hệ thống đang đối soát yêu cầu trước đó để tránh tạo trùng.',
    proposalScope: 'Phạm vi đề xuất cần từ 3 đến 2.000 ký tự.',
    proposalPrice: 'Báo giá cần đủ hai mức giá nguyên dương hợp lệ.',
    proposalRange: 'Giá tối đa phải bằng hoặc lớn hơn giá tối thiểu.',
    proposalAction: 'Cách phản hồi lời mời này không còn hợp lệ. Hãy tải lại.',
    directSelectionCollateralUnavailable: 'Trả trực tiếp chưa khả dụng cho công việc này. Hãy thanh toán bằng QR.',
    directSelectionUnavailable: 'Chức năng trả trực tiếp chưa sẵn sàng. Vui lòng thử lại sau.',
    directSelectionFailed: 'Chưa thể chọn trả trực tiếp. Vui lòng thử lại.',
    directConfirmationUnavailable: 'Chức năng xác nhận trả trực tiếp chưa sẵn sàng. Vui lòng thử lại sau.',
    directConfirmationFailed: 'Chưa thể ghi nhận xác nhận trả trực tiếp. Vui lòng thử lại.',
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
    receipt: 'The confirmation receipt is not valid. Refresh the offer and try again.',
    schedule: 'The service time is not valid. Choose another time.',
    policy: 'This request does not meet the current intake policy. Review the required information.',
    releaseMismatch: 'The app release does not match the service. Update or reopen the app.',
    noWorker: 'No suitable worker is currently reachable. Your request is preserved for retry.',
    recovery: 'The system is reconciling the previous request to prevent a duplicate.',
    proposalScope: 'Proposal scope must be between 3 and 2,000 characters.',
    proposalPrice: 'The quote needs two valid positive whole-number price bounds.',
    proposalRange: 'Maximum price must be at least the minimum price.',
    proposalAction: 'This invitation response is no longer valid. Refresh it.',
    directSelectionCollateralUnavailable: 'Direct payment is not available for this job. Use the QR payment instead.',
    directSelectionUnavailable: 'Direct payment is not ready yet. Try again later.',
    directSelectionFailed: 'Could not select direct payment. Try again.',
    directConfirmationUnavailable: 'Direct-payment confirmation is not ready yet. Try again later.',
    directConfirmationFailed: 'Direct-payment confirmation could not be recorded. Try again.',
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
  supportCode?: string | null,
) {
  const codeKey = isOneOf(code, ['MISSING_REASONING_RECEIPT', 'PRICE_REASONING_RECEIPT_REQUIRED', 'INVALID_PRICE_REASONING_RECEIPT'])
    ? 'receipt'
    : isOneOf(code, ['SCHEDULE_REQUIRED', 'SCHEDULE_INVALID', 'SCHEDULE_EXPIRED', 'INVALID_SCHEDULE'])
      ? 'schedule'
      : isOneOf(code, ['INTAKE_POLICY_MISSING', 'POLICY_NOT_FOUND', 'POLICY_VERSION_MISMATCH', 'QUOTE_MODE_BLOCKED'])
        ? 'policy'
        : isOneOf(code, ['RELEASE_MISMATCH', 'RELEASE_ID_MISMATCH', 'MOBILE_RELEASE_MISMATCH', 'CLIENT_RELEASE_MISMATCH', 'RELEASE_INCOMPATIBLE', 'BUILD_BELOW_MINIMUM'])
          ? 'releaseMismatch'
          : isOneOf(code, ['NO_REACHABLE_WORKER', 'NO_WORKER_FOUND'])
            ? 'noWorker'
            : isOneOf(code, ['RECOVERY_REQUIRED', 'CONFIRMATION_RECOVERY_REQUIRED', 'UNKNOWN_CONFIRMATION_OUTCOME', 'IDEMPOTENCY_RECONCILE_REQUIRED'])
              ? 'recovery'
              : isOneOf(code, ['PROPOSAL_SCOPE_INVALID', 'INVALID_PROPOSAL_SCOPE'])
                ? 'proposalScope'
                : isOneOf(code, ['PROPOSAL_PRICE_REQUIRED', 'PROPOSAL_PRICE_FORBIDDEN', 'INVALID_PROPOSAL_PRICE'])
                  ? 'proposalPrice'
                  : isOneOf(code, ['PROPOSAL_PRICE_RANGE_INVALID', 'INVALID_PRICE_RANGE'])
                    ? 'proposalRange'
                    : isOneOf(code, ['PROPOSAL_ACTION_INVALID', 'INVALID_PROPOSAL_ACTION'])
                      ? 'proposalAction'
              : code === 'AUTH_REQUIRED' || code === 'HTTP_401'
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
                : context === 'direct_payment_selection' && code === 'COLLATERAL_UNAVAILABLE'
                  ? 'directSelectionCollateralUnavailable'
                  : context === 'direct_payment_selection' && code === 'ROUTE_NOT_FOUND'
                    ? 'directSelectionUnavailable'
                    : context === 'direct_payment_selection' && (code === 'DB_ERROR' || code === 'PAYMENT_FAILED')
                      ? 'directSelectionFailed'
                : context === 'direct_payment_confirmation' && code === 'ROUTE_NOT_FOUND'
                  ? 'directConfirmationUnavailable'
                  : context === 'direct_payment_confirmation' && code === 'DB_ERROR'
                    ? 'directConfirmationFailed'
              : null
  if (codeKey) return withSupportCode(workflowErrorCopy[language][codeKey], language, supportCode)
  const mappedKey = workflowErrorKeyByViMessage.get(error)
  if (mappedKey) return withSupportCode(workflowErrorCopy[language][mappedKey], language, supportCode)
  return withSupportCode(workflowErrorCopy[language].fallback, language, supportCode)
}

function isOneOf(value: string | undefined, values: readonly string[]) {
  return typeof value === 'string' && values.includes(value)
}

function withSupportCode(message: string, language: AppLanguage, supportCode?: string | null) {
  if (!supportCode || !/^[A-Z0-9]{8}$/.test(supportCode)) return message
  return `${message} ${language === 'vi' ? 'Mã hỗ trợ' : 'Support code'}: ${supportCode}.`
}
