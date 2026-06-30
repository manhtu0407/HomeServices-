import type { TextStyle, ViewStyle } from 'react-native'

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
  typography: {
    h1: { fontSize: 31, lineHeight: 38, fontWeight: '700', letterSpacing: 0 } satisfies TextStyle,
    h2: { fontSize: 25, lineHeight: 32, fontWeight: '700', letterSpacing: 0 } satisfies TextStyle,
    h3: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: 0 } satisfies TextStyle,
    body: { fontSize: 15, lineHeight: 22, fontWeight: '400', letterSpacing: 0 } satisfies TextStyle,
    label: { fontSize: 12, lineHeight: 17, fontWeight: '600' } satisfies TextStyle,
    caption: { fontSize: 11, lineHeight: 16, fontWeight: '400' } satisfies TextStyle,
  },
  shadow: {
    soft: {
      shadowColor: '#085F57',
      shadowOpacity: 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 12 },
      elevation: 3,
    } satisfies ViewStyle,
    raised: {
      shadowColor: '#085F57',
      shadowOpacity: 0.14,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 20 },
      elevation: 6,
    } satisfies ViewStyle,
    primary: {
      shadowColor: '#088779',
      shadowOpacity: 0.24,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 14 },
      elevation: 7,
    } satisfies ViewStyle,
  },
} as const

export const targetCanvas = { width: 390, height: 844 } as const
