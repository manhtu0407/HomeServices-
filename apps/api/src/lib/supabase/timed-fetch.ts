import { readResponseBytesBounded } from '@/lib/http/response'

const MAX_SUPABASE_RESPONSE_BYTES = 4 * 1024 * 1024

export function createTimedFetch(timeoutMs: number): typeof fetch {
  return async (input, init = {}) => {
    const controller = new AbortController()
    const upstreamSignal = init.signal
    const relayAbort = () => controller.abort(upstreamSignal?.reason)

    if (upstreamSignal?.aborted) {
      relayAbort()
    } else {
      upstreamSignal?.addEventListener('abort', relayAbort, { once: true })
    }

    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(input, {
        ...init,
        redirect: 'error',
        signal: controller.signal,
      })
      const bytes = await readResponseBytesBounded(response, MAX_SUPABASE_RESPONSE_BYTES)
      const headers = new Headers(response.headers)
      headers.delete('content-encoding')
      headers.set('content-length', String(bytes.byteLength))
      return new Response(bytes.byteLength === 0 ? null : bytes, {
        headers,
        status: response.status,
        statusText: response.statusText,
      })
    } finally {
      clearTimeout(timeout)
      upstreamSignal?.removeEventListener('abort', relayAbort)
    }
  }
}

export async function withTimeout<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
  })

  try {
    return await Promise.race([Promise.resolve(operation), deadline])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}
