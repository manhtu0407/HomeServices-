import { StyleSheet, View } from 'react-native'
import { KaelLottieView, kaelLottieRendererKind } from '@/components/kael/kael-svg-lottie-view'
import { useEntryAccessibility } from './components/materials'

type LottieAsset = {
  fr?: number
  h: number
  ip?: number
  markers?: { cm?: string; dr?: number; tm?: number }[]
  nm?: string
  op?: number
  w: number
}

const auroraNestLogoLottie = require('@/assets/lottie/nestscout-aurora-nest-north-star-awakening.json') as LottieAsset

export function LottieLogoMark({ size, testID }: { size: number; testID: string }) {
  const { reduceMotion } = useEntryAccessibility()
  const logoHeight = Math.round(size * (auroraNestLogoLottie.h / auroraNestLogoLottie.w))
  const duration = lottieDurationSeconds(auroraNestLogoLottie)
  const shouldAnimate = kaelLottieRendererKind !== 'fallback' && !reduceMotion
  const assetLabel = `${auroraNestLogoLottie.nm ?? 'NestScout Aurora Nest'} ${auroraNestLogoLottie.w}x${auroraNestLogoLottie.h}${duration ? ` ${duration}s` : ''}`

  return (
    <View accessibilityLabel={assetLabel} style={[styles.logoMotion, { height: logoHeight, width: size }]} testID={testID}>
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

function lottieDurationSeconds(asset: LottieAsset) {
  if (!asset.fr || asset.fr <= 0 || typeof asset.ip !== 'number' || typeof asset.op !== 'number') return null
  return Number(((asset.op - asset.ip) / asset.fr).toFixed(1))
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
