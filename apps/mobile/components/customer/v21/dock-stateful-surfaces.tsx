import type { ComponentProps } from 'react'
import { Image, Pressable, View, type ImageSourcePropType, type ViewStyle } from 'react-native'
import Animated from 'react-native-reanimated'

import { GlassSurface } from '@/components/ui/glass-surface'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21Assets } from './assets'
import { customerV21TabCopy } from './copy'
import { CustomerV21DockTabButton } from './dock-surfaces'
import { customerV21DockStyles as dockStyles } from './dock-styles'
import type { CustomerPrimaryTab } from './types'

type AnimatedViewStyle = ComponentProps<typeof Animated.View>['style']

export function CustomerV21DockOverlayView({
  activeTab,
  animatedDockCausticStyle,
  animatedDockShimmerStyle,
  animatedLensSheenStyle,
  animatedLensStyle,
  animatedOrbRippleStyle,
  animatedOrbSheenStyle,
  animatedOrbStyle,
  dockCausticLeft,
  dockCausticWidth,
  kaelActive,
  language,
  liquidDockWidth,
  liquidNavWidth,
  mode,
  navItems,
  onKaelPress,
  onTabPress,
  reduceTransparency,
  selectedIndex,
  tokens,
}: {
  activeTab: CustomerPrimaryTab | null
  animatedDockCausticStyle: AnimatedViewStyle
  animatedDockShimmerStyle: AnimatedViewStyle
  animatedLensSheenStyle: AnimatedViewStyle
  animatedLensStyle: AnimatedViewStyle
  animatedOrbRippleStyle: AnimatedViewStyle
  animatedOrbSheenStyle: AnimatedViewStyle
  animatedOrbStyle: AnimatedViewStyle
  dockCausticLeft: number
  dockCausticWidth: number
  kaelActive: boolean
  language: AppLanguage
  liquidDockWidth: number
  liquidNavWidth: number
  mode: CustomerThemeTokens['mode']
  navItems: Array<{ image: ImageSourcePropType; key: CustomerPrimaryTab; route: string }>
  onKaelPress: () => void
  onTabPress: (route: string) => void
  reduceTransparency: boolean
  selectedIndex: number
  tokens: CustomerThemeTokens
}) {
  const liquidDockStyles = dockStyles as typeof dockStyles & Record<
    | 'dockCaustic'
    | 'dockCausticGlow'
    | 'dockCausticSweep'
    | 'dockCausticSweepBright'
    | 'dockInnerRefraction'
    | 'dockLens'
    | 'dockLensBloom'
    | 'dockLensInnerShadow'
    | 'dockLensSheen'
    | 'dockLensTopLight'
    | 'dockRow'
    | 'dockShimmer'
    | 'kaelAccessoryBackdrop'
    | 'kaelAccessoryCaustic'
    | 'kaelAccessoryFrontRim'
    | 'kaelAccessoryGlint'
    | 'kaelAccessoryGlobeTop'
    | 'kaelAccessoryOrbit',
    ViewStyle
  >
  const liquidOrbStyles = dockStyles as typeof dockStyles & Record<
    | 'kaelAccessoryOrbitBack'
    | 'kaelAccessoryOrbMotion'
    | 'kaelAccessoryPearl'
    | 'kaelAccessoryRipple'
    | 'kaelAccessoryStatus'
    | 'kaelAccessoryStatusHalo'
    | 'kaelAccessoryStatusWave',
    ViewStyle
  >

  return (
    <View pointerEvents="box-none" style={dockStyles.dockOverlay} testID="customer-v21-dock-overlay">
      <View style={[liquidDockStyles.dockRow, { width: liquidNavWidth }]} testID="customer-v21-liquid-navigation">
      <GlassSurface
        backgroundColor={tokens.glass}
        borderColor={tokens.glassBorder}
        material="liquid"
        mode={mode}
        style={[dockStyles.dockPlane, { width: liquidDockWidth }]}
        testID="customer-v21-primary-dock"
        variant="nav"
      >
        <Animated.View pointerEvents="none" style={[liquidDockStyles.dockShimmer, { width: liquidDockWidth * 0.72 }, animatedDockShimmerStyle]} testID="customer-v21-dock-shimmer" />
        <View pointerEvents="none" style={liquidDockStyles.dockCaustic} testID="customer-v21-dock-caustic">
          <Animated.View pointerEvents="none" style={[liquidDockStyles.dockCausticGlow, { left: dockCausticLeft, width: dockCausticWidth }, animatedDockCausticStyle]} testID="customer-v21-dock-caustic-glow" />
          <View pointerEvents="none" style={liquidDockStyles.dockCausticSweep} testID="customer-v21-dock-caustic-sweep" />
          <View pointerEvents="none" style={liquidDockStyles.dockCausticSweepBright} testID="customer-v21-dock-caustic-sweep-bright" />
        </View>
        <View pointerEvents="none" style={liquidDockStyles.dockInnerRefraction} testID="customer-v21-dock-inner-refraction" />
        {selectedIndex >= 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              liquidDockStyles.dockLens,
              animatedLensStyle,
            ]}
            testID="customer-v21-dock-lens"
          >
            <View pointerEvents="none" style={liquidDockStyles.dockLensBloom} testID="customer-v21-dock-lens-bloom" />
            <View pointerEvents="none" style={liquidDockStyles.dockLensTopLight} testID="customer-v21-dock-lens-top-light" />
            <Animated.View pointerEvents="none" style={[liquidDockStyles.dockLensSheen, animatedLensSheenStyle]} testID="customer-v21-dock-lens-sheen" />
            <View pointerEvents="none" style={liquidDockStyles.dockLensInnerShadow} testID="customer-v21-dock-lens-inner-shadow" />
          </Animated.View>
        ) : null}
        {navItems.map((item) => {
          const selected = activeTab === item.key
          const label = customerV21TabCopy[language][item.key]
          return (
            <CustomerV21DockTabButton
              image={item.image}
              key={item.key}
              label={label}
              onPress={() => onTabPress(item.route)}
              selected={selected}
              testID={`customer-v21-dock-${item.key}`}
              tokens={tokens}
            />
          )
        })}
      </GlassSurface>
      <Pressable
        accessibilityLabel={customerV21TabCopy[language].kael}
        accessibilityRole="button"
        accessibilityState={{ selected: kaelActive }}
        onPress={onKaelPress}
        style={({ pressed }) => [dockStyles.kaelAccessory, kaelActive ? dockStyles.kaelAccessoryActive : null, pressed ? dockStyles.kaelAccessoryPressed : null]}
        testID="customer-v21-kael-accessory"
      >
        {!reduceTransparency ? <View pointerEvents="none" style={[dockStyles.kaelAccessoryAura, kaelActive ? dockStyles.kaelAccessoryAuraActive : null]} testID="customer-v21-kael-accessory-aura" /> : null}
        <View pointerEvents="none" style={[liquidDockStyles.kaelAccessoryOrbit, liquidOrbStyles.kaelAccessoryOrbitBack, kaelActive ? dockStyles.kaelAccessoryOrbitActive : null]} testID="customer-v21-kael-accessory-orbit-back">
          <View pointerEvents="none" style={liquidOrbStyles.kaelAccessoryPearl} testID="customer-v21-kael-accessory-orbit-back-pearl" />
        </View>
        <View pointerEvents="none" style={[liquidDockStyles.kaelAccessoryOrbit, kaelActive ? dockStyles.kaelAccessoryOrbitActive : null]} testID="customer-v21-kael-accessory-orbit-front">
          <View pointerEvents="none" style={liquidOrbStyles.kaelAccessoryPearl} testID="customer-v21-kael-accessory-orbit-front-pearl" />
        </View>
        <Animated.View pointerEvents="none" style={[liquidOrbStyles.kaelAccessoryRipple, animatedOrbRippleStyle]} testID="customer-v21-kael-accessory-ripple" />
        <Animated.View style={[liquidOrbStyles.kaelAccessoryOrbMotion, animatedOrbStyle]}>
        <GlassSurface
          backgroundColor={tokens.glassStrong}
          borderColor={tokens.glassBorder}
          material="liquid"
          mode={mode}
          style={[dockStyles.kaelAccessoryGlass, kaelActive ? dockStyles.kaelAccessoryGlassActive : null]}
          testID="customer-v21-kael-accessory-glass"
          variant="control"
        >
          <View pointerEvents="none" style={liquidDockStyles.kaelAccessoryBackdrop} testID="customer-v21-kael-accessory-backdrop" />
          <View pointerEvents="none" style={liquidDockStyles.kaelAccessoryCaustic} testID="customer-v21-kael-accessory-caustic" />
          <View pointerEvents="none" style={liquidDockStyles.kaelAccessoryGlobeTop} testID="customer-v21-kael-accessory-globe-top" />
          <Image resizeMode="contain" source={customerV21Assets.kaelNavigation} style={dockStyles.kaelAccessoryImage} />
          <Animated.View pointerEvents="none" style={[liquidDockStyles.kaelAccessoryGlint, animatedOrbSheenStyle]} testID="customer-v21-kael-accessory-glint" />
          <View pointerEvents="none" style={liquidDockStyles.kaelAccessoryFrontRim} testID="customer-v21-kael-accessory-front-rim" />
          <View pointerEvents="none" style={liquidOrbStyles.kaelAccessoryStatusHalo} testID="customer-v21-kael-accessory-status-halo" />
          <View pointerEvents="none" style={liquidOrbStyles.kaelAccessoryStatusWave} testID="customer-v21-kael-accessory-status-wave" />
          <View pointerEvents="none" style={liquidOrbStyles.kaelAccessoryStatus} testID="customer-v21-kael-accessory-status" />
        </GlassSurface>
        </Animated.View>
      </Pressable>
      </View>
    </View>
  )
}
