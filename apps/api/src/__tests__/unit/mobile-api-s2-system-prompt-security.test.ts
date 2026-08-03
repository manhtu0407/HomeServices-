/**
 * The Kael system prompt must carry
 * explicit refuse-and-never-reveal rails (defense-in-depth against prompt injection
 * that asks Kael to leak the prompt/secrets or act outside Home Services scope).
 *
 * Downstream structural controls already fail closed (autonomy source-gate,
 * output scrub/validate); these directives raise the floor at the prompt layer.
 */
import { describe, expect, it } from 'vitest'
import {
  buildKaelSystemPrompt,
  type KaelPromptActor,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/prompts/system-prompt'

const prompt = buildKaelSystemPrompt({
  purpose: 'price_synthesis',
  actor: 'customer',
  contextSummary: 'Customer asks for an outlet estimate.',
})

describe('S2/F6: system prompt carries explicit security directives', () => {
  it('includes a dedicated Security directives section', () => {
    expect(prompt).toContain('Security directives')
  })

  it('forbids revealing/quoting the system prompt', () => {
    expect(prompt).toMatch(/Never reveal[\s\S]*system prompt/i)
  })

  it('forbids outputting secrets, keys, or tokens', () => {
    expect(prompt).toMatch(/Never output secrets/i)
  })

  it('instructs Kael to ignore role/scope-override (injection) attempts', () => {
    expect(prompt.toLowerCase()).toContain('ignore previous instructions')
  })

  it('reaffirms backend-only authority over booking/payment/workflow state', () => {
    expect(prompt).toMatch(/only the backend decides/i)
  })

  it('applies to every actor variant', () => {
    const actors: KaelPromptActor[] = ['customer', 'worker', 'admin', 'system']
    for (const actor of actors) {
      const p = buildKaelSystemPrompt({ purpose: 'worker_assist', actor })
      expect(p).toContain('Security directives')
    }
  })
})
