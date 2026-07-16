import {
  ResponseBodyInvalidEncodingError,
  readResponseTextBounded,
  ResponseBodyTooLargeError,
} from '@/lib/http/response'

const MAX_AI_PROVIDER_RESPONSE_BYTES = 2 * 1024 * 1024

export async function readBoundedProviderText(
  response: Response,
  maxBytes = MAX_AI_PROVIDER_RESPONSE_BYTES,
): Promise<string> {
  try {
    return await readResponseTextBounded(response, maxBytes)
  } catch (error) {
    if (error instanceof ResponseBodyTooLargeError) {
      throw new Error('AI_PROVIDER_RESPONSE_TOO_LARGE')
    }
    if (error instanceof ResponseBodyInvalidEncodingError) {
      throw new Error('AI_PROVIDER_RESPONSE_INVALID')
    }
    throw error
  }
}

export async function readBoundedProviderJson<T>(response: Response): Promise<T> {
  const text = await readBoundedProviderText(response)
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('AI_PROVIDER_RESPONSE_INVALID')
  }
  return parsed as T
}

export function requireProviderContent(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('AI_PROVIDER_RESPONSE_INVALID')
  }
  return value
}

export function providerUsageCount(value: unknown): number {
  if (value === undefined) return 0
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('AI_PROVIDER_RESPONSE_INVALID')
  }
  return value
}
