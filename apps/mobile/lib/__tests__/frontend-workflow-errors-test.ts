import { localizeWorkflowError } from '../frontend-workflow/errors'

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

  it('keeps direct-payment confirmation failures actionable without exposing backend detail', () => {
    expect(localizeWorkflowError('private provider detail 42', 'vi', 'ROUTE_NOT_FOUND', 'direct_payment_confirmation')).toBe(
      'Chức năng xác nhận trả trực tiếp chưa sẵn sàng. Vui lòng thử lại sau.',
    )
    expect(localizeWorkflowError('private provider detail 42', 'vi', 'DB_ERROR', 'direct_payment_confirmation')).toBe(
      'Chưa thể ghi nhận xác nhận trả trực tiếp. Vui lòng thử lại.',
    )
    expect(localizeWorkflowError('private provider detail 42', 'en', 'STATUS_CHANGED')).toBe(
      'The job status changed. Refresh and try again.',
    )
  })

  it('keeps direct-payment selection failures actionable without exposing worker finances', () => {
    expect(localizeWorkflowError('private provider detail 42', 'vi', 'COLLATERAL_UNAVAILABLE', 'direct_payment_selection')).toBe(
      'Trả trực tiếp chưa khả dụng cho công việc này. Hãy thanh toán bằng QR.',
    )
    expect(localizeWorkflowError('private provider detail 42', 'en', 'COLLATERAL_UNAVAILABLE', 'direct_payment_selection')).toBe(
      'Direct payment is not available for this job. Use the QR payment instead.',
    )
    expect(localizeWorkflowError('private provider detail 42', 'vi', 'ROUTE_NOT_FOUND', 'direct_payment_selection')).toBe(
      'Chức năng trả trực tiếp chưa sẵn sàng. Vui lòng thử lại sau.',
    )
  })

  it('preserves specific locally-owned workflow guidance', () => {
    const message = 'Không có yêu cầu để mở quyền vào căn hộ'

    expect(localizeWorkflowError(message, 'vi')).toBe(message)
    expect(localizeWorkflowError(message, 'en')).toBe('No request for apartment access')
  })
})
