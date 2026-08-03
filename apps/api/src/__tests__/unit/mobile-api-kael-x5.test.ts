import { describe, expect, it } from 'vitest'
import { scrubSensitiveForLLM } from '../../../../../supabase/functions/mobile-api/_shared/kael/pipeline/utils'

// The same scrubber the Edge persist
// layer applies before writing kael_chat_turns.text_content. These assert raw
// PII is removed so it never lands in the DB.

describe('X5 F-22 scrubSensitiveForLLM — strips PII before persist', () => {
  it('strips Vietnamese phone numbers', () => {
    const out = scrubSensitiveForLLM('Gọi tôi số 0909123456 nhé')
    expect(out).not.toMatch(/0909123456/)
    expect(out).toContain('[phone]')
  })

  it('strips +84 phone numbers', () => {
    const out = scrubSensitiveForLLM('Liên hệ +84909123456')
    expect(out).not.toMatch(/\+?84909123456/)
    expect(out).toContain('[phone]')
  })

  it('strips email addresses', () => {
    const out = scrubSensitiveForLLM('Email của tôi la nguyenvana@gmail.com')
    expect(out).not.toMatch(/nguyenvana@gmail\.com/)
    expect(out).toContain('[email]')
  })

  it('strips CCCD / long id numbers', () => {
    const out = scrubSensitiveForLLM('CCCD 001234567890 của tôi')
    expect(out).not.toMatch(/001234567890/)
  })

  it('strips known building names', () => {
    const out = scrubSensitiveForLLM('Tôi ở Vinhomes Central Park toà L3')
    expect(out).toContain('[building]')
  })

  it('strips floor and unit references', () => {
    const floor = scrubSensitiveForLLM('Nhà tôi ở tầng 12')
    expect(floor).toContain('[floor]')
    const unit = scrubSensitiveForLLM('Căn hộ A-1502 cần sửa')
    expect(unit).toContain('[unit]')
  })

  it('preserves the actual problem text (does not over-scrub)', () => {
    const out = scrubSensitiveForLLM('Cầu dao trip liên tục khi bật đèn')
    expect(out).toContain('Cầu dao trip')
    expect(out).toContain('đèn')
  })

  it('is idempotent — re-scrubbing already-scrubbed text is stable', () => {
    const once = scrubSensitiveForLLM('Số 0909123456, email a@b.com')
    const twice = scrubSensitiveForLLM(once)
    expect(twice).toBe(once)
  })
})
