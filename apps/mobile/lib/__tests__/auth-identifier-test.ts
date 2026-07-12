import {
  parseAuthIdentifier,
  validateAuthIdentifier,
} from '../auth-identifier'

describe('auth identifier validation', () => {
  it('accepts a normalized email address', () => {
    expect(parseAuthIdentifier('  ABC@Gmail.com ')).toEqual({
      kind: 'email',
      value: 'abc@gmail.com',
    })
    expect(validateAuthIdentifier('abc@gmail.com')).toBeNull()
  })

  it('accepts Vietnamese mobile numbers and normalizes them to E.164', () => {
    expect(parseAuthIdentifier('090 123 4567')).toEqual({
      kind: 'phone',
      value: '+84901234567',
    })
    expect(parseAuthIdentifier('+84 912-345-678')).toEqual({
      kind: 'phone',
      value: '+84912345678',
    })
    expect(validateAuthIdentifier('0987654321')).toBeNull()
  })

  it('rejects malformed email addresses and non-Vietnamese mobile formats', () => {
    expect(validateAuthIdentifier('abc@gmail')).toBe('Email chưa đúng định dạng.')
    expect(validateAuthIdentifier('091234567')).toBe('SDT Việt Nam chưa đúng định dạng.')
    expect(validateAuthIdentifier('0112345678')).toBe('SDT Việt Nam chưa đúng định dạng.')
    expect(validateAuthIdentifier('84912345678')).toBe('SDT Việt Nam chưa đúng định dạng.')
    expect(validateAuthIdentifier('+14155552671')).toBe('SDT Việt Nam chưa đúng định dạng.')
  })
})
