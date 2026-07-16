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

export async function readResponseBytesBounded(response: Response, maxBytes: number) {
  const contentLength = response.headers.get('content-length')
  const declaredBytes = contentLength === null ? null : Number(contentLength)
  if (declaredBytes !== null && Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    throw new ResponseBodyTooLargeError(maxBytes)
  }
  if (!response.body) {
    return new Uint8Array()
  }

  const reader = response.body.getReader()
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

export async function readResponseTextBounded(response: Response, maxBytes: number) {
  const bytes = await readResponseBytesBounded(response, maxBytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new ResponseBodyInvalidEncodingError()
  }
}
