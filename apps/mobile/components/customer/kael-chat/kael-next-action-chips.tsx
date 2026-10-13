import type { KaelNextAction } from '@nestscout/shared'
import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { CASE_WORK_CONTENT_INSET, CASE_WORK_ROW_STYLE } from './case-work-response'

// The one place a Work surface puts its actions: under the rail, in the text column, primary first.
export function KaelActionDock({ accessibilityLabel, children, testID }: {
  accessibilityLabel?: string
  children: ReactNode
  testID?: string
}) {
  return (
    <View style={styles.row}>
      <View accessibilityLabel={accessibilityLabel} style={styles.group} testID={testID}>{children}</View>
    </View>
  )
}

export const kaelActionPrimaryStyle = { alignSelf: 'stretch', marginBottom: 2 } as const

// The step that moves the case forward is the one primary button; every other offer is secondary.
export function KaelNextActionChips({
  actions,
  busy,
  language,
  onPress,
  sendingActionId,
}: {
  actions: readonly KaelNextAction[]
  busy: boolean
  language: AppLanguage
  onPress: (action: KaelNextAction) => void
  sendingActionId: string | null
  tokens: CustomerThemeTokens
}) {
  const primary = actions.filter((action) => action.kind === 'request_worker_quote')
  const secondary = actions.filter((action) => action.kind !== 'request_worker_quote')
  const button = (action: KaelNextAction, isPrimary: boolean, fullWidth = false) => (
    <KaelButton
      accessibilityLabel={action.label}
      disabled={busy || sendingActionId !== null}
      key={action.id}
      label={action.label}
      loading={sendingActionId === action.id}
      onPress={() => onPress(action)}
      size={isPrimary ? 'default' : 'small'}
      style={isPrimary ? kaelActionPrimaryStyle : fullWidth ? styles.secondaryFull : styles.secondary}
      testID={`customer-v21-kael-next-action-${action.id}`}
      variant={isPrimary ? 'primary' : 'secondary'}
    />
  )
  return (
    <KaelActionDock
      accessibilityLabel={language === 'vi' ? 'Bước tiếp theo Kael gợi ý' : 'Next steps Kael suggests'}
      testID="customer-v21-kael-next-actions"
    >
      {primary.map((action) => button(action, true))}
      {secondary.length > 0 ? <View style={styles.secondaryRow}>{secondary.map((action, index) => button(action, false, secondary.length % 2 === 1 && index === secondary.length - 1))}</View> : null}
    </KaelActionDock>
  )
}

const styles = StyleSheet.create({
  group: { gap: 12, marginLeft: CASE_WORK_CONTENT_INSET },
  row: { ...CASE_WORK_ROW_STYLE, paddingTop: 14 },
  secondary: { flexBasis: '48%', flexGrow: 0, flexShrink: 0, minHeight: 44, paddingHorizontal: 12 },
  secondaryFull: { flexBasis: '100%', flexGrow: 0, minHeight: 44, paddingHorizontal: 12 },
  secondaryRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
})
