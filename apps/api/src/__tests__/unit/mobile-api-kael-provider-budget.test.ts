import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkKaelProviderBudget,
  isKaelProviderCostCapEnabled,
  kaelProviderDailyCapUsd,
  recordKaelProviderSpend,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/provider-budget'

// These tests pin both sides of the DB-backed daily provider spend cap:
// contract guarantees that make it safe to ship before staging validation:
// (1) disabled by default = zero DB calls, never blocks; (2) fail-open on every
// uncertainty so the guard can never take down a real estimate.

const envFrom =
  (vars: Record<string, string | undefined>) => (name: string) => vars[name]

const ENABLED = envFrom({ KAEL_PROVIDER_COST_CAP_ENABLED: 'true' })

describe('kael provider budget (C-1)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is disabled by default and parses the enable flag', () => {
    expect(isKaelProviderCostCapEnabled(envFrom({}))).toBe(false)
    expect(isKaelProviderCostCapEnabled(envFrom({ KAEL_PROVIDER_COST_CAP_ENABLED: 'false' }))).toBe(false)
    expect(isKaelProviderCostCapEnabled(envFrom({ KAEL_PROVIDER_COST_CAP_ENABLED: 'true' }))).toBe(true)
    expect(isKaelProviderCostCapEnabled(envFrom({ KAEL_PROVIDER_COST_CAP_ENABLED: 'on' }))).toBe(true)
  })

  it('defaults the cap to $30 and honours a positive env override', () => {
    expect(kaelProviderDailyCapUsd(envFrom({}))).toBe(30)
    expect(kaelProviderDailyCapUsd(envFrom({ KAEL_PROVIDER_DAILY_CAP_USD: '12.5' }))).toBe(12.5)
    expect(kaelProviderDailyCapUsd(envFrom({ KAEL_PROVIDER_DAILY_CAP_USD: '-5' }))).toBe(30)
    expect(kaelProviderDailyCapUsd(envFrom({ KAEL_PROVIDER_DAILY_CAP_USD: 'abc' }))).toBe(30)
  })

  it('does not touch the DB and never blocks when disabled', async () => {
    const rpc = vi.fn()
    const status = await checkKaelProviderBudget({ rpc }, envFrom({}))
    expect(status).toEqual({ enforced: false, exhausted: false, spendUsd: 0, capUsd: 30 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reports not-exhausted when today spend is under the cap', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 10, error: null })
    const status = await checkKaelProviderBudget({ rpc }, ENABLED)
    expect(rpc).toHaveBeenCalledWith('get_kael_provider_spend_today')
    expect(status.enforced).toBe(true)
    expect(status.exhausted).toBe(false)
    expect(status.spendUsd).toBe(10)
  })

  it('reports exhausted at/over the cap, accepting numeric-as-string from PostgREST', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: '30', error: null })
    const status = await checkKaelProviderBudget(
      { rpc },
      envFrom({ KAEL_PROVIDER_COST_CAP_ENABLED: 'true', KAEL_PROVIDER_DAILY_CAP_USD: '30' }),
    )
    expect(status.exhausted).toBe(true)
    expect(status.spendUsd).toBe(30)
  })

  it('fails open when the budget read returns an error', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const status = await checkKaelProviderBudget({ rpc }, ENABLED)
    expect(status.enforced).toBe(true)
    expect(status.exhausted).toBe(false)
  })

  it('does not write provider or transport error details to runtime logs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'DB_DOWN', message: 'secret-provider-detail' },
    })

    await checkKaelProviderBudget({ rpc }, ENABLED)

    expect(warn).toHaveBeenCalledWith(
      'checkKaelProviderBudget: read failed, failing open',
      { errorCode: 'DB_DOWN' },
    )
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-provider-detail')
  })

  it('fails open when the rpc throws', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('network'))
    const status = await checkKaelProviderBudget({ rpc }, ENABLED)
    expect(status.exhausted).toBe(false)
  })

  it('fails open when no client is supplied', async () => {
    const status = await checkKaelProviderBudget(null, ENABLED)
    expect(status.exhausted).toBe(false)
  })

  it('records positive spend through the atomic rpc', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 0.08, error: null })
    await recordKaelProviderSpend({ rpc }, 0.08)
    expect(rpc).toHaveBeenCalledWith('record_kael_provider_spend', { p_cost_usd: 0.08 })
  })

  it('does not record non-positive spend', async () => {
    const rpc = vi.fn()
    await recordKaelProviderSpend({ rpc }, 0)
    await recordKaelProviderSpend({ rpc }, -1)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('swallows record errors (best-effort guard)', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('down'))
    await expect(recordKaelProviderSpend({ rpc }, 0.05)).resolves.toBeUndefined()
  })
})
