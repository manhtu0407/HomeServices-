export type GateMode = 'app' | 'reference'
export type Insets = Readonly<{ top: number; right: number; bottom: number; left: number }>

export const ZERO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

export function getGateLayout(
  width: number,
  height: number,
  mode: GateMode = 'app',
  insets: Insets = ZERO_INSETS,
  maxContentWidth = 480,
) {
  if (![width, height, maxContentWidth, ...Object.values(insets)].every(Number.isFinite)) {
    throw new RangeError('Gate layout values must be finite numbers.')
  }
  if (width <= 0 || height < 0 || maxContentWidth <= 0 || Object.values(insets).some(value => value < 0)) {
    throw new RangeError('Invalid viewport or safe-area dimensions.')
  }

  const safe = mode === 'app' ? insets : ZERO_INSETS
  const availableWidth = Math.max(1, width - safe.left - safe.right)
  const stageWidth = mode === 'app' ? Math.min(availableWidth, maxContentWidth) : availableWidth
  const sourceWidth = mode === 'app' ? 800 : 941
  const sourceHeight = mode === 'app' ? 1510 : 1672
  const scale = stageWidth / sourceWidth
  const stageHeight = sourceHeight * scale
  const availableHeight = Math.max(0, height - safe.top - safe.bottom)

  return {
    stageWidth,
    stageHeight,
    scale,
    safe,
    originX: mode === 'app' ? 70 : 0,
    originY: mode === 'app' ? 98 : 0,
    sourceWidth,
    sourceHeight,
    extraTop: mode === 'app' ? Math.max(0, (availableHeight - stageHeight) / 2) : 0,
    scrollNeeded: stageHeight > availableHeight,
  }
}

export type Role = 'customer' | 'worker'
