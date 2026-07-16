import { buildCustomerProfileMetadata } from '../customer-profile-metadata'

describe('buildCustomerProfileMetadata', () => {
  it('normalizes only the owned profile fields', () => {
    expect(buildCustomerProfileMetadata({
      birthDate: '1990-04-07',
      defaultAddress: '  Tòa A,   Quận 7  ',
      email: ' TU@Example.com ',
      fullName: '  Nguyễn   An  ',
      phone: '090 123 4567',
      savedAddresses: [' Tòa B, Quận 7 ', 'tòa b, quận 7', '', 'Tòa C, Quận 1'],
    })).toEqual({
      data: {
        birth_date: '1990-04-07',
        contact_email: 'tu@example.com',
        default_address: 'Tòa A, Quận 7',
        full_name: 'Nguyễn An',
        name: 'Nguyễn An',
        phone_number: '+84901234567',
        saved_addresses: ['Tòa B, Quận 7', 'Tòa C, Quận 1'],
      },
      success: true,
    })
  })

  it('keeps explicit blank optional values as clears', () => {
    expect(buildCustomerProfileMetadata({
      defaultAddress: ' ',
      email: '',
      nickname: ' ',
      phone: ' ',
      savedAddresses: [],
    })).toEqual({
      data: {
        contact_email: null,
        default_address: null,
        nickname: null,
        phone_number: null,
        preferred_name: null,
        saved_addresses: [],
      },
      success: true,
    })
  })

  it.each([
    { fullName: 'x' },
    { fullName: 'x'.repeat(101) },
    { email: 'not-an-email' },
    { phone: '+14155552671' },
    { birthDate: '2024-02-31' },
    { birthDate: '2999-01-01' },
    { defaultAddress: 'x'.repeat(301) },
    { savedAddresses: [null] as unknown as string[] },
    { savedAddresses: ['x'.repeat(301)] },
  ])('rejects malformed or oversized profile data: %p', (profile) => {
    expect(buildCustomerProfileMetadata(profile)).toEqual({
      error: 'Thông tin hồ sơ chưa hợp lệ.',
      success: false,
    })
  })

  it('rejects a non-string field without throwing outside the auth mutation', () => {
    expect(buildCustomerProfileMetadata({
      fullName: 42 as unknown as string,
    })).toEqual({
      error: 'Thông tin hồ sơ chưa hợp lệ.',
      success: false,
    })
  })
})
