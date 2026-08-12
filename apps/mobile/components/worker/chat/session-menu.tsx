import { View } from 'react-native'

import { GlassSurface } from '@/components/ui/glass-surface'
import { color } from '@/design/theme'

import { styles } from './session-menu-styles'
import { WorkerV5KaelSessionList, type WorkerV5KaelSessionMenuProps } from './worker-kael-session-list'

export function WorkerV5KaelSessionMenu({ reduceTransparency, ...props }: WorkerV5KaelSessionMenuProps) {
  return (
    <View style={styles.menuPosition} testID="worker-v5-kael-session-menu-shell">
      <GlassSurface
        backgroundColor={reduceTransparency ? color.surface.raised : 'rgba(250,255,253,0.92)'}
        borderColor={reduceTransparency ? color.surface.stroke : 'rgba(35,96,84,0.13)'}
        material="liquid"
        style={styles.menuGlass}
        testID="worker-v5-kael-session-menu-glass"
        variant="sheet"
      >
        <WorkerV5KaelSessionList reduceTransparency={reduceTransparency} {...props} />
      </GlassSurface>
    </View>
  )
}
