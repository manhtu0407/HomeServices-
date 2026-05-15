import { Tabs } from 'expo-router'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { getCustomerThemeTokens, useCustomerThemeMode } from '@/components/customer/customer-surfaces'

type CustomerTabName = 'home' | 'booking' | 'kael' | 'history' | 'profile'

const CUSTOMER_DOCK_MAIN_A = 'CUSTOMER_DOCK_MAIN_A: rounded material dock with active surface'
const CUSTOMER_DARK_DOCK_LAYER_MATCH = 'CUSTOMER_DARK_DOCK_LAYER_MATCH: dock reads the same semantic dark layers'
const CUSTOMER_DARK_LAYER_RESTORE_V12 = 'CUSTOMER_DARK_LAYER_RESTORE_V12: customer-dock-shadow-layer'
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
  const themeMode = useCustomerThemeMode()
  const tokens = getCustomerThemeTokens(themeMode)
  const dockMarker = CUSTOMER_DARK_DOCK_LAYER_MATCH + 'customer-tab-dark-layer-match'

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tokens.primary,
        tabBarInactiveTintColor: tokens.subtleText,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0,
        },
        tabBarActiveBackgroundColor: tokens.service,
        tabBarInactiveBackgroundColor: 'transparent',
        tabBarItemStyle: {
          borderRadius: 22,
          marginHorizontal: 4,
          marginVertical: 6,
          minHeight: 58,
        },
        tabBarStyle: {
          backgroundColor: tokens.base,
          borderColor: tokens.border,
          borderRadius: 28,
          borderTopColor: tokens.border,
          borderWidth: 1,
          boxShadow: tokens.mode === 'dark' ? '0 18px 44px rgba(0,0,0,0.32)' : '0 16px 38px rgba(16,43,47,0.12)',
          height: customerDockHeight,
          marginBottom: customerDockBottomMargin,
          marginHorizontal: 16,
          paddingBottom: 8,
          paddingTop: 8,
          position: 'absolute',
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
          title: 'Đặt lịch',
          tabBarLabel: 'Đặt lịch',
          tabBarIcon: ({ color, focused }) => <CustomerTabIcon color={color} focused={focused} marker={dockMarker} name="booking" />,
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
          title: 'Lịch sử',
          tabBarLabel: 'Lịch sử',
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
  const accessibilityMarker = CUSTOMER_DOCK_MAIN_A + CUSTOMER_DARK_LAYER_RESTORE_V12 + dockMarker + marker
  return (
    <Svg
      width={25}
      height={25}
      viewBox="0 0 25 25"
      fill="none"
      accessibilityLabel={accessibilityMarker}
      testID={testID}
    >
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
      {name === 'kael' ? (
        <>
          <Path d="M12.5 5.5v14" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
          <Path d="M7.3 10.4c3-2 7.4-2 10.4 0M7.3 15.1c3 2 7.4 2 10.4 0" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
          <Circle cx={12.5} cy={12.5} r={6.2} fill={focused ? color : accent} opacity={focused ? 0.14 : 0.08} />
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
