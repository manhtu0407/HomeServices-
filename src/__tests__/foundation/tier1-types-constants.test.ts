import { describe, it, expect } from 'vitest'
import { TIMEOUT_MS, MAX_RETRIES } from '@/lib/ai/types'
import type {
  AIProvider,
  AIMessage,
  AIRequest,
  AIUsage,
  AIResponse,
  AIError,
  AIResult,
} from '@/lib/ai/types'

// ---------------------------------------------------------------------------
// Tier 1: Types & Constants Completeness
// Verify AI types and constants match RULES.md Rule #10 specifications.
// Chain: These constants are consumed by Tier 3 (providers) and Tier 4 (client).
// ---------------------------------------------------------------------------

describe('TIMEOUT_MS matches RULES.md Rule #10', () => {
  it('Anthropic timeout is 20,000ms', () => {
    expect(TIMEOUT_MS.anthropic).toBe(20_000)
  })

  it('Perplexity timeout is 15,000ms', () => {
    expect(TIMEOUT_MS.perplexity).toBe(15_000)
  })

  it('DeepSeek timeout is 10,000ms', () => {
    expect(TIMEOUT_MS.deepseek).toBe(10_000)
  })

  it('has exactly 3 providers defined', () => {
    expect(Object.keys(TIMEOUT_MS)).toHaveLength(3)
    expect(Object.keys(TIMEOUT_MS).sort()).toEqual([
      'anthropic',
      'deepseek',
      'perplexity',
    ])
  })
})

describe('MAX_RETRIES matches RULES.md Rule #10', () => {
  it('max retries is 2', () => {
    expect(MAX_RETRIES).toBe(2)
  })

  it('is a positive integer', () => {
    expect(Number.isInteger(MAX_RETRIES)).toBe(true)
    expect(MAX_RETRIES).toBeGreaterThan(0)
  })
})

describe('AIProvider type covers all 3 providers', () => {
  it('anthropic is valid', () => {
    const p: AIProvider = 'anthropic'
    expect(p).toBe('anthropic')
  })

  it('perplexity is valid', () => {
    const p: AIProvider = 'perplexity'
    expect(p).toBe('perplexity')
  })

  it('deepseek is valid', () => {
    const p: AIProvider = 'deepseek'
    expect(p).toBe('deepseek')
  })
})

describe('AIMessage type structure', () => {
  it('accepts system role', () => {
    const msg: AIMessage = { role: 'system', content: 'test' }
    expect(msg.role).toBe('system')
  })

  it('accepts user role', () => {
    const msg: AIMessage = { role: 'user', content: 'test' }
    expect(msg.role).toBe('user')
  })

  it('accepts assistant role', () => {
    const msg: AIMessage = { role: 'assistant', content: 'test' }
    expect(msg.role).toBe('assistant')
  })
})

describe('AIRequest type structure', () => {
  it('accepts minimal required fields', () => {
    const req: AIRequest = {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hello' }],
    }
    expect(req.provider).toBe('anthropic')
    expect(req.model).toBe('claude-sonnet-4-6')
    expect(req.messages).toHaveLength(1)
    expect(req.maxTokens).toBeUndefined()
    expect(req.temperature).toBeUndefined()
  })

  it('accepts all optional fields', () => {
    const req: AIRequest = {
      provider: 'deepseek',
      model: 'deepseek-chat',
      messages: [],
      maxTokens: 500,
      temperature: 0.5,
    }
    expect(req.maxTokens).toBe(500)
    expect(req.temperature).toBe(0.5)
  })
})

describe('AIResponse type structure', () => {
  it('has success: true literal', () => {
    const res: AIResponse = {
      content: 'response text',
      usage: { inputTokens: 10, outputTokens: 20, costUsd: 0.001 },
      latencyMs: 500,
      success: true,
    }
    expect(res.success).toBe(true)
    expect(res.content).toBe('response text')
    expect(res.usage.inputTokens).toBe(10)
    expect(res.usage.outputTokens).toBe(20)
    expect(res.usage.costUsd).toBe(0.001)
    expect(res.latencyMs).toBe(500)
  })
})

describe('AIError type structure', () => {
  it('has success: false literal', () => {
    const err: AIError = {
      provider: 'anthropic',
      error: 'Timeout after 20000ms',
      code: 'AI_CALL_FAILED',
      retryable: false,
      success: false,
    }
    expect(err.success).toBe(false)
    expect(err.provider).toBe('anthropic')
    expect(err.code).toBe('AI_CALL_FAILED')
  })
})

describe('AIResult union type', () => {
  it('can be narrowed via success field — success case', () => {
    const result: AIResult = {
      content: 'ok',
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      latencyMs: 100,
      success: true,
    }
    if (result.success) {
      expect(result.content).toBe('ok')
    } else {
      throw new Error('should not reach')
    }
  })

  it('can be narrowed via success field — error case', () => {
    const result: AIResult = {
      provider: 'perplexity',
      error: 'fail',
      code: 'AI_CALL_FAILED',
      retryable: false,
      success: false,
    }
    if (!result.success) {
      expect(result.error).toBe('fail')
    } else {
      throw new Error('should not reach')
    }
  })
})

describe('TIMEOUT_MS ordering — strictest provider gets least time', () => {
  it('DeepSeek < Perplexity < Anthropic', () => {
    expect(TIMEOUT_MS.deepseek).toBeLessThan(TIMEOUT_MS.perplexity)
    expect(TIMEOUT_MS.perplexity).toBeLessThan(TIMEOUT_MS.anthropic)
  })
})
