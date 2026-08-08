import {
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'

import { motionTokens } from '@/components/ui/motion-tokens'

type Props = Omit<ViewProps, 'style'> & {
  reduceMotion: boolean
  style?: StyleProp<ViewStyle>
  transitionKey: string
}

// Remounting on a state key makes the Hero chip and feedback enter on the same liquid timeline.
export function KaelLiquidStatusTransition({
  reduceMotion,
  style,
  transitionKey,
  ...props
}: Props) {
  const entering = reduceMotion
    ? undefined
    : FadeInDown
      .duration(motionTokens.stateChange.durationMs)
      .withInitialValues({
        opacity: 0,
        transform: [{ translateY: 5 }],
      })

  return (
    <Animated.View
      key={transitionKey}
      {...props}
      entering={entering}
      style={style}
    />
  )
}
