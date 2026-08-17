import { useRef, useState, type ComponentProps } from 'react'
import { Pressable, View, type LayoutChangeEvent } from 'react-native'
import Animated from 'react-native-reanimated'

import { GlassSurface } from '@/components/ui/glass-surface'
import { KaelCoreV9 } from '@/components/ui/kael-core-v9'
import type { KaelCoreV9Handle } from '@/components/ui/kael-core-v9-contract'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21TabCopy } from '../ui/copy'
import { CustomerV21DockTabButton } from './dock-surfaces'
import { customerV21DockStyles as dockStyles } from './dock-styles'
import { LiquidSelectionLens } from './liquid-selection-lens'
import type { LiquidNavIconName } from './liquid-nav-icons'
import type { CustomerPrimaryTab } from '../ui/types'

type AnimatedViewStyle = ComponentProps<typeof Animated.View>['style']

export function CustomerV21DockOverlayView({
  activeTab,
  animatedDockScrollStyle,
  kaelActive,
  language,
  liquidDockWidth,
  liquidNavWidth,
  mode,
  navItems,
  onKaelPress,
  onTabPress,
  reduceMotion,
  reduceTransparency,
  tokens,
}: {
  activeTab: CustomerPrimaryTab | null
  animatedDockScrollStyle: AnimatedViewStyle
  kaelActive: boolean
  language: AppLanguage
  liquidDockWidth: number
  liquidNavWidth: number
  mode: CustomerThemeTokens['mode']
  navItems: { icon: LiquidNavIconName; key: CustomerPrimaryTab; route: string }[]
  onKaelPress: () => void
  onTabPress: (route: string) => void
  reduceMotion: boolean
  reduceTransparency: boolean
  tokens: CustomerThemeTokens
}) {
  const kaelRef = useRef<KaelCoreV9Handle>(null)
  const [surfaceWidth, setSurfaceWidth] = useState(0)
  const selectedIndex = activeTab === null ? null : Math.max(navItems.findIndex((item) => item.key === activeTab), 0)
  const handleDockLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => setSurfaceWidth(layout.width)

  return (
    <View pointerEvents="box-none" style={dockStyles.dockOverlay} testID="customer-v21-dock-overlay">
      <Animated.View style={[dockStyles.dockRow, { width: liquidNavWidth }, animatedDockScrollStyle]} testID="customer-v21-liquid-navigation">
        <GlassSurface
          backgroundColor={tokens.glass}
          borderColor={tokens.glassBorder}
          material="liquid"
          mode={mode}
          onLayout={handleDockLayout}
          style={[dockStyles.dockPlane, { width: liquidDockWidth }]}
          testID="customer-v21-primary-dock"
          variant="nav"
        >
          <LiquidSelectionLens
            itemCount={navItems.length}
            reduceMotion={reduceMotion}
            reduceTransparency={reduceTransparency}
            selectedIndex={selectedIndex}
            surfaceWidth={surfaceWidth}
            testID="customer-v21-dock"
          />
          {navItems.map((item) => {
            const selected = activeTab === item.key
            const label = customerV21TabCopy[language][item.key]
            return (
              <CustomerV21DockTabButton
                icon={item.icon}
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
