import { StyleSheet, View } from 'react-native'
import Svg, { Defs, Rect } from 'react-native-svg'

import { color } from '@/design/theme'
import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient, NativeSafeRadialGradient as RadialGradient } from './svg-alpha-stop'

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
const FORMULA_MINT_DARK_COLORS = {
  ambientBottomLeft: 'rgba(39,157,136,0.10)',
  ambientMidRight: 'rgba(56,177,154,0.12)',
  ambientTopLeft: 'rgba(43,167,145,0.12)',
  baseEnd: '#101A17',
  baseMiddle: '#0E1513',
  baseStart: '#0B0F0E',
  bottomLeft: 'rgba(54,174,151,0.13)',
  leftWash: 'rgba(45,167,145,0.12)',
  rightWash: 'rgba(49,183,159,0.13)',
  topRight: 'rgba(50,194,169,0.15)',
} as const

function safeFormulaScope(scope: string) {
  return scope.replace(/[^a-zA-Z0-9]/g, '')
}

export function FormulaMintCanvasAura({
  mode = 'light',
  reduceTransparency: _reduceTransparency = false,
  scope,
  testID,
}: FormulaMintCanvasAuraProps) {
  if (mode === 'light') {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color.surface.base }]} testID={testID} />
  }

  const colors = FORMULA_MINT_DARK_COLORS
  const safeScope = safeFormulaScope(scope)
  const baseId = `formulaMintCanvasBase${safeScope}`
  const topRightId = `formulaMintCanvasTopRight${safeScope}`
  const leftWashId = `formulaMintCanvasLeftWash${safeScope}`
  const rightWashId = `formulaMintCanvasRightWash${safeScope}`
  const bottomLeftId = `formulaMintCanvasBottomLeft${safeScope}`
  const ambientTopLeftId = `formulaMintCanvasAmbientTopLeft${safeScope}`
  const ambientMidRightId = `formulaMintCanvasAmbientMidRight${safeScope}`
  const ambientBottomLeftId = `formulaMintCanvasAmbientBottomLeft${safeScope}`

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox={`0 0 ${FORMULA_WIDTH} ${FORMULA_HEIGHT}`} width="100%">
        <Defs>
          <LinearGradient id={baseId} x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor={colors.baseStart} />
            <Stop offset="0.42" stopColor={colors.baseMiddle} />
            <Stop offset="1" stopColor={colors.baseEnd} />
          </LinearGradient>
          <RadialGradient cx={397.8} cy={-33.76} gradientUnits="userSpaceOnUse" id={topRightId} r={FORMULA_MINT_CANVAS_STANDARD_RADIAL_RADIUS}>
            <Stop offset="0" stopColor={colors.topRight} />
            <Stop offset="0.58" stopColor={colors.topRight} stopOpacity={mode === 'dark' ? 0.05 : 0.12} />
            <Stop offset="0.74" stopColor={colors.topRight} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient cx={-70.2} cy={320.72} gradientUnits="userSpaceOnUse" id={leftWashId} r={FORMULA_MINT_CANVAS_STANDARD_RADIAL_RADIUS}>
            <Stop offset="0" stopColor={colors.leftWash} />
            <Stop offset="0.72" stopColor={colors.leftWash} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient cx={405.6} cy={624.56} gradientUnits="userSpaceOnUse" id={rightWashId} r={FORMULA_MINT_CANVAS_STANDARD_RADIAL_RADIUS}>
            <Stop offset="0" stopColor={colors.rightWash} />
            <Stop offset="0.72" stopColor={colors.rightWash} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient cx={54.6} cy={877.76} gradientUnits="userSpaceOnUse" id={bottomLeftId} r={FORMULA_MINT_CANVAS_STANDARD_RADIAL_RADIUS}>
            <Stop offset="0" stopColor={colors.bottomLeft} />
            <Stop offset="0.73" stopColor={colors.bottomLeft} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient cx={8} cy={60.56} gradientUnits="userSpaceOnUse" id={ambientTopLeftId} r={FORMULA_MINT_CANVAS_STANDARD_RADIAL_RADIUS}>
            <Stop offset="0" stopColor={colors.ambientTopLeft} />
            <Stop offset="0.72" stopColor={colors.ambientTopLeft} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient cx={371} cy={411.96} gradientUnits="userSpaceOnUse" id={ambientMidRightId} r={FORMULA_MINT_CANVAS_STANDARD_RADIAL_RADIUS}>
            <Stop offset="0" stopColor={colors.ambientMidRight} />
            <Stop offset="0.72" stopColor={colors.ambientMidRight} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient cx={57.5} cy={743.28} gradientUnits="userSpaceOnUse" id={ambientBottomLeftId} r={FORMULA_MINT_CANVAS_STANDARD_RADIAL_RADIUS}>
            <Stop offset="0" stopColor={colors.ambientBottomLeft} />
            <Stop offset="0.75" stopColor={colors.ambientBottomLeft} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${baseId})`} height={FORMULA_HEIGHT} width={FORMULA_WIDTH} />
        <Rect fill={`url(#${ambientTopLeftId})`} height={FORMULA_HEIGHT} width={FORMULA_WIDTH} />
        <Rect fill={`url(#${ambientMidRightId})`} height={FORMULA_HEIGHT} width={FORMULA_WIDTH} />
        <Rect fill={`url(#${ambientBottomLeftId})`} height={FORMULA_HEIGHT} width={FORMULA_WIDTH} />
        <Rect fill={`url(#${topRightId})`} height={FORMULA_HEIGHT} width={FORMULA_WIDTH} />
        <Rect fill={`url(#${leftWashId})`} height={FORMULA_HEIGHT} width={FORMULA_WIDTH} />
        <Rect fill={`url(#${rightWashId})`} height={FORMULA_HEIGHT} width={FORMULA_WIDTH} />
        <Rect fill={`url(#${bottomLeftId})`} height={FORMULA_HEIGHT} width={FORMULA_WIDTH} />
      </Svg>
    </View>
  )
}
