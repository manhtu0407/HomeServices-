import type { AIError, AIProvider } from "../contracts/types.ts";

export function bindRequestAbort(signal: AbortSignal | undefined, controller: AbortController) {
  if (!signal) return () => undefined;
  const abort = () => controller.abort(signal.reason);
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  return () => signal.removeEventListener("abort", abort);
}

export function throwIfRequestAborted(signal: AbortSignal | undefined) {
  if (!signal?.aborted) return;
  throw requestCancelledError();
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function requestCancelledError() {
  const error = new Error("AI provider request was cancelled");
  error.name = "AbortError";
  return error;
}

export function requestCancelled(provider: AIProvider): AIError {
  return { success: false, provider, code: "REQUEST_CANCELLED", error: "REQUEST_CANCELLED" };
}

export function waitForProviderRetry(ms: number, signal?: AbortSignal) {
  if (!signal) return new Promise<void>((resolve) => setTimeout(resolve, ms));
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(requestCancelledError());
    };
    const timer = setTimeout(finish, ms);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}
