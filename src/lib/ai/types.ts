export type AIProvider = 'anthropic' | 'perplexity' | 'deepseek'

export type AIMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AIRequest = {
  provider: AIProvider
  model: string
  messages: AIMessage[]
  maxTokens?: number
  temperature?: number
}

export type AIUsage = {
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export type AIResponse = {
  content: string
  usage: AIUsage
  latencyMs: number
  success: true
}

export type AIError = {
  provider: AIProvider
  error: string
  code: string
  retryable: boolean
  success: false
}

export type AIResult = AIResponse | AIError

export const TIMEOUT_MS: Record<AIProvider, number> = {
  anthropic: 20_000,
  perplexity: 15_000,
  deepseek: 10_000,
}

export const MAX_RETRIES = 2
