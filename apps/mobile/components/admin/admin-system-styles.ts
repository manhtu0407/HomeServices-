import { StyleSheet } from 'react-native'

import { spacing } from '@/design/theme'

export const adminSystemStyles = StyleSheet.create({
  detail: { flex: 1, gap: spacing.md, minWidth: 0 },
  detailPane: { flex: 1, gap: spacing.md, maxWidth: 720, minWidth: 0 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  list: { flex: 1, minWidth: 0 },
  listContent: { paddingBottom: spacing.xl, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  split: { flex: 1, flexDirection: 'row', gap: spacing.xl, minHeight: 0 },
  stack: { flex: 1, gap: spacing.md, minHeight: 0 },
})
