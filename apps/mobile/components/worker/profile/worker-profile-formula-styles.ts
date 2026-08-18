import { StyleSheet } from 'react-native'

import { color, radius, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(204,223,219,0.94)',
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    ...shadow.soft,
  },
  content: {
    position: 'relative',
    zIndex: 1,
  },
  contentPadded: {
    padding: 16,
  },
  compactMetric: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(204,223,219,0.86)',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minHeight: 68,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  compactMetricLabel: {
    color: color.text.muted,
    flexShrink: 1,
    textAlign: 'center',
    ...typography.caption2,
  },
  compactMetricValue: {
    color: color.text.strong,
    flexShrink: 1,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    ...typography.caption1,
  },
  heroContent: {
    padding: 16,
  },
  sectionStack: {
    gap: 12,
  },
})
