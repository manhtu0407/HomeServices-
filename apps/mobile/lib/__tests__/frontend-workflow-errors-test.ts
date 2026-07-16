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

  it('preserves specific locally-owned workflow guidance', () => {
    const message = 'Không có yêu cầu để mở quyền vào căn hộ'

    expect(localizeWorkflowError(message, 'vi')).toBe(message)
    expect(localizeWorkflowError(message, 'en')).toBe('No request for apartment access')
  })
})
