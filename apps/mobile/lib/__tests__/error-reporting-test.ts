import { redactSensitiveText, scrubSensitiveValue, scrubSentryEvent } from '../error-reporting'

describe('mobile error reporting scrubber', () => {
  it('redacts direct PII and token-shaped values from text', () => {
    const text = redactSensitiveText(
      'phone 0901234567 email tu@example.com cccd 012345678901 token Bearer abc.def.ghi pat sbp_secretvalue',
    )

    expect(text).not.toContain('0901234567')
    expect(text).not.toContain('tu@example.com')
    expect(text).not.toContain('012345678901')
    expect(text).not.toContain('abc.def.ghi')
    expect(text).not.toContain('sbp_secretvalue')
  })

  it('redacts sensitive nested keys before sending crash context', () => {
    const scrubbed = scrubSensitiveValue({
      safe: 'workflow_error',
      phone: '0901234567',
      nested: {
        address: 'Quan 7, tang 12, can A1204',
        rawProblemDescription: 'May bom nuoc hu luc nua dem',
        authorization: 'Bearer abc.def.ghi',
      },
    }) as Record<string, unknown>

    expect(scrubbed.safe).toBe('workflow_error')
    expect(scrubbed.phone).toBe('[redacted]')
    expect(scrubbed.nested).toMatchObject({
      address: '[redacted]',
      rawProblemDescription: '[redacted]',
      authorization: '[redacted]',
    })
  })

  it('drops user and request secrets from Sentry events', () => {
    const event = scrubSentryEvent({
      message: 'failed for 0901234567',
      user: { id: 'user-1', email: 'tu@example.com' },
      request: {
        headers: { authorization: 'Bearer abc.def.ghi' },
        cookies: 'session=abc',
        data: { address: 'Quan 1' },
        query_string: 'token=sbp_secretvalue',
      },
      extra: { bank_account: '123456789012' },
    } as never)

    expect(event.user).toBeUndefined()
    expect(event.request?.headers).toBeUndefined()
    expect(event.request?.cookies).toBeUndefined()
    expect(event.request?.data).toBeUndefined()
    expect(event.message).not.toContain('0901234567')
    expect(event.request?.query_string).not.toContain('sbp_secretvalue')
    expect(event.extra?.bank_account).toBe('[redacted]')
  })
})
