import { type ComponentProps } from 'react'
import { Platform, View, type ImageSourcePropType } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { GlassSurface } from '@/components/ui/glass-surface'
import { KaelNavigationAccessory } from '@/components/ui/kael-navigation-accessory'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21TabCopy } from '../ui/copy'
import { CustomerV21DockTabButton } from './dock-surfaces'
import { customerV21DockStyles as dockStyles } from './dock-styles'
import type { LiquidNavIconName } from './liquid-nav-icons'
import type { CustomerPrimaryTab } from '../ui/types'

type AnimatedViewStyle = ComponentProps<typeof Animated.View>['style']

const dockIconForTab: Record<CustomerPrimaryTab, LiquidNavIconName> = {
  activity: 'activity',
  home: 'home',
  profile: 'profile',
  services: 'services',
}

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
  tokens,
}: {
  activeTab: CustomerPrimaryTab | null
  animatedDockScrollStyle: AnimatedViewStyle
  kaelActive: boolean
  language: AppLanguage
  liquidDockWidth: number
  liquidNavWidth: number
  mode: CustomerThemeTokens['mode']
  navItems: { image: ImageSourcePropType; key: CustomerPrimaryTab; route: string }[]
  onKaelPress: () => void
  onTabPress: (route: string) => void
  reduceMotion: boolean
  tokens: CustomerThemeTokens
}) {
  const insets = useSafeAreaInsets()
  const dockBottom = Platform.OS === 'ios' ? insets.bottom + 12 : 12

  return (
    <View pointerEvents="box-none" style={[dockStyles.dockOverlay, { bottom: dockBottom }]} testID="customer-v21-dock-overlay">
      <Animated.View style={[dockStyles.dockRow, { width: liquidNavWidth }, animatedDockScrollStyle]} testID="customer-v21-liquid-navigation">
        <GlassSurface
          backgroundColor={tokens.glass}
          borderColor={tokens.glassBorder}
          material="liquid"
          mode={mode}
          style={[dockStyles.dockPlane, { width: liquidDockWidth }]}
          testID="customer-v21-primary-dock"
          variant="nav"
        >
          {navItems.map((item) => {
            const selected = activeTab === item.key
            const label = customerV21TabCopy[language][item.key]
            return (
              <CustomerV21DockTabButton
                icon={dockIconForTab[item.key]}
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
        <KaelNavigationAccessory
          accessibilityLabel={customerV21TabCopy[language].kael}
          active={kaelActive}
          onPress={onKaelPress}
          reduceMotion={reduceMotion}
          style={[dockStyles.kaelAccessory, kaelActive ? dockStyles.kaelAccessoryActive : null]}
          testID="customer-v21-kael-accessory"
          visualRole="customer"
        />
      </Animated.View>
    </View>
  )
}
