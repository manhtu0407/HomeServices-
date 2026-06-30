// Worker dynamic style helpers (profile-map.ts), extracted from worker-surfaces.tsx (C4 stage 4).
import type { GlassMaterial } from '@/components/ui/tokens'
import { workerHasReducedGlass } from '../theme'
import type { WorkerThemeTokens } from '../theme'
import type { WorkerEarningsChromeVariant, WorkerHomeMaterialContrast, WorkerHomeMaterialDepth, WorkerHomeMaterialGroup, WorkerHomeMaterialRole, WorkerHomeMaterialSurface, WorkerKaelChatTone, WorkerProfileChromeVariant, WorkerProfileLevelMilestoneState, WorkerTone } from '../types'
import { workerHomeMaterialDepthShadow } from './glass-earnings'
import { workerHomeLiquidSheetSurface } from './home-jobs'

export function workerProfileHeroSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 84% 16%, rgba(105,222,198,0.090), transparent 31%), radial-gradient(circle at 24% 8%, rgba(230,244,240,0.080), transparent 34%), linear-gradient(135deg, rgba(28,36,33,0.70), rgba(12,16,15,0.54))'
    : 'radial-gradient(circle at 86% 14%, rgba(23,169,149,0.12), transparent 31%), linear-gradient(135deg, rgba(255,255,255,0.66), rgba(241,255,251,0.52))'

  return {
    backgroundColor: reduceTransparency ? (tokens.mode === 'dark' ? '#161D1B' : '#F8FFFC') : tokens.mode === 'dark' ? 'rgba(22,29,27,0.54)' : 'rgba(255,255,255,0.48)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.18)' : 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, 'readiness'),
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerProfileChromeRadius(variant: WorkerProfileChromeVariant) {
  if (variant === 'hero') return 30
  if (variant === 'form') return 29
  if (variant === 'preference') return 29
  if (variant === 'collapsed') return 24
  if (variant === 'mini') return 20
  return 29
}

export function workerProfileChromeInsetRadius(variant: WorkerProfileChromeVariant) {
  return Math.max(workerProfileChromeRadius(variant) - 4, 15)
}

export function workerProfileChromeWash(tokens: WorkerThemeTokens, variant: WorkerProfileChromeVariant) {
  const prominent = variant === 'hero' || variant === 'form'
  const gradient = tokens.mode === 'dark'
    ? prominent
      ? 'radial-gradient(circle at 82% 14%, rgba(105,222,198,0.075), transparent 32%), linear-gradient(180deg, rgba(230,244,240,0.070), rgba(0,0,0,0))'
      : 'linear-gradient(180deg, rgba(230,244,240,0.052), rgba(105,222,198,0.018))'
    : prominent
      ? 'radial-gradient(circle at 82% 14%, rgba(23,169,149,0.10), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.76), rgba(230,255,248,0.24))'
      : 'linear-gradient(180deg, rgba(255,255,255,0.78), rgba(230,255,248,0.30))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.018)' : 'rgba(255,255,255,0.22)',
    background: gradient,
    backgroundImage: gradient,
    borderRadius: workerProfileChromeRadius(variant),
    experimental_backgroundImage: gradient,
    opacity: prominent ? 0.92 : 0.70,
  } as any
}

export function workerProfileChromeRefraction(tokens: WorkerThemeTokens, variant: WorkerProfileChromeVariant) {
  const prominent = variant === 'hero' || variant === 'form'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 50% 50%, rgba(105,222,198,0.060), transparent 66%)'
    : 'radial-gradient(circle at 50% 50%, rgba(23,169,149,0.10), transparent 66%)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.026)' : 'rgba(23,169,149,0.042)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
    opacity: prominent ? 0.70 : 0.46,
  } as any
}

export function workerProfileChromeCrispShell(tokens: WorkerThemeTokens, variant: WorkerProfileChromeVariant) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.19)' : 'rgba(255,255,255,0.86)',
    borderRadius: workerProfileChromeRadius(variant),
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(230,244,240,0.15), inset 0 -1px 0 rgba(105,222,198,0.045)'
      : 'inset 0 1px 0 rgba(255,255,255,0.94), inset 0 -1px 0 rgba(9,121,106,0.12)',
  } as any
}

export function workerProfileChromeInnerInset(tokens: WorkerThemeTokens, variant: WorkerProfileChromeVariant) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.085)' : 'rgba(9,121,106,0.075)',
    borderRadius: workerProfileChromeInsetRadius(variant),
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.060)'
      : 'inset 0 1px 0 rgba(255,255,255,0.70)',
  } as any
}

