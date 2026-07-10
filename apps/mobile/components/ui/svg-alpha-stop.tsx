import type { ComponentProps } from 'react'
import { Stop as SvgStop } from 'react-native-svg'

type SvgStopProps = ComponentProps<typeof SvgStop>

const RGBA_COLOR_RE = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d*\.?\d+)\s*\)$/i

function toHexChannel(value: string) {
  const channel = Math.min(255, Math.max(0, Math.round(Number(value))))
  return channel.toString(16).padStart(2, '0').toUpperCase()
}

function toStopOpacity(value: string) {
  return Math.min(1, Math.max(0, Number(value)))
}

function normalizeRgbaStop(
  stopColor: SvgStopProps['stopColor'],
  stopOpacity: SvgStopProps['stopOpacity'],
) {
  if (typeof stopColor !== 'string') {
    return { stopColor, stopOpacity }
  }

  const match = stopColor.match(RGBA_COLOR_RE)
  if (!match) {
    return { stopColor, stopOpacity }
  }

  const [, red, green, blue, alpha] = match
  return {
    stopColor: `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`,
    stopOpacity: stopOpacity ?? toStopOpacity(alpha),
  }
}

export function AlphaStop({ stopColor, stopOpacity, ...props }: SvgStopProps) {
  const normalized = normalizeRgbaStop(stopColor, stopOpacity)
  return <SvgStop {...props} stopColor={normalized.stopColor} stopOpacity={normalized.stopOpacity} />
}
