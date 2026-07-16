const JSON_MEDIA_TYPE_PATTERN = /^application\/[a-z0-9!#$&^_.+-]+\+json$/i;

export type RequestJsonErrorCode =
  | "INVALID_JSON"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE";

export class RequestJsonError extends Error {
  constructor(
    public readonly code: RequestJsonErrorCode,
    public readonly status: 400 | 413 | 415,
  ) {
    super(code);
    this.name = "RequestJsonError";
  }
}

export async function readJsonRequestBounded(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError("maxBytes must be a positive safe integer");
  }
  if (!hasJsonContentType(request.headers.get("content-type"))) {
    await request.body?.cancel().catch(() => undefined);
    throw new RequestJsonError("UNSUPPORTED_MEDIA_TYPE", 415);
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^[0-9]+$/.test(contentLength)) {
      await request.body?.cancel().catch(() => undefined);
      throw new RequestJsonError("INVALID_JSON", 400);
    }
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maxBytes) {
      await request.body?.cancel().catch(() => undefined);
      throw new RequestJsonError("PAYLOAD_TOO_LARGE", 413);
    }
  }

  if (!request.body) throw new RequestJsonError("INVALID_JSON", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxBytes) {
        throw new RequestJsonError("PAYLOAD_TOO_LARGE", 413);
      }
      chunks.push(chunk.value);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    if (error instanceof RequestJsonError) throw error;
    throw new RequestJsonError("INVALID_JSON", 400);
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    throw new RequestJsonError("INVALID_JSON", 400);
  }
}

function hasJsonContentType(value: string | null): boolean {
  const mediaType = value?.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" ||
    (mediaType !== undefined && JSON_MEDIA_TYPE_PATTERN.test(mediaType));
}
