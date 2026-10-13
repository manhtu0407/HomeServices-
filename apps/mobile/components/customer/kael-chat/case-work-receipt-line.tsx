import { StyleSheet, Text, View } from 'react-native'

import { typography } from '@/design/theme'

import type { CustomerThemeTokens } from '../customer-theme'

// A short figure reads as one receipt line: label left, number right.
export function CaseWorkReceiptLine({ label, tokens, value }: { label: string; tokens: CustomerThemeTokens; value: string }) {
  return (
    <View style={styles.line}>
      <Text numberOfLines={1} style={[styles.label, { color: tokens.muted }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.value, { color: tokens.text }]}>{value}</Text>
    </View>
  )
}

export function CaseWorkReceipt({ children, tokens }: { children: React.ReactNode; tokens: CustomerThemeTokens }) {
  return <View style={[styles.receipt, { borderTopColor: tokens.border }]}>{children}</View>
}

const styles = StyleSheet.create({
  label: { ...typography.footnote, flexShrink: 1 },
  line: { alignItems: 'baseline', columnGap: 12, flexDirection: 'row', justifyContent: 'space-between' },
  receipt: { borderTopWidth: StyleSheet.hairlineWidth, gap: 10, paddingTop: 16 },
  value: { ...typography.subheadline, flexShrink: 0, fontVariant: ['tabular-nums'], fontWeight: '600', textAlign: 'right' },
})
