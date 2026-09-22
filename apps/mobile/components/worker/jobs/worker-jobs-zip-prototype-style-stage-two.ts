import { StyleSheet } from 'react-native'

import { typography } from '@/design/theme'
import type { WorkerThemeTokens } from '../worker-theme'

export const stageTwoStyles = StyleSheet.create({
  hero: {
    alignItems: 'stretch',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 168,
    overflow: 'hidden',
  },
  heroWorkart: {
    alignSelf: 'stretch',
    height: '100%',
    width: '100%',
  },
  heroWorkartPanel: {
    alignSelf: 'stretch',
    flexBasis: '40%',
    flexGrow: 0,
    flexShrink: 0,
    justifyContent: 'center',
    minWidth: 0,
    overflow: 'hidden',
    position: 'relative',
    width: '40%',
  },
  heroWorkartWash: {
    bottom: 0,
    position: 'absolute',
    right: -1,
    top: 0,
    width: 42,
  },
  heroCopy: {
    flex: 1,
    gap: 7,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  heroMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  heroMetaItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    minHeight: 22,
  },
  heroMetaText: {
    ...typography.caption2,
    fontWeight: '600',
  },
  heroPrice: {
    ...typography.caption1,
    fontWeight: '500',
  },
  heroService: {
    ...typography.title2,
    fontWeight: '700',
  },
  heroArea: {
    ...typography.footnote,
    fontWeight: '500',
  },
  section: {
    gap: 8,
  },
})

export type StageTwoPillTone = 'amber' | 'mint' | 'neutral'

/**
 * Canvas metrics of the section cards. The cards fill the host's content band, so one canvas unit is
 * `containerWidth / canvasWidth` points; type is sized separately against the window so the host's
 * padding moves the layout without moving text.
 */
export const stageTwoCardTokens = {
  canvasWidth: 728,
  geometry: {
    actionGap: 17,
    actionGhostFlex: 330,
    actionHeight: 90,
    actionInsetBlur: 16,
    actionInsetY: 10,
    actionPrimaryFlex: 382,
    actionRadius: 23,
    actionShadowBlur: 28,
    actionShadowY: 12,
    cardPaddingBottom: 20,
    cardPaddingTop: 16,
    cardPaddingX: 24,
    cardRadius: 29,
    cardShadowBlur: 30,
    cardShadowY: 13,
    cardSpacing: 22,
    /** One gap between a mark and its copy, for the section header and every row alike. */
    contentGap: 22,
    dividerBottom: 14,
    dividerTop: 16,
    /** One size for every section and row mark. The marks carry no tile, so what keeps the icon
     *  column straight is that they share a box, which also puts each title and its rows' copy on
     *  one left edge. */
    glyph: 54,
    pillHeight: 50,
    pillMinWidth: { amber: 118, mint: 126, neutral: 94 },
    pillPaddingX: 16,
    rowDividerGap: 14,
    rowHeight: 72,
    rowSubTop: 6,
    sectionSubTop: 8,
  },
  stroke: { glyph: 1.95 },
  /** Vietnamese stacks a tone mark above a vowel diacritic (`Kỹ`, `Đề`), which a line box under this
   *  ratio clips on native even though CSS lets it overflow. */
  lineHeightFloor: 1.36,
  type: {
    action: { ratio: 1.2, size: 24, tracking: -0.24, weight: '700' },
    pill: { ratio: 1.2, size: 17, tracking: -0.16, weight: '600' },
    rowSub: { ratio: 1.28, size: 19, tracking: -0.08, weight: '500' },
    rowTitle: { ratio: 1.13, size: 24, tracking: -0.34, weight: '600' },
    sectionSub: { ratio: 1.24, size: 20, tracking: -0.1, weight: '500' },
    sectionTitle: { ratio: 1.08, size: 31, tracking: -0.5, weight: '700' },
  },
} as const

export type StageTwoTextKind = keyof typeof stageTwoCardTokens.type

export type StageTwoPalette = {
  card: string
  cardBorder: string | null
  cardShadow: string | null
  disabled: { background: string; border: string; text: string }
  ghost: { background: string; border: string; highlight: string | null; text: string }
  glyph: string
  line: string
  pill: Record<StageTwoPillTone, { colors: readonly [string, string]; text: string }>
  primary: { colors: readonly [string, string, string]; glow: string | null; text: string }
  rowSub: string
  rowTitle: string
  sectionSub: string
  sectionTitle: string
}

const LIGHT_PALETTE: Omit<StageTwoPalette, 'disabled'> = {
  card: 'rgba(254, 255, 255, 0.985)',
  cardBorder: null,
  cardShadow: 'rgba(92, 139, 137, 0.105)',
  ghost: {
    background: 'rgba(255, 255, 255, 0.72)',
    border: '#AEE2D9',
    highlight: 'rgba(255, 255, 255, 0.95)',
    text: '#0A8E80',
  },
  glyph: '#11AA8F',
  line: '#E2EAEE',
  pill: {
    amber: { colors: ['#FBF0DC', '#F9ECD8'], text: '#C67A16' },
    mint: { colors: ['#E4F8F2', '#DFF7F1'], text: '#0F8F7E' },
    neutral: { colors: ['#F0F4F7', '#EBF1F5'], text: '#243240' },
  },
  primary: { colors: ['#20CBB0', '#10B896', '#06977D'], glow: 'rgba(21, 181, 160, 0.22)', text: '#FFFFFF' },
  rowSub: '#6F8192',
  rowTitle: '#0B1A31',
  sectionSub: '#6A7F91',
  sectionTitle: '#0B1D35',
}

/** Light mode carries the approved colours; dark mode keeps the theme tokens the screen already used. */
export function stageTwoPalette(tokens: WorkerThemeTokens): StageTwoPalette {
  const disabled = { background: tokens.disabled, border: tokens.border, text: tokens.subtleText }
  if (tokens.mode !== 'dark') return { ...LIGHT_PALETTE, disabled }

  const flat = [tokens.base, tokens.base] as const
  return {
    card: tokens.raised,
    cardBorder: tokens.border,
    cardShadow: null,
    disabled,
    ghost: { background: tokens.raised, border: tokens.borderStrong, highlight: null, text: tokens.primary },
    glyph: tokens.primary,
    line: tokens.border,
    pill: {
      amber: { colors: flat, text: tokens.text },
      mint: { colors: flat, text: tokens.primary },
      neutral: { colors: flat, text: tokens.text },
    },
    primary: { colors: [tokens.primary, tokens.primary, tokens.primary], glow: null, text: tokens.primaryText },
    rowSub: tokens.muted,
    rowTitle: tokens.text,
    sectionSub: tokens.muted,
    sectionTitle: tokens.text,
  }
}
