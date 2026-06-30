// Worker dynamic style helpers (glass-earnings.ts), extracted from worker-surfaces.tsx (C4 stage 4).
import type { GlassMaterial } from '@/components/ui/tokens'
import { workerHasReducedGlass } from '../theme'
import type { WorkerThemeTokens } from '../theme'
import type { WorkerEarningsChromeVariant, WorkerHomeMaterialContrast, WorkerHomeMaterialDepth, WorkerHomeMaterialGroup, WorkerHomeMaterialRole, WorkerHomeMaterialSurface, WorkerKaelChatTone, WorkerProfileChromeVariant, WorkerProfileLevelMilestoneState, WorkerTone } from '../types'
import { workerJobsLiquidCardSurface } from './home-jobs'
import { workerHomeLiquidMaterialSystem } from './profile-map'

export function messageBubbleSurface(tokens: WorkerThemeTokens, { mine, system }: { mine: boolean; system: boolean }) {
  const backgroundColor = mine
    ? tokens.mode === 'dark'
      ? '#183832'
      : '#E1F8F2'
    : system
      ? tokens.mode === 'dark'
        ? '#172F31'
        : '#EBF9F8'
      : tokens.mode === 'dark'
        ? '#171D1B'
        : '#FFFDF8'

  return {
    backgroundColor,
    borderColor: system ? tokens.borderStrong : tokens.border,
    borderWidth: 1,
    boxShadow: 'none',
  }
}

