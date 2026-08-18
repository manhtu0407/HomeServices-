import { Platform } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'

export type ProfileRankingMetricKind = 'reviews' | 'services' | 'streak'
export type ProfileRankingRuleKind = 'completion' | 'protected' | 'review'

export function ProfileRankingPointsIcon({ color, testID }: { color: string; testID?: string }) {
  return (
    <Svg accessible={Platform.OS === 'web' ? undefined : false} height={16} testID={testID} viewBox="0 0 16 16" width={16}>
      <Path d="m3.5 5.1 4.5-1.7 4.5 1.7L8 6.8 3.5 5.1ZM3.5 8 8 9.7 12.5 8M3.5 10.9 8 12.6l4.5-1.7" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.35} />
    </Svg>
  )
}

export function ProfileRankingNextLevelIcon({ color, testID }: { color: string; testID?: string }) {
  return (
    <Svg accessible={Platform.OS === 'web' ? undefined : false} height={16} testID={testID} viewBox="0 0 16 16" width={16}>
      <Circle cx={8} cy={8} fill="none" r={6.25} stroke={color} strokeWidth={1.35} />
      <Path d="m4.7 9.4 2.1-2.1 1.7 1.7 2.8-2.8M9.9 6.2h1.4v1.4" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.35} />
    </Svg>
  )
}

export function ProfileRankingUsageSignalIcon({ color, testID }: { color: string; testID?: string }) {
  return (
    <Svg accessible={Platform.OS === 'web' ? undefined : false} height={16} testID={testID} viewBox="0 0 16 16" width={16}>
      <Path d="m8 2.4 1.5 4.1L13.6 8l-4.1 1.5L8 13.6 6.5 9.5 2.4 8l4.1-1.5L8 2.4Z" fill="none" stroke={color} strokeLinejoin="round" strokeWidth={1.35} />
      <Circle cx={13.1} cy={3.2} fill={color} r={0.9} />
    </Svg>
  )
}

export function ProfileRankingMetricIcon({ color, kind, testID }: { color: string; kind: ProfileRankingMetricKind; testID?: string }) {
  return (
    <Svg height={38} testID={testID} viewBox="0 0 38 38" width={38}>
      {kind === 'services' ? (
        <>
          <Rect fill="none" height={18} rx={3} stroke={color} strokeWidth={1.8} width={26} x={6} y={12} />
          <Path d="M12 12V9.8c0-1.6 1.2-2.8 2.8-2.8h8.4c1.6 0 2.8 1.2 2.8 2.8V12M6.8 19h24.4M17 19v2.3h4V19" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
        </>
      ) : null}
      {kind === 'streak' ? (
        <>
          <Path d="M7 28c4-8.1 7.2-10.8 10.6-7.1 3.2 3.5 6.1 1.7 13.4-9.1" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.1} />
          <Path d="M24.2 11.8H31v6.8" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.1} />
        </>
      ) : null}
      {kind === 'reviews' ? (
        <>
          <Path d="M13.5 18.2v12.3H9.1c-1.7 0-3.1-1.4-3.1-3.1v-6.1c0-1.7 1.4-3.1 3.1-3.1h4.4ZM13.5 18.2l4.8-9.6c1.3.4 2.3 1.6 2.3 3v3.3h7c2.4 0 4.1 2.3 3.4 4.6l-2.1 7.1c-.5 1.7-2 2.9-3.8 2.9H13.5" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} />
        </>
      ) : null}
    </Svg>
  )
}

export function ProfileRankingRuleIcon({ color, kind, testID }: { color: string; kind: ProfileRankingRuleKind; testID?: string }) {
  return (
    <Svg height={38} testID={testID} viewBox="0 0 46 46" width={38}>
      {kind === 'completion' ? (
        <>
          <Path d="M8.5 4.5h17l10 10v25h-27zM25.5 4.5v10h10" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} />
          <Path d="M14 21h12M14 26h10M14 31h7" fill="none" stroke={color} strokeLinecap="round" strokeWidth={1.9} />
          <Circle cx={33.5} cy={34} fill="white" r={6.4} stroke={color} strokeWidth={1.9} />
          <Path d="m30.4 34 2.1 2.1 4-4.4" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} />
        </>
      ) : null}
      {kind === 'review' ? (
        <>
          <Circle cx={19} cy={14} fill="none" r={6.2} stroke={color} strokeWidth={1.9} />
          <Path d="M7.5 37c1-7 5-10.7 11.5-10.7S29.5 30 30.5 37" fill="none" stroke={color} strokeLinecap="round" strokeWidth={1.9} />
          <Circle cx={34.5} cy={34} fill="white" r={6.4} stroke={color} strokeWidth={1.9} />
          <Path d="m31.4 34 2.1 2.1 4-4.4" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} />
        </>
      ) : null}
      {kind === 'protected' ? (
        <>
          <Path d="M23 4.5 38 10v10.3c0 9.2-5.7 15.8-15 20.2-9.3-4.4-15-11-15-20.2V10z" fill="none" stroke={color} strokeLinejoin="round" strokeWidth={1.9} />
          <Path d="M16 16.5h14M16 22h14M16 27.5h9" fill="none" stroke={color} strokeLinecap="round" strokeWidth={1.9} />
        </>
      ) : null}
    </Svg>
  )
}
