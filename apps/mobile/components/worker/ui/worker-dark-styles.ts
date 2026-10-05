import { customerTheme } from '@/design/theme'

import { useWorkerThemeMode } from '../worker-theme'

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
