import { StyleSheet, Text, View } from 'react-native'
import type { LocalDeal } from '@nestscout/shared'

import { color, typography } from '@/design/theme'
import { type AppLanguage } from '@/lib/app-language'

import { textByLanguage } from '../ui/format'
import { workerThemedColor } from '../ui/worker-dark-styles'
import { getWorkerThemeTokens, useWorkerThemeMode } from '../worker-theme'
import type { WorkerV5RoutePreviewState } from './use-worker-route-preview'

type WorkerInteractiveRouteMapPrototypeProps = {
  allowWebFixture?: boolean
  deal: LocalDeal | null
  language: AppLanguage
  reduceMotion: boolean
  reduceTransparency: boolean
  routePreview: WorkerV5RoutePreviewState
}

export function WorkerInteractiveRouteMapPrototype({
  language,
  reduceTransparency,
}: WorkerInteractiveRouteMapPrototypeProps) {
  const workerThemeMode = useWorkerThemeMode()
  const theme = getWorkerThemeTokens(workerThemeMode)
  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: reduceTransparency ? workerThemedColor(workerThemeMode, 'surface', color.mint.white) : theme.raised,
          borderColor: theme.borderStrong,
        },
      ]}
      testID="worker-v5-route-map-panel"
    >
      <View style={styles.emptyContent} testID="worker-v5-route-map-native-disabled">
        <Text style={[styles.emptyTitle, { color: theme.text }]}>
          {textByLanguage(language, 'Bản đồ tương tác tạm thời chưa khả dụng', 'Interactive map is temporarily unavailable')}
        </Text>
        <Text style={[styles.emptyMeta, { color: theme.muted }]}>
          {textByLanguage(language, 'Tuyến đường sẽ được hiển thị khi phần bản đồ native được bật lại.', 'The route will appear when the native map is enabled again.')}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 28,
    borderWidth: 1,
    minHeight: 330,
    overflow: 'hidden',
    position: 'relative',
  },
  emptyContent: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyMeta: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    maxWidth: 320,
    textAlign: 'center',
  },
})
