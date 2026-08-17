import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SEED = readFileSync(
  resolve(__dirname, '../../../../../supabase/seed.sql'),
  'utf-8'
)

// Whether the seed produces the rows it means to is settled by running it:
// `supabase db reset --local` replays it in the database-controls job and fails
// there if it does not. What running cannot catch is a real credential or a real
// phone number committed into the file, so that is all this file still asserts.
describe('Seed data safety', () => {
  it('phone numbers are obviously fake (test patterns)', () => {
    const phones = SEED.match(/'00000000000\d'/g) || []
    expect(phones).toHaveLength(6)
    for (const phone of phones) {
      expect(phone).toMatch(/^'00000000000[123]'$/)
    }
  })

  it('no real API keys or secrets', () => {
    expect(SEED).not.toMatch(/sk-[a-zA-Z0-9]{20,}/)
    expect(SEED).not.toMatch(/pplx-[a-zA-Z0-9]{20,}/)
    expect(SEED).not.toMatch(/Bearer\s+[a-zA-Z0-9]{20,}/)
  })

  it('no real Vietnamese phone numbers (+84 format)', () => {
    expect(SEED).not.toMatch(/\+84\d{9,10}/)
  })

  it('no email addresses', () => {
    expect(SEED).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  })
})
