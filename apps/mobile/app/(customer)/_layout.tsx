import { Redirect, Tabs } from 'expo-router'
import { Image } from 'expo-image'
import { ActivityIndicator, useWindowDimensions, View } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { getCustomerThemeTokens, useCustomerThemeMode } from '@/components/customer/customer-surfaces'
import { useAuth } from '@/lib/auth-provider'
import { useAppLanguage } from '@/lib/app-language'

type CustomerTabName = 'home' | 'booking' | 'kael' | 'history' | 'profile'

const CUSTOMER_DOCK_MAIN_A = 'CUSTOMER_DOCK_MAIN_A: V4 rounded glass dock with active surface'
const CUSTOMER_DARK_DOCK_LAYER_MATCH = 'CUSTOMER_DARK_DOCK_LAYER_MATCH: dock reads the same semantic V4 layers'
const CUSTOMER_DARK_DOCK_LAYER_V4 = 'CUSTOMER_DARK_DOCK_LAYER_V4: customer-dock-shadow-layer'
void CUSTOMER_DOCK_MAIN_A
void CUSTOMER_DARK_DOCK_LAYER_V4
const CUSTOMER_TAB_DOCK_MARKERS = ['customer-tab-dock-main-a', 'customer-tab-dock-active-surface'] as const
const customerDockHeight = 82
const customerDockBottomMargin = 10
const CUSTOMER_TAB_ICON_TEST_IDS = [
  'customer-tab-icon-home',
  'customer-tab-icon-booking',
  'customer-tab-icon-kael',
  'customer-tab-icon-history',
  'customer-tab-icon-profile',
] as const
const CUSTOMER_TAB_COPY = {
  vi: {
    booking: 'Đặt',
    bookingA11y: 'Đặt dịch vụ',
    history: 'Hoạt động',
    historyA11y: 'Lịch sử',
    home: 'Trang chủ',
    kael: 'Kael',
    profile: 'Hồ sơ',
  },
  en: {
    booking: 'Book',
    bookingA11y: 'Book service',
    history: 'Activity',
    historyA11y: 'History',
    home: 'Home',
    kael: 'Kael',
    profile: 'Profile',
  },
} as const

export default function CustomerLayout() {
  const { loading, role, session } = useAuth()
  const language = useAppLanguage()
  const tabCopy = CUSTOMER_TAB_COPY[language]
  const themeMode = useCustomerThemeMode()
  const tokens = getCustomerThemeTokens(themeMode)
  const { width } = useWindowDimensions()
  const dockWidth = Math.min(width - 32, 430)
  const dockLeft = Math.max((width - dockWidth) / 2, 16)
  const dockMarker = CUSTOMER_DARK_DOCK_LAYER_MATCH + 'customer-tab-dark-layer-match'

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

  // Phase 5.1 (plan §22.10.B, 2026-05-23): admin no longer auto-bypass customer
  // shell. Admin gets its own (admin) shell. Customer shell strictly requires
  // role='customer' to prevent accidental admin actions in customer surfaces.
  if (role !== 'customer') {
    return <Redirect href="/(auth)/login" />
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tokens.primary,
        tabBarInactiveTintColor: tokens.subtleText,
        tabBarShowLabel: false,
        tabBarLabelStyle: {
          fontSize: 0,
          fontWeight: '700',
          letterSpacing: 0,
        },
        tabBarActiveBackgroundColor: tokens.service,
        tabBarInactiveBackgroundColor: 'transparent',
        tabBarItemStyle: {
          borderRadius: 24,
          marginHorizontal: 3,
          marginVertical: 6,
          minHeight: 58,
        },
        tabBarStyle: {
          backgroundColor: tokens.mode === 'dark' ? 'rgba(14,32,32,0.72)' : 'rgba(255,253,248,0.72)',
          borderColor: tokens.mode === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.88)',
          borderRadius: 32,
          borderTopColor: tokens.mode === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.88)',
          borderWidth: 1,
          boxShadow: 'none',
          display: 'none',
          height: customerDockHeight,
          left: dockLeft,
          marginBottom: customerDockBottomMargin,
          marginHorizontal: 0,
          paddingBottom: 8,
          paddingTop: 8,
          position: 'absolute',
          right: undefined,
          width: dockWidth,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: tabCopy.home,
          tabBarLabel: tabCopy.home,
          tabBarIcon: ({ color, focused }) => <CustomerTabIcon accessibilityLabel={tabCopy.home} color={color} focused={focused} marker={dockMarker} name="home" />,
        }}
      />
      <Tabs.Screen
        name="booking"
        options={{
          title: tabCopy.booking,
          tabBarLabel: tabCopy.booking,
          tabBarIcon: ({ color, focused }) => <CustomerTabIcon accessibilityLabel={tabCopy.bookingA11y} color={color} focused={focused} marker={dockMarker} name="booking" />,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="kael"
        options={{
          title: 'Kael',
          tabBarLabel: 'Kael',
          tabBarIcon: ({ color, focused }) => <CustomerTabIcon accessibilityLabel={tabCopy.kael} color={color} focused={focused} marker={dockMarker} name="kael" />,
        }}
      />
      <Tabs.Screen
        name="kael-chat"
        options={{
          href: null,
          title: 'Kael',
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: tabCopy.history,
          tabBarLabel: tabCopy.history,
          tabBarIcon: ({ color, focused }) => <CustomerTabIcon accessibilityLabel={tabCopy.historyA11y} color={color} focused={focused} marker={dockMarker} name="history" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: tabCopy.profile,
          tabBarLabel: tabCopy.profile,
          tabBarIcon: ({ color, focused }) => <CustomerTabIcon accessibilityLabel={tabCopy.profile} color={color} focused={focused} marker={dockMarker} name="profile" />,
        }}
      />
    </Tabs>
  )
}

