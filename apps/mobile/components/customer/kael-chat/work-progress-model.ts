// The same arithmetic as the worker's own work clock, so both sides read the same second: time since the
// start, stopped at the pause while one is open, less every earlier pause. Null when there is no usable
// start, so a missing timestamp shows nothing rather than a made-up duration.
export function elapsedSeconds(input: {
  now: number
  pausedAt?: string | null
  pausedMs?: number | null
  startedAt?: string | null
}): number | null {
  const started = Date.parse(input.startedAt ?? '')
  if (!Number.isFinite(started) || !Number.isFinite(input.now)) return null
  const pausedAt = Date.parse(input.pausedAt ?? '')
  const end = Number.isFinite(pausedAt) ? Math.min(input.now, pausedAt) : input.now
  const paused = Number.isFinite(input.pausedMs) ? Math.max(0, input.pausedMs as number) : 0
  return Math.floor(Math.max(0, end - started - paused) / 1000)
}

export function formatElapsedClock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds))
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`
}

// Milliseconds until the next whole-second tick of the wall clock, so the shown second changes on the second.
export function msToNextSecond(now: number) {
  return 1000 - (((now % 1000) + 1000) % 1000)
}
