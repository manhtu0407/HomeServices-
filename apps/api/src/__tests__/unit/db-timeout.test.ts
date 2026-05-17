import { describe, it, expect } from 'vitest'
import { withDbTimeout, DbTimeoutError } from '@/lib/db/query'

describe('withDbTimeout', () => {
  it('resolves when promise completes before timeout', async () => {
    const result = await withDbTimeout(Promise.resolve('ok'), 1000)
    expect(result).toBe('ok')
  })

  it('rejects with DbTimeoutError after timeout', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 5000))
    await expect(withDbTimeout(slow, 50)).rejects.toThrow(DbTimeoutError)
  })

  it('DbTimeoutError has correct message', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 5000))
    try {
      await withDbTimeout(slow, 100)
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(DbTimeoutError)
      expect((err as DbTimeoutError).message).toContain('100ms')
    }
  })

  it('passes through rejection from the original promise', async () => {
    const failing = Promise.reject(new Error('db error'))
    await expect(withDbTimeout(failing, 1000)).rejects.toThrow('db error')
  })

  it('defaults to 15s timeout', async () => {
    const result = await withDbTimeout(Promise.resolve(42))
    expect(result).toBe(42)
  })
})
