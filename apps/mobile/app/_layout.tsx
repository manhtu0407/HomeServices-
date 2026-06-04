import { Slot } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from '@/lib/auth-provider'
import { initErrorReporting, withErrorReporting } from '@/lib/error-reporting'
import { FrontendWorkflowProvider } from '@/lib/frontend-workflow-provider'

initErrorReporting()

function RootLayoutContent() {
  return (
    <AuthProvider>
      <FrontendWorkflowProvider>
        <StatusBar style="auto" />
        <Slot />
      </FrontendWorkflowProvider>
    </AuthProvider>
  )
}

const RootLayoutWithErrorReporting = withErrorReporting(RootLayoutContent)

export default function RootLayout() {
  return <RootLayoutWithErrorReporting />
}
