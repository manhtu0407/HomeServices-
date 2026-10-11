import type { Breadcrumb, ErrorEvent, StackFrame } from '@sentry/react-native'

const SAFE_IDENTITY = /^[A-Za-z0-9._:@+-]{1,100}$/u
const SAFE_METHOD = /^(GET|POST|PUT|PATCH|DELETE|HEAD)$/u
const SAFE_ROUTE = /^\/(?:admin\/system\/incidents\/:id\/export|admin\/system\/incidents\/:id|admin\/system\/:operation|workers\/me\/:operation|jobs\/:id\/:operation|notifications\/:operation|me\/:operation|kael\/:operation|[a-z-]{1,30}\/:operation)$/u

export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
  const tags = Object.fromEntries(Object.entries(event.tags ?? {}).flatMap(([key, value]) => {
    if (!['release_id', 'build_id', 'platform'].includes(key) || typeof value !== 'string') return []
    if (key === 'platform' ? !['ios', 'android'].includes(value) : !SAFE_IDENTITY.test(value)) return []
    return [[key, value]]
  }))
  const exceptionValues = event.exception?.values?.slice(0, 5).map((value) => {
    const frames = value.stacktrace?.frames?.slice(-50).map(sanitizeSentryFrame)
    const framesOmitted = value.stacktrace?.frames_omitted?.map(safeCount) as [number, number] | undefined
    return {
      type: safeErrorType(value.type),
      value: '[redacted]',
      stacktrace: frames?.length || framesOmitted ? { frames, frames_omitted: framesOmitted } : undefined,
    }
  })
  return {
    event_id: safeEventId(event.event_id),
    timestamp: safeTimestamp(event.timestamp),
    level: event.level,
    platform: event.platform === 'javascript' || event.platform === 'cocoa' ? event.platform : undefined,
    release: safeIdentity(event.release),
    dist: safeIdentity(event.dist),
    breadcrumbs: event.breadcrumbs?.flatMap((breadcrumb) => {
      const safe = sanitizeSentryBreadcrumb(breadcrumb)
      return safe ? [safe] : []
    }),
    tags,
    exception: exceptionValues?.length ? { values: exceptionValues } : undefined,
    debug_meta: sanitizeDebugMeta(event.debug_meta),
    type: undefined,
  }
}

export function sanitizeSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category !== 'mobile-api') return null
  const data = breadcrumb.data && typeof breadcrumb.data === 'object' ? breadcrumb.data : {}
  const method = typeof data.method === 'string' && SAFE_METHOD.test(data.method) ? data.method : null
  const route = typeof data.route === 'string' && SAFE_ROUTE.test(data.route) ? data.route : '/other'
  const status = typeof data.status_code === 'number' && Number.isInteger(data.status_code) && data.status_code >= 0 && data.status_code <= 599 ? data.status_code : 0
  const duration = typeof data.duration_ms === 'number' && Number.isFinite(data.duration_ms) ? Math.max(0, Math.min(60_000, Math.floor(data.duration_ms))) : 0
  return {
    timestamp: safeTimestamp(breadcrumb.timestamp),
    type: 'http',
    category: 'mobile-api',
    level: breadcrumb.level === 'error' || breadcrumb.level === 'warning' ? breadcrumb.level : 'info',
    message: method ? `${method} ${route} ${status}` : 'Mobile API request',
    data: { method, route, status_code: status, duration_ms: duration },
  }
}

function sanitizeSentryFrame(frame: StackFrame): StackFrame {
  return {
    filename: safeFrameFilename(frame.filename),
    function: safeFunctionName(frame.function),
    lineno: safePositiveInteger(frame.lineno),
    colno: safePositiveInteger(frame.colno),
    in_app: typeof frame.in_app === 'boolean' ? frame.in_app : undefined,
  }
}

function sanitizeDebugMeta(value: ErrorEvent['debug_meta']): ErrorEvent['debug_meta'] {
  if (!value || !Array.isArray(value.images)) return undefined
  const images: NonNullable<NonNullable<ErrorEvent['debug_meta']>['images']> = []
  for (const image of value.images.slice(0, 50)) {
    const debugId = safeIdentity(image.debug_id)
    const codeFile = safeCodeFile(image.code_file)
    if (!debugId || !codeFile) continue
    if (image.type === 'sourcemap') {
      images.push({ type: 'sourcemap', debug_id: debugId, code_file: codeFile })
      continue
    }
    if (image.type === 'wasm') {
      images.push({ type: 'wasm', debug_id: debugId, code_file: codeFile })
      continue
    }
    const imageAddress = safeAddress(image.image_addr)
    const imageSize = safePositiveInteger(image.image_size)
    if (!imageAddress || !imageSize) continue
    images.push({
      type: 'macho',
      debug_id: debugId,
      image_addr: imageAddress,
      image_size: imageSize,
      code_file: codeFile,
    })
  }
  return images.length ? { images } : undefined
}

function safeCodeFile(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const filename = value.split(/[\\/]/u).at(-1) ?? ''
  return /^[A-Za-z0-9_.-]{1,120}$/u.test(filename) ? `app:///${filename}` : undefined
}

function safeFrameFilename(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const filename = value.split(/[\\/]/u).at(-1) ?? ''
  return /^[A-Za-z0-9_.-]{1,120}$/u.test(filename) ? filename : undefined
}

function safeFunctionName(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9_$.[\]<>:/-]{1,160}$/u.test(value) ? value : undefined
}

function safeErrorType(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9_$.-]{1,80}$/u.test(value) ? value : undefined
}

function safeIdentity(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_IDENTITY.test(value) ? value : undefined
}

function safeEventId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-f0-9]{32}$/iu.test(value) ? value : undefined
}

function safeAddress(value: unknown): string | undefined {
  return typeof value === 'string' && /^(?:0x)?[a-f0-9]{1,32}$/iu.test(value) ? value : undefined
}

function safeTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function safePositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 10_000_000 ? value : undefined
}

function safeCount(value: number): number {
  return Number.isInteger(value) ? Math.max(0, Math.min(10_000, value)) : 0
}