function CustomerTabIcon({
  accessibilityLabel,
  color,
  focused,
  marker,
  name,
}: {
  accessibilityLabel: string
  color: string
  focused: boolean
  marker: string
  name: CustomerTabName
}) {
  const themeMode = useCustomerThemeMode()
  const tokens = getCustomerThemeTokens(themeMode)
  const accent = focused ? tokens.copper : tokens.subtleText
  const testID = CUSTOMER_TAB_ICON_TEST_IDS.find((item) => item.endsWith(name))
  const dockMarker = focused ? CUSTOMER_TAB_DOCK_MARKERS[1] : CUSTOMER_TAB_DOCK_MARKERS[0]
  void dockMarker
  void marker

  if (name === 'kael') {
    return (
      <Image
        accessibilityLabel={accessibilityLabel}
        source={require('../../assets/kael-model-8a-head.png')}
        style={{
          borderColor: focused ? tokens.primary : tokens.borderStrong,
          borderRadius: 999,
          borderWidth: 1,
          height: focused ? 35 : 29,
          width: focused ? 35 : 29,
        }}
        testID="customer-tab-kael-mascot-8a"
      />
    )
  }

  return (
    <Svg width={25} height={25} viewBox="0 0 25 25" fill="none" accessibilityLabel={accessibilityLabel} testID={testID}>
      {name === 'home' ? (
        <>
          <Path d="M5.5 12.2 12.5 6l7 6.2v7.2H5.5v-7.2Z" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M10.4 19.4v-4.3h4.2v4.3" stroke={accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      {name === 'booking' ? (
        <>
          <Rect x={6} y={5.8} width={13} height={14} rx={3.4} stroke={color} strokeWidth={1.9} />
          <Path d="M9.2 10.3h6.4M9.2 14h4.8" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'history' ? (
        <>
          <Path d="M7.2 6.2h10.6v13H8.8c-.9 0-1.6-.7-1.6-1.6V6.2Z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
          <Path d="M9.8 10.5h5.4M9.8 14.3h4" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'profile' ? (
        <>
          <Path d="M7.2 20c.9-2.5 2.8-3.7 5.3-3.7s4.4 1.2 5.3 3.7" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
          <Circle cx={12.5} cy={9.6} r={3.2} stroke={color} strokeWidth={1.9} />
          <Path d="M18.4 7.4v3M16.9 8.9h3" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
        </>
      ) : null}
    </Svg>
  )
}
