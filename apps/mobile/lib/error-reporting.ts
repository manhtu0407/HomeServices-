import type { ComponentType } from 'react'
import Constants from 'expo-constants'
import { mobileRuntimeConfig } from './runtime-config'
import type { Event } from '@sentry/react-native'

type SentryModule = typeof import('@sentry/react-native')

const REDACTED = '[redacted]'
const SENSITIVE_KEY_PATTERN =
  /(authorization|password|secret|access[_-]?token|refresh[_-]?token|phone|email|cccd|citizen|identity|bank|account|address|unit|floor|latitude|longitude|coordinate|problem|description|prompt|response)/i

let sentryModule: SentryModule | null = null
let initialized = false

function loadSentry() {
  if (sentryModule) return sentryModule

  try {
    // Keep tests and Expo Go resilient when the native package is unavailable.
    sentryModule = require('@sentry/react-native') as SentryModule
    return sentryModule
  } catch {
    return null
  }
}

export function redactSensitiveText(value: string) {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED)
    .replace(/\b(?:\+?84|0)(?:3|5|7|8|9)\d{8}\b/g, REDACTED)
    .replace(/\b\d{12}\b/g, REDACTED)
    .replace(/\bBearer\s+[A-Za-z0-9._-]+\b/gi, `Bearer ${REDACTED}`)
    .replace(/\bsbp_[A-Za-z0-9._-]+\b/g, REDACTED)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED)
}

export function scrubSensitiveValue(value: unknown, key = '', depth = 0): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return REDACTED
  if (typeof value === 'string') return redactSensitiveText(value)
  if (value == null || typeof value !== 'object') return value
  if (depth > 8) return REDACTED
  if (Array.isArray(value)) return value.map((item) => scrubSensitiveValue(item, key, depth + 1))

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
      childKey,
      scrubSensitiveValue(childValue, childKey, depth + 1),
    ]),
  )
}

export function scrubSentryEvent(event: Event): Event {
  const scrubbed = scrubSensitiveValue(event) as Event

  delete scrubbed.user
  if (scrubbed.request) {
    delete scrubbed.request.cookies
    delete scrubbed.request.headers
    delete scrubbed.request.data
    if (typeof scrubbed.request.query_string === 'string') {
      scrubbed.request.query_string = redactSensitiveText(scrubbed.request.query_string)
    }
  }

  return scrubbed
}

function appRelease() {
  const slug = Constants.expoConfig?.slug
  const version = Constants.expoConfig?.version
  return slug && version ? `${slug}@${version}` : undefined
}

export function initErrorReporting() {
  if (initialized) return initialized

  const dsn = mobileRuntimeConfig.sentryDsn
  if (!dsn) return false

  const Sentry = loadSentry()
  if (!Sentry) return false

  initialized = true
  Sentry.init({
    dsn,
    environment: mobileRuntimeConfig.sentryEnvironment || (__DEV__ ? 'development' : 'production'),
    release: appRelease(),
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      return scrubSentryEvent(event as Event) as typeof event
    },
  })
  Sentry.setTag('runtime', 'expo-react-native')
  Sentry.setTag('app_surface', 'mobile')
  return true
}

export function captureAppError(error: unknown, context?: Record<string, unknown>) {
  const Sentry = initialized ? loadSentry() : null
  if (!Sentry) return

  Sentry.captureException(error, {
    extra: scrubSensitiveValue(context ?? {}) as Record<string, unknown>,
  })
}

export function withErrorReporting<P extends object>(Component: ComponentType<P>): ComponentType<P> {
  const Sentry = initialized ? loadSentry() : null
  return Sentry ? (Sentry.wrap(Component as ComponentType<Record<string, unknown>>) as ComponentType<P>) : Component
}
