import { callAI } from '@/lib/ai/client'
import { buildPrebriefMessages } from './prompts'
import { workerPrebriefSchema, type WorkerPrebrief } from './schemas'
import { safeParseJSON } from './parsing'
import { sanitizeForLLM, scrubSensitiveForLLM } from '@home-services/shared'

export type PrebriefResult =
  | { success: true; prebrief: WorkerPrebrief }
  | { success: false }

export async function generatePrebrief(
  jobId: string,
  serviceType: string,
  problemSummary: string,
  customerDescription: string,
  complexity: string,
): Promise<PrebriefResult> {
  const sanitizedDescription = scrubSensitiveForLLM(customerDescription)
  const messages = buildPrebriefMessages(
    sanitizeForLLM(serviceType),
    scrubSensitiveForLLM(problemSummary),
    sanitizedDescription,
    sanitizeForLLM(complexity),
  )

  const result = await callAI({
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    messages,
    maxTokens: 500,
    temperature: 0.3,
  })

  if (!result.success) {
    return { success: false }
  }

  const parsed = safeParseJSON(result.content)
  if (!parsed) {
    return { success: false }
  }

  const validated = workerPrebriefSchema.safeParse({
    ...parsed as object,
    job_id: jobId,
    customer_description: customerDescription,
  })

  if (!validated.success) {
    return { success: false }
  }

  return { success: true, prebrief: validated.data }
}
