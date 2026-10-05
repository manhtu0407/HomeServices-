import React from 'react'
import { View } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useWorkerColor } from '../../ui/worker-dark-styles'

export function WaitingClockIcon({ size = 24, color = '#073448' }: { size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    <Circle cx={12} cy={12} r={9.2} stroke={color} strokeWidth={1.8} fill="none" />
    <Path d="M12 6v6.2l4 2.2" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
}
export function WaitingAtmosphere({ id }: { id: string }) {
  const tc = useWorkerColor()
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height="100%" viewBox="0 0 560 890" preserveAspectRatio="none" accessible={false}>
      <Defs>
        <LinearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={tc('surface', '#FCFFFE')}/><Stop offset="0.8" stopColor={tc('surface', '#F4FFFC')}/><Stop offset="1" stopColor={tc('surface', '#FBFFFE')}/></LinearGradient>
        <RadialGradient id={`${id}-haze`}><Stop offset="0" stopColor="#86E3D1" stopOpacity="0.25"/><Stop offset="1" stopColor="#A4F0DB" stopOpacity="0"/></RadialGradient>
      </Defs>
      <Rect width={560} height={890} fill={`url(#${id}-bg)`}/>
      <Circle cx={475} cy={132} r={49} fill={`url(#${id}-haze)`}/><Circle cx={72} cy={390} r={53} fill={`url(#${id}-haze)`}/><Circle cx={190} cy={710} r={100} fill={`url(#${id}-haze)`}/>
    </Svg>
  </View>
}
export function WaitingRing({ scale, id }: { scale: number; id: string }) {
  const tc = useWorkerColor()
  const r = 168
  return <Svg width={348 * scale} height={348 * scale} viewBox="0 0 348 348" accessible={false}>
    <Defs><LinearGradient id={`${id}-ring`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#12CDA7"/><Stop offset="0.23" stopColor="#8AE1CA"/><Stop offset="0.7" stopColor="#A9EEDF"/><Stop offset="1" stopColor="#E9FCF8"/></LinearGradient></Defs>
    <Circle cx={174} cy={174} r={r} fill="none" stroke={tc('line', '#E7FBF8')} strokeWidth={12}/>
    <Path d="M174 6A168 168 0 0 1 174 342" fill="none" stroke={`url(#${id}-ring)`} strokeWidth={12} strokeLinecap="round"/>
    <Path d="M174 6a168 168 0 0 1 58 10.3" stroke="#08CDA8" strokeWidth={12} strokeLinecap="round" fill="none" opacity={0.65}/>
  </Svg>
}
export function WaitingParticles({ scale, id }: { scale: number; id: string }) {
  return <Svg width={560 * scale} height={400 * scale} viewBox="0 0 560 400" accessible={false}>
    <Defs><RadialGradient id={`${id}-bead`} cx="0.3" cy="0.22" r="0.8"><Stop offset="0" stopColor="#BAF3E4"/><Stop offset="0.65" stopColor="#6EDCC1"/><Stop offset="1" stopColor="#80E0CA"/></RadialGradient><RadialGradient id={`${id}-blur`}><Stop offset="0" stopColor="#83E4CD" stopOpacity={0.6}/><Stop offset="1" stopColor="#83E4CD" stopOpacity={0}/></RadialGradient></Defs>
    <Path d="M100 73C74 104 64 150 69 193 M79 249C89 266 107 282 122 292 M483 147C494 191 489 230 477 266" stroke="#55DAC0" strokeOpacity={0.65} strokeWidth={0.9} strokeDasharray="3 5" strokeLinecap="round" fill="none"/>
    <Circle cx={110} cy={64} r={7.5} fill={`url(#${id}-bead)`}/><Circle cx={482} cy={146} r={10.5} fill={`url(#${id}-bead)`}/><Circle cx={87} cy={281} r={9} fill={`url(#${id}-bead)`}/><Circle cx={460} cy={309} r={8} fill={`url(#${id}-bead)`}/>
    <Circle cx={179} cy={13} r={10} fill={`url(#${id}-blur)`}/><Circle cx={454} cy={102} r={3.3} fill="#95EBD7"/><Circle cx={118} cy={317} r={2.7} fill="#A1ECDC"/><Circle cx={434} cy={337} r={3.4} fill="#76E1C7"/>
  </Svg>
}
export function WaitingButtonFill({ id, colors }: { id: string; colors: readonly [string, string] }) {
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
    <Svg width="100%" height="100%" viewBox="0 0 508 80" preserveAspectRatio="none" accessible={false}>
      <Defs><LinearGradient id={`${id}-button`} x1="0%" y1="0%" x2="75%" y2="100%"><Stop offset="0" stopColor={colors[0]}/><Stop offset="1" stopColor={colors[1]}/></LinearGradient><LinearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="white" stopOpacity={0.42}/><Stop offset="0.12" stopColor="white" stopOpacity={0}/></LinearGradient></Defs>
      <Rect x={0.5} y={0.5} width={507} height={79} rx={40} fill={`url(#${id}-button)`}/><Rect x={1} y={1} width={506} height={78} rx={39} fill={`url(#${id}-shine)`} stroke="#4FE1BE" strokeWidth={0.8}/>
    </Svg>
  </View>
}