export function workerProfileChromeTopEdge(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(230,244,240,0), rgba(230,244,240,0.20) 22%, rgba(105,222,198,0.060) 58%, rgba(230,244,240,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.90) 22%, rgba(195,255,243,0.48) 58%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.11)' : 'rgba(255,255,255,0.76)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerProfileChromeBottomEdge(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(0,0,0,0), rgba(105,222,198,0.075) 50%, rgba(0,0,0,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(9,121,106,0.12) 50%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.045)' : 'rgba(9,121,106,0.080)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}
export function workerProfileLevelOrbSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 38% 24%, rgba(230,244,240,0.12), transparent 30%), linear-gradient(145deg, rgba(105,222,198,0.13), rgba(22,29,27,0.68))'
    : 'radial-gradient(circle at 38% 24%, rgba(255,255,255,0.92), transparent 30%), linear-gradient(145deg, rgba(211,255,246,0.96), rgba(247,255,252,0.78))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.12)' : 'rgba(226,255,249,0.90)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.16)' : 'rgba(8,139,124,0.12)',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 12px 26px rgba(0,0,0,0.28), inset 0 1px 0 rgba(230,244,240,0.10)' : '0 12px 26px rgba(17,70,61,0.08)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerProfileProgressTrackSurface(tokens: WorkerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.045)' : 'rgba(255,255,255,0.54)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.075)' : 'rgba(16,131,115,0.070)',
  } as any
}

