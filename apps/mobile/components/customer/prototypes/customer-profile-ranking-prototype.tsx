import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Svg, { Defs, Rect } from 'react-native-svg'

import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient } from '@/components/ui/svg-alpha-stop'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { scaledTypography } from '@/design/theme'

import { ProfileAuraCard } from '../profile/profile-utility-surfaces'
import { customerV21Assets } from '../ui/assets'
import { useCustomerV21SurfaceTheme, V21Screen } from '../ui/shared-surfaces'

const CARD_ASPECT_RATIO = 0.59

export function CustomerProfileRankingPrototype() {
  const router = useRouter()
  const { width: viewportWidth } = useWindowDimensions()
  const { reduceMotion, tokens } = useCustomerV21SurfaceTheme()
  const { reduceTransparency } = useGlassAccessibility()
  const cardWidth = Math.min(Math.max(viewportWidth - 32, 280), 620)
  const cardHeight = Math.min(Math.max(cardWidth * CARD_ASPECT_RATIO, 190), 278)
  const textScale = Math.max(0.86, Math.min(1.14, cardWidth / 430))

  return (
    <V21Screen
      frameStyle={styles.frame}
      screenId="6.1-profile-overview"
      testID="customer-profile-ranking-prototype"
    >
      <Pressable
        accessibilityLabel="Xếp hạng sử dụng. 675 trên 1.000 điểm. Mở chi tiết xếp hạng."
        accessibilityRole="button"
        onPress={() => router.replace({
          pathname: '/(customer)/profile',
          params: { panel: 'ranking' },
        } as never)}
        testID="customer-profile-ranking-prototype-cta"
      >
        {({ pressed }) => (
          <ProfileAuraCard
            cardStyle={[
              styles.card,
              { borderColor: reduceTransparency ? tokens.border : 'rgba(74,218,197,0.48)', height: cardHeight, width: cardWidth },
              pressed && !reduceMotion ? styles.pressed : null,
            ]}
            contentStyle={[styles.cardContent, { height: cardHeight, width: cardWidth }]}
            scope="RankingPrototype"
            showCardSkin={false}
            testID="customer-profile-ranking-prototype-card"
          >
            <View pointerEvents="none" style={[styles.artworkLayer, { height: cardHeight, width: cardWidth * 0.57 }]} testID="customer-profile-ranking-prototype-workart">
              <Image
                accessible={false}
                contentFit="contain"
                source={customerV21Assets.usageRankingWorkart}
                style={styles.artwork}
              />
            </View>

            <View pointerEvents="none" style={[styles.fadeLayer, { height: cardHeight, left: cardWidth * 0.28, width: cardWidth * 0.42 }]}>
              <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" width="100%">
                <Defs>
                  <LinearGradient id="customer-profile-ranking-prototype-fade" x1="0" x2="1" y1="0.5" y2="0.5">
                    <Stop offset="0" stopColor={reduceTransparency ? '#FFFFFF' : '#F5FFFD'} stopOpacity="0" />
                    <Stop offset="1" stopColor={reduceTransparency ? '#FFFFFF' : '#FFFFFF'} stopOpacity="0.96" />
                  </LinearGradient>
                </Defs>
                <Rect fill="url(#customer-profile-ranking-prototype-fade)" height="100" width="100" x="0" y="0" />
              </Svg>
            </View>

            <View pointerEvents="none" style={[styles.copy, { left: cardWidth * 0.53, right: cardWidth * 0.06 }]} testID="customer-profile-ranking-prototype-copy">
              <Text numberOfLines={2} style={[scaledTypography('title3', textScale), styles.title, { color: tokens.text }]}>
                Xếp hạng sử dụng
              </Text>
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                numberOfLines={1}
                style={[scaledTypography('title2', Math.min(1.22, textScale * 1.18)), styles.points, { color: tokens.primary }]}
              >
                675 / 1.000 điểm
              </Text>
            </View>
          </ProfileAuraCard>
        )}
      </Pressable>
    </V21Screen>
  )
}

const styles = StyleSheet.create({
  artwork: {
    height: '100%',
    transform: [{ scale: 1.14 }],
    width: '100%',
  },
  artworkLayer: {
    alignItems: 'center',
    justifyContent: 'center',
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
    zIndex: 1,
  },
  card: {
    alignSelf: 'center',
    borderRadius: 24,
    marginTop: 4,
    padding: 0,
    boxShadow: '0px 14px 24px rgba(8,125,114,0.14)',
  },
  cardContent: {
    overflow: 'hidden',
    position: 'relative',
  },
  copy: {
    alignItems: 'flex-start',
    bottom: 0,
    justifyContent: 'center',
    minWidth: 0,
    position: 'absolute',
    top: 0,
    zIndex: 3,
  },
  fadeLayer: {
    position: 'absolute',
    top: 0,
    zIndex: 2,
  },
  frame: {
    alignItems: 'center',
  },
  points: {
    fontWeight: '700',
    marginTop: 10,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  title: {
    fontWeight: '600',
  },
})