export function workerKaelChatSurface(tokens: WorkerThemeTokens, tone: WorkerKaelChatTone) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const dark = tokens.mode === 'dark'
  const gradients: Record<WorkerKaelChatTone, string> = dark
    ? {
        agent: 'radial-gradient(circle at 92% 0%, rgba(105,222,198,0.14), transparent 34%), radial-gradient(circle at 10% 100%, rgba(230,244,240,0.052), transparent 38%), linear-gradient(145deg, rgba(24,31,29,0.84), rgba(13,17,16,0.74))',
        avatar: 'linear-gradient(145deg, rgba(30,38,35,0.78), rgba(18,23,22,0.70))',
        brief: 'radial-gradient(circle at 94% 12%, rgba(105,222,198,0.12), transparent 35%), linear-gradient(150deg, rgba(24,31,29,0.80), rgba(15,20,19,0.66))',
        bubble: 'linear-gradient(145deg, rgba(24,31,29,0.82), rgba(16,20,19,0.70))',
        composer: 'linear-gradient(135deg, rgba(24,31,29,0.82), rgba(15,20,19,0.74))',
        header: 'radial-gradient(circle at 88% 16%, rgba(105,222,198,0.12), transparent 30%), linear-gradient(135deg, rgba(24,31,29,0.84), rgba(15,20,19,0.74))',
        icon: 'linear-gradient(145deg, rgba(30,38,35,0.78), rgba(18,23,22,0.70))',
        send: 'linear-gradient(145deg, #69DEC6, #10A594)',
        status: 'linear-gradient(135deg, rgba(29,44,40,0.82), rgba(17,22,21,0.68))',
        step: 'linear-gradient(145deg, rgba(30,38,35,0.78), rgba(16,22,21,0.66))',
      }
    : {
        agent: 'radial-gradient(circle at 92% 0%, rgba(156,238,221,0.82), transparent 32%), radial-gradient(circle at 4% 100%, rgba(255,245,229,0.76), transparent 36%), linear-gradient(145deg, rgba(255,253,248,0.98), rgba(224,249,243,0.93))',
        avatar: 'linear-gradient(145deg, rgba(255,253,248,0.98), rgba(232,252,247,0.78))',
        brief: 'radial-gradient(circle at 94% 12%, rgba(156,238,221,0.62), transparent 35%), linear-gradient(150deg, rgba(217,251,242,0.92), rgba(236,255,250,0.82))',
        bubble: 'linear-gradient(145deg, rgba(255,253,248,0.98), rgba(255,249,239,0.92))',
        composer: 'linear-gradient(135deg, rgba(255,253,248,0.98), rgba(239,255,250,0.94))',
        header: 'radial-gradient(circle at 88% 16%, rgba(156,238,221,0.74), transparent 32%), linear-gradient(135deg, rgba(255,253,248,0.98), rgba(226,250,244,0.98))',
        icon: 'linear-gradient(145deg, rgba(217,251,242,0.95), rgba(255,253,248,0.82))',
        send: 'linear-gradient(145deg, #10A594, #078B7C)',
        status: 'linear-gradient(135deg, rgba(217,251,242,0.96), rgba(255,253,248,0.80))',
        step: 'linear-gradient(145deg, rgba(255,253,248,0.86), rgba(232,252,247,0.78))',
      }
  const backgroundColor = dark
    ? tone === 'send'
      ? '#69DEC6'
      : tone === 'brief'
        ? '#183832'
        : tone === 'icon'
          ? tokens.mint
        : '#171D1B'
    : tone === 'send'
      ? '#078B7C'
      : tone === 'brief'
        ? '#D9FBF2'
        : tone === 'icon'
          ? tokens.mint
        : '#FFFDF8'
  const borderColor = dark
    ? tone === 'agent' || tone === 'brief' ? 'rgba(230,244,240,0.16)' : 'rgba(230,244,240,0.12)'
    : tone === 'agent' || tone === 'brief' || tone === 'composer' || tone === 'header'
      ? 'rgba(8,139,124,0.30)'
      : 'rgba(8,139,124,0.22)'
  const shadow = dark
    ? tone === 'agent' || tone === 'brief' || tone === 'composer' || tone === 'header'
      ? '0 16px 34px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.10)'
      : '0 8px 18px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.08)'
    : tone === 'agent' || tone === 'brief'
      ? '0 15px 36px rgba(16,74,66,0.11), inset 0 1px 0 rgba(255,255,255,0.88)'
      : tone === 'header'
        ? '0 15px 36px rgba(16,74,66,0.12), inset 0 1px 0 rgba(255,255,255,0.92)'
        : tone === 'composer'
          ? '0 18px 40px rgba(16,74,66,0.12), inset 0 1px 0 rgba(255,255,255,0.92)'
          : tone === 'send'
            ? '0 10px 22px rgba(8,139,124,0.22), inset 0 1px 0 rgba(255,255,255,0.22)'
            : '0 6px 14px rgba(16,74,66,0.06), inset 0 1px 0 rgba(255,255,255,0.72)'

  return {
    backgroundColor,
    borderColor,
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : shadow,
    background: reduceTransparency ? undefined : gradients[tone],
    backgroundImage: reduceTransparency ? undefined : gradients[tone],
    experimental_backgroundImage: reduceTransparency ? undefined : gradients[tone],
  } as any
}

export function workerChatModePillGlassLayer(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 72% 16%, rgba(245,255,252,0.18), transparent 38%), linear-gradient(145deg, rgba(245,255,252,0.12), rgba(105,222,198,0.09))'
    : 'radial-gradient(circle at 72% 10%, rgba(255,255,255,0.98), transparent 42%), linear-gradient(145deg, rgba(255,255,255,0.96), rgba(235,255,250,0.78))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(245,255,252,0.12)' : 'rgba(255,255,255,0.92)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? 'inset 0 1px 0 rgba(190,210,205,0.16)'
        : '0 8px 20px rgba(13,134,119,0.06), inset 0 1px 0 rgba(255,255,255,0.98)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerChatModePillTextHighlight(tokens: WorkerThemeTokens) {
  return {
    textShadowColor: tokens.mode === 'dark' ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.94)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: tokens.mode === 'dark' ? 2 : 3,
  }
}

