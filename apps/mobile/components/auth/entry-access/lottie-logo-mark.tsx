import { StyleSheet, View } from 'react-native'
import { KaelLottieView, kaelLottieRendererKind } from '@/components/kael/kael-svg-lottie-view'
import { useAppLanguage } from '@/lib/app-language'
import { useEntryAccessibility } from './components/materials'
import { entryAccessCopy } from './copy'

type LottieAsset = {
  h: number
  w: number
}

const auroraNestLogoLottie = require('@/assets/lottie/nestscout-aurora-nest-north-star-awakening.json') as LottieAsset

export function LottieLogoMark({ size, testID }: { size: number; testID: string }) {
  const language = useAppLanguage()
  const { reduceMotion } = useEntryAccessibility()
  const logoHeight = Math.round(size * (auroraNestLogoLottie.h / auroraNestLogoLottie.w))
  const shouldAnimate = kaelLottieRendererKind !== 'fallback' && !reduceMotion

  return (
    <View accessibilityLabel={entryAccessCopy[language].accessibility.logo} style={[styles.logoMotion, { height: logoHeight, width: size }]} testID={testID}>
      <KaelLottieView
        autoPlay={shouldAnimate}
        loop={shouldAnimate}
        resizeMode="contain"
        source={auroraNestLogoLottie}
        style={styles.logoExactImage}
        testID={shouldAnimate ? `${testID}-lottie` : `${testID}-static`}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  logoExactImage: {
    height: '100%',
    width: '100%',
  },
  logoMotion: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    overflow: 'hidden',
  },
})
