import { Redirect, Tabs, usePathname } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { CustomerV21DockOverlay, type CustomerDockActive } from '@/components/customer/customer-surfaces'
import { color } from '@/design/theme'
import { useAuth } from '@/lib/auth-provider'
import { useAppLanguage } from '@/lib/app-language'

const CUSTOMER_TAB_COPY = {
  en: {
    booking: 'Services',
    history: 'Activity',
    home: 'Home',
    kael: 'Kael',
    profile: 'Profile',
  },
  vi: {
    booking: 'Dịch vụ',
    history: 'Hoạt động',
    home: 'Trang chủ',
    kael: 'Kael',
    profile: 'Hồ sơ',
  },
} as const

function activeCustomerDockFromPath(pathname: string): CustomerDockActive {
  if (pathname.includes('booking')) return 'services'
  if (pathname.includes('history')) return 'activity'
  if (pathname.includes('profile')) return 'profile'
  if (pathname.includes('kael')) return 'chat'
  return 'home'
}

export default function CustomerLayout() {
  const { guestMode, loading, role, session } = useAuth()
  const language = useAppLanguage()
  const pathname = usePathname()
  const tabCopy = CUSTOMER_TAB_COPY[language]
  const activeDock = activeCustomerDockFromPath(pathname)
  const showDock = !pathname.includes('/kael')

  if (loading) {
    return (
      <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color={color.brand.primary} size="large" />
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
    <View style={{ flex: 1 }}>
      <Tabs tabBar={() => null} screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="home" options={{ title: tabCopy.home }} />
        <Tabs.Screen name="booking" options={{ title: tabCopy.booking }} />
        <Tabs.Screen name="history" options={{ title: tabCopy.history }} />
        <Tabs.Screen name="profile" options={{ title: tabCopy.profile }} />
        <Tabs.Screen name="kael" options={{ href: null, title: tabCopy.kael }} />
        <Tabs.Screen name="kael-chat" options={{ href: null, title: tabCopy.kael }} />
      </Tabs>
      {showDock ? <CustomerV21DockOverlay active={activeDock} /> : null}
    </View>
  )
}