export function workerOpaqueCardSurface(tokens: WorkerThemeTokens, tone: WorkerTone = 'base', reduceTransparency = false) {
  const isWarm = tone === 'cream' || tone === 'warm'
  const isMint = tone === 'mint'
  const isCyan = tone === 'cyan'
  const backgroundColor = isWarm
    ? tokens.mode === 'dark'
      ? '#30271E'
      : '#FFF8EB'
    : isMint
      ? tokens.mode === 'dark'
        ? '#183832'
        : '#E8F9F4'
      : isCyan
        ? tokens.mode === 'dark'
          ? '#172F31'
          : '#EBF9F8'
        : tokens.mode === 'dark'
          ? '#171D1B'
          : '#FFFDF8'
  const experimentalBackgroundImage = tokens.mode === 'dark'
    ? isWarm
      ? 'linear-gradient(180deg, rgba(48,39,30,0.82), rgba(18,23,22,0.72))'
      : isMint
        ? 'linear-gradient(180deg, rgba(24,56,50,0.76), rgba(18,23,22,0.70))'
        : isCyan
          ? 'linear-gradient(180deg, rgba(23,47,49,0.76), rgba(18,23,22,0.70))'
          : 'linear-gradient(180deg, rgba(24,31,29,0.72), rgba(13,17,16,0.66))'
    : isWarm
      ? 'linear-gradient(180deg, rgba(255,248,235,0.96), rgba(255,253,248,0.90))'
      : isMint
        ? 'linear-gradient(180deg, rgba(232,249,244,0.96), rgba(255,253,248,0.90))'
        : isCyan
          ? 'linear-gradient(180deg, rgba(235,249,248,0.96), rgba(255,253,248,0.90))'
          : 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(255,253,248,0.90))'
  return {
    backgroundColor,
    borderColor: tokens.border,
    borderWidth: 1,
    boxShadow: tokens.mode === 'dark' ? '0 8px 22px rgba(0,0,0,0.18)' : '0 8px 22px rgba(17,70,61,0.06)',
    experimental_backgroundImage: reduceTransparency ? undefined : experimentalBackgroundImage,
  } as any
}

export function workerJobCardSurface(tokens: WorkerThemeTokens, tone: WorkerTone = 'base') {
  return workerJobsLiquidCardSurface(tokens, tone)
}

export function workerEarningsChromeRadius(variant: WorkerEarningsChromeVariant) {
  if (variant === 'hero') return 32
  if (variant === 'ledger') return 29
  if (variant === 'chart' || variant === 'cell') return 22
  return 24
}

export function workerEarningsChromeInsetRadius(variant: WorkerEarningsChromeVariant) {
  return Math.max(workerEarningsChromeRadius(variant) - 4, 16)
}

export function workerEarningsChromeWash(tokens: WorkerThemeTokens, variant: WorkerEarningsChromeVariant) {
  const prominent = variant === 'hero'
  const gradient = tokens.mode === 'dark'
    ? prominent
      ? 'radial-gradient(circle at 82% 14%, rgba(105,222,198,0.12), transparent 32%), linear-gradient(180deg, rgba(190,210,205,0.055), rgba(0,0,0,0))'
      : 'linear-gradient(180deg, rgba(190,210,205,0.045), rgba(105,222,198,0.030))'
    : prominent
      ? 'radial-gradient(circle at 82% 14%, rgba(23,169,149,0.11), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.74), rgba(230,255,248,0.26))'
      : 'linear-gradient(180deg, rgba(255,255,255,0.78), rgba(230,255,248,0.34))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.020)' : 'rgba(255,255,255,0.22)',
    background: gradient,
    backgroundImage: gradient,
    borderRadius: workerEarningsChromeRadius(variant),
    experimental_backgroundImage: gradient,
    opacity: prominent ? 0.92 : 0.72,
  } as any
}

export function workerEarningsChromeRefraction(tokens: WorkerThemeTokens, variant: WorkerEarningsChromeVariant) {
  const prominent = variant === 'hero' || variant === 'chart'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 50% 50%, rgba(105,222,198,0.095), transparent 66%)'
    : 'radial-gradient(circle at 50% 50%, rgba(23,169,149,0.105), transparent 66%)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.040)' : 'rgba(23,169,149,0.045)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
    opacity: prominent ? 0.72 : 0.48,
  } as any
}

