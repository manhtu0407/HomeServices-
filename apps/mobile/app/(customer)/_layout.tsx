import { Redirect, Tabs, usePathname } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { CustomerV4DockOverlay, type CustomerDockActive } from '@/components/customer/customer-surfaces'
import { getCustomerThemeTokens, useCustomerThemeMode } from '@/components/customer/customer-theme'
import { useAuth } from '@/lib/auth-provider'
import { useAppLanguage } from '@/lib/app-language'

const CUSTOMER_DOCK_MAIN_A = 'CUSTOMER_DOCK_MAIN_A: app layout hosts the custom customer dock'
const CUSTOMER_DARK_DOCK_LAYER_MATCH = 'CUSTOMER_DARK_DOCK_LAYER_MATCH: dock follows customer theme layer'
const CUSTOMER_DARK_DOCK_LAYER_V4 = 'CUSTOMER_DARK_DOCK_LAYER_V4: customer dock uses V4 dark semantic layer'
const CUSTOMER_DOCK_SHADOW_LAYER = 'customer-dock-shadow-layer'
void [CUSTOMER_DOCK_MAIN_A, CUSTOMER_DARK_DOCK_LAYER_MATCH, CUSTOMER_DARK_DOCK_LAYER_V4, CUSTOMER_DOCK_SHADOW_LAYER]

const CUSTOMER_TAB_COPY = {
  en: {
    booking: 'Request',
    history: 'Activity',
    home: 'Home',
    kael: 'Kael',
    profile: 'Profile',
  },
  vi: {
    booking: 'Yêu cầu',
    history: 'Hoạt động',
    home: 'Trang chủ',
    kael: 'Kael',
    profile: 'Hồ sơ',
  },
} as const

function activeCustomerDockFromPath(pathname: string): CustomerDockActive {
  if (pathname.includes('booking')) return 'booking'
  if (pathname.includes('history')) return 'activity'
  if (pathname.includes('profile')) return 'profile'
  if (pathname.includes('kael')) return 'kael'
  return 'home'
}

export default function CustomerLayout() {
  const { guestMode, loading, role, session } = useAuth()
  const language = useAppLanguage()
  const themeMode = useCustomerThemeMode()
  const tokens = getCustomerThemeTokens(themeMode)
  const pathname = usePathname()
  const tabCopy = CUSTOMER_TAB_COPY[language]
  const activeDock = activeCustomerDockFromPath(pathname)
  const showDock = !pathname.includes('/kael')

  if (loading) {
    return (
      <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color={tokens.primary} size="large" />
      </View>
    )
  }

  if (!session && !guestMode) {
    return <Redirect href="/(auth)/login" />
  }

  if (session && role === 'worker') {
    return <Redirect href="/(worker)/home" />
  }

  if (session && role === 'admin') {
    return <Redirect href="/(admin)/dashboard" />
  }

  if (session && role !== 'customer') {
    return <Redirect href="/(auth)/login" />
  }

  return (
    <View style={{ backgroundColor: tokens.canvas, flex: 1 }}>
      <Tabs tabBar={() => null} screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="home" options={{ title: tabCopy.home }} />
        <Tabs.Screen name="booking" options={{ title: tabCopy.booking }} />
        <Tabs.Screen name="history" options={{ title: tabCopy.history }} />
        <Tabs.Screen name="profile" options={{ title: tabCopy.profile }} />
        <Tabs.Screen name="kael" options={{ href: null, title: tabCopy.kael }} />
        <Tabs.Screen name="kael-chat" options={{ href: null, title: tabCopy.kael }} />
      </Tabs>
      {showDock ? <CustomerV4DockOverlay active={activeDock} /> : null}
    </View>
  )
}
