// AI provider contract — single-sourced from packages/shared (one canonical home).
// apps/api re-exports so existing '@/lib/ai/types' importers stay unchanged; the Edge
// runtime keeps its own divergent copy in kael/types.ts (caching/search/citations) because
// Deno cannot import this package and those fields are server-only extensions.
export type {
  AIProvider,
  AITextContent,
  AIImageContent,
  AIMessageContent,
  AIMessage,
  AIRequest,
  AIUsage,
  AIResponse,
  AIError,
  AIResult,
} from '@home-services/shared'
export { TIMEOUT_MS, MAX_RETRIES, AIProviderError } from '@home-services/shared'