export function workerEarningsChromeCrispShell(tokens: WorkerThemeTokens, variant: WorkerEarningsChromeVariant) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.18)' : 'rgba(255,255,255,0.86)',
    borderRadius: workerEarningsChromeRadius(variant),
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.14), inset 0 -1px 0 rgba(105,222,198,0.070)'
      : 'inset 0 1px 0 rgba(255,255,255,0.94), inset 0 -1px 0 rgba(9,121,106,0.12)',
  } as any
}

export function workerEarningsChromeInnerInset(tokens: WorkerThemeTokens, variant: WorkerEarningsChromeVariant) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.085)' : 'rgba(9,121,106,0.075)',
    borderRadius: workerEarningsChromeInsetRadius(variant),
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.060)'
      : 'inset 0 1px 0 rgba(255,255,255,0.70)',
  } as any
}

export function workerEarningsChromeTopEdge(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(230,244,240,0), rgba(230,244,240,0.18) 22%, rgba(105,222,198,0.055) 58%, rgba(230,244,240,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.90) 22%, rgba(195,255,243,0.48) 58%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.10)' : 'rgba(255,255,255,0.76)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerEarningsChromeBottomEdge(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(0,0,0,0), rgba(105,222,198,0.070) 50%, rgba(0,0,0,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(9,121,106,0.12) 50%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.040)' : 'rgba(9,121,106,0.080)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerEarningsTrendSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 82% 18%, rgba(105,222,198,0.085), transparent 32%), radial-gradient(circle at 18% 0%, rgba(230,244,240,0.050), transparent 34%), linear-gradient(145deg, rgba(24,31,29,0.72), rgba(12,16,15,0.58))'
    : 'radial-gradient(circle at 82% 18%, rgba(23,169,149,0.12), transparent 32%), linear-gradient(145deg, rgba(255,255,255,0.64), rgba(239,255,251,0.50))'

  return {
    backgroundColor: reduceTransparency ? (tokens.mode === 'dark' ? '#161D1B' : '#F8FFFC') : tokens.mode === 'dark' ? 'rgba(22,29,27,0.58)' : 'rgba(255,255,255,0.46)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.16)' : 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, 'readiness'),
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerEarningsChartSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(180deg, rgba(24,31,29,0.72), rgba(13,17,16,0.62))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(239,255,251,0.74))'

  return {
    backgroundColor: tokens.mode === 'dark' ? '#171D1B' : '#F8FFFC',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(16,131,115,0.12)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 10px 24px rgba(0,0,0,0.20)' : '0 12px 26px rgba(17,70,61,0.09)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerEarningsBarSurface(tokens: WorkerThemeTokens, hasDailyEarnings: boolean) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? hasDailyEarnings
      ? 'linear-gradient(180deg, #69DEC6, #08786E)'
      : 'linear-gradient(180deg, rgba(105,222,198,0.96), rgba(8,120,110,0.78))'
    : hasDailyEarnings
      ? 'linear-gradient(180deg, #3ED8BC, #08786E)'
      : 'linear-gradient(180deg, #42DCC4 0%, #16BCA9 54%, #08786E 100%)'

  return {
    backgroundColor: hasDailyEarnings ? tokens.primary : tokens.mode === 'dark' ? '#69DEC6' : '#16BCA9',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 8px 14px rgba(0,0,0,0.24)' : '0 10px 18px rgba(8,120,110,0.24)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerEarningsMiniSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(180deg, rgba(24,31,29,0.72), rgba(13,17,16,0.62))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(240,255,251,0.88))'

  return {
    backgroundColor: tokens.mode === 'dark' ? '#171D1B' : '#F8FFFC',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(35,96,84,0.13)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 10px 24px rgba(0,0,0,0.20)' : '0 10px 24px rgba(17,70,61,0.07)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerEarningsLedgerSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(180deg, rgba(24,31,29,0.72), rgba(13,17,16,0.62))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(240,255,251,0.86))'

  return {
    backgroundColor: tokens.mode === 'dark' ? '#171D1B' : '#F8FFFC',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(35,96,84,0.13)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 10px 24px rgba(0,0,0,0.18)' : '0 10px 24px rgba(17,70,61,0.07)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerEarningsRowSurface(tokens: WorkerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.026)' : 'rgba(255,255,255,0.42)',
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.070)' : 'rgba(16,131,115,0.070)',
    borderWidth: 1,
  } as any
}

