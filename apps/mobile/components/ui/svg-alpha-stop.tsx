import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import {
  LinearGradient as SvgLinearGradient,
  RadialGradient as SvgRadialGradient,
  Stop as SvgStop,
} from 'react-native-svg'

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

function normalizeGradientStops(children: ReactNode): ReactElement[] {
  const normalizedStops: ReactElement[] = []

  for (const child of Children.toArray(children)) {
    if (!isValidElement<SvgStopProps>(child)) {
      continue
    }

    if (child.type !== AlphaStop) {
      normalizedStops.push(child)
      continue
    }

    const { offset, stopColor, stopOpacity } = child.props
    const normalized = normalizeRgbaStop(stopColor, stopOpacity)

    // react-native-svg extracts direct child props before it renders AlphaStop.
    normalizedStops.push(
      <SvgStop
        key={child.key ?? `alpha-stop-${normalizedStops.length}`}
        offset={offset}
        stopColor={normalized.stopColor}
        stopOpacity={normalized.stopOpacity}
      />,
    )
  }

  return normalizedStops
}

type NativeSafeLinearGradientProps = ComponentProps<typeof SvgLinearGradient>
type NativeSafeRadialGradientProps = ComponentProps<typeof SvgRadialGradient>

export function NativeSafeLinearGradient({ children, ...props }: NativeSafeLinearGradientProps) {
  return <SvgLinearGradient {...props}>{normalizeGradientStops(children)}</SvgLinearGradient>
}

export function NativeSafeRadialGradient({ children, ...props }: NativeSafeRadialGradientProps) {
  return <SvgRadialGradient {...props}>{normalizeGradientStops(children)}</SvgRadialGradient>
}
