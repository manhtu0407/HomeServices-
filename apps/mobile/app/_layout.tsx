import { Slot } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from '@/lib/auth-provider'
import { FrontendWorkflowProvider } from '@/lib/frontend-workflow-provider'

export default function RootLayout() {
  return (
    <AuthProvider>
      <FrontendWorkflowProvider>
        <StatusBar style="auto" />
        <Slot />
      </FrontendWorkflowProvider>
    </AuthProvider>
  )
}
