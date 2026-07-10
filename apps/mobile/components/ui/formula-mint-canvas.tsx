import { StyleSheet, View } from 'react-native'
import Svg, { Defs, LinearGradient, RadialGradient, Rect } from 'react-native-svg'

import { AlphaStop as Stop } from './svg-alpha-stop'

type FormulaMintCanvasAuraProps = {
  reduceTransparency?: boolean
  scope: string
  testID: string
}

const FORMULA_WIDTH = 390
const FORMULA_HEIGHT = 844

function safeFormulaScope(scope: string) {
  return scope.replace(/[^a-zA-Z0-9]/g, '')
}

export function FormulaMintCanvasAura({
  reduceTransparency: _reduceTransparency = false,
  scope,
  testID,
}: FormulaMintCanvasAuraProps) {
  // The page formula remains visible under Reduce Transparency; glass components own the opaque fallback.
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
            <Stop offset="0" stopColor="#F9FFFD" />
            <Stop offset="0.42" stopColor="#F3FBF9" />
            <Stop offset="1" stopColor="#EDF9F6" />
          </LinearGradient>
          <RadialGradient cx={397.8} cy={-33.76} gradientUnits="userSpaceOnUse" id={topRightId} rx={280} ry={230}>
            <Stop offset="0" stopColor="rgba(80,232,210,0.34)" />
            <Stop offset="0.58" stopColor="rgba(151,246,232,0.12)" />
            <Stop offset="0.74" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient cx={-70.2} cy={320.72} gradientUnits="userSpaceOnUse" id={leftWashId} rx={240} ry={230}>
            <Stop offset="0" stopColor="rgba(136,241,223,0.22)" />
            <Stop offset="0.72" stopColor="rgba(136,241,223,0)" />
          </RadialGradient>
          <RadialGradient cx={405.6} cy={624.56} gradientUnits="userSpaceOnUse" id={rightWashId} rx={320} ry={240}>
            <Stop offset="0" stopColor="rgba(83,220,206,0.24)" />
            <Stop offset="0.72" stopColor="rgba(83,220,206,0)" />
          </RadialGradient>
          <RadialGradient cx={54.6} cy={877.76} gradientUnits="userSpaceOnUse" id={bottomLeftId} rx={300} ry={230}>
            <Stop offset="0" stopColor="rgba(145,232,222,0.23)" />
            <Stop offset="0.73" stopColor="rgba(145,232,222,0)" />
          </RadialGradient>
          <RadialGradient cx={8} cy={60.56} gradientUnits="userSpaceOnUse" id={ambientTopLeftId} rx={170} ry={140}>
            <Stop offset="0" stopColor="rgba(89,232,207,0.20)" />
            <Stop offset="0.72" stopColor="rgba(89,232,207,0)" />
          </RadialGradient>
          <RadialGradient cx={371} cy={411.96} gradientUnits="userSpaceOnUse" id={ambientMidRightId} rx={190} ry={150}>
            <Stop offset="0" stopColor="rgba(122,243,223,0.18)" />
            <Stop offset="0.72" stopColor="rgba(122,243,223,0)" />
          </RadialGradient>
          <RadialGradient cx={57.5} cy={743.28} gradientUnits="userSpaceOnUse" id={ambientBottomLeftId} rx={210} ry={160}>
            <Stop offset="0" stopColor="rgba(81,216,203,0.15)" />
            <Stop offset="0.75" stopColor="rgba(81,216,203,0)" />
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
