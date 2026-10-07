import { Slot, usePathname } from 'expo-router'
import { View } from 'react-native'
import { CustomerDockOverlay, type CustomerDockActive } from '@/components/customer/customer-surfaces'
import { getCustomerThemeTokens, useCustomerThemeMode } from '@/components/customer/customer-theme'
import { DockScrollStateProvider } from '@/components/ui/dock-scroll-state'
import { OfflineStatusPill } from '@/components/ui/offline-status-pill'

function activeCustomerDockFromPath(pathname: string): CustomerDockActive {
  if (pathname.includes('booking')) return 'services'
  if (pathname.includes('history')) return 'activity'
  if (pathname.includes('profile')) return 'profile'
  return 'home'
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
        <OfflineStatusPill tokens={tokens} />
      </View>
    </DockScrollStateProvider>
  )
}

export default function CustomerTabsLayout() {
  return <CustomerFallbackTabs />
}