export function workerDiagnosisSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(135deg, #173F37, #102E2A)'
    : 'linear-gradient(135deg, #E0FFF7, #F0FFFB)'
  return {
    backgroundColor: tokens.mode === 'dark' ? '#143832' : '#EFFFFA',
    borderColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.26)' : 'rgba(16,131,115,0.20)',
    borderWidth: 1,
    boxShadow: 'none',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerPrimaryButtonSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(135deg, #69DEC6, #08786E)'
    : 'linear-gradient(135deg, #08786E, #0AA895)'
  return {
    backgroundColor: reduceTransparency ? tokens.primary : tokens.mode === 'dark' ? tokens.aqua : '#0B5C50',
    borderColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.24)' : 'rgba(255,255,255,0.28)',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 14px 25px rgba(0,0,0,0.22)' : '0 14px 25px rgba(9,121,106,0.22)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
    transition: reduceTransparency ? undefined : 'transform 130ms ease, filter 130ms ease',
  } as any
}

export function workerSecondaryButtonSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  return {
    backgroundColor: reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(24,31,29,0.74)' : 'rgba(255,255,255,0.72)',
    borderColor: reduceTransparency ? tokens.border : tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(20,117,105,0.12)',
    boxShadow: 'none',
    transition: reduceTransparency ? undefined : 'transform 130ms ease',
    experimental_backgroundImage: reduceTransparency
      ? undefined
      : tokens.mode === 'dark'
      ? 'linear-gradient(180deg, rgba(24,31,29,0.72), rgba(13,17,16,0.62))'
      : undefined,
  } as any
}

export function workerJobsSegmentLiquidSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 50% 0%, rgba(105,222,198,0.08), transparent 38%), linear-gradient(180deg, rgba(22,29,27,0.70), rgba(15,22,21,0.58))'
    : 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.72), transparent 38%), radial-gradient(circle at 28% 100%, rgba(147,255,232,0.18), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.58), rgba(247,249,248,0.42))'

  return {
    backgroundColor: reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(22,29,27,0.64)' : 'rgba(255,255,255,0.48)',
    borderColor: reduceTransparency ? tokens.borderStrong : workerLiquidEdgeHighlight(tokens),
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, 'mapControl'),
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerJobsSegmentRefraction(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(100deg, rgba(190,210,205,0), rgba(190,210,205,0.10), rgba(105,222,198,0.055), rgba(190,210,205,0))'
    : 'linear-gradient(100deg, rgba(255,255,255,0), rgba(255,255,255,0.82), rgba(207,255,243,0.34), rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.07)' : 'rgba(255,255,255,0.56)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerJobsSegmentCrispShell(tokens: WorkerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.18)' : 'rgba(255,255,255,0.84)',
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.13), inset 0 -1px 0 rgba(105,222,198,0.060)'
      : 'inset 0 1px 0 rgba(255,255,255,0.94), inset 0 -1px 0 rgba(0,117,106,0.10)',
  } as any
}

export function workerJobsSegmentTopEdge(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(190,210,205,0), rgba(190,210,205,0.16) 28%, rgba(105,222,198,0.090) 62%, rgba(190,210,205,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.88) 28%, rgba(195,255,243,0.42) 62%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.10)' : 'rgba(255,255,255,0.72)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerLiquidEdgeHighlight(tokens: WorkerThemeTokens) {
  return tokens.mode === 'dark' ? 'rgba(190,210,205,0.14)' : 'rgba(255,255,255,0.46)'
}

