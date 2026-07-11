import { callAI } from '@/lib/ai/client'
import { buildVisionMessages } from './prompts'
import { visionResultSchema, type VisionResult } from './schemas'
import { safeParseJSON } from './parsing'
import { sanitizeForLLM, scrubSensitiveForLLM } from '@nestscout/shared'

export type VisionAnalysisResult =
  | { success: true; analysis: VisionResult; failureReason?: undefined }
  | { success: false; fallback: VisionResult; failureReason: string }

export async function analyzeDescription(
  description: string,
  intentContext: string,
  photoUrls: string[] = [],
  language: 'vi' | 'en' = 'vi',
): Promise<VisionAnalysisResult> {
  const sanitized = scrubSensitiveForLLM(description)
  const messages = buildVisionMessages(
    sanitized,
    sanitizeForLLM(intentContext),
    photoUrls,
    language,
  )

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
      fallback: buildFallbackVision(intentContext, language),
      failureReason: `AI call failed: ${result.code} — ${result.error}`,
    }
  }

  const parsed = safeParseJSON(result.content)
  if (!parsed) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext, language),
      failureReason: 'JSON parse failed on AI response',
    }
  }

  const validated = visionResultSchema.safeParse(parsed)
  if (!validated.success) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext, language),
      failureReason: `Schema validation failed: ${validated.error.issues[0]?.message ?? 'unknown'}`,
    }
  }

  if (language === 'en' && hasVietnameseDiacritics([
    validated.data.problem_identified,
    ...validated.data.severity_indicators,
  ].join(' '))) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext, language),
      failureReason: 'AI vision English validation failed',
    }
  }

  return { success: true, analysis: validated.data }
}

function buildFallbackVision(intentContext: string, language: 'vi' | 'en' = 'vi'): VisionResult {
  return {
    problem_identified: intentContext || (language === 'en'
      ? 'The issue requires an on-site inspection'
      : 'Vấn đề cần kiểm tra trực tiếp'),
    severity_indicators: [],
    complexity_hint: 'medium',
  }
}

function hasVietnameseDiacritics(text: string) {
  return /[\u0300-\u036f]/u.test(text.normalize('NFD')) || /[đĐ]/u.test(text)
}
