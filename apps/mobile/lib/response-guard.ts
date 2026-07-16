export class ResponseBodyTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super('RESPONSE_BODY_TOO_LARGE')
    this.name = 'ResponseBodyTooLargeError'
  }
}

export class ResponseBodyInvalidEncodingError extends Error {
  constructor() {
    super('RESPONSE_BODY_INVALID_ENCODING')
    this.name = 'ResponseBodyInvalidEncodingError'
  }
}

export async function readResponseTextBounded(response: Response, maxBytes: number) {
  await rejectDeclaredOversize(response, maxBytes)
  if (response.body) {
    const bytes = await readStreamBounded(response.body, maxBytes)
    return decodeUtf8(bytes)
  }
  if (typeof response.arrayBuffer === 'function') {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > maxBytes) throw new ResponseBodyTooLargeError(maxBytes)
    return decodeUtf8(bytes)
  }
  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ResponseBodyTooLargeError(maxBytes)
  }
  return text
}

function decodeUtf8(bytes: Uint8Array) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new ResponseBodyInvalidEncodingError()
  }
}

export async function readResponseBlobBounded(response: Response, maxBytes: number) {
  await rejectDeclaredOversize(response, maxBytes)
  if (response.body) {
    const bytes = await readStreamBounded(response.body, maxBytes)
    return new Blob([bytes], {
      type: response.headers?.get?.('content-type') ?? '',
    })
  }
  const blob = await response.blob()
  if (blob.size > maxBytes) throw new ResponseBodyTooLargeError(maxBytes)
  return blob
}

export async function withNetworkDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  upstreamSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController()
  const relayAbort = () => controller.abort(upstreamSignal?.reason)
  if (upstreamSignal?.aborted) relayAbort()
  else upstreamSignal?.addEventListener('abort', relayAbort, { once: true })
  const timer = setTimeout(() => controller.abort(networkAbortError('NETWORK_TIMEOUT')), timeoutMs)
  let rejectOnAbort: ((error: Error) => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectOnAbort = reject
  })
  const onAbort = () => {
    const reason = controller.signal.reason
    rejectOnAbort?.(reason instanceof Error ? reason : networkAbortError('NETWORK_ABORTED'))
  }
  controller.signal.addEventListener('abort', onAbort, { once: true })
  if (controller.signal.aborted) {
    onAbort()
    clearTimeout(timer)
    controller.signal.removeEventListener('abort', onAbort)
    upstreamSignal?.removeEventListener('abort', relayAbort)
    return aborted
  }
  try {
    return await Promise.race([operation(controller.signal), aborted])
  } finally {
    clearTimeout(timer)
    controller.signal.removeEventListener('abort', onAbort)
    upstreamSignal?.removeEventListener('abort', relayAbort)
  }
}

function networkAbortError(message: string) {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

async function rejectDeclaredOversize(response: Response, maxBytes: number) {
  const contentLength = response.headers?.get?.('content-length') ?? null
  if (contentLength === null) return
  const declaredBytes = Number(contentLength)
  if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    throw new ResponseBodyTooLargeError(maxBytes)
  }
}

async function readStreamBounded(stream: ReadableStream<Uint8Array>, maxBytes: number) {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      totalBytes += chunk.value.byteLength
      if (totalBytes > maxBytes) throw new ResponseBodyTooLargeError(maxBytes)
      chunks.push(chunk.value)
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}
