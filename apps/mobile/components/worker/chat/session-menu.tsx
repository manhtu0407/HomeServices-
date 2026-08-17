import { View } from 'react-native'

import { GlassSurface } from '@/components/ui/glass-surface'
import { LiquidSurfaceOverlay } from '@/components/ui/liquid-back-button'
import { color } from '@/design/theme'

import { styles } from './session-menu-styles'
import { WorkerV5KaelSessionList, type WorkerV5KaelSessionMenuProps } from './worker-kael-session-list'

export function WorkerV5KaelSessionMenu({ reduceTransparency, ...props }: WorkerV5KaelSessionMenuProps) {
  return (
    <View style={styles.menuPosition} testID="worker-v5-kael-session-menu-shell">
      <GlassSurface
        backgroundColor={reduceTransparency ? color.surface.raised : 'rgba(255,255,255,0.18)'}
        borderColor={reduceTransparency ? color.surface.stroke : 'rgba(255,255,255,0.72)'}
        material="liquid"
        showEdgeHighlight={false}
        style={styles.menuGlass}
        testID="worker-v5-kael-session-menu-glass"
        variant="sheet"
      >
        {!reduceTransparency ? (
          <LiquidSurfaceOverlay
            designHeight={180}
            mode="light"
            radius={18}
            testID="worker-v5-kael-session-menu-liquid"
          />
        ) : null}
        <WorkerV5KaelSessionList reduceTransparency={reduceTransparency} {...props} />
      </GlassSurface>
    </View>
  )
}
