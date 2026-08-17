import { typography } from '@/design/theme'
import { StyleSheet } from 'react-native'

export const customerV21ProfileJourneyStyles = StyleSheet.create({
  activity: {
    flexShrink: 1,
    ...typography.caption2,
    fontWeight: '600',
  },
  activityValue: {
    fontWeight: '600',
  },
  day: {
    flexShrink: 0,
    ...typography.caption2,
    fontWeight: '600',
  },
  root: {
    gap: 4,
    marginTop: 7,
    width: '100%',
  },
  separator: {
    backgroundColor: '#08AF9C',
    borderRadius: 2,
    height: 4,
    width: 4,
  },
  start: {
    ...typography.caption2,
    fontWeight: '600',
  },
  summary: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
})
