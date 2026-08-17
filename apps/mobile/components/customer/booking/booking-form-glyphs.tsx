import { View } from 'react-native'
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'

import {
  CaseWideMintAura,
  SourceCardSkin,
  ZipMintAura,
} from '../ui/aura-surfaces'
import { customerV21BookingStyles as bookingStyles } from './booking-styles'

export type BookingFormGlyphKind = 'calendar' | 'clock' | 'note' | 'pin' | 'send'

export function BookingFormGlyph({
  color,
  kind,
  size = 18,
}: {
  color: string
  kind: BookingFormGlyphKind
  size?: number
}) {
  const strokeProps = {
    fill: 'none' as const,
    stroke: color,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.7,
  }

  return (
    <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      {kind === 'send' ? (
        <>
          <Path d="m4 12 16-8-4.5 16-3.2-5.1L4 12Z" {...strokeProps} />
          <Path d="m12.3 14.9 7.7-10.1" {...strokeProps} />
        </>
      ) : kind === 'pin' ? (
        <>
          <Path d="M12 21s6-5.25 6-10a6 6 0 1 0-12 0c0 4.75 6 10 6 10Z" {...strokeProps} />
          <Circle cx={12} cy={11} r={2} {...strokeProps} />
        </>
      ) : kind === 'clock' ? (
        <>
          <Circle cx={12} cy={12} r={8.5} {...strokeProps} />
          <Line x1={12} x2={12} y1={7.5} y2={12} {...strokeProps} />
          <Line x1={12} x2={15.5} y1={12} y2={14.2} {...strokeProps} />
        </>
      ) : kind === 'note' ? (
        <>
          <Rect height={17} rx={2.5} width={14} x={4} y={3.5} {...strokeProps} />
          <Path d="m8 16 1.8.4 7.7-7.7-2.2-2.2-7.7 7.7L8 16Z" {...strokeProps} />
          <Path d="m14.7 6.5 2.2 2.2" {...strokeProps} />
        </>
      ) : (
        <>
          <Rect height={15} rx={2.5} width={16} x={4} y={5.5} {...strokeProps} />
          <Line x1={8} x2={8} y1={3.5} y2={7.5} {...strokeProps} />
          <Line x1={16} x2={16} y1={3.5} y2={7.5} {...strokeProps} />
          <Line x1={4} x2={20} y1={9.5} y2={9.5} {...strokeProps} />
        </>
      )}
    </Svg>
  )
}

export function BookingFormulaMintAura({
  includeSkin = false,
  quiet = false,
  scope,
  testIDPrefix,
}: {
  includeSkin?: boolean
  quiet?: boolean
  scope: string
  testIDPrefix: string
}) {
  return (
    <View pointerEvents="none" style={[bookingStyles.bookingFormulaMintAura, quiet ? { opacity: 0 } : null]}>
      {includeSkin ? <SourceCardSkin testID={`${testIDPrefix}-card-skin`} /> : null}
      <CaseWideMintAura
        intensity="strong"
        scope={`${scope}Wide`}
        testID={`${testIDPrefix}-wide-mint-aura`}
      />
      <ZipMintAura scope={`${scope}Fine`} testID={`${testIDPrefix}-mint-aura`} />
    </View>
  )
}
