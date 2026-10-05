import { customerTheme } from '@/design/theme'

import { getWorkerThemeModeNow, useWorkerThemeMode } from '../worker-theme'

// Many Worker screens were built as static light StyleSheets. In dark mode their colours are mapped
// onto the shared neutral dark tokens by role, so a screen follows the theme without a hand-written
// dark twin for every style: light surfaces become dark cards, dark ink becomes white, grey ink the
// secondary grey, light hairlines dark borders. Saturated brand fills and white text on them stay,
// because they already read on black.
const dark = customerTheme.darkLayer

type Rgba = { a: number; b: number; g: number; r: number }

function parseColor(value: string): Rgba | null {
  const text = value.trim().toLowerCase()
  if (text === 'white') return { a: 1, b: 255, g: 255, r: 255 }
  if (text === 'black') return { a: 1, b: 0, g: 0, r: 0 }
  const hex = /^#([0-9a-f]{3,8})$/.exec(text)
  if (hex) {
    const digits = hex[1]
    if (digits.length === 3) {
      const [r, g, b] = digits.split('').map((d) => parseInt(d + d, 16))
      return { a: 1, b, g, r }
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
        b: parseInt(digits.slice(4, 6), 16),
        g: parseInt(digits.slice(2, 4), 16),
        r: parseInt(digits.slice(0, 2), 16),
      }
    }
    return null
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(text)
  if (!fn) return null
  const parts = fn[1].split(',').map((part) => parseFloat(part.trim()))
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null
  return { a: parts[3] ?? 1, b: parts[2], g: parts[1], r: parts[0] }
}

function channel(value: number) {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function describe(color: Rgba) {
  const max = Math.max(color.r, color.g, color.b)
  const min = Math.min(color.r, color.g, color.b)
  return {
    lum: 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b),
    sat: max === 0 ? 0 : (max - min) / max,
  }
}

export function darkSurfaceColor(value: string) {
  const parsed = parseColor(value)
  if (!parsed || parsed.a === 0) return value
  const { lum, sat } = describe(parsed)
  if (lum >= 0.72) {
    if (parsed.a < 0.95) return sat < 0.12 ? dark.glass : dark.ghost
    return sat < 0.12 ? dark.base : dark.statusSurface
  }
  if (lum >= 0.45 && sat < 0.2) return dark.raised
  return value
}

export function darkInkColor(value: string) {
  const parsed = parseColor(value)
  if (!parsed || parsed.a === 0) return value
  const { lum, sat } = describe(parsed)
  if (lum >= 0.8) return value
  // Near-black ink, even when tinted, is body text; mid teal and green ink is the brand accent.
  if (lum < 0.06) return dark.text
  if (sat >= 0.45) return parsed.g >= parsed.r ? dark.primary : value
  return dark.muted
}

export function darkLineColor(value: string) {
  const parsed = parseColor(value)
  if (!parsed || parsed.a === 0) return value
  const { lum, sat } = describe(parsed)
  if (sat >= 0.45 && lum < 0.6) return dark.borderStrong
  if (lum >= 0.35) return parsed.a < 0.6 ? dark.glassBorder : dark.border
  return value
}

const SURFACE_KEYS = new Set(['backgroundColor'])
const INK_KEYS = new Set(['color', 'textDecorationColor', 'tintColor'])
const LINE_KEYS = new Set(['borderColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'])

function darkenStyle(style: Record<string, unknown>) {
  const next: Record<string, unknown> = { ...style }
  for (const [key, value] of Object.entries(style)) {
    if (typeof value !== 'string') continue
    if (SURFACE_KEYS.has(key)) next[key] = darkSurfaceColor(value)
    else if (INK_KEYS.has(key)) next[key] = darkInkColor(value)
    else if (LINE_KEYS.has(key)) next[key] = darkLineColor(value)
  }
  return next
}

const derived = new WeakMap<object, object>()

export function deriveWorkerDarkStyles<T extends Record<string, object>>(sheet: T): T {
  const cached = derived.get(sheet)
  if (cached) return cached as T
  const next: Record<string, object> = {}
  for (const [name, style] of Object.entries(sheet)) {
    next[name] = style && typeof style === 'object' && !Array.isArray(style) ? darkenStyle(style as Record<string, unknown>) : style
  }
  derived.set(sheet, next)
  return next as T
}

