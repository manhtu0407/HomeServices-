import { useSyncExternalStore } from 'react'
import { AppState } from 'react-native'

// Reachability is learned from real transport outcomes, not from the OS radio state:
// on weak 3G the phone reports "connected" while every request times out.
export type ConnectivityState = 'online' | 'offline'

const FAILURES_BEFORE_OFFLINE = 2
// Without a probe, a screen whose data is still fresh sends nothing, so it would stay offline after the link returns.
export const RECOVERY_PROBE_DELAYS_MS = [5_000, 10_000, 20_000, 30_000] as const

let state: ConnectivityState = 'online'
let consecutiveFailures = 0
const listeners = new Set<() => void>()
const reconnectListeners = new Set<() => void>()
let recoveryProbe: (() => unknown) | null = null
let probeTimer: ReturnType<typeof setTimeout> | null = null
let probeStep = 0

function setState(next: ConnectivityState) {
  if (state === next) return
  const reconnected = state === 'offline' && next === 'online'
  state = next
  if (next === 'offline' && recoveryProbe) scheduleRecoveryProbe(0)
  else stopRecoveryProbe()
  listeners.forEach((listener) => listener())
  if (reconnected) reconnectListeners.forEach((listener) => listener())
}

function stopRecoveryProbe() {
  if (probeTimer) clearTimeout(probeTimer)
  probeTimer = null
  probeStep = 0
}

function scheduleRecoveryProbe(step: number) {
  if (probeTimer) clearTimeout(probeTimer)
  probeStep = Math.min(step, RECOVERY_PROBE_DELAYS_MS.length - 1)
  probeTimer = setTimeout(() => {
    probeTimer = null
    if (state !== 'offline' || !recoveryProbe) return
    // A backgrounded app spends no radio time; returning to the foreground revalidates on its own.
    if (AppState.currentState !== 'background') void Promise.resolve().then(recoveryProbe).catch(() => undefined)
    scheduleRecoveryProbe(probeStep + 1)
  }, RECOVERY_PROBE_DELAYS_MS[probeStep])
}

// One light read stands in for every screen: its success flips the state online, and onReconnect refreshes the rest.
export function setRecoveryProbe(probe: () => unknown) {
  recoveryProbe = probe
  if (state === 'offline' && !probeTimer) scheduleRecoveryProbe(0)
  return () => {
    if (recoveryProbe !== probe) return
    recoveryProbe = null
    stopRecoveryProbe()
  }
}

let lastServerResponseAt: number | null = null

export function reportTransportSuccess() {
  consecutiveFailures = 0
  lastServerResponseAt = Date.now()
  setState('online')
}

// The moment the app last heard from the server; what an offline screen shows is at most this fresh.
export function getLastServerResponseAt() {
  return lastServerResponseAt
}

export function reportTransportFailure() {
  consecutiveFailures += 1
  if (consecutiveFailures >= FAILURES_BEFORE_OFFLINE) setState('offline')
}

export function getConnectivity(): ConnectivityState {
  return state
}

export function isConnectivityOffline() {
  return state === 'offline'
}

export function subscribeConnectivity(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function onReconnect(listener: () => void) {
  reconnectListeners.add(listener)
  return () => {
    reconnectListeners.delete(listener)
  }
}

export function useConnectivity(): ConnectivityState {
  return useSyncExternalStore(subscribeConnectivity, getConnectivity, getConnectivity)
}

export function resetConnectivityForTests() {
  state = 'online'
  consecutiveFailures = 0
  lastServerResponseAt = null
  recoveryProbe = null
  stopRecoveryProbe()
}
