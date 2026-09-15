import type { ReactNode } from 'react'

import Svg, { Circle, G, Path, Rect } from 'react-native-svg'

export type StageEightIconName = 'camera' | 'checklist' | 'note'

export function StageEightIcon({ color, name, size }: { color: string; name: StageEightIconName; size: number }) {
  let shape: ReactNode

  switch (name) {
    case 'camera':
      shape = (
        <>
          <Path d="M3.5 8.8c0-1.3 1-2.3 2.3-2.3h2l1.4-2h5.6l1.4 2h2c1.3 0 2.3 1 2.3 2.3v8.4c0 1.3-1 2.3-2.3 2.3H5.8c-1.3 0-2.3-1-2.3-2.3Z" />
          <Circle cx={12} cy={12.9} r={3.5} />
          <Circle cx={17.2} cy={9.6} fill={color} r={0.8} strokeWidth={0} />
        </>
      )
      break
    case 'checklist':
      shape = (
        <>
          <Rect height={16} rx={3.5} width={16} x={4} y={4} />
          <Path d="m8.3 12.2 2.6 2.6 4.9-5.4" />
        </>
      )
      break
    case 'note':
      shape = (
        <>
          <Path d="M11 4H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-4" />
          <Path d="M17.49 3.69a2 2 0 0 1 2.82 2.82l-7.46 7.46L9.6 14.4l.43-3.25Z" />
          <Path d="M7.8 17h3.4" />
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
