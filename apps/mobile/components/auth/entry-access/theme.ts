import type { ViewStyle } from 'react-native'

import { typography } from '@/design/theme'

export const entryTheme = {
  color: {
    text: {
      primary: '#071A24',
      strong: '#0B2F2A',
      secondary: '#526B73',
      muted: '#7C8F94',
      disabled: '#B8C7C8',
      inverse: '#FFFFFF',
    },
    mint: {
      white: '#F7FFFB',
      canvas: '#F4FAF9',
      auraSoft: '#E6F7F3',
      auraStrong: '#C8F4EA',
      mint50: '#E6FBF3',
      mint100: '#D7F6EF',
      mint300: '#8FE2D4',
      mint500: '#40CDBE',
      mint600: '#24B3A1',
      mint700: '#088779',
      mint800: '#055F57',
    },
    surface: {
      base: '#FFFFFF',
      soft: '#FAFDFC',
      mint: '#F1FBF8',
      stroke: '#D8EBE8',
      strokeStrong: '#B8E7DF',
    },
    accent: {
      success: '#27B66D',
      warning: '#F7B642',
      coral: '#FF6B63',
      destructive: '#EF4E4E',
    },
  },
  spacing: {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    screenX: 20,
  },
  radius: {
    xs: 8,
    sm: 12,
    md: 16,
    input: 19,
    lg: 22,
    card: 28,
    sheet: 30,
    pill: 999,
  },
  typography,
  shadow: {
    soft: {
      boxShadow: '0px 12px 14px rgba(8,95,87,0.08)',
    } satisfies ViewStyle,
    raised: {
      boxShadow: '0px 20px 24px rgba(8,95,87,0.14)',
    } satisfies ViewStyle,
    primary: {
      boxShadow: '0px 14px 16px rgba(8,135,121,0.24)',
    } satisfies ViewStyle,
  },
} as const
