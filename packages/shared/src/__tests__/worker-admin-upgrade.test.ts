import { describe, expect, it } from 'vitest'
import {
  adminOperatorActivationSchema,
  adminOperatorProvisionSchema,
  workerRegistrationDraftSchema,
} from '../index'

describe('worker registration draft contract', () => {
  it('accepts a valid partial step without requiring the full registration', () => {
    expect(workerRegistrationDraftSchema.parse({
      legal_name: 'Nguyễn Văn An',
      years_experience: 4,
    })).toEqual({
      legal_name: 'Nguyễn Văn An',
      years_experience: 4,
    })
  })

  it('keeps paired coordinates and private verification references strict', () => {
    expect(workerRegistrationDraftSchema.safeParse({ home_lat: 10.8 }).success).toBe(false)
    expect(workerRegistrationDraftSchema.safeParse({
      cccd_front_url: 'https://public.example/identity.jpg',
    }).success).toBe(false)
  })
})

describe('admin operator provisioning contracts', () => {
  it('normalizes and accepts only gmail.com identities', () => {
    const parsed = adminOperatorProvisionSchema.parse({
      full_name: '  Lê Minh Anh  ',
      email: '  MINH.ANH@GMAIL.COM ',
      initial_password: 'temporary-strong-password',
      capabilities: ['workers.read'],
    })

    expect(parsed.full_name).toBe('Lê Minh Anh')
    expect(parsed.email).toBe('minh.anh@gmail.com')
    expect(parsed.capabilities).toContain('finance.read')
    expect(adminOperatorProvisionSchema.safeParse({
      full_name: 'Lê Minh Anh',
      email: 'minh.anh@googlemail.com',
      initial_password: 'temporary-strong-password',
      capabilities: [],
    }).success).toBe(false)
  })

  it('requires distinct current and replacement passwords', () => {
    expect(adminOperatorActivationSchema.safeParse({
      current_password: 'same-password',
      new_password: 'same-password',
    }).success).toBe(false)
  })
})
