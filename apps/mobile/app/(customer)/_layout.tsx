import { Tabs } from 'expo-router'
import { Colors } from '@/constants/colors'

export default function CustomerLayout() {
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
        name="booking"
        options={{ title: 'Đặt lịch', tabBarLabel: 'Đặt lịch' }}
      />
      <Tabs.Screen
        name="kael"
        options={{ title: 'Kael', tabBarLabel: 'Kael' }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'Lịch sử', tabBarLabel: 'Lịch sử' }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Hồ sơ', tabBarLabel: 'Hồ sơ' }}
      />
    </Tabs>
  )
}
