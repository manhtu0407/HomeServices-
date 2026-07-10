import { useRef, type ComponentProps } from 'react'
import { Pressable, View, type ImageSourcePropType, type ViewStyle } from 'react-native'
import Animated from 'react-native-reanimated'

import { GlassSurface } from '@/components/ui/glass-surface'
import { KaelCoreV9, type KaelCoreV9Handle } from '@/components/ui/kael-core-v9'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21TabCopy } from './copy'
import { CustomerV21DockTabButton } from './dock-surfaces'
import { customerV21DockStyles as dockStyles } from './dock-styles'
import type { CustomerPrimaryTab } from './types'

type AnimatedViewStyle = ComponentProps<typeof Animated.View>['style']

export function CustomerV21DockOverlayView({
  activeTab,
  animatedDockCausticStyle,
  animatedDockShimmerStyle,
  animatedDockScrollStyle,
  animatedLensSheenStyle,
  animatedLensStyle,
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
  reduceMotion,
  selectedIndex,
  tokens,
}: {
  activeTab: CustomerPrimaryTab | null
  animatedDockCausticStyle: AnimatedViewStyle
  animatedDockShimmerStyle: AnimatedViewStyle
  animatedDockScrollStyle: AnimatedViewStyle
  animatedLensSheenStyle: AnimatedViewStyle
  animatedLensStyle: AnimatedViewStyle
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
  reduceMotion: boolean
  selectedIndex: number
  tokens: CustomerThemeTokens
}) {
  const kaelRef = useRef<KaelCoreV9Handle>(null)
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
    | 'dockShimmer',
    ViewStyle
  >

  return (
    <View pointerEvents="box-none" style={dockStyles.dockOverlay} testID="customer-v21-dock-overlay">
      <Animated.View style={[liquidDockStyles.dockRow, { width: liquidNavWidth }, animatedDockScrollStyle]} testID="customer-v21-liquid-navigation">
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
        onFocus={() => kaelRef.current?.bow('focus')}
        onHoverIn={() => kaelRef.current?.bow('proximity')}
        onPress={onKaelPress}
        onPressIn={() => kaelRef.current?.bow('pointer-press')}
        style={[dockStyles.kaelAccessory, kaelActive ? dockStyles.kaelAccessoryActive : null]}
        testID="customer-v21-kael-accessory"
      >
        <KaelCoreV9 reduceMotion={reduceMotion} ref={kaelRef} testID="customer-v21-kael-core-v9" />
      </Pressable>
      </Animated.View>
    </View>
  )
}
