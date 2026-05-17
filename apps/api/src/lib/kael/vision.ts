import { callAI } from '@/lib/ai/client'
import { buildVisionMessages } from './prompts'
import { visionResultSchema, type VisionResult } from './schemas'
import { safeParseJSON } from './parsing'
import { sanitizeForLLM } from '@home-services/shared'

export type VisionAnalysisResult =
  | { success: true; analysis: VisionResult }
  | { success: false; fallback: VisionResult }

export async function analyzeDescription(
  description: string,
  intentContext: string,
): Promise<VisionAnalysisResult> {
  const sanitized = sanitizeForLLM(description)
  const messages = buildVisionMessages(sanitized, sanitizeForLLM(intentContext))

  const result = await callAI({
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    messages,
    maxTokens: 500,
    temperature: 0.2,
  })

  if (!result.success) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext),
    }
  }

  const parsed = safeParseJSON(result.content)
  if (!parsed) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext),
    }
  }

  const validated = visionResultSchema.safeParse(parsed)
  if (!validated.success) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext),
    }
  }

  return { success: true, analysis: validated.data }
}

function buildFallbackVision(intentContext: string): VisionResult {
  return {
    problem_identified: intentContext || 'Vấn đề cần kiểm tra trực tiếp',
    severity_indicators: [],
    complexity_hint: 'medium',
  }
}

