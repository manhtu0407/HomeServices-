import { useId } from 'react'
import Svg, { Defs, LinearGradient, Mask, Rect, Stop } from 'react-native-svg'

import { stageNineTokens as TLight } from './stage-nine-tokens'
import { useWorkerThemedTokens } from '../../ui/worker-dark-styles'

/** Two horizontal ramps blended top-to-bottom, calibrated to the approved call-to-action material. */
export function StageNineButtonSurface({ height = 76, width = 340 }: { height?: number; width?: number }) {
  const T = useWorkerThemedTokens(TLight)
  // SVG ids are document-global on web, so each instance needs its own gradient and mask ids.
  const prefix = `stageNineButton${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const lastStop = T.colors.buttonSurfaceTop.length - 1

  return (
    <Svg height={height} preserveAspectRatio="none" viewBox="0 0 340 76" width={width}>
      <Defs>
        <LinearGradient id={`${prefix}Top`} x1="0" x2="1" y1="0" y2="0">
          {T.colors.buttonSurfaceTop.map((stopColor, index) => (
            <Stop key={stopColor} offset={index / lastStop} stopColor={stopColor} />
          ))}
        </LinearGradient>
        <LinearGradient id={`${prefix}Bottom`} x1="0" x2="1" y1="0" y2="0">
          {T.colors.buttonSurfaceBottom.map((stopColor, index) => (
            <Stop key={stopColor} offset={index / lastStop} stopColor={stopColor} />
          ))}
        </LinearGradient>
        <LinearGradient id={`${prefix}Fade`} x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="white" stopOpacity={1} />
          <Stop offset="1" stopColor="white" stopOpacity={0} />
        </LinearGradient>
        <Mask id={`${prefix}Mask`}>
          <Rect fill={`url(#${prefix}Fade)`} height={76} width={340} />
        </Mask>
      </Defs>
      <Rect fill={`url(#${prefix}Bottom)`} height={76} width={340} />
      <Rect fill={`url(#${prefix}Top)`} height={76} mask={`url(#${prefix}Mask)`} width={340} />
    </Svg>
  )
}
