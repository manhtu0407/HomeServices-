import {
  appendKaelSupportCode,
  localizeKaelRequestFailure,
} from '../kael-chat/customer-kael-chat-helpers'

describe('localizeKaelRequestFailure', () => {
  it('does not claim that the case moved forward for an invalid confirmation state', () => {
    const failure = {
      code: 'INVALID_STATUS',
      error: 'private workflow detail 42',
    }

    expect(localizeKaelRequestFailure(failure, 'vi')).toBe(
      'Kael chưa thể xác nhận báo giá này. Hãy tải lại trạng thái công việc rồi kiểm tra lại.',
    )
    expect(localizeKaelRequestFailure(failure, 'en')).toBe(
      'Kael could not confirm this estimate. Refresh the case status and review it again.',
    )
  })

  it.each([
    ['MISSING_ESTIMATE', 'Kael cần hoàn tất ước tính trước khi xác nhận báo giá.'],
    ['MISSING_SCOPE', 'Kael cần hoàn tất phân tích phạm vi trước khi xác nhận báo giá.'],
    ['MISSING_REASONING_RECEIPT', 'Kael cần hoàn tất biên nhận phân tích giá đã xác thực trước khi xác nhận báo giá.'],
  ])('explains the %s confirmation prerequisite without inventing a workflow state', (code, expected) => {
    expect(localizeKaelRequestFailure({ code, error: 'private detail' }, 'vi')).toBe(expected)
  })

  it('keeps an already processed confirmation distinct from an invalid confirmation state', () => {
    const failure = { code: 'ALREADY_CONFIRMED', error: 'private detail' }

    expect(localizeKaelRequestFailure(failure, 'vi')).toBe(
      'Xác nhận này đã được xử lý. Hãy tải lại trạng thái công việc để tiếp tục.',
    )
    expect(localizeKaelRequestFailure(failure, 'en')).toBe(
      'This confirmation was already processed. Refresh the case status to continue.',
    )
  })

  it('explains that an incomplete idempotency record is being reconciled', () => {
    const failure = { code: 'IDEMPOTENCY_RECONCILE_REQUIRED', error: 'private detail' }

    expect(localizeKaelRequestFailure(failure, 'vi')).toBe(
      'Kael đang đối soát lịch sử xác nhận để tránh tạo trùng yêu cầu. Vui lòng tải lại trạng thái sau ít phút.',
    )
    expect(localizeKaelRequestFailure(failure, 'en')).toBe(
      'Kael is reconciling a previous confirmation to avoid creating a duplicate request. Refresh the case status shortly.',
    )
  })

  it('never exposes an unknown backend error in either language', () => {
    const failure = {
      code: 'PRIVATE_PROVIDER_CODE',
      error: 'Lỗi nội bộ nhà cung cấp 42',
    }

    expect(localizeKaelRequestFailure(failure, 'vi')).toBe(
      'Kael chưa thể hoàn tất bước này. Vui lòng thử lại.',
    )
    expect(localizeKaelRequestFailure(failure, 'en')).toBe(
      'Kael could not complete that step. Please try again.',
    )
  })

  it.each(['TIMEOUT', 'STREAM_TIMEOUT', 'STREAM_NETWORK'])(
    'keeps %s failures actionable without exposing provider details',
    (code) => {
      const failure = { code, error: 'private transport detail' }

      expect(localizeKaelRequestFailure(failure, 'vi')).toBe(
        'Phản hồi của Kael đang mất nhiều thời gian hơn bình thường. Vui lòng gửi lại sau ít phút.',
      )
      expect(localizeKaelRequestFailure(failure, 'en')).toBe(
        'Kael is taking longer than usual to respond. Please try again shortly.',
      )
    },
  )

  it('maps the compatibility gate and preserves the safe support code', () => {
    const failure = {
      code: 'CLIENT_UPDATE_REQUIRED',
      error: 'private compatibility detail',
      meta: { supportCode: 'A1B2C3D4' },
    }

    expect(localizeKaelRequestFailure(failure, 'vi')).toBe(
      'Phiên bản ứng dụng chưa khớp với dịch vụ. Hãy cập nhật hoặc mở lại ứng dụng. Mã hỗ trợ: A1B2C3D4.',
    )
    expect(localizeKaelRequestFailure(failure, 'en')).toBe(
      'The app release does not match the service. Update or reopen the app. Support code: A1B2C3D4.',
    )
  })

  it('does not duplicate a support code when a decision path appends it again', () => {
    const message = 'Kael đang đối soát. Mã hỗ trợ: A1B2C3D4.'

    expect(appendKaelSupportCode(message, 'vi', 'A1B2C3D4')).toBe(message)
  })
})
