export type KaelResponseEventEmitter = (event: string, data: unknown) => void;

export type KaelResponseReporter = {
  complete(text: string): void;
  fail(input: { message: string; recoverable: boolean }): void;
  hasPublished(): boolean;
  publishedText(): string;
  preview(text: string): void;
};

const MAX_RESPONSE_TEXT_CHARS = 12_000;
const MAX_PUBLIC_FAILURE_CHARS = 280;

/**
 * Emits one append-only public answer block from actual server-side provider
 * deltas. It deliberately does not split text or create timing on its own.
 */
export function createKaelResponseReporter(input: {
  readonly emit: KaelResponseEventEmitter;
  readonly language?: "vi" | "en";
  readonly responseId?: string;
  readonly startedAt?: Date;
}): KaelResponseReporter {
  const startedAt = input.startedAt ?? new Date();
  const responseId = input.responseId ?? `kael-response:${crypto.randomUUID()}`;
  const blockId = `${responseId}:block:0`;
  let started = false;
  let terminal = false;
  let emittedText = "";

  const elapsedMs = () => Math.max(0, Date.now() - startedAt.getTime());
  const start = () => {
    if (started || terminal) return;
    started = true;
    input.emit("response.started", { response_id: responseId, mode: "standard" });
    input.emit("block.started", { block_id: blockId, kind: "paragraph" });
  };
  const append = (text: string) => {
    const delta = text.slice(0, Math.max(0, MAX_RESPONSE_TEXT_CHARS - emittedText.length));
    if (!delta) return;
    start();
    if (terminal) return;
    emittedText += delta;
    input.emit("block.text.delta", { block_id: blockId, delta });
  };
  const fail = (failure: { message: string; recoverable: boolean }) => {
    if (terminal) return;
    const message = boundedText(failure.message, MAX_PUBLIC_FAILURE_CHARS) || responseFailureText(input.language);
    start();
    if (terminal) return;
    terminal = true;
    input.emit("response.failed", {
      response_id: responseId,
      message,
      recoverable: failure.recoverable,
    });
  };

  return {
    complete(text) {
      if (terminal) return;
      const finalText = boundedText(text, MAX_RESPONSE_TEXT_CHARS);
      if (!finalText) {
        fail({ message: responseFailureText(input.language), recoverable: true });
        return;
      }
      if (emittedText && !finalText.startsWith(emittedText)) {
        fail({ message: responseContinuationFailureText(input.language), recoverable: true });
        return;
      }
      append(finalText.slice(emittedText.length));
      start();
      if (terminal) return;
      terminal = true;
      input.emit("block.completed", { block_id: blockId });
      input.emit("response.completed", {
        response_id: responseId,
        elapsed_ms: elapsedMs(),
      });
    },
    fail,
    hasPublished() {
      return emittedText.length > 0;
    },
    publishedText() {
      return emittedText;
    },
    preview(text) {
      if (terminal) return;
      const candidate = boundedText(text, MAX_RESPONSE_TEXT_CHARS);
      if (!candidate || candidate.length <= emittedText.length) return;
      if (!candidate.startsWith(emittedText)) return;
      append(candidate.slice(emittedText.length));
    },
  };
}

function boundedText(value: string, maxLength: number) {
  return value.replace(/\r\n/gu, "\n").trim().slice(0, maxLength);
}

function responseFailureText(language: "vi" | "en" | undefined) {
  return language === "en"
    ? "Kael could not complete this reply."
    : "Kael chưa thể hoàn tất phản hồi này.";
}

function responseContinuationFailureText(language: "vi" | "en" | undefined) {
  return language === "en"
    ? "Kael could not safely continue this reply."
    : "Kael chưa thể tiếp tục phản hồi này một cách an toàn.";
}
