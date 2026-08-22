import { StyleSheet } from 'react-native'

import { typography } from '@/design/theme'

export const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    maxWidth: 420,
    width: '100%',
  },
  copy: {
    ...typography.title3,
    flex: 1,
    flexShrink: 1,
    fontWeight: '500',
    maxWidth: 240,
    minWidth: 0,
    textAlign: 'left',
  },
  hero: {
    alignItems: 'center',
    flexGrow: 0,
    justifyContent: 'center',
    minHeight: 300,
    paddingBottom: 18,
    paddingHorizontal: 24,
    paddingTop: 22,
  },
  modelStage: {
    alignItems: 'center',
    flexShrink: 0,
    justifyContent: 'center',
  },
})
