export type SseEvent = {
  readonly event?: string;
  readonly data?: unknown;
  readonly id?: string;
};

const SSE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
};

export function encodeSseEvent(input: SseEvent): string {
  const lines: string[] = [];
  if (input.id) lines.push(`id: ${input.id}`);
  if (input.event) lines.push(`event: ${input.event}`);
  const data = typeof input.data === "string"
    ? input.data
    : JSON.stringify(input.data ?? null);
  for (const line of data.split(/\r?\n/)) {
    lines.push(`data: ${line}`);
  }
  return `${lines.join("\n")}\n\n`;
}

export function encodeSseHeartbeat(label = "heartbeat"): string {
  return `: ${label}\n\n`;
}

export function createSseResponse(
  stream: ReadableStream<Uint8Array>,
  init: ResponseInit = {},
): Response {
  return new Response(stream, {
    ...init,
    headers: {
      ...SSE_HEADERS,
      ...Object.fromEntries(new Headers(init.headers).entries()),
    },
  });
}
