import Svg, { Circle, Path } from 'react-native-svg'

const SIZE = 148
const CENTER = SIZE / 2
const DISPLAY = 116

/** Flat filled check seal in the manner of the system "checkmark.circle.fill" symbol, with one faint halo. */
export function StageNineSubmittedEmblem({ primary }: { primary: string }) {
  return (
    <Svg height={DISPLAY} viewBox={`0 0 ${SIZE} ${SIZE}`} width={DISPLAY}>
      <Circle cx={CENTER} cy={CENTER} fill={primary} fillOpacity={0.12} r={CENTER} />
      <Circle cx={CENTER} cy={CENTER} fill={primary} fillOpacity={0.2} r={58} />
      <Circle cx={CENTER} cy={CENTER} fill={primary} r={44} />
      <Path d="m55 75 14 14 25-28" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={8} />
    </Svg>
  )
}
