export class ResponseBodyTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super("RESPONSE_BODY_TOO_LARGE");
    this.name = "ResponseBodyTooLargeError";
  }
}

export class ResponseBodyInvalidJsonError extends Error {
  constructor() {
    super("RESPONSE_BODY_INVALID_JSON");
    this.name = "ResponseBodyInvalidJsonError";
  }
}

export async function readResponseBytesBounded(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  const declaredBytes = contentLength === null ? null : Number(contentLength);
  if (declaredBytes !== null && Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new ResponseBodyTooLargeError(maxBytes);
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxBytes) {
        throw new ResponseBodyTooLargeError(maxBytes);
      }
      chunks.push(chunk.value);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readResponseTextBounded(
  response: Response,
  maxBytes: number,
): Promise<string> {
  return new TextDecoder("utf-8", { fatal: true }).decode(
    await readResponseBytesBounded(response, maxBytes),
  );
}

export async function readResponseJsonBounded(
  response: Response,
  maxBytes: number,
): Promise<unknown> {
  let bytes: Uint8Array;
  try {
    bytes = await readResponseBytesBounded(response, maxBytes);
  } catch (error) {
    if (error instanceof ResponseBodyTooLargeError) throw error;
    throw new ResponseBodyInvalidJsonError();
  }
  return parseJsonBytesStrict(bytes);
}

export function createBufferedResponse(
  response: Response,
  bytes: Uint8Array,
): Response {
  const headers = new Headers(response.headers);
  headers.delete("content-encoding");
  const hasBody = bytes.byteLength > 0 && !isBodylessStatus(response.status);
  headers.set("content-length", String(hasBody ? bytes.byteLength : 0));
  const body = hasBody ? copyToArrayBuffer(bytes) : null;
  return new Response(body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export async function fetchBufferedWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: {
    timeoutMs: number;
    maxResponseBytes: number;
    validateJsonResponses?: boolean;
  },
): Promise<Response> {
  const controller = new AbortController();
  const upstreamSignal = init.signal;
  const relayAbort = () => controller.abort(upstreamSignal?.reason);
  if (upstreamSignal?.aborted) {
    relayAbort();
  } else {
    upstreamSignal?.addEventListener("abort", relayAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      redirect: "error",
      signal: controller.signal,
    });
    const bytes = await readResponseBytesBounded(response, options.maxResponseBytes);
    if (
      options.validateJsonResponses && bytes.byteLength > 0 &&
      isJsonMediaType(response.headers.get("content-type"))
    ) {
      parseJsonBytesStrict(bytes);
    }
    return createBufferedResponse(response, bytes);
  } catch (error) {
    if (!controller.signal.aborted) controller.abort(error);
    throw error;
  } finally {
    clearTimeout(timer);
    upstreamSignal?.removeEventListener("abort", relayAbort);
  }
}

function parseJsonBytesStrict(bytes: Uint8Array): unknown {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    throw new ResponseBodyInvalidJsonError();
  }
}

function isJsonMediaType(value: string | null): boolean {
  const mediaType = value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return mediaType === "application/json" ||
    /^application\/[a-z0-9!#$&^_.+-]+\+json$/i.test(mediaType);
}

function isBodylessStatus(status: number): boolean {
  return status === 101 || status === 204 || status === 205 || status === 304;
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
