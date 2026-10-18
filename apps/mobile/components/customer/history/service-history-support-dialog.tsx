import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { color, component, spacing, typography } from '@/design/theme'
import type { CustomerThemeTokens } from '../customer-theme'
import type { HistorySupportDialogState } from './use-service-history-support-alert'

export function ServiceHistorySupportDialog({ dialog, tokens }: {
  dialog: HistorySupportDialogState | null
  tokens: CustomerThemeTokens
}) {
  if (!dialog) return null
  const primaryIndex = dialog.actions.findIndex(action => !action.cancel)
  return (
    <Modal animationType="none" onRequestClose={dialog.dismiss} transparent visible>
      <View style={styles.center}>
        <View pointerEvents="none" style={styles.scrim} />
        <View accessibilityLabel={dialog.title} accessibilityViewIsModal
          style={[styles.panel, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
          testID="customer-history-support-dialog">
          <ScrollView contentContainerStyle={styles.content}>
            <Text accessibilityRole="header" style={[styles.title, { color: tokens.text }]}>{dialog.title}</Text>
            <Text style={[styles.body, { color: tokens.muted }]}>{dialog.message}</Text>
            {dialog.actions.map((action, index) => {
              const primary = index === primaryIndex
              return (
                <Pressable accessibilityLabel={action.label} accessibilityRole="button"
                  key={action.label} onPress={action.onPress}
                  style={({ pressed }) => [styles.action, {
                    backgroundColor: primary ? (pressed ? color.brand.primaryDeep : color.brand.primaryDark) : tokens.raised,
                    borderColor: primary ? color.brand.primaryDark : tokens.border,
                  }]}>
                  <Text style={[styles.actionText, { color: primary ? component.button.primary.text : tokens.text }]}>{action.label}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: color.text.primary, opacity: 0.4 },
  panel: { width: '100%', maxWidth: 480, maxHeight: '90%', borderRadius: component.card.radius, borderWidth: 1, overflow: 'hidden' },
  content: { padding: spacing.xl, gap: spacing.md },
  title: { ...typography.title3 },
  body: { ...typography.footnote },
  action: { minHeight: component.button.secondary.height, borderRadius: component.button.secondary.radius,
    borderWidth: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, justifyContent: 'center', alignItems: 'center' },
  actionText: { ...typography.body, textAlign: 'center' },
})
