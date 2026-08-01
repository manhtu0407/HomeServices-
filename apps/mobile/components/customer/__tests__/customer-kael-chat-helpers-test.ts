import { localizeKaelRequestFailure } from '../kael-chat/customer-kael-chat-helpers'

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
})
