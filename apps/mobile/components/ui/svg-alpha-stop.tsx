import type { ComponentProps } from 'react'
import { Stop as SvgStop } from 'react-native-svg'

type SvgStopProps = ComponentProps<typeof SvgStop>

const RGBA_COLOR_RE = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([01]?(?:\.\d+)?)\s*\)$/i

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
    stopColor: `rgb(${Number(red)},${Number(green)},${Number(blue)})`,
    stopOpacity: stopOpacity ?? Number(alpha),
  }
}

export function AlphaStop({ stopColor, stopOpacity, ...props }: SvgStopProps) {
  const normalized = normalizeRgbaStop(stopColor, stopOpacity)
  return <SvgStop {...props} stopColor={normalized.stopColor} stopOpacity={normalized.stopOpacity} />
}
