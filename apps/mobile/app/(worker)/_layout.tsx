import { Redirect, Tabs } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { useAuth } from '@/lib/auth-provider'
import { useAppLanguage } from '@/lib/app-language'

type WorkerTabName = 'chat' | 'earnings' | 'home' | 'jobs' | 'profile'

const WORKER_DOCK_MAIN = 'WORKER_DOCK_MAIN: worker liquid glass dock'
const WORKER_DOCK_XANHSM_LAYER_MATCH = 'WORKER_DOCK_XANHSM_LAYER_MATCH: mint/cyan service-app dock'
void WORKER_DOCK_MAIN
void WORKER_DOCK_XANHSM_LAYER_MATCH
const WORKER_TAB_ICON_TEST_IDS = [
  'worker-tab-icon-home',
  'worker-tab-icon-jobs',
  'worker-tab-icon-chat',
  'worker-tab-icon-earnings',
  'worker-tab-icon-profile',
] as const
const WORKER_TAB_COPY = {
  vi: {
    chat: 'Tin nhắn',
    earnings: 'Thu nhập',
    home: 'Trang chủ',
    jobs: 'Công việc',
    profile: 'Hồ sơ',
  },
  en: {
    chat: 'Messages',
    earnings: 'Earnings',
    home: 'Home',
    jobs: 'Jobs',
    profile: 'Profile',
  },
} as const

const workerDockHeight = 64
const workerDockBottomMargin = 8
const dockTokens = {
  active: '#08786E',
  inactive: '#7C9691',
  accent: '#BB743D',
  service: '#DDF4EC',
}

export default function WorkerLayout() {
  const { loading, role, session } = useAuth()
  const language = useAppLanguage()
  const tabCopy = WORKER_TAB_COPY[language]

  if (loading) {
    return (
      <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color={dockTokens.active} size="large" />
      </View>
    )
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />
  }

  // Phase 5.1 (plan §22.10.B, 2026-05-23): admin no longer auto-bypass worker
  // shell. Admin gets its own (admin) shell. Worker shell strictly requires
  // role='worker' to prevent accidental admin actions in worker surfaces.
  if (role !== 'worker') {
    return <Redirect href="/(auth)/login" />
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: dockTokens.active,
        tabBarInactiveTintColor: dockTokens.inactive,
        tabBarShowLabel: false,
        headerShown: false,
        tabBarActiveBackgroundColor: dockTokens.service,
        tabBarItemStyle: {
          borderRadius: 24,
          marginHorizontal: 3,
          marginVertical: 6,
          minHeight: 58,
        },
        tabBarStyle: {
          backgroundColor: 'rgba(255,253,248,0.74)',
          borderColor: 'rgba(255,255,255,0.88)',
          borderRadius: 29,
          borderTopColor: 'rgba(255,255,255,0.88)',
          borderWidth: 1,
          boxShadow: 'none',
          display: 'none',
          height: workerDockHeight,
          marginBottom: workerDockBottomMargin,
          paddingBottom: 6,
          paddingTop: 6,
          position: 'absolute',
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: tabCopy.home,
          tabBarLabel: tabCopy.home,
          tabBarIcon: ({ color, focused }) => <WorkerTabIcon accessibilityLabel={tabCopy.home} color={color} focused={focused} name="home" />,
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: tabCopy.jobs,
          tabBarLabel: tabCopy.jobs,
          tabBarIcon: ({ color, focused }) => <WorkerTabIcon accessibilityLabel={tabCopy.jobs} color={color} focused={focused} name="jobs" />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: tabCopy.chat,
          tabBarLabel: tabCopy.chat,
          tabBarIcon: ({ color, focused }) => <WorkerTabIcon accessibilityLabel={tabCopy.chat} color={color} focused={focused} name="chat" />,
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: tabCopy.earnings,
          tabBarLabel: tabCopy.earnings,
          tabBarIcon: ({ color, focused }) => <WorkerTabIcon accessibilityLabel={tabCopy.earnings} color={color} focused={focused} name="earnings" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: tabCopy.profile,
          tabBarLabel: tabCopy.profile,
          tabBarIcon: ({ color, focused }) => <WorkerTabIcon accessibilityLabel={tabCopy.profile} color={color} focused={focused} name="profile" />,
        }}
      />
    </Tabs>
  )
}

function WorkerTabIcon({ accessibilityLabel, color, focused, name }: { accessibilityLabel: string; color: string; focused: boolean; name: WorkerTabName }) {
  const accent = focused ? dockTokens.accent : dockTokens.inactive
  const testID = WORKER_TAB_ICON_TEST_IDS.find((item) => item.endsWith(name))

  return (
    <Svg width={25} height={25} viewBox="0 0 25 25" fill="none" accessibilityLabel={accessibilityLabel} testID={testID}>
      {name === 'home' ? (
        <>
          <Path d="M5.5 12.2 12.5 6l7 6.2v7.2H5.5v-7.2Z" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M10.4 19.4v-4.3h4.2v4.3" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'jobs' ? (
        <>
          <Rect x={6} y={6.2} width={13} height={13.4} rx={3.4} stroke={color} strokeWidth={1.9} />
          <Path d="M9.3 10.4h6.4M9.3 14.2h4.8" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'chat' ? (
        <>
          <Path d="M6.5 7.2h12v8.3h-5.1l-3.7 3v-3H6.5V7.2Z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
          <Path d="M9.4 10.5h6.2M9.4 13.2h3.8" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'earnings' ? (
        <>
          <Rect x={5.8} y={7.4} width={13.4} height={10.2} rx={2.8} stroke={color} strokeWidth={1.9} />
          <Circle cx={12.5} cy={12.5} r={2.1} stroke={accent} strokeWidth={1.8} />
        </>
      ) : null}
      {name === 'profile' ? (
        <>
          <Path d="M7.2 20c.9-2.5 2.8-3.7 5.3-3.7s4.4 1.2 5.3 3.7" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
          <Circle cx={12.5} cy={9.6} r={3.2} stroke={accent} strokeWidth={1.8} />
        </>
      ) : null}
    </Svg>
  )
}
