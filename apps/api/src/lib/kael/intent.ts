import { callAI } from '@/lib/ai/client'
import { buildIntentMessages } from './prompts'
import { intentResultSchema, type IntentResult } from './schemas'
import { safeParseJSON } from './parsing'
import { sanitizeForLLM, scrubSensitiveForLLM } from '@home-services/shared'

export type IntentClassifyResult =
  | { success: true; intent: IntentResult; failureReason?: undefined }
  | { success: false; fallback: IntentResult; failureReason: string }

export async function classifyIntent(
  serviceType: string,
  problemChips: string[],
  description: string,
): Promise<IntentClassifyResult> {
  const sanitized = scrubSensitiveForLLM(description)
  const sanitizedChips = problemChips.map(scrubSensitiveForLLM)
  const messages = buildIntentMessages(sanitizeForLLM(serviceType), sanitizedChips, sanitized)

  const failures: string[] = []
  for (const candidate of [
    { provider: 'deepseek' as const, model: 'deepseek-v4-flash' },
    { provider: 'anthropic' as const, model: 'claude-sonnet-4-6' },
  ]) {
    const result = await callAI({
      provider: candidate.provider,
      model: candidate.model,
      messages,
      maxTokens: 200,
      temperature: 0.1,
    })

    if (!result.success) {
      failures.push(`${candidate.provider}: AI call failed: ${result.code} - ${result.error}`)
      continue
    }

    const parsed = safeParseJSON(result.content)
    if (!parsed) {
      failures.push(`${candidate.provider}: JSON parse failed on AI response`)
      continue
    }

    const validated = intentResultSchema.safeParse(parsed)
    if (!validated.success) {
      failures.push(
        `${candidate.provider}: Schema validation failed: ${validated.error.issues[0]?.message ?? 'unknown'}`,
      )
      continue
    }

    return { success: true, intent: validated.data }
  }

  return {
    success: false,
    fallback: buildFallbackIntent(serviceType, problemChips),
    failureReason: failures.join('; '),
  }
}

function buildFallbackIntent(
  serviceType: string,
  problemChips: string[],
): IntentResult {
  const validServiceType =
    serviceType === 'electrical' || serviceType === 'plumbing' || serviceType === 'cleaning'
      ? serviceType
      : ('unsupported' as const)

  const slugMap: Record<string, string> = {
    'Mất điện một phòng': 'power_outage_one_room',
    'Mất điện toàn căn': 'power_outage_whole_unit',
    'Ổ cắm/công tắc hỏng': 'outlet_or_switch_broken',
    'Cầu dao trip': 'breaker_trip',
    'Đèn chập chờn': 'flickering_light',
    'Lắp thêm thiết bị': 'install_device',
    'Ống rò rỉ': 'pipe_leak',
    'Tắc cống/bồn': 'clogged_drain_or_sink',
    'Vòi hỏng': 'faucet_broken',
    'Toilet không xả': 'toilet_flush_issue',
    'Áp nước yếu': 'weak_water_pressure',
    'Lắp/thay thiết bị': 'install_or_replace_fixture',
    'Dọn dẹp nhà': 'standard_home_cleaning',
    'Vệ sinh bếp': 'kitchen_deep_clean',
    'Vệ sinh phòng tắm': 'bathroom_deep_clean',
    'Tổng vệ sinh': 'deep_cleaning',
    'Dọn sau sửa chữa': 'post_repair_cleaning',
    'Vệ sinh cửa kính': 'window_cleaning',
  }

  const firstChip = problemChips[0] ?? ''
  const slug =
    slugMap[firstChip] ??
    (validServiceType === 'electrical'
      ? 'other_electrical'
      : validServiceType === 'plumbing'
        ? 'other_plumbing'
        : validServiceType === 'cleaning'
          ? 'other_cleaning'
          : 'unsupported')

  return {
    service_type: validServiceType,
    problem_slug: slug,
    confidence: 0.3,
    needs_clarification: false,
  }
}
