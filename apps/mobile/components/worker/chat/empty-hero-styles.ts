import { StyleSheet } from 'react-native'

import { color, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  copy: {
    ...typography.title3,
    color: color.text.strong,
    fontWeight: '400',
    letterSpacing: -0.18,
    lineHeight: 29,
    maxWidth: 320,
    textAlign: 'center',
  },
  hero: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 300,
    paddingBottom: 18,
    paddingHorizontal: 24,
    paddingTop: 22,
  },
  modelStage: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
})
