import { StyleSheet, View } from 'react-native'
import Svg, { Defs, Rect } from 'react-native-svg'

import { color } from '@/design/theme'
import { AlphaStop as Stop, NativeSafeRadialGradient as RadialGradient } from './svg-alpha-stop'

type FormulaMintCanvasAuraProps = {
  mode?: 'light' | 'dark'
  reduceTransparency?: boolean
  scope: string
  testID: string
}

const FORMULA_WIDTH = 390
const FORMULA_HEIGHT = 844
// `rx` and `ry` are native-only radial extensions; a standard radius keeps web and native aligned.
export const FORMULA_MINT_CANVAS_STANDARD_RADIAL_RADIUS = Math.hypot(FORMULA_WIDTH, FORMULA_HEIGHT) / (2 * Math.SQRT2)
// Dark follows the iOS base: flat black with one faint mint wash at the top-right, the single
// accent region a screen keeps (governance/design/signature.md §2).
const FORMULA_MINT_DARK_COLORS = {
  base: '#000000',
  topRight: 'rgba(99,230,208,0.07)',
} as const

function safeFormulaScope(scope: string) {
  return scope.replace(/[^a-zA-Z0-9]/g, '')
}

export function FormulaMintCanvasAura({
  mode = 'light',
  reduceTransparency = false,
  scope,
  testID,
}: FormulaMintCanvasAuraProps) {
  if (mode === 'light') {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color.surface.base }]} testID={testID} />
  }

  const colors = FORMULA_MINT_DARK_COLORS
  if (reduceTransparency) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.base }]} testID={testID} />
  }
  const topRightId = `formulaMintCanvasTopRight${safeFormulaScope(scope)}`

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.base }]} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox={`0 0 ${FORMULA_WIDTH} ${FORMULA_HEIGHT}`} width="100%">
        <Defs>
          <RadialGradient cx={397.8} cy={-33.76} gradientUnits="userSpaceOnUse" id={topRightId} r={FORMULA_MINT_CANVAS_STANDARD_RADIAL_RADIUS}>
            <Stop offset="0" stopColor={colors.topRight} />
            <Stop offset="0.62" stopColor={colors.topRight} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${topRightId})`} height={FORMULA_HEIGHT} width={FORMULA_WIDTH} />
      </Svg>
    </View>
  )
}
