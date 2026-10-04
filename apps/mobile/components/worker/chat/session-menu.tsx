import { useState } from 'react'
import { useWindowDimensions, View } from 'react-native'

import { GlassSurface } from '@/components/ui/glass-surface'
import { color } from '@/design/theme'

import { styles } from './session-menu-styles'
import { WorkerV5KaelSessionList, type WorkerV5KaelSessionMenuProps } from './worker-kael-session-list'

export function WorkerV5KaelSessionMenu({ reduceTransparency, ...props }: WorkerV5KaelSessionMenuProps) {
  const [renameEditorOpen, setRenameEditorOpen] = useState(false)
  const { width: windowWidth } = useWindowDimensions()
  return (
    <View
      style={[
        styles.menuPosition,
        renameEditorOpen ? styles.menuPositionExpanded : null,
        renameEditorOpen ? { maxWidth: Math.min(440, Math.max(0, windowWidth - 28)) } : null,
      ]}
      testID="worker-v5-kael-session-menu-shell"
    >
      <GlassSurface
        backgroundColor={reduceTransparency ? color.surface.raised : 'rgba(255,255,255,0.18)'}
        borderColor={reduceTransparency ? color.surface.stroke : 'rgba(255,255,255,0.72)'}
        material="liquid"
        showEdgeHighlight={false}
        style={styles.menuGlass}
        testID="worker-v5-kael-session-menu-glass"
        variant="sheet"
      >
        <WorkerV5KaelSessionList onRenameEditorOpenChange={setRenameEditorOpen} reduceTransparency={reduceTransparency} {...props} />
      </GlassSurface>
    </View>
  )
}
