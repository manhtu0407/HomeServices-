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
})
