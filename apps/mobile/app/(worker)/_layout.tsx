import { Tabs } from 'expo-router'
import { Colors } from '@/constants/colors'

export default function WorkerLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.tabInactive,
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Trang chủ', tabBarLabel: 'Trang chủ' }}
      />
      <Tabs.Screen
        name="jobs"
        options={{ title: 'Công việc', tabBarLabel: 'Công việc' }}
      />
      <Tabs.Screen
        name="chat"
        options={{ title: 'Chat', tabBarLabel: 'Chat' }}
      />
      <Tabs.Screen
        name="earnings"
        options={{ title: 'Thu nhập', tabBarLabel: 'Thu nhập' }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Hồ sơ', tabBarLabel: 'Hồ sơ' }}
      />
    </Tabs>
  )
}
