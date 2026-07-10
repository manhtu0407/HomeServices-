import { Redirect, Tabs, usePathname } from 'expo-router'
import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { CustomerDockOverlay, type CustomerDockActive } from '@/components/customer/customer-surfaces'
import { getCustomerThemeTokens, useCustomerThemeMode } from '@/components/customer/customer-theme'
import { DockScrollStateProvider } from '@/components/ui/dock-scroll-state'
import { useAuth } from '@/lib/auth-provider'
import { useAppLanguage } from '@/lib/app-language'
import { mobileRuntimeConfig } from '@/lib/runtime-config'

const CUSTOMER_DOCK_MAIN_A = 'CUSTOMER_DOCK_MAIN_A: app layout hosts the custom customer dock'
const CUSTOMER_DARK_DOCK_LAYER_MATCH = 'CUSTOMER_DARK_DOCK_LAYER_MATCH: dock follows customer theme layer'
const CUSTOMER_DARK_DOCK_LAYER = 'CUSTOMER_DARK_DOCK_LAYER: customer dock follows the current semantic layer'
const CUSTOMER_DOCK_SHADOW_LAYER = 'customer-dock-shadow-layer'
void [CUSTOMER_DOCK_MAIN_A, CUSTOMER_DARK_DOCK_LAYER_MATCH, CUSTOMER_DARK_DOCK_LAYER, CUSTOMER_DOCK_SHADOW_LAYER]

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
  if (pathname.includes('booking')) return 'services'
  if (pathname.includes('history')) return 'activity'
  if (pathname.includes('profile')) return 'profile'
  if (pathname.includes('kael')) return 'chat'
  return 'home'
}

function runtimeBuildMarkerText() {
  const info = mobileRuntimeConfig.runtimeBuildInfo
  const sha = info.gitShortSha || (info.gitSha ? info.gitSha.slice(0, 12) : '') || 'unknown'
  const parts = [`SHA ${sha}`]

  if (info.gitBranch) parts.push(`Branch ${info.gitBranch}`)
  if (info.easBuildProfile) parts.push(`Profile ${info.easBuildProfile}`)
  if (info.easBuildPlatform) parts.push(`Platform ${info.easBuildPlatform}`)
  if (info.easBuildId) parts.push(`Build ${info.easBuildId}`)
  if (info.builtAt) parts.push(`Built ${info.builtAt}`)

  return parts.join(' | ')
}

function CustomerRuntimeBuildMarker() {
  const [visible, setVisible] = useState(false)
  const marker = useMemo(runtimeBuildMarkerText, [])

  return (
    <>
      <Pressable
        accessibilityLabel={`NestScout customer runtime marker: ${marker}`}
        accessibilityRole="button"
        hitSlop={6}
        onLongPress={() => setVisible(true)}
        onPress={() => visible && setVisible(false)}
        style={styles.runtimeMarkerHotspot}
        testID="customer-runtime-marker-hotspot"
      />
      {visible ? (
        <View
          pointerEvents="none"
          style={styles.runtimeMarkerPill}
          testID="customer-runtime-marker"
        >
          <Text selectable style={styles.runtimeMarkerText}>
            {marker}
          </Text>
        </View>
      ) : null}
    </>
  )
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
    <DockScrollStateProvider>
      <View style={{ backgroundColor: tokens.canvas, flex: 1 }}>
        <Tabs tabBar={() => null} screenOptions={{ headerShown: false }}>
          <Tabs.Screen name="home" options={{ title: tabCopy.home }} />
          <Tabs.Screen name="booking" options={{ title: tabCopy.booking }} />
          <Tabs.Screen name="history" options={{ title: tabCopy.history }} />
          <Tabs.Screen name="profile" options={{ title: tabCopy.profile }} />
          <Tabs.Screen name="kael" options={{ href: null, title: tabCopy.kael }} />
          <Tabs.Screen name="kael-chat" options={{ href: null, title: tabCopy.kael }} />
        </Tabs>
        {showDock ? <CustomerDockOverlay active={activeDock} /> : null}
        <CustomerRuntimeBuildMarker />
      </View>
    </DockScrollStateProvider>
  )
}

const styles = StyleSheet.create({
  runtimeMarkerHotspot: {
    height: 1,
    opacity: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: 1,
    zIndex: 200,
  },
  runtimeMarkerPill: {
    backgroundColor: 'rgba(7,26,36,0.86)',
    borderRadius: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: 'absolute',
    right: 12,
    top: 12,
    zIndex: 201,
  },
  runtimeMarkerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
})
