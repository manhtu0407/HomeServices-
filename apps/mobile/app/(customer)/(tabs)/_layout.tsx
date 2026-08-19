import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { Slot, usePathname } from 'expo-router'
import { Platform, View } from 'react-native'
import { CustomerDockOverlay, type CustomerDockActive } from '@/components/customer/customer-surfaces'
import { getCustomerThemeTokens, useCustomerThemeMode } from '@/components/customer/customer-theme'
import { customerV21TabCopy } from '@/components/customer/ui/copy'
import { DockScrollStateProvider } from '@/components/ui/dock-scroll-state'
import { NativeKaelBottomAccessory } from '@/components/ui/native-kael-bottom-accessory'
import { color } from '@/design/theme'
import { useAppLanguage } from '@/lib/app-language'

function activeCustomerDockFromPath(pathname: string): CustomerDockActive {
  if (pathname.includes('booking')) return 'services'
  if (pathname.includes('history')) return 'activity'
  if (pathname.includes('profile')) return 'profile'
  return 'home'
}

function CustomerNativeTabs() {
  const language = useAppLanguage()
  const tabCopy = customerV21TabCopy[language]

  return (
    <NativeTabs tintColor={color.brand.ios26TabTint} minimizeBehavior="never">
      <NativeTabs.BottomAccessory>
        <NativeKaelBottomAccessory route="/(customer)/kael-chat?mode=normal" visualRole="customer" />
      </NativeTabs.BottomAccessory>
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Icon sf="house" />
        <NativeTabs.Trigger.Label>{tabCopy.home}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="booking">
        <NativeTabs.Trigger.Icon sf="square.grid.2x2" />
        <NativeTabs.Trigger.Label>{tabCopy.services}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="history">
        <NativeTabs.Trigger.Icon sf="clock" />
        <NativeTabs.Trigger.Label>{tabCopy.activity}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf="person" />
        <NativeTabs.Trigger.Label>{tabCopy.profile}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}

function CustomerFallbackTabs() {
  const themeMode = useCustomerThemeMode()
  const tokens = getCustomerThemeTokens(themeMode)
  const pathname = usePathname()
  const activeDock = activeCustomerDockFromPath(pathname)

  return (
    <DockScrollStateProvider>
      <View style={{ backgroundColor: tokens.canvas, flex: 1 }}>
        <Slot />
        <CustomerDockOverlay active={activeDock} />
      </View>
    </DockScrollStateProvider>
  )
}

export default function CustomerTabsLayout() {
  return Platform.OS === 'ios' ? <CustomerNativeTabs /> : <CustomerFallbackTabs />
}
