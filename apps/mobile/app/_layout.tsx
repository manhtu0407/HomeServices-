import { Slot } from 'expo-router'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { AuthProvider } from '@/lib/auth-provider'
import { AdminActivationProvider } from '@/lib/admin-activation-provider'
import { FrontendWorkflowProvider } from '@/lib/frontend-workflow-provider'

const NESTSCOUT_SYSTEM_TYPOGRAPHY_WEB_STYLE_ID = 'nestscout-system-typography-web-style'

function installSystemTypographyWebStyle() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return
  if (document.getElementById(NESTSCOUT_SYSTEM_TYPOGRAPHY_WEB_STYLE_ID)) return

  const style = document.createElement('style')
  style.id = NESTSCOUT_SYSTEM_TYPOGRAPHY_WEB_STYLE_ID
  style.textContent = `
    html,
    body,
    #root,
    #root * {
      -webkit-font-smoothing: antialiased;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      font-kerning: normal;
      text-rendering: optimizeLegibility;
    }
    #root [data-nestscout-serif] {
      font-family: ui-serif, Cambria, Constantia, 'Iowan Old Style', Georgia, 'Times New Roman', serif !important;
    }
  `
  document.head.appendChild(style)
}

export default function RootLayout() {
  useEffect(() => {
    installSystemTypographyWebStyle()
  }, [])

  return (
    <AuthProvider>
      <AdminActivationProvider>
        <FrontendWorkflowProvider>
          <Slot />
        </FrontendWorkflowProvider>
      </AdminActivationProvider>
    </AuthProvider>
  )
}
