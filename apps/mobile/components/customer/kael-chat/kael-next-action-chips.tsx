import type { KaelNextAction } from '@nestscout/shared'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { KaelChip } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'

export function KaelNextActionChips({
  actions,
  busy,
  language,
  onPress,
  sendingActionId,
  tokens,
}: {
  actions: readonly KaelNextAction[]
  busy: boolean
  language: AppLanguage
  onPress: (action: KaelNextAction) => void
  sendingActionId: string | null
  tokens: CustomerThemeTokens
}) {
  return (
    <View
      accessibilityLabel={language === 'vi' ? 'Bước tiếp theo Kael gợi ý' : 'Next steps Kael suggests'}
      style={styles.row}
      testID="customer-v21-kael-next-actions"
    >
      {actions.map((action) => (
        <KaelChip
          accessibilityLabel={action.label}
          disabled={busy || sendingActionId !== null}
          key={action.id}
          label={action.label}
          onPress={() => onPress(action)}
          style={styles.chip}
          testID={`customer-v21-kael-next-action-${action.id}`}
          variant={action.kind === 'request_worker_quote' ? 'selected' : 'unselected'}
        />
      ))}
      {sendingActionId ? <ActivityIndicator color={tokens.primary} style={styles.spinner} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  chip: { minHeight: 40 },
  row: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 4 },
  spinner: { marginLeft: 4 },
})
