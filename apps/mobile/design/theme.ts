/**
 * NestScout / Kael design theme for the Expo React Native app.
 *
 * Source: `nestscout-codex-handoff.zip/design/theme.ts`.
 * Rule: implementation values come from this file. Primary is #0DAE9A.
 */

export const color = {
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
    mint500: '#28C4B3',
    mint600: '#0DAE9A',
    mint700: '#087F73',
    mint800: '#055F57',
  },
  brand: {
    primary: '#0DAE9A',
    primaryDark: '#087F73',
    primaryDeep: '#055F57',
  },
  surface: {
    base: '#FFFFFF',
    soft: '#FAFDFC',
    mint: '#F1FBF8',
    raised: '#FFFFFF',
    disabled: '#EDF3F2',
    stroke: '#D8EBE8',
    strokeStrong: '#B8E7DF',
  },
  accent: {
    aqua: '#22D1C8',
    skyBlue: '#38BDF8',
    deepTeal: '#0A5F63',
    success: '#27B66D',
    warning: '#F7B642',
    coral: '#FF6B63',
    destructive: '#EF4E4E',
    lavender: '#8A78FA',
    gold: '#FFC857',
  },
  primary: '#0DAE9A',
  primaryDark: '#087F73',
  background: '#F4FAF9',
  textPrimary: '#071A24',
} as const

export const typography = {
  fontFamily: 'Kael Sans',
  h1: { fontSize: 32, lineHeight: 40, fontWeight: '700' as const },
  h2: { fontSize: 24, lineHeight: 32, fontWeight: '600' as const },
  h3: { fontSize: 20, lineHeight: 28, fontWeight: '500' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
} as const

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  screenHorizontalPadding: 16,
  screenVerticalPadding: 18,
  cardPaddingSmall: 12,
  cardPadding: 16,
  cardPaddingLarge: 20,
  sectionGap: 16,
  componentGap: 12,
  iconGridGap: 14,
} as const

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  sheet: 34,
  pill: 999,
} as const

export const shadow = {
  soft: {
    shadowColor: '#085F57',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },
  raised: {
    shadowColor: '#085F57',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 18 },
    elevation: 5,
  },
  primary: {
    shadowColor: '#0DAE9A',
    shadowOpacity: 0.28,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  orb: {
    shadowColor: '#0DAE9A',
    shadowOpacity: 0.34,
    shadowRadius: 17,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
} as const

export const glass = {
  bg: 'rgba(255,255,255,0.68)',
  bgStrong: 'rgba(255,255,255,0.82)',
  stroke: 'rgba(255,255,255,0.86)',
  innerHighlight: 'rgba(255,255,255,0.74)',
  blur: 22,
} as const

export const aura = {
  page: {
    center: { x: 0.84, y: 0.08 },
    stops: [
      { offset: 0, color: 'rgba(143,226,212,0.24)' },
      { offset: 0.36, color: 'rgba(230,251,243,0.16)' },
      { offset: 0.7, color: 'rgba(247,255,251,0)' },
    ],
  },
  component: {
    center: { x: 0.72, y: 0.18 },
    stops: [
      { offset: 0, color: 'rgba(143,226,212,0.30)' },
      { offset: 0.34, color: 'rgba(230,251,243,0.18)' },
      { offset: 0.68, color: 'rgba(255,255,255,0)' },
    ],
  },
  iconTile: {
    center: { x: 0.5, y: 0.42 },
    stops: [
      { offset: 0, color: 'rgba(143,226,212,0.34)' },
      { offset: 0.46, color: 'rgba(230,251,243,0.22)' },
      { offset: 0.76, color: 'rgba(255,255,255,0)' },
    ],
  },
} as const

export const component = {
  button: {
    primary: {
      gradient: ['#16C7B4', '#0DAE9A', '#087F73'] as const,
      gradientStops: [0, 0.46, 1] as const,
      text: '#FFFFFF',
      border: 'rgba(255,255,255,0.72)',
      height: 48,
      radius: 22,
      paddingX: 20,
    },
    primaryPressed: {
      gradient: ['#0DAE9A', '#087F73'] as const,
      gradientStops: [0, 1] as const,
    },
    secondary: {
      bg: '#F7FFFB',
      text: '#087F73',
      border: '#C8EDE7',
      height: 44,
      radius: 22,
    },
    ghost: {
      bg: 'rgba(255,255,255,0.52)',
      text: '#087F73',
      border: 'rgba(184,231,223,0.72)',
      radius: 22,
    },
    destructive: {
      bg: '#FFF1F1',
      text: '#EF4E4E',
      border: '#FFD0D0',
      pressedBg: '#FFE3E3',
      radius: 22,
    },
    disabled: {
      bg: '#EDF3F2',
      text: '#B8C7C8',
      border: '#E1EAEA',
      opacity: 0.58,
    },
    small: { height: 36 },
  },
  chip: {
    selected: { bg: '#E6FBF3', text: '#087F73', border: '#B8E7DF' },
    unselected: { bg: '#FFFFFF', text: '#526B73', border: '#DCECEA' },
    successStatus: { bg: '#EAF8EF', text: '#1F9B5B', border: '#BFE8CE' },
    warning: { bg: '#FFF7E6', text: '#B87500', border: '#FFE0A6' },
    error: { bg: '#FFF1F1', text: '#EF4E4E', border: '#FFD0D0' },
    height: 32,
    paddingX: 14,
    radius: 999,
  },
  input: {
    bg: '#FFFFFF',
    border: '#D8EBE8',
    focusBorder: '#0DAE9A',
    placeholder: '#7C8F94',
    height: 48,
    radius: 18,
    paddingX: 16,
  },
  iconTile: { size: 72, visualSize: 46, radius: 22 },
  card: { radius: 24, largeRadius: 28 },
  bottomNav: {
    bg: '#FFFFFF',
    height: 64,
    radius: 34,
    paddingX: 10,
    iconSize: 22,
    activeIcon: '#0DAE9A',
    inactiveIcon: '#7C8F94',
    tabs: ['Trang chu', 'Lich su', 'Tin nhan', 'Ho so'] as const,
    orb: {
      bg: '#0DAE9A',
      label: 'Kael',
      size: 64,
      outerSize: 76,
      radius: 999,
      separated: true,
      iconSize: 26,
      glyphHeight: 31,
      glyphWidth: 34,
      labelFontSize: 10,
      labelLineHeight: 12,
      paddingTop: 7,
      paddingBottom: 6,
      auraSize: 59,
      auraOffsetTop: -8,
      auraOffsetRight: -10,
    },
  },
  agenticCenter: {
    maxWidth: 720,
    scrollPaddingBottom: 34,
    heroMinHeight: 184,
    mascotImageSize: 54,
    actionMinWidth: 126,
    homeLinkMinHeight: 42,
    homeLinkMinWidth: 116,
    approvalActionMinWidth: 84,
    cardShadow: '0 12px 26px rgba(8,95,87,0.07)',
    primaryButtonShadow: '0 12px 22px rgba(13,174,154,0.22)',
    primaryButtonBorderDark: 'rgba(190,210,205,0.18)',
    primaryButtonBorderLight: 'rgba(255,255,255,0.62)',
    orbBorderDark: 'rgba(190,210,205,0.20)',
    orbBorderLight: 'rgba(255,255,255,0.76)',
    orbShadowDark: '0 16px 32px rgba(0,0,0,0.30)',
    orbShadowLight: '0 16px 34px rgba(13,174,154,0.28)',
  },
} as const

export const theme = { aura, color, component, glass, radius, shadow, spacing, typography } as const

export default theme