export function workerProfileProgressFillSurface(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, #69DEC6, #0AA895)'
    : 'linear-gradient(90deg, #B7FFF0, #17A995)'

  return {
    backgroundColor: tokens.primary,
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerProfileLevelChipSurface(tokens: WorkerThemeTokens, state: WorkerProfileLevelMilestoneState, selected: boolean) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const isOpen = state === 'open' || state === 'next'
  const isMystery = state === 'mystery'
  const gradient = tokens.mode === 'dark'
    ? selected
      ? 'linear-gradient(145deg, rgba(105,222,198,0.13), rgba(230,244,240,0.055))'
      : 'linear-gradient(145deg, rgba(230,244,240,0.038), rgba(105,222,198,0.014))'
    : selected
      ? 'linear-gradient(145deg, rgba(223,255,248,0.90), rgba(255,255,255,0.60))'
      : 'linear-gradient(145deg, rgba(255,255,255,0.56), rgba(239,255,251,0.26))'

  return {
    backgroundColor: tokens.mode === 'dark'
      ? selected ? 'rgba(105,222,198,0.085)' : 'rgba(230,244,240,0.022)'
      : selected ? 'rgba(226,255,249,0.78)' : 'rgba(255,255,255,0.46)',
    borderColor: tokens.mode === 'dark'
      ? selected ? 'rgba(230,244,240,0.15)' : isOpen ? 'rgba(105,222,198,0.075)' : 'rgba(230,244,240,0.060)'
      : selected ? 'rgba(8,139,124,0.18)' : isOpen ? 'rgba(8,139,124,0.10)' : 'rgba(16,131,115,0.060)',
    boxShadow: reduceTransparency || !selected ? 'none' : tokens.mode === 'dark' ? '0 10px 22px rgba(0,0,0,0.18)' : '0 10px 22px rgba(17,70,61,0.060)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
    opacity: isMystery ? 0.72 : 1,
  } as any
}

export function workerProfileLevelChipSheen(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(255,255,255,0.20), rgba(255,255,255,0.02))'
    : 'linear-gradient(90deg, rgba(255,255,255,0.78), rgba(255,255,255,0.08))'

  return {
    backgroundColor: tokens.glassHighlight,
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerProfileLevelMilestoneSurface(tokens: WorkerThemeTokens, state: WorkerProfileLevelMilestoneState) {
  const isCurrent = state === 'current'
  const isMystery = state === 'mystery'
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? isCurrent
      ? 'linear-gradient(135deg, rgba(105,222,198,0.11), rgba(230,244,240,0.048))'
      : 'linear-gradient(135deg, rgba(230,244,240,0.036), rgba(105,222,198,0.014))'
    : isCurrent
      ? 'linear-gradient(135deg, rgba(219,255,248,0.86), rgba(255,255,255,0.54))'
      : 'linear-gradient(135deg, rgba(255,255,255,0.52), rgba(239,255,251,0.24))'

  return {
    backgroundColor: tokens.mode === 'dark'
      ? isCurrent ? 'rgba(105,222,198,0.072)' : 'rgba(230,244,240,0.020)'
      : isCurrent ? 'rgba(226,255,249,0.62)' : 'rgba(255,255,255,0.42)',
    borderColor: tokens.mode === 'dark'
      ? isCurrent ? 'rgba(230,244,240,0.14)' : isMystery ? 'rgba(230,244,240,0.050)' : 'rgba(230,244,240,0.072)'
      : isCurrent ? 'rgba(8,139,124,0.15)' : isMystery ? 'rgba(16,131,115,0.048)' : 'rgba(16,131,115,0.075)',
    boxShadow: reduceTransparency || !isCurrent ? 'none' : tokens.mode === 'dark' ? '0 10px 24px rgba(0,0,0,0.18)' : '0 10px 22px rgba(17,70,61,0.065)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
    opacity: isMystery ? 0.76 : 1,
  } as any
}

export function workerProfileLevelMilestoneBadgeSurface(tokens: WorkerThemeTokens, state: WorkerProfileLevelMilestoneState) {
  const isCurrent = state === 'current'
  return {
    backgroundColor: tokens.mode === 'dark'
      ? isCurrent ? 'rgba(105,222,198,0.105)' : 'rgba(230,244,240,0.024)'
      : isCurrent ? 'rgba(209,255,246,0.88)' : 'rgba(255,255,255,0.50)',
    borderColor: tokens.mode === 'dark'
      ? isCurrent ? 'rgba(230,244,240,0.15)' : 'rgba(230,244,240,0.066)'
      : isCurrent ? 'rgba(8,139,124,0.16)' : 'rgba(16,131,115,0.070)',
  } as any
}

export function workerProfileLevelScrollTrackSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = workerHasReducedGlass(tokens)
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(230,244,240,0.018), rgba(230,244,240,0.070), rgba(105,222,198,0.028), rgba(230,244,240,0.018))'
    : 'linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0.56), rgba(211,255,246,0.22), rgba(255,255,255,0.18))'

  return {
    backgroundColor: reduceTransparency
      ? tokens.mode === 'dark' ? 'rgba(230,244,240,0.050)' : 'rgba(255,255,255,0.60)'
      : tokens.mode === 'dark' ? 'rgba(230,244,240,0.026)' : 'rgba(255,255,255,0.32)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.080)' : 'rgba(255,255,255,0.68)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? 'inset 0 1px 0 rgba(230,244,240,0.070), inset 0 -1px 0 rgba(0,0,0,0.18)'
        : 'inset 0 1px 0 rgba(255,255,255,0.82), 0 6px 14px rgba(17,70,61,0.050)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerProfileLevelScrollThumbSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = workerHasReducedGlass(tokens)
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(230,244,240,0.20), rgba(230,244,240,0.42), rgba(105,222,198,0.18))'
    : 'linear-gradient(90deg, rgba(255,255,255,0.74), rgba(255,255,255,0.94), rgba(191,255,242,0.58))'

  return {
    backgroundColor: reduceTransparency
      ? tokens.mode === 'dark' ? 'rgba(230,244,240,0.24)' : 'rgba(8,139,124,0.24)'
      : tokens.mode === 'dark' ? 'rgba(230,244,240,0.24)' : 'rgba(255,255,255,0.72)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.18)' : 'rgba(8,139,124,0.11)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? '0 4px 12px rgba(0,0,0,0.24), inset 0 1px 0 rgba(230,244,240,0.18)'
        : '0 6px 16px rgba(17,70,61,0.070), inset 0 1px 0 rgba(255,255,255,0.96)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerProfileLevelScrollEdgeSurface(tokens: WorkerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(255,255,255,0.72)',
  } as any
}

