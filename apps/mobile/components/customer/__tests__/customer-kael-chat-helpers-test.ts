import { localizeKaelRequestFailure } from '../v21/customer-kael-chat-helpers'

describe('localizeKaelRequestFailure', () => {
  it('uses code-owned localized messages', () => {
    const failure = {
      code: 'INVALID_STATUS',
      error: 'private workflow detail 42',
    }

    expect(localizeKaelRequestFailure(failure, 'vi')).toBe(
      'Bước này không còn khả dụng vì công việc đã chuyển tiếp.',
    )
    expect(localizeKaelRequestFailure(failure, 'en')).toBe(
      'This step is no longer available because the case has moved forward.',
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
