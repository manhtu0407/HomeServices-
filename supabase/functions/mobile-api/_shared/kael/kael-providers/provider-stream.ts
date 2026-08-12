import type { AIProvider } from "../contracts/types.ts";

const MAX_PROVIDER_STREAM_BYTES = 2 * 1024 * 1024;
const MAX_PROVIDER_STREAM_BUFFER_CHARS = 128 * 1024;

export type ProviderStreamPayload = {
  readonly data: Record<string, unknown>;
  readonly emittedText: boolean;
};

/**
 * Reads only provider-visible text deltas from a native provider SSE response.
 * Provider reasoning, signatures, and unknown event fields are intentionally
 * ignored before the structured response guard can inspect the text channel.
 */
export async function readProviderSseResponse(input: {
  readonly provider: AIProvider;
  readonly response: Response;
  readonly onTextDelta: (delta: string) => void;
}): Promise<ProviderStreamPayload> {
  const reader = input.response.body?.getReader();
  if (!reader) throw new Error("AI_PROVIDER_STREAM_UNREADABLE");

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let responseBytes = 0;
  let buffer = "";
  let content = "";
  let usage: Record<string, unknown> = {};
  let citations: string[] | undefined;
  let emittedText = false;

  const consumeFrame = (frame: string) => {
    const parsed = parseProviderSseFrame(frame);
    if (!parsed) return;
    if (parsed.done) return;
    const payload = parsed.data;
    if (!payload) throw new Error("AI_PROVIDER_STREAM_INVALID");

    if (input.provider === "anthropic") {
      const update = anthropicStreamUpdate(parsed.event, payload);
      usage = { ...usage, ...update.usage };
      if (update.text) {
        content += update.text;
        emittedText = true;
        input.onTextDelta(update.text);
      }
      return;
    }

    const update = openAiCompatibleStreamUpdate(payload);
    usage = { ...usage, ...update.usage };
    if (update.citations) citations = update.citations;
    if (update.text) {
      content += update.text;
      emittedText = true;
      input.onTextDelta(update.text);
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      responseBytes += value.byteLength;
      if (responseBytes > MAX_PROVIDER_STREAM_BYTES) {
        throw new Error("AI_PROVIDER_STREAM_TOO_LARGE");
      }
      buffer += decoder.decode(value, { stream: true });
      let boundary = sseFrameBoundary(buffer);
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + sseFrameBoundaryLength(buffer, boundary));
        consumeFrame(frame);
        boundary = sseFrameBoundary(buffer);
      }
      if (buffer.length > MAX_PROVIDER_STREAM_BUFFER_CHARS) {
        throw new Error("AI_PROVIDER_STREAM_FRAME_TOO_LARGE");
      }
    }
    if (buffer.trim().length > 0) consumeFrame(buffer);
  } finally {
    reader.releaseLock();
  }

  if (!content.trim()) throw new Error("AI_PROVIDER_RESPONSE_INVALID");
  return {
    data: input.provider === "anthropic"
      ? {
        content: [{ type: "text", text: content }],
        usage,
      }
      : {
        choices: [{ message: { content } }],
        usage,
        ...(citations?.length ? { citations } : {}),
      },
    emittedText,
  };
}

function parseProviderSseFrame(frame: string): {
  readonly data: Record<string, unknown> | null;
  readonly done: boolean;
  readonly event: string;
} | null {
  const lines = frame.replace(/\r\n/gu, "\n").split("\n");
  let event = "message";
  const dataLines: string[] = [];
  let hasField = false;
  for (const line of lines) {
    if (!line || line.startsWith(":")) continue;
    hasField = true;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!hasField) return null;
  const raw = dataLines.join("\n").trim();
  if (raw === "[DONE]") return { data: null, done: true, event };
  if (!raw) return { data: null, done: false, event };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI_PROVIDER_STREAM_INVALID");
  }
  if (!isRecord(parsed)) throw new Error("AI_PROVIDER_STREAM_INVALID");
  return { data: parsed, done: false, event };
}

function anthropicStreamUpdate(event: string, data: Record<string, unknown>) {
  const usage = event === "message_start"
    ? recordAt(data, ["message", "usage"])
    : event === "message_delta"
    ? recordAt(data, ["usage"])
    : {};
  if (event !== "content_block_delta") return { text: "", usage };
  const delta = recordAt(data, ["delta"]);
  return {
    text: delta.type === "text_delta" && typeof delta.text === "string"
      ? delta.text
      : "",
    usage,
  };
}

function openAiCompatibleStreamUpdate(data: Record<string, unknown>) {
  const choice = Array.isArray(data.choices) && isRecord(data.choices[0])
    ? data.choices[0]
    : null;
  const delta = choice ? recordAt(choice, ["delta"]) : {};
  const rawCitations = Array.isArray(data.citations)
    ? data.citations.filter((item): item is string => typeof item === "string")
    : undefined;
  return {
    text: typeof delta.content === "string" ? delta.content : "",
    usage: recordAt(data, ["usage"]),
    citations: rawCitations,
  };
}

function sseFrameBoundary(buffer: string) {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (lf < 0) return crlf;
  if (crlf < 0) return lf;
  return Math.min(lf, crlf);
}

function sseFrameBoundaryLength(buffer: string, index: number) {
  return buffer.slice(index, index + 4) === "\r\n\r\n" ? 4 : 2;
}

function recordAt(value: unknown, path: readonly string[]) {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return {};
    current = current[key];
  }
  return isRecord(current) ? current : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