export function workerProfileLevelScrollSheenSurface(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(255,255,255,0.18), transparent 58%)'
    : 'linear-gradient(90deg, rgba(255,255,255,0.94), transparent 58%)'

  return {
    backgroundColor: tokens.glassHighlight,
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerProfileMiniSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 82% 8%, rgba(230,244,240,0.060), transparent 36%), linear-gradient(180deg, rgba(24,31,29,0.74), rgba(13,17,16,0.58))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(240,255,251,0.86))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(22,29,27,0.66)' : '#F8FFFC',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(35,96,84,0.12)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 14px 30px rgba(0,0,0,0.30), inset 0 1px 0 rgba(230,244,240,0.08)' : '0 10px 22px rgba(17,70,61,0.06)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerProfilePreferenceSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 86% 0%, rgba(230,244,240,0.050), transparent 34%), linear-gradient(180deg, rgba(24,31,29,0.72), rgba(13,17,16,0.58))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(240,255,251,0.86))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(22,29,27,0.66)' : '#F8FFFC',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(35,96,84,0.12)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 14px 32px rgba(0,0,0,0.30), inset 0 1px 0 rgba(230,244,240,0.08)' : '0 10px 24px rgba(17,70,61,0.07)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerProfilePanelSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 86% 0%, rgba(230,244,240,0.056), transparent 34%), linear-gradient(180deg, rgba(24,31,29,0.72), rgba(13,17,16,0.56))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(240,255,251,0.86))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(22,29,27,0.66)' : '#F8FFFC',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(35,96,84,0.13)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 15px 34px rgba(0,0,0,0.31), inset 0 1px 0 rgba(230,244,240,0.08)' : '0 10px 24px rgba(17,70,61,0.07)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerProfileLevelCornerAura(tokens: WorkerThemeTokens) {
  if (workerHasReducedGlass(tokens)) {
    return {
      backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.048)' : 'rgba(105,222,198,0.090)',
    } as any
  }

  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(225deg, rgba(105,222,198,0.10), rgba(230,244,240,0.030) 42%, transparent 74%)'
    : 'linear-gradient(225deg, rgba(105,222,198,0.30), rgba(105,222,198,0.12) 42%, transparent 74%)'

  return {
    backgroundColor: 'transparent',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerProfileRowSurface(tokens: WorkerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.022)' : 'rgba(255,255,255,0.42)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.065)' : 'rgba(16,131,115,0.070)',
    borderWidth: 1,
  } as any
}

export function workerProfileLevelSignalSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = workerHasReducedGlass(tokens)
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 50% 0%, rgba(230,244,240,0.070), transparent 48%), linear-gradient(145deg, rgba(230,244,240,0.055), rgba(13,17,16,0.54))'
    : 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.96), transparent 48%), linear-gradient(145deg, rgba(255,255,255,0.82), rgba(232,255,249,0.48))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(22,29,27,0.54)' : 'rgba(255,255,255,0.58)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? 'inset 0 1px 0 rgba(230,244,240,0.10), 0 14px 24px rgba(0,0,0,0.26)'
        : 'inset 0 1px 0 rgba(255,255,255,0.86), 0 12px 24px rgba(17,70,61,0.08)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerProfileLevelSignalGlass(tokens: WorkerThemeTokens) {
  if (workerHasReducedGlass(tokens)) {
    return { backgroundColor: 'transparent' } as any
  }

  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(160deg, rgba(230,244,240,0.080), transparent 42%, rgba(105,222,198,0.030))'
    : 'linear-gradient(160deg, rgba(255,255,255,0.82), transparent 42%, rgba(195,255,243,0.38))'

  return {
    backgroundColor: 'transparent',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerProfileLevelSignalTopEdge(tokens: WorkerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.14)' : 'rgba(255,255,255,0.82)',
  } as any
}

export function workerProfilePreferenceRowSurface(tokens: WorkerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.020)' : 'rgba(255,255,255,0.36)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.052)' : 'rgba(16,131,115,0.055)',
    borderWidth: 1,
  } as any
}

export function workerProfileInputSurface(tokens: WorkerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.024)' : 'rgba(255,255,255,0.50)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.082)' : 'rgba(16,131,115,0.090)',
  } as any
}

export function workerProfileServiceAreaSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(180deg, rgba(230,244,240,0.040), rgba(105,222,198,0.016))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.72), rgba(230,255,248,0.30))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.020)' : 'rgba(255,255,255,0.42)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.082)' : 'rgba(16,131,115,0.085)',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? 'inset 0 1px 0 rgba(230,244,240,0.055)' : 'inset 0 1px 0 rgba(255,255,255,0.66)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerProfileFileButtonSurface(tokens: WorkerThemeTokens, selected: boolean) {
  return {
    backgroundColor: selected
      ? tokens.mode === 'dark' ? 'rgba(105,222,198,0.12)' : 'rgba(218,255,247,0.78)'
      : tokens.mode === 'dark' ? 'rgba(230,244,240,0.022)' : 'rgba(255,255,255,0.46)',
    borderColor: selected
      ? tokens.mode === 'dark' ? 'rgba(105,222,198,0.24)' : 'rgba(8,139,124,0.18)'
      : tokens.mode === 'dark' ? 'rgba(230,244,240,0.072)' : 'rgba(16,131,115,0.080)',
  } as any
}

