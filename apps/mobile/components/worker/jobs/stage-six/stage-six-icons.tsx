import type { ReactNode } from 'react'

import Svg, { Circle, G, Path, Rect } from 'react-native-svg'

import { stageSixTokens } from './stage-six-tokens'

export type StageSixIconName = 'check' | 'clock' | 'edit' | 'evidence' | 'item' | 'photos' | 'plus' | 'price' | 'reason' | 'sparkle'

/** Vector geometry shared with the approved Timeline Card HTML reference. */
export function StageSixIcon({
  color,
  name,
  size = 18,
  strokeWidth = 1.8,
}: {
  color: string
  name: StageSixIconName
  size?: number
  strokeWidth?: number
}) {
  let shape: ReactNode

  switch (name) {
    case 'clock':
      shape = (
        <>
          <Circle cx={12} cy={12} fill={stageSixTokens.colors.clockFace} r={9} />
          <Path d="M12 6.5v5.7l4 2.4" />
        </>
      )
      break
    case 'item':
      shape = (
        <>
          <Path d="M6.4 4.5h11.2A2.4 2.4 0 0 1 20 6.9v8.4a2.4 2.4 0 0 1-2.4 2.4H10L5 20v-3a2.4 2.4 0 0 1-1-1.9V6.9a2.4 2.4 0 0 1 2.4-2.4Z" />
          <Path d="m8 9 2 1.6 3-2.8M8 13.6h7.2" />
        </>
      )
      break
    case 'reason':
      shape = <Path d="M8 4.5h8a5 5 0 0 1 5 5v3a5 5 0 0 1-5 5h-5l-5 3v-4a4.8 4.8 0 0 1-3-4.5v-2.5a5 5 0 0 1 5-5Z" />
      break
    case 'evidence':
      shape = (
        <>
          <Rect height={12.4} rx={3} width={18.8} x={2.6} y={7.2} />
          <Path d="M8.5 7.2 9.9 4.9h4.2l1.4 2.3" />
          <Circle cx={12} cy={13.4} r={3.5} />
          <Circle cx={17.9} cy={10.6} fill={color} r={0.9} stroke="none" />
        </>
      )
      break
    case 'photos':
      shape = (
        <>
          <Rect height={15} rx={3} width={17} x={3.5} y={4.5} />
          <Circle cx={8.3} cy={9.3} fill={color} r={1.4} stroke="none" />
          <Path d="m4.4 17.2 4.2-4.1 2.9 2.7 2.8-2.6 4.7 4.7" />
        </>
      )
      break
    case 'price':
      shape = (
        <>
          <Path d="M3 4.5V11a2 2 0 0 0 .6 1.4l7.5 7.5a1.9 1.9 0 0 0 2.7 0l6.1-6.1a1.9 1.9 0 0 0 0-2.7l-7.5-7.5A2 2 0 0 0 11 3H4.5A1.5 1.5 0 0 0 3 4.5Z" fill={color} stroke="none" />
          <Circle cx={7.1} cy={7.1} fill={stageSixTokens.colors.tagHole} r={1.5} stroke="none" />
        </>
      )
      break
    case 'edit':
      shape = (
        <>
          <Path d="m4 16-1 5 5-1L19 9l-4-4L4 16Z" />
          <Path d="m13.5 6.5 4 4M4 16l4 4m8-16 1.2-1.2a1.4 1.4 0 0 1 2 0l2 2a1.4 1.4 0 0 1 0 2L20 8" />
        </>
      )
      break
    case 'plus':
      shape = <Path d="M12 5v14M5 12h14" />
      break
    case 'check':
      shape = <Path d="m5.5 12 4.2 4.2L18.5 7.5" />
      break
    case 'sparkle':
      shape = (
        <>
          <Path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z" />
          <Path d="M20 3v3m-1.5-1.5h3M3.5 19v2m-1-1h2" strokeWidth={1.3} />
        </>
      )
      break
  }

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <G fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
        {shape}
      </G>
    </Svg>
  )
}
