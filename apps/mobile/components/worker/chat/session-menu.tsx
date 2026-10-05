import { View } from 'react-native'

import { GlassSurface } from '@/components/ui/glass-surface'
import { color } from '@/design/theme'

import { styles } from './session-menu-styles'
import { WorkerV5KaelSessionList, type WorkerV5KaelSessionMenuProps } from './worker-kael-session-list'

export function WorkerV5KaelSessionMenu({ reduceTransparency, ...props }: WorkerV5KaelSessionMenuProps) {
  return (
    <View
      style={styles.menuPosition}
      testID="worker-v5-kael-session-menu-shell"
    >
      {/* Denser than the header glass: the menu sits over the conversation, which must not read through it. */}
      <GlassSurface
        backgroundColor={reduceTransparency ? color.surface.raised : 'rgba(255,255,255,0.86)'}
        borderColor={reduceTransparency ? color.surface.stroke : 'rgba(255,255,255,0.72)'}
        material="liquid"
        showEdgeHighlight={false}
        style={styles.menuGlass}
        testID="worker-v5-kael-session-menu-glass"
        variant="sheet"
      >
        <WorkerV5KaelSessionList reduceTransparency={reduceTransparency} {...props} />
      </GlassSurface>
    </View>
  )
}