export function workerHomeMaterialRole(surface: WorkerHomeMaterialSurface) {
  return workerHomeLiquidMaterialSystem.surfaces[surface].role
}

export function workerHomeMaterialDepth(surface: WorkerHomeMaterialSurface) {
  return workerHomeLiquidMaterialSystem.surfaces[surface].depth
}

export function workerHomeMaterialContrast(surface: WorkerHomeMaterialSurface) {
  return workerHomeLiquidMaterialSystem.surfaces[surface].contrast
}

export function workerHomeMaterialDepthShadow(tokens: WorkerThemeTokens, surface: WorkerHomeMaterialSurface) {
  const depth = workerHomeMaterialDepth(surface)
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'

  if (reduceTransparency) return 'none'

  if (tokens.mode === 'dark') {
    if (depth === 'anchored') return '0 20px 42px rgba(0,0,0,0.34), 0 0 0 1px rgba(190,210,205,0.10), inset 0 1px 0 rgba(190,210,205,0.11)'
    if (depth === 'focus') return '0 24px 56px rgba(0,0,0,0.32), 0 0 38px rgba(105,222,198,0.055), inset 0 1px 0 rgba(190,210,205,0.14), inset 0 -18px 28px rgba(105,222,198,0.045)'
    if (depth === 'floating') return '0 12px 26px rgba(0,0,0,0.24), 0 0 0 1px rgba(190,210,205,0.055), inset 0 1px 0 rgba(190,210,205,0.10)'
    if (depth === 'content') return '0 7px 16px rgba(0,0,0,0.10), inset 0 1px 0 rgba(190,210,205,0.055)'
    return '0 18px 42px rgba(0,0,0,0.26), 0 0 0 1px rgba(190,210,205,0.070), inset 0 1px 0 rgba(190,210,205,0.12)'
  }

  if (depth === 'anchored') return '0 20px 42px rgba(20,73,66,0.12), 0 0 0 1px rgba(255,255,255,0.72), inset 0 1px 0 rgba(255,255,255,0.46)'
  if (depth === 'focus') return '0 24px 54px rgba(20,73,66,0.13), 0 0 42px rgba(76,222,199,0.072), inset 0 1px 0 rgba(255,255,255,0.88), inset 0 -18px 28px rgba(20,117,105,0.038)'
  if (depth === 'floating') return '0 12px 26px rgba(20,73,66,0.10), 0 0 0 1px rgba(255,255,255,0.66), inset 0 1px 0 rgba(255,255,255,0.58)'
  if (depth === 'content') return '0 7px 16px rgba(17,70,61,0.030), inset 0 1px 0 rgba(255,255,255,0.78)'
  return '0 18px 42px rgba(20,73,66,0.11), 0 0 0 1px rgba(255,255,255,0.76), inset 0 1px 0 rgba(255,255,255,0.82)'
}

export function workerHomeMaterialSubstrateSurface(tokens: WorkerThemeTokens, surface: 'map' | 'readiness' | 'sheet') {
  const map = surface === 'map'
  const gradient = tokens.mode === 'dark'
    ? map
      ? 'radial-gradient(circle at 32% 38%, rgba(105,222,198,0.10), transparent 28%), radial-gradient(circle at 76% 18%, rgba(190,210,205,0.06), transparent 32%), linear-gradient(155deg, rgba(24,32,30,0.46), rgba(12,18,17,0.08))'
      : 'radial-gradient(circle at 76% 18%, rgba(105,222,198,0.11), transparent 30%), linear-gradient(145deg, rgba(190,210,205,0.045), rgba(0,0,0,0))'
    : map
      ? 'radial-gradient(circle at 32% 38%, rgba(23,169,149,0.12), transparent 28%), radial-gradient(circle at 76% 18%, rgba(255,255,255,0.78), transparent 32%), linear-gradient(155deg, rgba(255,255,255,0.44), rgba(236,244,242,0.08))'
      : 'radial-gradient(circle at 76% 18%, rgba(23,169,149,0.10), transparent 30%), linear-gradient(145deg, rgba(255,255,255,0.52), rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark'
      ? map ? 'rgba(190,210,205,0.022)' : 'rgba(190,210,205,0.026)'
      : map ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.24)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
    opacity: map ? 0.9 : 0.82,
  } as any
}

