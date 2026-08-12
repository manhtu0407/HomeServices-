export type HarnessEventStreamTerminal = {
  readonly errorCode?: string;
  readonly eventClass: "request.stream_cancelled" | "request.stream_completed" | "request.stream_failed";
  readonly status: "cancelled" | "completed" | "failed";
};

export function withHarnessStreamLifecycle(
  response: Response,
  finalizeTerminal: (input: HarnessEventStreamTerminal) => Promise<void>,
): Response {
  const source = response.body;
  if (!source) return response;

  const decoder = new TextDecoder();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let finalization: Promise<void> | null = null;
  let streamFailureCode: string | null = null;
  let sseBuffer = "";
  const finalize = (input: HarnessEventStreamTerminal) => {
    finalization ??= finalizeTerminal(input);
    return finalization;
  };
  const inspectSseFrame = (frame: string) => {
    const event = frame
      .split(/\r?\n/gu)
      .map((line) => line.trim())
      .find((line) => line.startsWith("event:"))
      ?.slice("event:".length)
      .trim();
    if (event === "response.failed" && !streamFailureCode) {
      streamFailureCode = "STREAM_RESPONSE_FAILED";
    }
    if (event === "error" && !streamFailureCode) {
      streamFailureCode = "STREAM_APPLICATION_ERROR";
    }
  };
  const inspectSseBuffer = (flush = false) => {
    while (true) {
      const separator = sseBuffer.match(/\r?\n\r?\n/u);
      const index = separator?.index;
      const delimiter = separator?.[0];
      if (index === undefined || !delimiter) break;
      inspectSseFrame(sseBuffer.slice(0, index));
      sseBuffer = sseBuffer.slice(index + delimiter.length);
    }
    if (flush && sseBuffer.trim()) inspectSseFrame(sseBuffer);
    if (flush) sseBuffer = "";
  };
  const closeReader = () => {
    try {
      reader?.releaseLock();
    } catch {
      // The response may already have released a cancelled reader.
    }
  };

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      reader ??= source.getReader();
      try {
        const next = await reader.read();
        if (!next.done) {
          if (next.value) {
            sseBuffer += decoder.decode(next.value, { stream: true });
            inspectSseBuffer();
            controller.enqueue(next.value);
          }
          return;
        }
        sseBuffer += decoder.decode();
        inspectSseBuffer(true);
        closeReader();
        await finalize(streamFailureCode
          ? {
            errorCode: streamFailureCode,
            eventClass: "request.stream_failed",
            status: "failed",
          }
          : {
            eventClass: "request.stream_completed",
            status: "completed",
          });
        controller.close();
      } catch (error) {
        closeReader();
        await finalize({
          errorCode: "STREAM_BODY_FAILED",
          eventClass: "request.stream_failed",
          status: "failed",
        });
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        if (reader) {
          await reader.cancel(reason);
        } else {
          await source.cancel(reason);
        }
      } catch {
        // The client has already abandoned the body, so finish the trace.
      } finally {
        closeReader();
        await finalize({
          errorCode: "STREAM_CANCELLED",
          eventClass: "request.stream_cancelled",
          status: "cancelled",
        });
      }
    },
  });

  return new Response(body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}
