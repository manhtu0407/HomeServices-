import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
describe('Kael durable guards migration', () => {
  it('wires the default-off rollout flag without putting it in mobile config', () => {
    const env = readFileSync(
      new URL('../../../../../supabase/functions/_shared/platform/env.ts', import.meta.url),
      'utf8',
    )
    const example = readFileSync(
      new URL('../../../../../config/env/workspace.env.example', import.meta.url),
      'utf8',
    )
    const provider = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/provider-client.ts', import.meta.url),
      'utf8',
    )
    const providerPreflight = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/provider-preflight.ts', import.meta.url),
      'utf8',
    )
    const services = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/domains.ts', import.meta.url),
      'utf8',
    )
    const customerChat = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/create.ts', import.meta.url),
      'utf8',
    )
    const workerChat = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/domains/worker/kael-chat-turn.ts', import.meta.url),
      'utf8',
    )

    expect(env).toContain('KAEL_DURABLE_GUARDS_ENABLED')
    expect(example).toContain('KAEL_DURABLE_GUARDS_ENABLED=')
    expect(providerPreflight).toContain('isDurableCircuitOpen')
    expect(provider).toContain('recordDurableCircuitFailure')
    expect(provider).toContain('recordDurableCircuitSuccess')
    expect(services).toContain('durableGuardClient:')
    expect(services).toContain('ctx.privilegedSupabase')
    expect(services).toContain('ctx.supabase')
    expect(customerChat).toContain('takeDurableKaelChatRateLimit')
    expect(workerChat).toContain('takeDurableKaelChatRateLimit')
  })

  it('ships a rollback-only runtime harness for local/staging verification', () => {
    const harness = readFileSync(
      new URL('../../../../../supabase/tests/kael_durable_guards_verification.sql', import.meta.url),
      'utf8',
    )

    expect(harness.trimStart().startsWith('-- Rollback-only')).toBe(true)
    expect(harness).toMatch(/\nbegin;[\s\S]*\nrollback;\s*$/)
    expect(harness).toContain('provider-global circuit was not visible cross-purpose')
    expect(harness).toContain('blocked minute request partially consumed hour tokens')
    expect(harness).toContain("'authenticated'")
    expect(harness).toContain("'service_role'")
  })
})
