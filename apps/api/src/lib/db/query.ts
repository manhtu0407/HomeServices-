export class DbTimeoutError extends Error {
  constructor(ms: number) {
    super(`Database query timed out after ${ms}ms`)
    this.name = 'DbTimeoutError'
  }
}

/**
 * Race a DB promise against a timeout. Clears the timer whichever way the race
 * settles so we do not keep the event loop alive past resolution.
 *
 * Note: when the timeout wins, the underlying DB query is NOT cancelled — the
 * Supabase client does not expose AbortSignal cleanly. The query continues in
 * the background and its result is discarded. This is acceptable for read-side
 * latency control; for write-side concerns prefer optimistic concurrency.
 */
export function withDbTimeout<T>(
  promise: PromiseLike<T>,
  ms = 15_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DbTimeoutError(ms)), ms)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}
