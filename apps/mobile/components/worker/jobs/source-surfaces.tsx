
import { Text as RNText, View, type TextProps } from 'react-native'
import { styles } from './source-styles'
export type WorkerV5InboxTabId = 'matches' | 'new' | 'saved'

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5SourceProgressBar({ active, label }: { active: boolean; label: string }) {
  return (
    <View style={styles.sourceProgressShell} testID="worker-v5-opportunity-progress">
      <View style={[styles.sourceProgressFill, active ? styles.sourceProgressFillActive : null]} />
      <Text style={styles.sourceProgressText} numberOfLines={1}>{label}</Text>
    </View>
  )
}