export function workerHomeMaterialDepthPlaneSurface(tokens: WorkerThemeTokens, surface: 'map' | 'readiness' | 'sheet') {
  const map = surface === 'map'
  const sheet = surface === 'sheet'
  const contrast = workerHomeMaterialContrast(surface)
  const gradient = tokens.mode === 'dark'
    ? map
      ? 'linear-gradient(180deg, rgba(190,210,205,0.09), rgba(190,210,205,0.018) 32%, rgba(0,0,0,0) 66%, rgba(0,117,106,0.08)), radial-gradient(circle at 78% 18%, rgba(105,222,198,0.10), transparent 30%)'
      : 'linear-gradient(180deg, rgba(190,210,205,0.075), rgba(190,210,205,0.018) 36%, rgba(0,0,0,0) 64%, rgba(0,117,106,0.07)), radial-gradient(circle at 86% 18%, rgba(105,222,198,0.12), transparent 32%)'
    : map
      ? 'linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.18) 33%, rgba(255,255,255,0) 63%, rgba(20,117,105,0.065)), radial-gradient(circle at 80% 18%, rgba(147,255,232,0.20), transparent 31%)'
      : 'linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,255,255,0.20) 36%, rgba(255,255,255,0) 64%, rgba(20,117,105,0.055)), radial-gradient(circle at 86% 18%, rgba(147,255,232,0.24), transparent 33%)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.016)' : 'rgba(255,255,255,0.13)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
    opacity: map ? 0.42 : contrast === 'prominent' ? (sheet ? 0.82 : 0.88) : 0.76,
  } as any
}

export function workerHomeMaterialTopEdge(tokens: WorkerThemeTokens, surface: 'map' | 'readiness' | 'sheet') {
  const readiness = surface === 'readiness' || surface === 'sheet'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(190,210,205,0), rgba(190,210,205,0.16) 22%, rgba(105,222,198,0.10) 56%, rgba(190,210,205,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.90) 22%, rgba(194,255,243,0.48) 56%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.10)' : 'rgba(255,255,255,0.72)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
    opacity: readiness ? 0.58 : 0.66,
  } as any
}

export function workerHomeMaterialBottomEdge(tokens: WorkerThemeTokens, surface: 'map' | 'readiness' | 'sheet') {
  const readiness = surface === 'readiness' || surface === 'sheet'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(0,0,0,0), rgba(0,117,106,0.16) 40%, rgba(0,0,0,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(0,117,106,0.10) 40%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(0,117,106,0.10)' : 'rgba(0,117,106,0.08)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
    opacity: readiness ? 0.44 : 0.5,
  } as any
}

export function workerLiquidSharpKeyline(tokens: WorkerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.18)' : 'rgba(255,255,255,0.82)',
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.12), inset 0 -1px 0 rgba(0,0,0,0.14)'
      : 'inset 0 1px 0 rgba(255,255,255,0.96), inset 0 -1px 0 rgba(20,117,105,0.08)',
  } as any
}

export function workerLiquidSpecularBand(tokens: WorkerThemeTokens, variant: 'hero' | 'panel' | 'sheet') {
  const panel = variant === 'panel'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(105deg, rgba(190,210,205,0), rgba(190,210,205,0.10) 42%, rgba(105,222,198,0.06) 56%, rgba(190,210,205,0) 78%)'
    : 'linear-gradient(105deg, rgba(255,255,255,0), rgba(255,255,255,0.76) 42%, rgba(207,255,243,0.36) 56%, rgba(255,255,255,0) 78%)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.08)' : 'rgba(255,255,255,0.70)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
    opacity: panel ? 0.50 : 0.58,
  } as any
}

