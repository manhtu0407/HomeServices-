import { entryAccessCopy, localizeEntryAuthError } from '../entry-access/copy'

describe('entry access copy', () => {
  it('keeps the Vietnamese and English contracts structurally aligned', () => {
    expect(Object.keys(entryAccessCopy.en.errors).sort()).toEqual(Object.keys(entryAccessCopy.vi.errors).sort())
    expect(entryAccessCopy.en.onboarding.benefits).toHaveLength(entryAccessCopy.vi.onboarding.benefits.length)
    expect(JSON.stringify(entryAccessCopy.en)).not.toMatch(/[À-ỹĐđ]/u)
  })

  it('maps known authentication errors into the selected language', () => {
    expect(localizeEntryAuthError('Email/SDT hoặc mật khẩu không đúng', 'en', 'signInFailed')).toBe(
      'Email/phone or password is incorrect.',
    )
    expect(localizeEntryAuthError('Invalid login credentials', 'vi', 'signInFailed')).toBe(
      'Thư điện tử hoặc SĐT hoặc mật khẩu không đúng.',
    )
  })

  it('never exposes an unrecognized provider string', () => {
    expect(localizeEntryAuthError('private provider detail 42', 'vi', 'signupFailed')).toBe(
      entryAccessCopy.vi.errors.signupFailed,
    )
    expect(localizeEntryAuthError('Lỗi nhà cung cấp riêng 42', 'en', 'signInFailed')).toBe(
      entryAccessCopy.en.errors.signInFailed,
    )
  })
})
