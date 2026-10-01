import { type ComponentProps } from 'react'
import { Platform, View, type ImageSourcePropType } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { KaelNavigationAccessory } from '@/components/ui/kael-navigation-accessory'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21TabCopy } from '../ui/copy'
import { customerV21DockStyles as dockStyles } from './dock-styles'
import type { LiquidNavFilledIconName } from './liquid-nav-filled-icons'
import { LiquidTabPlane } from './liquid-tab-plane'
import type { CustomerPrimaryTab } from '../ui/types'

type AnimatedViewStyle = ComponentProps<typeof Animated.View>['style']

const dockIconForTab: Record<CustomerPrimaryTab, LiquidNavFilledIconName> = {
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
  navItems: { image: ImageSourcePropType; key: CustomerPrimaryTab; route: string }[]
  onKaelPress: () => void
  onTabPress: (route: string) => void
  reduceMotion: boolean
  tokens: CustomerThemeTokens
}) {
  const insets = useSafeAreaInsets()
  const { reduceTransparency } = useGlassAccessibility()
  const dockBottom = Platform.OS === 'ios' ? insets.bottom + 12 : 12

  return (
    <View pointerEvents="box-none" style={[dockStyles.dockOverlay, { bottom: dockBottom }]} testID="customer-v21-dock-overlay">
      <Animated.View style={[dockStyles.dockRow, { width: liquidNavWidth }, animatedDockScrollStyle]} testID="customer-v21-liquid-navigation">
        <LiquidTabPlane
          items={navItems.map((item) => ({
            icon: dockIconForTab[item.key],
            key: item.key,
            label: customerV21TabCopy[language][item.key],
            testID: `customer-v21-dock-${item.key}`,
          }))}
          onSelect={(key) => {
            const route = navItems.find((item) => item.key === key)?.route
            if (route) onTabPress(route)
          }}
          reduceMotion={reduceMotion}
          reduceTransparency={reduceTransparency}
          selectedKey={activeTab}
          testID="customer-v21-primary-dock"
          tokens={tokens}
          width={liquidDockWidth}
        />
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
