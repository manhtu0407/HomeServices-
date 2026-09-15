import type { ReactNode } from 'react'

import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg'

import { stageTenTokens } from './stage-ten-tokens'

export type StageTenIconName = 'calendar' | 'chart' | 'check' | 'chevron' | 'info' | 'photo' | 'pin' | 'star' | 'trend' | 'trophy' | 'wallet'

export function StageTenIcon({
  color = stageTenTokens.mint,
  filled = false,
  name,
  size = 20,
}: {
  color?: string
  filled?: boolean
  name: StageTenIconName
  size?: number
}) {
  let shape: ReactNode

  switch (name) {
    case 'check':
      shape = <Path d="m5.5 12 4.2 4.3 8.8-9" strokeWidth={2.5} />
      break
    case 'wallet':
      shape = (
        <>
          <Path d="M4 6.5 17 3v3.5M20 8v12H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h13" />
          <Rect fill={filled ? '#7DDACC' : 'none'} height={6} rx={1.5} width={8} x={14} y={11} />
          <Circle cx={17.2} cy={14} fill={color} r={0.8} strokeWidth={0} />
        </>
      )
      break
    case 'star':
      shape = <Path d="m12 2.5 2.95 6 6.65.95-4.8 4.67 1.13 6.61L12 17.61l-5.93 3.12 1.13-6.61L2.4 9.45l6.65-.95Z" fill={filled ? color : 'none'} strokeWidth={1.3} />
      break
    case 'trophy':
      shape = (
        <>
          <Path d="M7 3h10v7a5 5 0 0 1-10 0Z" fill={color} strokeWidth={0} />
          <Path d="M7 5H3v3c0 3 2 5 5 5m9-8h4v3c0 3-2 5-5 5M12 15v5m-4 1h8" strokeWidth={1.8} />
        </>
      )
      break
    case 'chart':
      shape = (
        <>
          <Rect fill={color} height={9} rx={2} strokeWidth={0} width={4.3} x={2} y={13} />
          <Rect fill={color} height={15} rx={2} strokeWidth={0} width={4.3} x={9.5} y={7} />
          <Rect fill={color} height={21} rx={2} strokeWidth={0} width={4.3} x={17} y={1} />
        </>
      )
      break
    case 'pin':
      shape = (
        <>
          <Path d="M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 1 1 14 0" fill={color} strokeWidth={0} />
          <Circle cx={12} cy={10} fill="white" r={2.6} strokeWidth={0} />
        </>
      )
      break
    case 'calendar':
      shape = (
        <>
          <Rect height={17} rx={2} width={18} x={3} y={5} />
          <Path d="M7 2v6m10-6v6M3 11h18" />
        </>
      )
      break
    case 'trend':
      shape = <Path d="m3 16 7-7 5 1 5-6m-6 0h6v6" />
      break
    case 'chevron':
      shape = <Path d="m9 5 7 7-7 7" />
      break
    case 'info':
      shape = (
        <>
          <Circle cx={12} cy={12} fill={color} r={11} strokeWidth={0} />
          <Path d="M12 11v6m0-10v.2" stroke="white" strokeWidth={2} />
        </>
      )
      break
    case 'photo':
      shape = (
        <>
          <Rect height={18} rx={3} width={18} x={3} y={3} />
          <Circle cx={8} cy={8} r={1.5} />
          <Path d="m4 18 5-5 3 3 4-5 5 7" />
        </>
      )
      break
  }

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <G fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}>
        {shape}
      </G>
    </Svg>
  )
}

export function StageTenGradient({ from, id, to }: { from: string; id: string; to: string }) {
  return (
    <Svg
      height="100%"
      pointerEvents="none"
      preserveAspectRatio="none"
      style={{ left: 0, position: 'absolute', top: 0 }}
      width="100%"
    >
      <Defs>
        <LinearGradient id={id} x1="0%" x2="100%" y1="0%" y2="100%">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect fill={`url(#${id})`} height="100%" width="100%" />
    </Svg>
  )
}
