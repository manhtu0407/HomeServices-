import {
  isAmbiguousKaelConversationFailure,
  kaelConversationOutcomeUncertainCopy,
  localizeKaelConversationFailure,
} from '../kael-conversation-failure'

describe('Kael conversation failures', () => {
  it('explains the Production client compatibility response in the selected language', () => {
    expect(localizeKaelConversationFailure({ code: 'CLIENT_UPDATE_REQUIRED', status: 426 }, 'vi', 'fallback'))
      .toContain('chưa tương thích với dịch vụ')
    expect(localizeKaelConversationFailure({ code: 'CLIENT_UPDATE_REQUIRED', status: 426 }, 'en', 'fallback'))
      .toContain('not compatible with the service')
  })

  it('explains an expired or missing authenticated session', () => {
    expect(localizeKaelConversationFailure({ code: 'AUTH_MISSING', status: 401 }, 'vi', 'fallback'))
      .toContain('Phiên đăng nhập')
    expect(localizeKaelConversationFailure({ code: 'AUTH_REQUIRED', status: 401 }, 'en', 'fallback'))
      .toContain('Sign in again')
  })

  it('keeps definitive compatibility rejections out of ambiguous-turn recovery', () => {
    expect(isAmbiguousKaelConversationFailure({ code: 'CLIENT_UPDATE_REQUIRED', status: 426 })).toBe(false)
    expect(isAmbiguousKaelConversationFailure({ code: 'NETWORK_ERROR', status: 0 })).toBe(true)
    expect(isAmbiguousKaelConversationFailure({ code: 'INTERNAL_ERROR', status: 503 })).toBe(true)
  })

  it('provides a safe retry instruction when the turn outcome is unknown', () => {
    expect(kaelConversationOutcomeUncertainCopy('vi')).toContain('kiểm tra trước khi gửi lại')
    expect(kaelConversationOutcomeUncertainCopy('en')).toContain('check before sending it again')
  })
})
