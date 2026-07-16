const DEFAULT_MAX_JSON_REQUEST_BYTES = 64 * 1024

export class InvalidJsonRequestError extends Error {
  constructor() {
    super('INVALID_JSON_REQUEST')
    this.name = 'InvalidJsonRequestError'
  }
}

export async function readJsonRequestBounded(
  request: Request,
  maxBytes = DEFAULT_MAX_JSON_REQUEST_BYTES,
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new RangeError('maxBytes must be a positive safe integer')

  const contentLength = request.headers.get('content-length')
  if (contentLength !== null) {
    if (!/^[0-9]+$/.test(contentLength)) throw new InvalidJsonRequestError()
    const declaredBytes = Number(contentLength)
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maxBytes) {
      await request.body?.cancel().catch(() => undefined)
      throw new InvalidJsonRequestError()
    }
  }

  if (!request.body) throw new InvalidJsonRequestError()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      totalBytes += chunk.value.byteLength
      if (totalBytes > maxBytes) throw new InvalidJsonRequestError()
      chunks.push(chunk.value)
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined)
    throw error instanceof InvalidJsonRequestError ? error : new InvalidJsonRequestError()
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return JSON.parse(text) as unknown
  } catch {
    throw new InvalidJsonRequestError()
  }
}
