import { callAI } from '@/lib/ai/client'
import { buildIntentMessages } from './prompts'
import { intentResultSchema, type IntentResult } from './schemas'
import { safeParseJSON } from './parsing'
import { sanitizeForLLM } from '@home-services/shared'

export type IntentClassifyResult =
  | { success: true; intent: IntentResult }
  | { success: false; fallback: IntentResult }

export async function classifyIntent(
  serviceType: string,
  problemChips: string[],
  description: string,
): Promise<IntentClassifyResult> {
  const sanitized = sanitizeForLLM(description)
  const sanitizedChips = problemChips.map(sanitizeForLLM)
  const messages = buildIntentMessages(sanitizeForLLM(serviceType), sanitizedChips, sanitized)

  const result = await callAI({
    provider: 'deepseek',
    model: 'deepseek-chat',
    messages,
    maxTokens: 200,
    temperature: 0.1,
  })

  if (!result.success) {
    return {
      success: false,
      fallback: buildFallbackIntent(serviceType, problemChips),
    }
  }

  const parsed = safeParseJSON(result.content)
  if (!parsed) {
    return {
      success: false,
      fallback: buildFallbackIntent(serviceType, problemChips),
    }
  }

  const validated = intentResultSchema.safeParse(parsed)
  if (!validated.success) {
    return {
      success: false,
      fallback: buildFallbackIntent(serviceType, problemChips),
    }
  }

  return { success: true, intent: validated.data }
}

function buildFallbackIntent(
  serviceType: string,
  problemChips: string[],
): IntentResult {
  const validServiceType =
    serviceType === 'electrical' || serviceType === 'plumbing'
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
  }

  const firstChip = problemChips[0] ?? ''
  const slug =
    slugMap[firstChip] ??
    (validServiceType === 'electrical'
      ? 'other_electrical'
      : validServiceType === 'plumbing'
        ? 'other_plumbing'
        : 'unsupported')

  return {
    service_type: validServiceType,
    problem_slug: slug,
    confidence: 0.3,
    needs_clarification: false,
  }
}

