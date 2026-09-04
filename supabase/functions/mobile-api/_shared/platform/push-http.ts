import {
  createBufferedResponse,
  readResponseBytesBounded,
} from "../../../_shared/network.ts";

export async function fetchPushProviderWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  maximumResponseBytes: number,
): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([
      fetch(url, {
        ...init,
        redirect: "error",
        signal: controller.signal,
      }),
      timeout,
    ]);
    const bytes = await Promise.race([
      readResponseBytesBounded(response, maximumResponseBytes),
      timeout,
    ]);
    return createBufferedResponse(response, bytes);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
