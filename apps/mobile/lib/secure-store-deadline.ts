const SECURE_STORE_TIMEOUT_MS = 5_000

export async function withSecureStoreDeadline<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('SECURE_STORE_TIMEOUT')), SECURE_STORE_TIMEOUT_MS)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