export function workerLiquidRefractionPool(tokens: WorkerThemeTokens, variant: 'hero' | 'panel' | 'sheet') {
  const panel = variant === 'panel'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 50% 50%, rgba(105,222,198,0.10), transparent 62%)'
    : 'radial-gradient(circle at 50% 50%, rgba(23,169,149,0.13), transparent 62%)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.06)' : 'rgba(23,169,149,0.08)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
    opacity: panel ? 0.54 : 0.62,
  } as any
}

export function workerMapLiquidLens(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(118deg, rgba(190,210,205,0), rgba(190,210,205,0.045) 46%, rgba(105,222,198,0.045) 60%, rgba(190,210,205,0) 82%)'
    : 'linear-gradient(118deg, rgba(255,255,255,0), rgba(255,255,255,0.34) 46%, rgba(23,169,149,0.08) 60%, rgba(255,255,255,0) 82%)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.025)' : 'rgba(255,255,255,0.22)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerMapLiquidGlassOverlay(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(112deg, rgba(190,210,205,0) 8%, rgba(190,210,205,0.07) 34%, rgba(105,222,198,0.08) 47%, rgba(190,210,205,0.026) 58%, rgba(190,210,205,0) 78%), radial-gradient(circle at 20% 18%, rgba(105,222,198,0.08), transparent 28%), radial-gradient(circle at 82% 70%, rgba(190,210,205,0.05), transparent 34%)'
    : 'linear-gradient(112deg, rgba(255,255,255,0) 8%, rgba(255,255,255,0.40) 34%, rgba(147,255,232,0.18) 47%, rgba(255,255,255,0.12) 58%, rgba(255,255,255,0) 78%), radial-gradient(circle at 20% 18%, rgba(255,255,255,0.44), transparent 28%), radial-gradient(circle at 82% 70%, rgba(76,222,199,0.11), transparent 34%)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.018)' : 'rgba(255,255,255,0.08)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
    opacity: tokens.mode === 'dark' ? 0.46 : 0.52,
  } as any
}

export function workerMapLiquidGlassEdge(tokens: WorkerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.20)' : 'rgba(255,255,255,0.82)',
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.17), inset 0 -1px 0 rgba(105,222,198,0.11), inset 1px 0 0 rgba(190,210,205,0.07)'
      : 'inset 0 1px 0 rgba(255,255,255,0.96), inset 0 -1px 0 rgba(76,222,199,0.18), inset 1px 0 0 rgba(255,255,255,0.52)',
  } as any
}

export function workerMapLiquidSpecularArc(tokens: WorkerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.11)' : 'rgba(255,255,255,0.68)',
    boxShadow: tokens.mode === 'dark'
      ? '0 14px 34px rgba(0,0,0,0.14)'
      : '0 14px 30px rgba(255,255,255,0.42)',
  } as any
}

export function workerPanelLiquidGlassOverlay(tokens: WorkerThemeTokens, variant: 'panel' | 'sheet') {
  const sheet = variant === 'sheet'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(128deg, rgba(190,210,205,0) 10%, rgba(190,210,205,0.095) 34%, rgba(105,222,198,0.16) 50%, rgba(190,210,205,0.045) 61%, rgba(190,210,205,0) 82%), radial-gradient(circle at 84% 14%, rgba(105,222,198,0.17), transparent 26%)'
    : 'linear-gradient(128deg, rgba(255,255,255,0) 10%, rgba(255,255,255,0.62) 34%, rgba(147,255,232,0.36) 50%, rgba(255,255,255,0.22) 61%, rgba(255,255,255,0) 82%), radial-gradient(circle at 84% 14%, rgba(76,222,199,0.24), transparent 27%)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.035)' : 'rgba(255,255,255,0.20)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
    opacity: sheet ? 0.72 : 0.86,
  } as any
}

export function workerMapSharpInset(tokens: WorkerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.14)' : 'rgba(255,255,255,0.72)',
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.12), inset 0 -1px 0 rgba(0,0,0,0.18)'
      : 'inset 0 1px 0 rgba(255,255,255,0.90), inset 0 -1px 0 rgba(20,117,105,0.08)',
  } as any
}