export function useWorkerThemedStyles<T extends Record<string, object>>(sheet: T): T {
  return useWorkerThemeMode() === 'dark' ? deriveWorkerDarkStyles(sheet) : sheet
}

export function workerThemedColor(mode: 'light' | 'dark', role: 'ink' | 'line' | 'surface', value: string) {
  if (mode === 'light') return value
  return role === 'ink' ? darkInkColor(value) : role === 'line' ? darkLineColor(value) : darkSurfaceColor(value)
}

// Stage screens keep their colours in local token objects. In dark each colour is mapped by the
// role its name gives it (ink, line) and otherwise by its lightness: light values are surfaces,
// near-black and grey values are ink, and saturated brand colours are kept.
const LINE_NAME = /(border|line|stroke|dashed|connector|divider|outline|track|hairline)/i
const INK_NAME = /(ink|text|muted|faint|eyebrow|value|label|title|copy|caption|price|glyph|icon|kael|secondary)/i

function darkTokenColor(key: string, value: string) {
  const parsed = parseColor(value)
  if (!parsed || parsed.a === 0) return value
  if (LINE_NAME.test(key)) return darkLineColor(value)
  if (INK_NAME.test(key)) return darkInkColor(value)
  const { lum, sat } = describe(parsed)
  if (lum >= 0.45) return darkSurfaceColor(value)
  if (sat < 0.45) return darkInkColor(value)
  return value
}

function darkenTokens(value: unknown, key: string): unknown {
  if (typeof value === 'string') return darkTokenColor(key, value)
  if (Array.isArray(value)) return value.map((item) => darkenTokens(item, key))
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {}
    for (const [childKey, child] of Object.entries(value)) next[childKey] = darkenTokens(child, childKey)
    return next
  }
  return value
}

const derivedTokens = new WeakMap<object, object>()

export function deriveWorkerDarkTokens<T extends object>(tokens: T): T {
  const cached = derivedTokens.get(tokens)
  if (cached) return cached as T
  const next = darkenTokens(tokens, '') as T
  derivedTokens.set(tokens, next as object)
  return next
}

export function useWorkerThemedTokens<T extends object>(tokens: T): T {
  return useWorkerThemeMode() === 'dark' ? deriveWorkerDarkTokens(tokens) : tokens
}

// Class components read the theme at render time; their hook-based parents re-render them on a change.
export function workerThemedTokensNow<T extends object>(tokens: T): T {
  return getWorkerThemeModeNow() === 'dark' ? deriveWorkerDarkTokens(tokens) : tokens
}

export function workerThemedStylesNow<T extends Record<string, object>>(sheet: T): T {
  return getWorkerThemeModeNow() === 'dark' ? deriveWorkerDarkStyles(sheet) : sheet
}

// A stand-in for a module-level token object or StyleSheet that answers with the dark-mapped value
// whenever the Worker theme is dark at the moment of the read, so class components and module-level
// helpers follow the theme without hooks. The target is a blank object so frozen sources stay valid.
function themedProxy<T extends object>(source: T, derive: (value: T) => T): T {
  const current = () => (getWorkerThemeModeNow() === 'dark' ? derive(source) : source)
  return new Proxy({} as T, {
    get: (_target, key) => Reflect.get(current(), key),
    has: (_target, key) => Reflect.has(current(), key),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_target, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(current(), key)
      return descriptor ? { ...descriptor, configurable: true } : undefined
    },
  })
}

export function workerThemedTokensProxy<T extends object>(tokens: T): T {
  return themedProxy(tokens, deriveWorkerDarkTokens)
}

export function workerThemedStylesProxy<T extends Record<string, object>>(sheet: T): T {
  return themedProxy(sheet, deriveWorkerDarkStyles)
}

// For colours written inline in a component: maps a light value by role while the theme is dark.
export function useWorkerColor() {
  const mode = useWorkerThemeMode()
  return (role: 'ink' | 'line' | 'surface', value: string) => workerThemedColor(mode, role, value)
}
