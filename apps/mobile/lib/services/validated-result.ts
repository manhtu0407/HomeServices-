import type { z } from 'zod'

import type { ApiResult } from '../api'

// A money or discipline screen never renders a response it cannot fully account for.
export function validatedResult<T>(result: ApiResult<unknown>, schema: z.ZodType<T>): ApiResult<T> {
  if (!result.success) return result
  const parsed = schema.safeParse(result.data)
  if (!parsed.success) {
    return { success: false, code: 'INVALID_RESPONSE', error: '', status: result.status, meta: result.meta }
  }
  return { ...result, data: parsed.data }
}
