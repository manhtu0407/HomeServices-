import type { AppLanguage } from '../app-language'

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
export function localizeWorkflowError(error: string, language: AppLanguage) {
  const mappedKey = workflowErrorKeyByViMessage.get(error)
  if (mappedKey) return workflowErrorCopy[language][mappedKey]
  return workflowErrorCopy[language].fallback
}
