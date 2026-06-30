import type { ComponentProps } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import LottieView from 'lottie-react-native'

export type KaelLottieSource = object | string | number

export const kaelLottieRendererKind: 'fallback' | 'native-lottie' = 'native-lottie'

type NativeLottieSource = ComponentProps<typeof LottieView>['source']

type KaelLottieViewProps = {
  autoPlay?: boolean
  loop?: boolean
  resizeMode?: 'cover' | 'contain' | 'center'
  source: KaelLottieSource
  speed?: number
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function KaelLottieView({
  autoPlay = true,
  loop = false,
  resizeMode = 'contain',
  source,
  speed = 1,
  style,
  testID,
}: KaelLottieViewProps) {
  return (
    <LottieView
      autoPlay={autoPlay}
      loop={loop}
      resizeMode={resizeMode}
      source={source as NativeLottieSource}
      speed={speed}
      style={style}
      testID={testID}
    />
  )
}
