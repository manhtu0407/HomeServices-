import type { ClockAnchor, WaitingClockInput } from './waiting.types'
export type ClockReading = { seconds: number | null; text: string; mode: 'remaining' | 'elapsed' | 'unknown'; expired: boolean }
export function timestamp(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}
export function clockAnchor(epochMs = Date.now(), monotonicMs = performance.now()): ClockAnchor {
  if (!Number.isFinite(epochMs) || !Number.isFinite(monotonicMs)) throw new TypeError('Invalid clock anchor')
  return { epochMs, monotonicMs }
}
export function epochNow(anchor: ClockAnchor, monotonicMs: number): number {
  return anchor.epochMs + Math.max(0, monotonicMs - anchor.monotonicMs)
}
export function formatClock(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--:--'
  const n = Math.max(0, Math.floor(seconds))
  const ss = String(n % 60).padStart(2, '0'), mm = String(Math.floor(n / 60) % 60).padStart(2, '0')
  return n >= 3600 ? `${Math.floor(n / 3600)}:${mm}:${ss}` : `${mm}:${ss}`
}
export function readWaitingClock(input: WaitingClockInput, nowMs: number): ClockReading {
  const start = timestamp(input.startedAt), end = timestamp(input.expiresAt)
  if (!Number.isFinite(nowMs)) return { seconds: null, text: '--:--', mode: 'unknown', expired: false }
  // Reject inconsistent timestamps instead of inventing a countdown.
  if (end !== null && (start === null || end >= start)) {
    const seconds = Math.max(0, Math.ceil((end - nowMs) / 1000))
    return { seconds, text: formatClock(seconds), mode: 'remaining', expired: end <= nowMs }
  }
  if (start !== null && start <= nowMs) {
    const seconds = Math.floor((nowMs - start) / 1000)
    return { seconds, text: formatClock(seconds), mode: 'elapsed', expired: false }
  }
  return { seconds: null, text: '--:--', mode: 'unknown', expired: false }
}
