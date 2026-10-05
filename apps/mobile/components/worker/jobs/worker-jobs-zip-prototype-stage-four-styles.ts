import { Dimensions, StyleSheet } from 'react-native'

import { component } from '@/design/theme'

import type { WorkerThemeTokens } from '../worker-theme'
import { stageButtonHeight, stageLayout, stageMetric } from './stage-ratio'

export type StageFourPalette = ReturnType<typeof getStageFourPalette>

export function getStageFourPalette(tokens: WorkerThemeTokens) {
  const dark = tokens.mode === 'dark'
  return {
    ctaSubtitle: '#E4FFF9',
    hairline: dark ? tokens.border : '#EFF3F2',
    placeholderBorder: dark ? tokens.border : '#E6EDF1',
    placeholderInk: dark ? tokens.subtleText : '#7F93A1',
    placeholderSurface: dark ? tokens.depthSurface : '#F3F6F8',
  }
}

export function createStageFourStyles(scale: number, tokens: WorkerThemeTokens) {
  const s = (value: number) => Math.round(value * scale)
  const m = (value: number) => stageMetric(value, Dimensions.get('window').width)
  const controlSize = Math.max(44, s(44))
  const palette = getStageFourPalette(tokens)
  // One gap drives both sides of the ETA sheet, so it stays exactly centred between the map card and the first content card.
  const etaSheetGap = s(28)
  const contentStackTop = s(6)

  return StyleSheet.create({
    actionIcon: {
      alignItems: 'center',
      backgroundColor: tokens.water,
      borderRadius: s(14),
      height: s(36),
      justifyContent: 'center',
      width: s(36),
    },
    card: {
      backgroundColor: tokens.base,
      borderColor: palette.hairline,
      borderRadius: m(stageLayout.cardRadius),
      borderWidth: 1,
      boxShadow: '0 2px 9px rgba(37, 73, 72, 0.035)',
      overflow: 'hidden',
    },
    cardContent: {
      padding: m(stageLayout.innerPadding),
    },
    chip: {
      alignItems: 'center',
      backgroundColor: tokens.base,
      borderRadius: s(22),
      boxShadow: '0 7px 24px rgba(29, 63, 67, 0.12)',
      flexDirection: 'row',
      gap: s(12),
      left: s(72),
      minHeight: Math.max(54, s(62)),
      paddingHorizontal: s(16),
      position: 'absolute',
      top: s(82),
      width: s(266),
      zIndex: 4,
    },
    chipCopy: {
      flex: 1,
      minWidth: 0,
    },
    chipIcon: {
      alignItems: 'center',
      backgroundColor: tokens.water,
      borderRadius: s(21),
      height: s(42),
      justifyContent: 'center',
      width: s(42),
    },
    contentStack: {
      gap: m(stageLayout.componentGap),
      paddingHorizontal: stageLayout.gutter,
    },
    customerActions: {
      flexDirection: 'row',
      gap: s(8),
    },
    customerBody: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: s(8),
      marginTop: s(3),
    },
    customerCopy: {
      flex: 1,
      minWidth: 0,
    },
    customerInitial: {
      alignItems: 'center',
      backgroundColor: tokens.water,
      borderRadius: s(21),
      height: s(42),
      justifyContent: 'center',
      width: s(42),
    },
    // Square inside the card's minimum height; a longer address stretches it vertically instead of resizing it.
    destinationArt: {
      alignItems: 'center',
      alignSelf: 'stretch',
      backgroundColor: palette.placeholderSurface,
      borderColor: palette.placeholderBorder,
      borderRadius: s(14),
      borderWidth: 1,
      gap: s(6),
      justifyContent: 'center',
      margin: s(8),
      marginLeft: 0,
      width: s(100),
    },
    destinationCard: {
      flexDirection: 'row',
      marginTop: contentStackTop,
      minHeight: s(116),
      padding: 0,
    },
    destinationCopy: {
      marginTop: s(10),
      minWidth: 0,
    },
    destinationMain: {
      flex: 1,
      minWidth: 0,
      padding: s(10),
      paddingBottom: s(12),
    },
    error: {
      color: tokens.danger,
      marginTop: s(1),
    },
    etaSheet: {
      backgroundColor: tokens.base,
      borderColor: palette.hairline,
      borderRadius: m(stageLayout.cardRadius),
      borderWidth: 1,
      marginBottom: etaSheetGap - contentStackTop,
      marginHorizontal: stageLayout.gutter,
      minHeight: Math.max(70, s(70)),
      paddingHorizontal: m(stageLayout.innerPadding),
      paddingVertical: s(8),
      zIndex: 5,
    },
    etaSheetRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: s(12),
      minHeight: Math.max(54, s(54)),
    },
    emptyMap: {
      alignItems: 'center',
      backgroundColor: tokens.service,
      justifyContent: 'center',
      paddingHorizontal: s(18),
    },
    hero: {
      backgroundColor: tokens.canvas,
      height: s(442),
      justifyContent: 'flex-end',
      overflow: 'hidden',
      position: 'relative',
    },
    mapControlColumn: {
      gap: s(9),
      position: 'absolute',
      right: s(12),
      top: s(134),
      zIndex: 4,
    },
    mapControl: {
      alignItems: 'center',
      backgroundColor: tokens.base,
      borderRadius: s(22),
      boxShadow: '0 3px 12px rgba(32, 68, 86, 0.06)',
      height: controlSize,
      justifyContent: 'center',
      width: controlSize,
    },
    // The live or empty map fills the whole hero above the ETA sheet, in flow so a taller sheet can never overlap it.
    mapCanvas: {
      borderBottomLeftRadius: s(24),
      borderBottomRightRadius: s(24),
      flex: 1,
      marginBottom: etaSheetGap,
      overflow: 'hidden',
    },
    mapImage: {
      bottom: 0,
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    },
    metric: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: s(7),
      minWidth: 0,
      paddingHorizontal: s(1),
    },
    metricStack: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      minWidth: 0,
    },
    noteCard: {
      minHeight: s(112),
      paddingBottom: s(12),
    },
    noteSurface: {
      alignItems: 'center',
      backgroundColor: tokens.service,
      borderRadius: s(13),
      flexDirection: 'row',
      gap: s(9),
      marginTop: s(12),
      minHeight: s(52),
      paddingHorizontal: s(12),
      paddingVertical: s(8),
    },
    primary: {
      alignItems: 'center',
      backgroundColor: tokens.primary,
      borderRadius: m(stageLayout.buttonRadius),
      borderColor: component.button.primary.border,
      borderWidth: 1,
      boxShadow: component.button.primary.boxShadow,
      height: stageButtonHeight(Dimensions.get('window').width),
      justifyContent: 'center',
      marginTop: s(1),
      overflow: 'hidden',
    },
    primaryCopy: {
      alignItems: 'center',
      flexShrink: 1,
    },
    primaryRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: s(11),
      justifyContent: 'center',
      paddingHorizontal: s(16),
    },
    screen: {
      backgroundColor: tokens.canvas,
      paddingBottom: s(10),
    },
    sectionTitle: {
      flex: 1,
      minWidth: 0,
    },
    sectionTitleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: s(9),
    },
    smallAction: {
      alignItems: 'center',
      backgroundColor: tokens.base,
      borderColor: palette.hairline,
      borderRadius: m(stageLayout.buttonRadius),
      borderWidth: 1,
      boxShadow: '0 2px 8px rgba(31, 85, 82, 0.04)',
      flex: 1,
      flexDirection: 'row',
      gap: s(6),
      justifyContent: 'center',
      minHeight: stageButtonHeight(Dimensions.get('window').width),
      paddingHorizontal: s(4),
    },
    smallActionRow: {
      flexDirection: 'row',
      gap: s(5),
      marginTop: s(0),
    },
    verticalDivider: {
      alignSelf: 'stretch',
      backgroundColor: palette.hairline,
      marginHorizontal: s(7),
      marginVertical: s(4),
      width: 1,
    },
    workAction: {
      alignItems: 'center',
      backgroundColor: tokens.service,
      borderRadius: s(14),
      flexShrink: 0,
      gap: s(3),
      justifyContent: 'center',
      minHeight: Math.max(50, s(50)),
      paddingHorizontal: s(4),
      width: s(58),
    },
  })
}
