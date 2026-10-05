import { View } from 'react-native'

import { GlassSurface } from '@/components/ui/glass-surface'
import { color } from '@/design/theme'

import { useWorkerKaelOrbPalette } from './orb-palette'
import { styles } from './session-menu-styles'
import { WorkerV5KaelSessionList, type WorkerV5KaelSessionMenuProps } from './worker-kael-session-list'

// Dense neutral dark glass, so the conversation behind does not read through the menu.
const MENU_GLASS_DARK = 'rgba(44,44,46,0.92)'

export function WorkerV5KaelSessionMenu({ reduceTransparency, ...props }: WorkerV5KaelSessionMenuProps) {
  const palette = useWorkerKaelOrbPalette()
  const dark = palette.mode === 'dark'
  return (
    <View
      style={styles.menuPosition}
      testID="worker-v5-kael-session-menu-shell"
    >
      {/* Denser than the header glass: the menu sits over the conversation, which must not read through it. */}
      <GlassSurface
        backgroundColor={dark
          ? (reduceTransparency ? palette.opaqueFill : MENU_GLASS_DARK)
          : (reduceTransparency ? color.surface.raised : 'rgba(255,255,255,0.86)')}
        borderColor={dark ? palette.opaqueBorder : reduceTransparency ? color.surface.stroke : 'rgba(255,255,255,0.72)'}
        material="liquid"
        mode={palette.mode}
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
