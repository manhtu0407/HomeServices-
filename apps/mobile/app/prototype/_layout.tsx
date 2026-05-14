import { Stack } from 'expo-router'

export default function PrototypeLayout() {
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen
        name="client-price-check"
        options={{ title: 'Prototype kiểm tra giá' }}
      />
    </Stack>
  )
}
