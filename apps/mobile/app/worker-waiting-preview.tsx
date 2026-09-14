import React, { useMemo } from 'react'
import { Alert, ScrollView, StatusBar } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { WaitingContent } from '../components/worker/jobs/waiting/waiting-content'
import { createWaitingDemo } from '../components/worker/jobs/waiting/__fixtures__/waiting-demo'
export default function WorkerWaitingPreview() {
  const params = useLocalSearchParams<{ kind?: string }>(), router = useRouter()
  const kind = params.kind === 'approval' ? 'scope-approval' : 'customer-confirmation'
  const model = useMemo(() => createWaitingDemo(kind), [kind])
  if (!__DEV__) return null
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#FCFFFE' }} edges={['top', 'bottom']}>
    <Stack.Screen options={{ headerShown: false }} /><StatusBar barStyle="dark-content"/>
    <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: '#FCFFFE' }}>
      <WaitingContent model={model} onBack={() => router.back()} onOpenDetails={() => Alert.alert('Bản minh họa', 'Màn hình này chỉ dùng đối chiếu giao diện; không thay đổi đơn thật.')} />
    </ScrollView>
  </SafeAreaView>
}
