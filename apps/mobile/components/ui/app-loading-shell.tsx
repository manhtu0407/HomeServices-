import { View } from 'react-native'
import { color } from '@/design/theme'

// Route guards hold the shell for a few frames while auth resolves. A painted light canvas
// with no spinner keeps that wait invisible; an unpainted View inherits the system dark
// window and flashes black before the next screen.
export function AppLoadingShell() {
  return (
    <View
      accessibilityState={{ busy: true }}
      style={{ flex: 1, backgroundColor: color.surface.soft }}
      testID="app-loading-shell"
    />
  )
}
