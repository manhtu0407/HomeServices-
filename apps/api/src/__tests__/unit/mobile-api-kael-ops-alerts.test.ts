import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildKaelOpsAlertPayload,
  emitKaelOpsAlert,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/ops/alerts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Kael operations alerts', () => {
  it('builds a bounded PII-free payload', () => {
    const payload = buildKaelOpsAlertPayload({
      code: 'spend_cap_reached',
      severity: 'critical',
      provider: 'anthropic',
      purpose: 'price_synthesis',
      scope: 'user_daily',
      reason: 'durable budget reached',
    }, new Date('2026-08-07T00:00:00.000Z'))

    expect(payload).toEqual({
      code: 'spend_cap_reached',
      severity: 'critical',
      provider: 'anthropic',
      purpose: 'price_synthesis',
      scope: 'user_daily',
      reason: 'durable budget reached',
      occurred_at: '2026-08-07T00:00:00.000Z',
      schema_version: 'kael_ops_alert.v1',
    })
  })

  it('rejects unsafe payloads before network I/O', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    vi.stubGlobal('Deno', { env: { get: () => 'https://alerts.example.test/hook' } })

    expect(() => buildKaelOpsAlertPayload({
      code: 'model_escalation',
      severity: 'warning',
      reason: 'email private@example.test',
    })).toThrow()

    await emitKaelOpsAlert({
      code: 'model_escalation',
      severity: 'warning',
      reason: 'email private@example.test',
    })

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('is a no-op without an HTTPS webhook and never throws on delivery failure', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network down') })
    vi.stubGlobal('fetch', fetchImpl)
    vi.stubGlobal('Deno', { env: { get: () => undefined } })
    await expect(emitKaelOpsAlert({ code: 'kill_switch_block', severity: 'critical' })).resolves.toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()

    vi.stubGlobal('Deno', { env: { get: () => 'https://alerts.example.test/hook' } })
    await expect(emitKaelOpsAlert({ code: 'kill_switch_block', severity: 'critical' })).resolves.toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
