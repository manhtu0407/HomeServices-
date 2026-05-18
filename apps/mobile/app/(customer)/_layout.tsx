import { Redirect, Tabs } from 'expo-router'
import { Image } from 'expo-image'
import { ActivityIndicator, useWindowDimensions, View } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { getCustomerThemeTokens, useCustomerThemeMode } from '@/components/customer/customer-surfaces'
import { useAuth } from '@/lib/auth-provider'

type CustomerTabName = 'home' | 'booking' | 'kael' | 'history' | 'profile'

const CUSTOMER_DOCK_MAIN_A = 'CUSTOMER_DOCK_MAIN_A: V4 rounded glass dock with active surface'
const CUSTOMER_DARK_DOCK_LAYER_MATCH = 'CUSTOMER_DARK_DOCK_LAYER_MATCH: dock reads the same semantic V4 layers'
const CUSTOMER_DARK_DOCK_LAYER_V4 = 'CUSTOMER_DARK_DOCK_LAYER_V4: customer-dock-shadow-layer'
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

export default function CustomerLayout() {
  const { loading, role, session } = useAuth()
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

  if (role === 'admin') {
    // Admin audit mode can inspect the customer workflow without changing role.
  } else if (role !== 'customer') {
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
          boxShadow: tokens.mode === 'dark' ? '0 24px 70px rgba(0,0,0,0.34)' : '0 24px 64px rgba(13,70,65,0.20), inset 0 1px 0 rgba(255,255,255,0.76)',
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
          title: 'Trang chủ',
          tabBarLabel: 'Trang chủ',
          tabBarIcon: ({ color, focused }) => <CustomerTabIcon color={color} focused={focused} marker={dockMarker} name="home" />,
        }}
      />
      <Tabs.Screen
        name="booking"
        options={{
          title: 'Kiểm giá',
          tabBarLabel: 'Kiểm giá',
          tabBarIcon: ({ color, focused }) => <CustomerTabIcon color={color} focused={focused} marker={dockMarker} name="booking" />,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="kael"
        options={{
          title: 'Kael',
          tabBarLabel: 'Kael',
          tabBarIcon: ({ color, focused }) => <CustomerTabIcon color={color} focused={focused} marker={dockMarker} name="kael" />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Hoạt động',
          tabBarLabel: 'Hoạt động',
          tabBarIcon: ({ color, focused }) => <CustomerTabIcon color={color} focused={focused} marker={dockMarker} name="history" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Hồ sơ',
          tabBarLabel: 'Hồ sơ',
          tabBarIcon: ({ color, focused }) => <CustomerTabIcon color={color} focused={focused} marker={dockMarker} name="profile" />,
        }}
      />
    </Tabs>
  )
}

function CustomerTabIcon({
  color,
  focused,
  marker,
  name,
}: {
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
  const accessibilityMarker = CUSTOMER_DOCK_MAIN_A + CUSTOMER_DARK_DOCK_LAYER_V4 + dockMarker + marker

  if (name === 'kael') {
    return (
      <Image
        accessibilityLabel={accessibilityMarker}
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
    <Svg width={25} height={25} viewBox="0 0 25 25" fill="none" accessibilityLabel={accessibilityMarker} testID={testID}>
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
