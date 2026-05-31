import { Redirect, Tabs, usePathname } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { CustomerV4DockOverlay } from '@/components/customer/customer-surfaces'
import { getCustomerThemeTokens, useCustomerThemeMode } from '@/components/customer/customer-theme'
import { useAuth } from '@/lib/auth-provider'
import { useAppLanguage } from '@/lib/app-language'

const CUSTOMER_DOCK_MAIN_A = 'CUSTOMER_DOCK_MAIN_A: V4 rounded glass dock with active surface'
const CUSTOMER_DARK_DOCK_LAYER_MATCH = 'CUSTOMER_DARK_DOCK_LAYER_MATCH: dock reads the same semantic V4 layers'
const CUSTOMER_DARK_DOCK_LAYER_V4 = 'CUSTOMER_DARK_DOCK_LAYER_V4: customer-dock-shadow-layer'
void CUSTOMER_DOCK_MAIN_A
void CUSTOMER_DARK_DOCK_LAYER_MATCH
void CUSTOMER_DARK_DOCK_LAYER_V4

const CUSTOMER_TAB_COPY = {
  vi: {
    booking: 'Yêu cầu',
    history: 'Hoạt động',
    home: 'Trang chủ',
    kael: 'Kael',
    profile: 'Hồ sơ',
  },
  en: {
    booking: 'Request',
    history: 'Activity',
    home: 'Home',
    kael: 'Kael',
    profile: 'Profile',
  },
} as const

function activeCustomerDockFromPath(pathname: string) {
  if (pathname.includes('booking')) return 'booking'
  if (pathname.includes('history')) return 'activity'
  if (pathname.includes('profile')) return 'profile'
  if (pathname.includes('kael')) return 'kael'
  return 'home'
}

export default function CustomerLayout() {
  const { loading, role, session } = useAuth()
  const language = useAppLanguage()
  const pathname = usePathname()
  const tabCopy = CUSTOMER_TAB_COPY[language]
  const themeMode = useCustomerThemeMode()
  const tokens = getCustomerThemeTokens(themeMode)
  const activeDock = activeCustomerDockFromPath(pathname)
  const showDock = !pathname.includes('kael')

  if (loading) {
    return (
      <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color={tokens.primary} size="large" />
      </View>
    )
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />
  }

  if (role === 'worker') {
    return <Redirect href="/(worker)/home" />
  }

  if (role === 'admin') {
    return <Redirect href="/(admin)/dashboard" />
  }

  // Phase 5.1 (plan §22.10.B, 2026-05-23): admin no longer auto-bypass customer
  // shell. Admin gets its own (admin) shell. Customer shell strictly requires
  // role='customer' to prevent accidental admin actions in customer surfaces.
  if (role !== 'customer') {
    return <Redirect href="/(auth)/login" />
  }

  return (
    <View style={{ flex: 1 }}>
      <Tabs tabBar={() => null} screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="home" options={{ title: tabCopy.home }} />
        <Tabs.Screen name="booking" options={{ title: tabCopy.booking }} />
        <Tabs.Screen name="kael" options={{ title: tabCopy.kael }} />
        <Tabs.Screen name="kael-chat" options={{ href: null, title: tabCopy.kael }} />
        <Tabs.Screen name="history" options={{ title: tabCopy.history }} />
        <Tabs.Screen name="profile" options={{ title: tabCopy.profile }} />
      </Tabs>
      {showDock ? <CustomerV4DockOverlay active={activeDock} /> : null}
    </View>
  )
}
