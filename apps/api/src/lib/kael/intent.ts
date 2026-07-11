import { callAI } from '@/lib/ai/client'
import { buildIntakeDiagnosisMessages, buildIntentMessages } from './prompts'
import { intentResultSchema, type IntentResult } from './schemas'
import { safeParseJSON } from './parsing'
import { SERVICE_TYPES, sanitizeForLLM, scrubSensitiveForLLM, type ServiceType } from '@nestscout/shared'

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

// Intake-diagnosis (2026-06-04): upgraded classifier that also decides whether to
// ask ONE clarification question, using recent conversation context. Same provider
// loop + fallback contract as classifyIntent; separate function so the legacy
// classifyIntent path stays byte-identical when the clarification flag is off.
export async function diagnoseIntake(
  serviceType: string,
  problemChips: string[],
  description: string,
  conversationContext?: string,
  language: 'vi' | 'en' = 'vi',
): Promise<IntentClassifyResult> {
  const sanitized = scrubSensitiveForLLM(description)
  const sanitizedChips = problemChips.map(scrubSensitiveForLLM)
  const sanitizedContext = conversationContext
    ? scrubSensitiveForLLM(conversationContext)
    : undefined
  const messages = buildIntakeDiagnosisMessages(
    sanitizeForLLM(serviceType),
    sanitizedChips,
    sanitized,
    sanitizedContext,
    language,
  )

  const failures: string[] = []
  for (const candidate of [
    { provider: 'deepseek' as const, model: 'deepseek-v4-flash' },
    { provider: 'anthropic' as const, model: 'claude-sonnet-4-6' },
  ]) {
    const result = await callAI({
      provider: candidate.provider,
      model: candidate.model,
      messages,
      maxTokens: 320,
      temperature: 0.2,
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
  const validServiceType = SERVICE_TYPES.includes(serviceType as ServiceType)
    ? serviceType as ServiceType
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
    'Vệ sinh điều hòa': 'routine_hvac_cleaning',
    'Máy lạnh yếu': 'weak_cooling',
    'Máy không mát': 'no_cooling',
    'Chảy nước': 'water_leak',
    'Kêu bất thường': 'unusual_noise',
    'Có mã lỗi': 'error_code',
    'Vệ sinh sofa': 'sofa_cleaning',
    'Vệ sinh nệm': 'mattress_cleaning',
    'Vệ sinh rèm': 'curtain_cleaning',
    'Vệ sinh thảm': 'carpet_cleaning',
    'Vết bẩn': 'stain_treatment',
    'Mùi hôi/ẩm mốc': 'odor_or_mold',
    'Khoan/lắp kệ': 'drill_or_mount_shelf',
    'Lắp thanh rèm': 'install_curtain_rod',
    'Lắp đèn/thiết bị nhỏ': 'install_small_fixture',
    'Sửa bản lề/tay nắm': 'repair_hinge_or_handle',
    'Lắp thiết bị phòng tắm': 'install_bathroom_fixture',
    'Lắp TV/nội thất': 'mount_tv_or_furniture',
    'Việc nhỏ khác': 'other_handyman',
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
          : validServiceType === 'hvac'
            ? 'other_hvac'
            : validServiceType === 'upholstery'
              ? 'other_upholstery'
              : validServiceType === 'handyman'
                ? 'other_handyman'
          : 'unsupported')

  return {
    service_type: validServiceType,
    problem_slug: slug,
    confidence: 0.3,
    needs_clarification: false,
  }
}
