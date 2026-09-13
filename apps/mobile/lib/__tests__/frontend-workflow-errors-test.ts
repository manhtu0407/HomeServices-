import { localizeWorkflowError } from '../frontend-workflow/errors'
import type { ApiResult } from '../api'

function remoteFailure(code: string, supportCode: string | null): Extract<ApiResult<never>, { success: false }> {
  return {
    success: false,
    code,
    error: 'private provider detail 42',
    status: 503,
    meta: { supportCode, operationId: null, releaseId: null, runId: null, traceId: null },
  }
}

describe('frontend workflow error localization', () => {
  it('keeps the six-service validation message aligned in Vietnamese and English', () => {
    const message = 'Chọn một trong sáu dịch vụ NestScout hỗ trợ trước khi tạo yêu cầu'

    expect(localizeWorkflowError(message, 'vi')).toBe(message)
    expect(localizeWorkflowError(message, 'en')).toBe('Choose one of the six NestScout services before creating a request')
  })

  it('does not expose unknown backend errors in either language', () => {
    expect(localizeWorkflowError('private provider detail 42', 'vi')).toBe(
      'Không thể cập nhật yêu cầu. Vui lòng thử lại.',
    )
    expect(localizeWorkflowError('Lỗi nội bộ nhà cung cấp 42', 'en')).toBe(
      'Could not update the request. Try again.',
    )
  })

  it('turns safe transport codes into actionable customer guidance', () => {
    expect(localizeWorkflowError('private provider detail 42', 'vi', 'AUTH_REQUIRED')).toBe(
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    )
    expect(localizeWorkflowError('private provider detail 42', 'vi', 'NETWORK_ERROR')).toBe(
      'Không thể kết nối đến hệ thống. Vui lòng thử lại.',
    )
    expect(localizeWorkflowError('private provider detail 42', 'en', 'INVALID_RESPONSE')).toBe(
      'The job data is not valid. Try again.',
    )
  })

  it('keeps generic backend failures generic outside cash confirmation', () => {
    expect(localizeWorkflowError('private provider detail 42', 'vi', 'DB_ERROR')).toBe(
      'Không thể cập nhật yêu cầu. Vui lòng thử lại.',
    )
  })

  it('keeps stale payment-route errors generic after direct payment is retired', () => {
    expect(localizeWorkflowError('private provider detail 42', 'vi', 'ROUTE_NOT_FOUND')).toBe(
      'Không thể cập nhật yêu cầu. Vui lòng thử lại.',
    )
    expect(localizeWorkflowError('private provider detail 42', 'vi', 'DB_ERROR')).toBe(
      'Không thể cập nhật yêu cầu. Vui lòng thử lại.',
    )
    expect(localizeWorkflowError('private provider detail 42', 'en', 'STATUS_CHANGED')).toBe(
      'The job status changed. Refresh and try again.',
    )
  })

  it('preserves specific locally-owned workflow guidance', () => {
    const message = 'Không có yêu cầu để mở quyền vào căn hộ'

    expect(localizeWorkflowError(message, 'vi')).toBe(message)
    expect(localizeWorkflowError(message, 'en')).toBe('No request for apartment access')
  })

  it.each([
    ['CANCELLATION_OUTCOME_UNKNOWN', 'Chưa xác định được kết quả hủy yêu cầu. Công việc vẫn được giữ để đối soát; hãy tải lại trạng thái trước khi thao tác tiếp.', 'The cancellation outcome is not yet known. The job is retained for reconciliation; refresh its status before taking another action.'],
    ['KAEL_CASE_WORK_REQUIRED', 'Hãy mở yêu cầu trong Kael và xác nhận đề nghị có giá hoặc yêu cầu khảo sát, báo giá trước khi gửi tới thợ.', 'Open your request in Kael and confirm the priced offer or inspection and quotation request before sending it to workers.'],
    ['COVERAGE_UNAVAILABLE', 'Dịch vụ chưa thể nhận yêu cầu tại khu vực này. Vui lòng thử lại sau.', 'The service cannot accept a request in this area right now. Try again later.'],
    ['MATCHING_CAPACITY_UNAVAILABLE', 'Khả năng nhận việc đã thay đổi. Hãy tải lại trạng thái ghép thợ hoặc danh sách lời mời.', 'Worker capacity has changed. Refresh the matching status or invitation list.'],
    ['MATCHING_REPLACEMENT_CAPACITY_UNAVAILABLE', 'Khả năng nhận việc đã thay đổi. Hãy tải lại trạng thái ghép thợ hoặc danh sách lời mời.', 'Worker capacity has changed. Refresh the matching status or invitation list.'],
    ['POLICY_UNAVAILABLE', 'Chính sách dịch vụ chưa sẵn sàng. Vui lòng thử lại sau.', 'The service policy is not ready. Try again later.'],
    ['CLIENT_UPDATE_REQUIRED', 'Hãy cập nhật ứng dụng để tiếp tục.', 'Update the app to continue.'],
    ['RECOVERY_REQUIRED', 'Yêu cầu cần được đối soát trước khi tiếp tục. Hãy tải lại trạng thái hoặc liên hệ hỗ trợ.', 'This request needs reconciliation before continuing. Refresh its status or contact support.'],
    ['INVALID_JOB_MEDIA_REF', 'Ảnh hoặc video không hợp lệ cho công việc này. Hãy tải lại bằng chứng.', 'The photo or video is not valid for this job. Upload the evidence again.'],
    ['MEDIA_VALIDATION_UNAVAILABLE', 'Chưa thể xác minh bằng chứng công việc. Vui lòng thử lại sau.', 'Job evidence cannot be verified right now. Try again later.'],
    ['CUSTOMER_COMPLETION_EVIDENCE_REQUIRED', 'Cần có bằng chứng hoàn tất hợp lệ trước khi xác nhận.', 'Valid completion evidence is required before confirmation.'],
    ['COMPLETION_EVIDENCE_REQUIRED', 'Cần có bằng chứng hoàn tất hợp lệ trước khi xác nhận.', 'Valid completion evidence is required before confirmation.'],
  ])('distinguishes the server %s blocker without exposing backend details', (code, vi, en) => {
    const failure = remoteFailure(code, 'A1B2C3D4')
    expect(localizeWorkflowError(failure, 'vi')).toBe(`${vi} Mã hỗ trợ: A1B2C3D4.`)
    expect(localizeWorkflowError(failure, 'en')).toBe(`${en} Support code: A1B2C3D4.`)
  })

  it.each([null, '', 'short', 'A1B2C3D4\nprivate', 'credential=secret', 'A1B2C3D45'])('rejects malformed support identity %s', (supportCode) => {
    const failure = remoteFailure('DB_ERROR', supportCode)
    expect(localizeWorkflowError(failure, 'vi')).toBe('Không thể cập nhật yêu cầu. Vui lòng thử lại.')
    expect(localizeWorkflowError(failure, 'en')).toBe('Could not update the request. Try again.')
  })

  it('keeps an unknown failure traceable without forwarding its private message', () => {
    expect(localizeWorkflowError(remoteFailure('UNEXPECTED_PROVIDER_FAILURE', 'A1B2C3D4'), 'vi')).toBe(
      'Không thể cập nhật yêu cầu. Vui lòng thử lại. Mã hỗ trợ: A1B2C3D4.',
    )
  })

  it('labels a no-response diagnostic as device-only without claiming a server support record', () => {
    const failure = remoteFailure('NETWORK_ERROR', null)
    failure.meta = { ...failure.meta!, clientRequestId: '70d9b338-6444-43ad-9c41-abcda1b2c3d4', clientDiagnosticCode: 'NSL-A1B2C3D4' }
    expect(localizeWorkflowError(failure, 'vi')).toBe('Không thể kết nối đến hệ thống. Vui lòng thử lại. Mã chẩn đoán trên thiết bị: NSL-A1B2C3D4.')
    expect(localizeWorkflowError(failure, 'en')).toBe('Could not connect to the system. Try again. Device diagnostic code: NSL-A1B2C3D4.')
    expect(localizeWorkflowError(failure, 'en')).not.toContain('Support code')
  })
})