export function workerMapViewportSurface(tokens: WorkerThemeTokens, material: GlassMaterial = 'standard') {
  if (material === 'liquid') {
    return {
      backgroundColor: tokens.mode === 'dark' ? '#161D1B' : '#F6F7F7',
      borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.10)' : 'rgba(255,255,255,0.58)',
      borderWidth: 1,
      experimental_backgroundImage:
        tokens.mode === 'dark'
          ? 'radial-gradient(circle at 34% 42%, rgba(105,222,198,0.10), transparent 25%), radial-gradient(circle at 78% 22%, rgba(190,210,205,0.06), transparent 30%), linear-gradient(145deg, #161D1B, #101615 58%, #18201E)'
          : 'radial-gradient(circle at 34% 42%, rgba(23,169,149,0.13), transparent 25%), radial-gradient(circle at 78% 22%, rgba(255,255,255,0.74), transparent 30%), linear-gradient(145deg, #FFFFFF 0%, #EEF2F1 58%, #F7F8F8 100%)',
    } as any
  }

  return {
    backgroundColor: tokens.mode === 'dark' ? tokens.depth : '#ECFFF8',
    experimental_backgroundImage:
      tokens.mode === 'dark'
        ? 'radial-gradient(circle at 24% 28%, rgba(105,222,198,0.11), transparent 28%), radial-gradient(circle at 82% 32%, rgba(230,244,240,0.060), transparent 30%), linear-gradient(145deg, #131918, #171D1B 58%, #1D2522)'
        : 'radial-gradient(circle at 27% 49%, rgba(134,237,220,0.72), transparent 23%), radial-gradient(circle at 83% 31%, rgba(151,226,220,0.54), transparent 31%), radial-gradient(circle at 86% 85%, rgba(255,226,173,0.70), transparent 31%), linear-gradient(145deg, #F7FFF8 0%, #D7F7EE 50%, #FFF2D8 100%)',
  } as any
}

export function workerMapModalSheetSurface(tokens: WorkerThemeTokens, material: GlassMaterial = 'standard') {
  if (material === 'liquid') {
    return workerHomeLiquidSheetSurface(tokens)
  }

  const backgroundColor = tokens.mode === 'dark' ? 'rgba(22,29,27,0.86)' : 'rgba(252,255,252,0.96)'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 82% 8%, rgba(230,244,240,0.070), transparent 34%), linear-gradient(180deg, rgba(24,31,29,0.82), rgba(13,17,16,0.78))'
    : 'linear-gradient(180deg, rgba(252,255,252,0.98), rgba(244,252,248,0.96))'

  return {
    backgroundColor,
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.14)' : 'rgba(20,117,105,0.14)',
    experimental_backgroundImage: gradient,
  } as any
}


export const workerHomeLiquidMaterialSystem: {
  accent: 'mint'
  applePath: 'functional-layer-depth-hierarchy'
  maxVisibleGlassLayers: 3
  surfaces: Record<WorkerHomeMaterialSurface, {
    blurCap?: 14 | 18 | 22 | 24 | 26
    contrast: WorkerHomeMaterialContrast
    depth: WorkerHomeMaterialDepth
    glassLayer: 0 | 1 | 2 | 3
    group: WorkerHomeMaterialGroup
    role: WorkerHomeMaterialRole
  }>
} = {
  accent: 'mint',
  applePath: 'functional-layer-depth-hierarchy',
  maxVisibleGlassLayers: 3,
  surfaces: {
    cta: { blurCap: 18, contrast: 'prominent', depth: 'focus', glassLayer: 3, group: 'control', role: 'glass-focus' },
    dock: { blurCap: 24, contrast: 'prominent', depth: 'anchored', glassLayer: 3, group: 'navigation', role: 'glass-control' },
    map: { blurCap: 22, contrast: 'standard', depth: 'substrate', glassLayer: 1, group: 'surface', role: 'substrate' },
    mapControl: { blurCap: 18, contrast: 'standard', depth: 'floating', glassLayer: 2, group: 'control', role: 'glass-control' },
    mapHud: { blurCap: 18, contrast: 'standard', depth: 'floating', glassLayer: 2, group: 'control', role: 'glass-control' },
    readiness: { blurCap: 22, contrast: 'prominent', depth: 'focus', glassLayer: 1, group: 'surface', role: 'glass-focus' },
    sheet: { blurCap: 26, contrast: 'prominent', depth: 'focus', glassLayer: 3, group: 'surface', role: 'glass-focus' },
    tile: { contrast: 'quiet', depth: 'content', glassLayer: 0, group: 'content', role: 'opaque-content' },
  },
}
