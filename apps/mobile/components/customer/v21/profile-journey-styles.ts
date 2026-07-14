import { StyleSheet } from 'react-native'

export const customerV21ProfileJourneyStyles = StyleSheet.create({
  activity: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  activityValue: {
    fontWeight: '800',
  },
  day: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 15,
  },
  root: {
    gap: 6,
    marginTop: 12,
    width: '100%',
  },
  separator: {
    backgroundColor: '#08AF9C',
    borderRadius: 2,
    height: 4,
    width: 4,
  },
  start: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  summary: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
})
