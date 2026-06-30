import { Platform, type TextStyle } from 'react-native'

/**
 * NestScout / Kael design theme for the Expo React Native app.
 *
 * Source: `NestScout_Apple_iOS27_System_Typography_CODE_ONLY_v1_0.zip`
 * and `nestscout-codex-handoff.zip/design/theme.ts`.
 * Rule: implementation values come from this file. Brand primary is #24B3A1;
 * the app-wide primary CTA gradient follows the Entry Gate button formula.
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
    mint500: '#40CDBE',
    mint600: '#24B3A1',
    mint700: '#088779',
    mint800: '#055F57',
  },
  brand: {
    primary: '#24B3A1',
    primaryDark: '#088779',
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
  primary: '#24B3A1',
  primaryDark: '#088779',
  background: '#F4FAF9',
  textPrimary: '#071A24',
} as const

export const signature = {
  mint: '#17A995',
  mintDeep: '#00756A',
  cover: color.brand.primary,
  coverDeep: color.brand.primaryDeep,
  bg: '#F6F7F7',
  surface: '#FFFFFF',
  text: '#14201E',
  textSecondary: '#5C6B68',
  line: '#E4E8E7',
  glassTint: 'rgba(255,255,255,0.62)',
  edgeHighlight: 'rgba(255,255,255,0.30)',
  coverWash: 'rgba(13,174,154,0.10)',
  coverEdge: 'rgba(255,255,255,0.62)',
  badgeBg: 'rgba(255,255,255,0.72)',
  badgeBorder: 'rgba(23,169,149,0.20)',
  providerBorder: 'rgba(23,169,149,0.28)',
} as const

type AppleTypographyRole =
  | 'largeTitle'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'body'
  | 'callout'
  | 'subheadline'
  | 'footnote'
  | 'caption1'
  | 'caption2'
  | 'tabularBody'

const systemFontFamily: TextStyle['fontFamily'] = Platform.OS === 'ios' ? undefined : 'System'

const appleSystemTypography = {
  largeTitle: { fontFamily: systemFontFamily, fontSize: 34, lineHeight: 41, fontWeight: '400' },
  title1: { fontFamily: systemFontFamily, fontSize: 28, lineHeight: 34, fontWeight: '400' },
  title2: { fontFamily: systemFontFamily, fontSize: 22, lineHeight: 28, fontWeight: '400' },
  title3: { fontFamily: systemFontFamily, fontSize: 20, lineHeight: 25, fontWeight: '400' },
  headline: { fontFamily: systemFontFamily, fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontFamily: systemFontFamily, fontSize: 17, lineHeight: 22, fontWeight: '400' },
  callout: { fontFamily: systemFontFamily, fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subheadline: { fontFamily: systemFontFamily, fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontFamily: systemFontFamily, fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption1: { fontFamily: systemFontFamily, fontSize: 12, lineHeight: 16, fontWeight: '400' },
  caption2: { fontFamily: systemFontFamily, fontSize: 11, lineHeight: 13, fontWeight: '400' },
  tabularBody: {
    fontFamily: systemFontFamily,
    fontSize: 17,
    fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
    fontWeight: '400',
    lineHeight: 22,
  },
} satisfies Record<AppleTypographyRole, TextStyle>

export const typography = {
  fontFamily: systemFontFamily,
  fontPolicy: {
    dynamicType: true,
    embedFontFiles: false,
    family: 'system',
    opticalSizing: 'automatic',
    resolvedOnIOS: 'SF Pro',
  },
  ...appleSystemTypography,
  h1: appleSystemTypography.largeTitle,
  h2: appleSystemTypography.title2,
  h3: appleSystemTypography.title3,
  label: appleSystemTypography.subheadline,
  caption: appleSystemTypography.caption1,
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
    shadowColor: '#088779',
    shadowOpacity: 0.24,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 14 },
    elevation: 7,
  },
  orb: {
    shadowColor: '#088779',
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
      gradient: ['#49CFC0', '#24B3A1', '#088779'] as const,
      gradientStops: [0, 0.5, 1] as const,
      text: '#FFFFFF',
      border: 'rgba(255,255,255,0.72)',
      height: 48,
      radius: 22,
      paddingX: 20,
    },
    primaryPressed: {
      gradient: ['#24B3A1', '#088779'] as const,
      gradientStops: [0, 1] as const,
    },
    secondary: {
      bg: '#F7FFFB',
      text: '#088779',
      border: '#C8EDE7',
      height: 44,
      radius: 22,
    },
    ghost: {
      bg: 'rgba(255,255,255,0.52)',
      text: '#088779',
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
    selected: { bg: '#E6FBF3', text: '#088779', border: '#B8E7DF' },
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
    focusBorder: '#24B3A1',
    placeholder: '#7C8F94',
    height: 48,
    radius: 18,
    paddingX: 16,
  },
  iconTile: { size: 72, visualSize: 46, radius: 22 },
  card: { radius: 24, largeRadius: 28 },
  logoMark: {
    background: 'rgba(245,255,251,0.64)',
    border: 'rgba(214,255,246,0.78)',
    shadow: '0 0 22px rgba(214,255,246,0.58)',
    auraBackground: 'rgba(214,255,246,0.34)',
    auraInset: -8,
    auraRadiusAdd: 10,
    logoOverflow: 14,
  },
  authSurface: {
    canvas: color.background,
    raised: color.surface.base,
    glass: 'rgba(255,255,252,0.88)',
    milk: '#FFFDF8',
    mint: color.mint.mint100,
    cyan: '#E7FBFA',
    cream: '#FFF5E8',
    border: color.surface.strokeStrong,
    line: color.surface.stroke,
    ink: color.text.primary,
    muted: color.text.secondary,
    subtle: color.text.muted,
    primary: color.brand.primary,
    cookie: '#111817',
    cookieSoft: '#24302E',
    copper: '#BB743D',
    shadow: '0 18px 42px rgba(13,24,22,0.10)',
    softShadow: '0 10px 24px rgba(13,24,22,0.07)',
  },
  bottomNav: {
    bg: '#FFFFFF',
    height: 64,
    radius: 34,
    paddingX: 10,
    iconSize: 22,
    activeIcon: color.brand.primary,
    inactiveIcon: '#7C8F94',
    tabs: ['Trang chu', 'Lich su', 'Tin nhan', 'Ho so'] as const,
    orb: {
      bg: color.brand.primary,
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
  authWelcome: {
    shellBg: 'rgba(255,255,252,0.94)',
    shellBorder: 'rgba(132,230,210,0.34)',
    shellShadow: '0 24px 52px rgba(13,24,22,0.12), inset 0 1px 0 rgba(255,255,255,0.98)',
    shellGap: spacing.lg,
    shellMaxWidth: 350,
    shellMinHeight: 520,
    shellPadding: spacing.screenVerticalPadding,
    shellRadius: radius.sheet,
    auraBg: 'rgba(183,255,240,0.28)',
    auraOffsetRight: -74,
    auraOffsetTop: -56,
    auraSize: 210,
    dividerBg: 'rgba(17,24,23,0.08)',
    dividerInset: radius.lg,
    dividerTop: 76,
    brandGap: spacing.md - spacing.xxs,
    brandMinHeight: 46,
    brandMarkBorder: 'rgba(255,255,255,0.74)',
    brandMarkRadius: radius.md,
    brandMarkSize: 40,
    brandTextSize: 19,
    brandTextLineHeight: 24,
    copyGap: spacing.sm,
    mascotMarginTop: spacing.xs,
    mascotStageMinHeight: 176,
    mascotSize: 176,
    serviceRowGap: spacing.sm - 1,
    serviceRowPaddingTop: spacing.xxs,
    serviceChipPaddingX: spacing.md - spacing.xxs,
    serviceChipPaddingY: spacing.sm - spacing.xxs,
    subtitleMaxWidth: 286,
    subtitleTextSize: typography.label.fontSize,
    subtitleTextLineHeight: typography.label.lineHeight,
    subtitleOpacity: 0.84,
    titleTextSize: 25,
    titleTextLineHeight: 31,
    trustPaddingX: spacing.cardPaddingSmall,
    trustPaddingY: spacing.sm - 1,
    trustTextSize: 11,
    trustTextLineHeight: 15,
    serviceChipTextSize: 11,
    serviceChipTextLineHeight: 15,
    buttonHeight: 48,
    buttonMarginTop: spacing.xs,
    buttonMinWidth: 154,
    buttonPaddingX: spacing.xxl,
    dotsGap: spacing.sm - 1,
    dotsHeight: 7,
    dotsMinHeight: spacing.lg,
    dotsWidth: 7,
    dotsActiveWidth: 18,
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
    phaseRailStepMinWidth: 118,
    phaseRailDotSize: 10,
    phaseRailActivePillMinWidth: 52,
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

export const customerTheme = {
  lightLayer: {
    mode: 'light',
    canvas: color.background,
    base: color.mint.white,
    raised: color.surface.raised,
    service: color.surface.mint,
    water: color.mint.mint50,
    warm: '#FFF8EB',
    depthSurface: color.mint.auraSoft,
    ghost: 'rgba(255,253,248,0.78)',
    glass: 'rgba(255,255,255,0.58)',
    glassStrong: 'rgba(255,255,255,0.74)',
    glassWarm: 'rgba(255,253,246,0.68)',
    glassBorder: 'rgba(255,255,255,0.82)',
    glassHighlight: 'rgba(255,255,255,0.70)',
    glassShadow: '0 12px 30px rgba(13,70,65,0.09)',
    glassFloatShadow: '0 8px 20px rgba(13,70,65,0.07)',
    disabled: color.surface.disabled,
    border: 'rgba(35,96,84,0.13)',
    borderStrong: 'rgba(8,120,110,0.22)',
    text: color.text.primary,
    muted: color.text.secondary,
    subtleText: color.text.muted,
    primary: color.brand.primary,
    primaryText: color.text.inverse,
    aqua: color.accent.aqua,
    copper: '#BB743D',
    danger: color.accent.destructive,
  },
  darkLayer: {
    mode: 'dark',
    canvas: '#0B0F0E',
    base: '#111614',
    raised: '#171D1B',
    service: '#183832',
    water: '#172F31',
    warm: '#2A241D',
    depthSurface: '#131918',
    ghost: 'rgba(190,210,205,0.10)',
    glass: 'rgba(22,29,27,0.58)',
    glassStrong: 'rgba(30,38,35,0.68)',
    glassWarm: 'rgba(30,37,34,0.66)',
    glassBorder: 'rgba(190,210,205,0.16)',
    glassHighlight: 'rgba(230,244,240,0.13)',
    glassShadow: '0 22px 56px rgba(0,0,0,0.42)',
    glassFloatShadow: '0 12px 34px rgba(0,0,0,0.30)',
    disabled: '#1D2522',
    border: 'rgba(190,210,205,0.12)',
    borderStrong: 'rgba(105,222,198,0.26)',
    text: '#F1F6F4',
    muted: '#A9B7B3',
    subtleText: '#83938F',
    primary: '#63E6D0',
    primaryText: '#08201D',
    aqua: '#82DDE2',
    copper: '#E2A56E',
    danger: '#F29A8D',
  },
  reducedTransparency: {
    light: {
      ghost: '#FFFFFF',
      glass: '#FFFFFF',
      glassStrong: '#FFFFFF',
      glassWarm: '#FFF8EB',
    },
    dark: {
      ghost: '#161D1B',
      glass: '#161D1B',
      glassStrong: '#1D2522',
      glassWarm: '#2A241D',
    },
  },
} as const

export const glassSurfaceTheme = {
  shadowByVariant: {
    nav: {
      dark: '0 18px 36px rgba(0,0,0,0.28)',
      light: '0 18px 36px rgba(21,89,78,0.18), inset 0 1px 0 rgba(255,255,255,0.94)',
    },
    control: {
      dark: '0 6px 14px rgba(0,0,0,0.16)',
      light: '0 6px 14px rgba(13,70,65,0.07)',
    },
    hero: {
      dark: '0 12px 30px rgba(0,0,0,0.20)',
      light: '0 12px 30px rgba(13,70,65,0.09)',
    },
    sheet: {
      dark: '0 14px 34px rgba(0,0,0,0.22)',
      light: '0 14px 34px rgba(13,70,65,0.09)',
    },
    subtle: {
      dark: '0 4px 10px rgba(0,0,0,0.12)',
      light: '0 4px 10px rgba(13,70,65,0.05)',
    },
  },
  liquidShadowByVariant: {
    nav: {
      dark: '0 18px 34px rgba(0,0,0,0.24), inset 0 1px 0 rgba(190,210,205,0.10)',
      light: '0 18px 34px rgba(20,73,66,0.12), inset 0 1px 0 rgba(255,255,255,0.30)',
    },
    control: {
      dark: '0 8px 18px rgba(0,0,0,0.18), inset 0 1px 0 rgba(190,210,205,0.09)',
      light: '0 8px 18px rgba(20,73,66,0.07), inset 0 1px 0 rgba(255,255,255,0.28)',
    },
    hero: {
      dark: '0 16px 34px rgba(0,0,0,0.22), inset 0 1px 0 rgba(190,210,205,0.10)',
      light: '0 16px 34px rgba(20,73,66,0.09), inset 0 1px 0 rgba(255,255,255,0.30)',
    },
    sheet: {
      dark: '0 18px 38px rgba(0,0,0,0.26), inset 0 1px 0 rgba(190,210,205,0.10)',
      light: '0 18px 38px rgba(20,73,66,0.10), inset 0 1px 0 rgba(255,255,255,0.30)',
    },
    subtle: {
      dark: '0 6px 14px rgba(0,0,0,0.14), inset 0 1px 0 rgba(190,210,205,0.08)',
      light: '0 6px 14px rgba(20,73,66,0.05), inset 0 1px 0 rgba(255,255,255,0.24)',
    },
  },
  liquidFallbackBackground: {
    dark: '#161D1B',
    light: '#FFFFFF',
  },
  standardFallbackBackground: {
    dark: '#112522',
    light: '#FFFDF8',
  },
  liquidBackground: {
    dark: 'rgba(22,29,27,0.38)',
    navLight: 'rgba(255,255,255,0.10)',
    light: 'rgba(255,255,255,0.46)',
  },
  standardBackground: {
    dark: 'rgba(16,36,32,0.72)',
    navLight: 'rgba(255,255,255,0.78)',
    light: 'rgba(255,255,255,0.70)',
  },
  liquidBorder: {
    dark: 'rgba(190,210,205,0.16)',
    navLight: 'rgba(255,255,255,0.70)',
    light: 'rgba(255,255,255,0.34)',
  },
  standardBorder: {
    dark: 'rgba(255,255,255,0.14)',
    navLight: 'rgba(255,255,255,0.88)',
    light: 'rgba(255,255,255,0.78)',
  },
  opaqueRow: {
    darkBackground: '#122724',
    darkBorder: 'rgba(255,255,255,0.09)',
    lightBorder: 'rgba(210,232,225,0.82)',
  },
} as const

export const theme = { aura, color, component, customerTheme, glass, glassSurfaceTheme, radius, shadow, signature, spacing, typography } as const

export default theme
