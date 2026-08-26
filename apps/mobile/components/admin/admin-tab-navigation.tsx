import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { color, radius, spacing, typography } from '@/design/theme'
import { AdminText } from './admin-text'

export type AdminTabNavigationItem = {
  accessibilityLabel?: string
  key: string
  label: string
  onPress: () => void
  selected: boolean
  testID: string
}

export function AdminTabNavigation({ compactLabels = false, items, testID }: {
  compactLabels?: boolean
  items: readonly AdminTabNavigationItem[]
  testID: string
}) {
  return <View style={styles.shell} testID={testID}>
    <ScrollView
      accessibilityRole="tablist"
      contentContainerStyle={styles.content}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {/* react-doctor-disable-next-line react-doctor/rn-no-scrollview-mapped-list */}
      {items.map((item) => <Pressable
        accessibilityLabel={item.accessibilityLabel ?? item.label}
        accessibilityRole="tab"
        accessibilityState={{ selected: item.selected }}
        key={item.key}
        onPress={item.onPress}
        style={({ pressed }) => [
          styles.item,
          item.selected && styles.itemSelected,
          pressed && styles.itemPressed,
        ]}
        testID={item.testID}
      >
        <AdminText textRole="subheadline" style={[
          styles.label,
          compactLabels && styles.compactLabel,
          item.selected && styles.labelSelected,
        ]}>{item.label}</AdminText>
        {item.selected ? <View pointerEvents="none" style={styles.selectionIndicator} testID={`${item.testID}-indicator`} /> : null}
      </Pressable>)}
    </ScrollView>
  </View>
}

const styles = StyleSheet.create({
  compactLabel: {
    ...typography.footnote,
  },
  content: {
    flexGrow: 1,
    gap: spacing.xs,
    padding: spacing.xs,
  },
  item: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: radius.md,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 112,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'relative',
  },
  itemPressed: {
    opacity: 0.62,
  },
  itemSelected: {
    backgroundColor: color.surface.base,
    borderColor: 'transparent',
  },
  label: {
    ...typography.label,
    color: color.text.secondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  labelSelected: {
    color: color.text.strong,
    fontWeight: '700',
  },
  selectionIndicator: {
    backgroundColor: color.brand.primary,
    borderRadius: 2,
    bottom: 3,
    height: 3,
    position: 'absolute',
    width: 28,
  },
  shell: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.lg,
  },
})
