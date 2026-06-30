// Worker dynamic style helpers (home-jobs.ts), extracted from worker-surfaces.tsx (C4 stage 4).
import type { GlassMaterial } from '@/components/ui/tokens'
import { workerHasReducedGlass } from '../theme'
import type { WorkerThemeTokens } from '../theme'
import type { WorkerEarningsChromeVariant, WorkerHomeMaterialContrast, WorkerHomeMaterialDepth, WorkerHomeMaterialGroup, WorkerHomeMaterialRole, WorkerHomeMaterialSurface, WorkerKaelChatTone, WorkerProfileChromeVariant, WorkerProfileLevelMilestoneState, WorkerTone } from '../types'
import { workerHomeMaterialDepthShadow, workerLiquidEdgeHighlight } from './glass-earnings'

export function workerHomeLiquidHeroSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 62% 20%, rgba(105,222,198,0.08), transparent 31%), linear-gradient(155deg, rgba(24,32,30,0.82), rgba(15,22,21,0.58) 62%, rgba(20,28,26,0.70))'
    : 'radial-gradient(circle at 62% 20%, rgba(23,169,149,0.07), transparent 31%), linear-gradient(155deg, rgba(255,255,255,0.78), rgba(242,246,245,0.46) 64%, rgba(255,255,255,0.62))'

  return {
    backgroundColor: reduceTransparency ? (tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF') : tokens.mode === 'dark' ? 'rgba(22,29,27,0.56)' : 'rgba(255,255,255,0.40)',
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.13)' : 'rgba(255,255,255,0.58)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, 'map'),
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerHomeLiquidControlSurface(tokens: WorkerThemeTokens, tone: 'activeButton' | 'button' | 'control' | 'status' = 'control') {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const active = tone === 'activeButton'
  const status = tone === 'status'
  const gradient = tokens.mode === 'dark'
    ? active
      ? 'linear-gradient(145deg, rgba(105,222,198,0.18), rgba(22,29,27,0.84))'
      : 'linear-gradient(145deg, rgba(31,42,40,0.86), rgba(22,29,27,0.70))'
    : active
      ? 'linear-gradient(145deg, rgba(232,252,247,0.92), rgba(255,255,255,0.70))'
      : 'linear-gradient(145deg, rgba(255,255,255,0.78), rgba(246,248,248,0.58))'

  return {
    backgroundColor: reduceTransparency
      ? tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF'
      : tokens.mode === 'dark'
        ? active ? 'rgba(105,222,198,0.14)' : 'rgba(22,29,27,0.68)'
        : status ? 'rgba(255,255,255,0.68)' : 'rgba(255,255,255,0.62)',
    borderColor: reduceTransparency ? tokens.borderStrong : active ? (tokens.mode === 'dark' ? 'rgba(105,222,198,0.26)' : 'rgba(23,169,149,0.20)') : workerLiquidEdgeHighlight(tokens),
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, active ? 'cta' : status ? 'mapHud' : 'mapControl'),
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerHomeDockGlassSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 18% 8%, rgba(190,210,205,0.10), transparent 31%), radial-gradient(circle at 54% 94%, rgba(105,222,198,0.050), transparent 42%), linear-gradient(180deg, rgba(31,42,40,0.40), rgba(22,29,27,0.18))'
    : 'radial-gradient(circle at 18% 8%, rgba(255,255,255,0.44), transparent 34%), radial-gradient(circle at 50% 96%, rgba(23,169,149,0.018), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.11), rgba(255,255,255,0.026))'
  return {
    backgroundColor: reduceTransparency
      ? tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF'
        : tokens.mode === 'dark' ? 'rgba(22,29,27,0.32)' : 'rgba(255,255,255,0.052)',
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.13)' : 'rgba(255,255,255,0.78)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? '0 13px 28px rgba(0,0,0,0.24), inset 0 1px 0 rgba(190,210,205,0.12), inset 0 -1px 0 rgba(0,117,106,0.08)'
        : '0 10px 22px rgba(31,92,82,0.040), 0 2px 8px rgba(255,255,255,0.30), inset 0 1px 0 rgba(255,255,255,0.86), inset 0 -1px 0 rgba(8,120,110,0.045)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerDockKaelActionSurface(tokens: WorkerThemeTokens, active: boolean) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? active
      ? 'radial-gradient(circle at 34% 15%, rgba(255,255,255,0.20), transparent 34%), radial-gradient(circle at 70% 72%, rgba(190,210,205,0.12), transparent 42%), linear-gradient(145deg, rgba(31,42,40,0.28), rgba(22,29,27,0.10))'
      : 'radial-gradient(circle at 34% 15%, rgba(255,255,255,0.16), transparent 34%), radial-gradient(circle at 70% 72%, rgba(190,210,205,0.09), transparent 42%), linear-gradient(145deg, rgba(31,42,40,0.22), rgba(22,29,27,0.08))'
    : active
      ? 'radial-gradient(circle at 32% 14%, rgba(255,255,255,0.92), transparent 36%), radial-gradient(circle at 72% 76%, rgba(255,255,255,0.38), transparent 44%), linear-gradient(145deg, rgba(255,255,255,0.34), rgba(255,255,255,0.10))'
      : 'radial-gradient(circle at 32% 14%, rgba(255,255,255,0.84), transparent 36%), radial-gradient(circle at 72% 76%, rgba(255,255,255,0.28), transparent 44%), linear-gradient(145deg, rgba(255,255,255,0.26), rgba(255,255,255,0.08))'

  return {
    backgroundColor: reduceTransparency
      ? tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF'
      : tokens.mode === 'dark'
        ? active ? 'rgba(31,42,40,0.28)' : 'rgba(31,42,40,0.22)'
        : active ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.22)',
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: reduceTransparency
      ? tokens.borderStrong
      : tokens.mode === 'dark'
        ? active ? 'rgba(190,210,205,0.24)' : 'rgba(190,210,205,0.18)'
        : active ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.90)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? '0 14px 26px rgba(0,0,0,0.20), inset 0 1px 0 rgba(190,210,205,0.18), inset 0 -1px 0 rgba(190,210,205,0.06)'
        : '0 0 0 1px rgba(255,255,255,0.62), 0 12px 24px rgba(31,92,82,0.035), 0 2px 10px rgba(255,255,255,0.38), inset 0 1px 0 rgba(255,255,255,0.98), inset 0 -1px 0 rgba(20,73,66,0.06)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerDockKaelActionEdgeSurface(tokens: WorkerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.22)' : 'rgba(255,255,255,0.98)',
    boxShadow: tokens.mode === 'dark'
      ? '0 0 0 1px rgba(190,210,205,0.08), inset 0 1px 0 rgba(190,210,205,0.18), inset 0 -1px 0 rgba(190,210,205,0.06)'
      : '0 0 0 1px rgba(255,255,255,0.72), inset 0 1px 0 rgba(255,255,255,0.98), inset 0 -1px 0 rgba(20,73,66,0.06)',
  } as any
}

export function workerDockKaelActionAuraSurface(tokens: WorkerThemeTokens, active: boolean) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle, rgba(190,210,205,0.12), rgba(255,255,255,0.035) 48%, transparent 76%)'
    : 'radial-gradient(circle, rgba(255,255,255,0.46), rgba(255,255,255,0.12) 48%, transparent 76%)'
  return {
    backgroundColor: reduceTransparency
      ? 'transparent'
      : tokens.mode === 'dark'
        ? active ? 'rgba(190,210,205,0.09)' : 'rgba(190,210,205,0.06)'
        : active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.12)',
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerHomeHeaderPillSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  return {
    backgroundColor: reduceTransparency
      ? tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF'
      : tokens.mode === 'dark' ? 'rgba(190,210,205,0.045)' : 'rgba(255,255,255,0.58)',
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.11)' : 'rgba(20,73,66,0.10)',
    color: tokens.primary,
  } as any
}

export function workerHomeMapControlButtonKeyline(tokens: WorkerThemeTokens, active = false) {
  return {
    borderColor: active
      ? tokens.mode === 'dark' ? 'rgba(230,244,240,0.18)' : 'rgba(255,255,255,0.82)'
      : tokens.mode === 'dark' ? 'rgba(190,210,205,0.12)' : 'rgba(255,255,255,0.72)',
    boxShadow: tokens.mode === 'dark'
      ? active ? 'inset 0 1px 0 rgba(190,210,205,0.14), inset 0 -1px 0 rgba(0,117,106,0.22)' : 'inset 0 1px 0 rgba(190,210,205,0.09)'
      : active ? 'inset 0 1px 0 rgba(255,255,255,0.90), inset 0 -1px 0 rgba(0,117,106,0.12)' : 'inset 0 1px 0 rgba(255,255,255,0.78)',
  } as any
}

export function workerHomeToggleTrackKeyline(tokens: WorkerThemeTokens, active = false) {
  return {
    borderColor: active
      ? tokens.mode === 'dark' ? 'rgba(190,210,205,0.24)' : 'rgba(255,255,255,0.72)'
      : tokens.mode === 'dark' ? 'rgba(190,210,205,0.12)' : 'rgba(20,73,66,0.10)',
    boxShadow: tokens.mode === 'dark'
      ? active ? 'inset 0 1px 0 rgba(190,210,205,0.16), inset 0 -1px 0 rgba(0,0,0,0.18)' : 'inset 0 1px 0 rgba(190,210,205,0.08)'
      : active ? 'inset 0 1px 0 rgba(255,255,255,0.76), inset 0 -1px 0 rgba(0,117,106,0.14)' : 'inset 0 1px 0 rgba(255,255,255,0.60)',
  } as any
}

export function workerHomeAvailabilityToggleTrackSurface(tokens: WorkerThemeTokens, active = false, disabled = false) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const offGradient = tokens.mode === 'dark'
    ? 'linear-gradient(145deg, rgba(190,210,205,0.08), rgba(22,29,27,0.82))'
    : 'linear-gradient(145deg, rgba(255,255,255,0.92), rgba(235,245,242,0.76))'
  const activeGradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 76% 44%, rgba(190,210,205,0.24), transparent 30%), linear-gradient(135deg, rgba(105,222,198,0.82), rgba(0,117,106,0.96))'
    : 'radial-gradient(circle at 76% 44%, rgba(255,255,255,0.52), transparent 30%), linear-gradient(135deg, rgba(71,204,184,0.82), rgba(0,130,116,0.96))'
  const gradient = active ? activeGradient : offGradient

  return {
    backgroundColor: reduceTransparency
      ? active ? tokens.primary : tokens.raised
      : active ? tokens.primary : tokens.mode === 'dark' ? 'rgba(190,210,205,0.10)' : 'rgba(255,255,255,0.82)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: reduceTransparency ? tokens.borderStrong : active ? tokens.primary : tokens.border,
    boxShadow: reduceTransparency
      ? 'none'
      : active
        ? tokens.mode === 'dark' ? '0 12px 28px rgba(0,117,106,0.22), inset 0 1px 0 rgba(190,210,205,0.18)' : '0 14px 30px rgba(0,117,106,0.18), inset 0 1px 0 rgba(255,255,255,0.62)'
        : tokens.mode === 'dark' ? 'inset 0 1px 0 rgba(190,210,205,0.09)' : 'inset 0 1px 0 rgba(255,255,255,0.70)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
    opacity: disabled ? 0.72 : 1,
  } as any
}

export function workerHomeAvailabilityToggleFill(tokens: WorkerThemeTokens, active = false) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(135deg, rgba(105,222,198,0.78), rgba(0,117,106,0.96))'
    : 'linear-gradient(135deg, rgba(112,231,211,0.80), rgba(0,130,116,0.98))'

  return {
    backgroundColor: reduceTransparency
      ? active ? tokens.primary : tokens.raised
      : active ? tokens.primary : tokens.mode === 'dark' ? 'rgba(105,222,198,0.18)' : 'rgba(112,231,211,0.22)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerHomeAvailabilityToggleKnob(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  return {
    backgroundColor: tokens.mode === 'dark' ? '#F5FFFC' : '#FFFFFF',
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.18)' : 'rgba(255,255,255,0.82)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark' ? '0 6px 14px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.52)' : '0 6px 16px rgba(20,73,66,0.16), inset 0 1px 0 rgba(255,255,255,0.96)',
  } as any
}

export function workerHomeLiquidReadinessSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 82% 16%, rgba(105,222,198,0.11), transparent 28%), linear-gradient(160deg, rgba(24,33,31,0.96), rgba(15,22,21,0.88) 64%, rgba(22,29,27,0.94))'
    : 'radial-gradient(circle at 82% 16%, rgba(23,169,149,0.085), transparent 30%), linear-gradient(160deg, rgba(255,255,255,0.96), rgba(245,248,247,0.74) 64%, rgba(255,255,255,0.86))'

  return {
    backgroundColor: reduceTransparency ? (tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF') : tokens.mode === 'dark' ? 'rgba(22,29,27,0.78)' : 'rgba(255,255,255,0.66)',
    borderColor: reduceTransparency ? tokens.borderStrong : workerLiquidEdgeHighlight(tokens),
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, 'readiness'),
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerHomeDisabledPrimaryButtonSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(145deg, rgba(190,210,205,0.08), rgba(22,29,27,0.74))'
    : 'linear-gradient(145deg, rgba(255,255,255,0.72), rgba(239,245,243,0.64))'

  return {
    backgroundColor: reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(22,29,27,0.70)' : 'rgba(246,249,248,0.76)',
    borderColor: reduceTransparency ? tokens.border : tokens.mode === 'dark' ? 'rgba(190,210,205,0.12)' : 'rgba(20,73,66,0.09)',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? 'inset 0 1px 0 rgba(190,210,205,0.08)' : 'inset 0 1px 0 rgba(255,255,255,0.76)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerHomeReadinessActionWellSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(145deg, rgba(190,210,205,0.045), rgba(22,29,27,0.10))'
    : 'linear-gradient(145deg, rgba(255,255,255,0.54), rgba(244,249,248,0.18))'

  return {
    backgroundColor: reduceTransparency
      ? tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF'
      : tokens.mode === 'dark' ? 'rgba(190,210,205,0.035)' : 'rgba(255,255,255,0.34)',
    borderColor: reduceTransparency ? tokens.border : tokens.mode === 'dark' ? 'rgba(190,210,205,0.08)' : 'rgba(255,255,255,0.62)',
    borderRadius: 21,
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? 'inset 0 1px 0 rgba(190,210,205,0.06)' : 'inset 0 1px 0 rgba(255,255,255,0.62)',
    padding: 4,
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerHomeLiquidPrimaryButtonSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(135deg, #69DEC6, #00756A)'
    : 'linear-gradient(135deg, #17A995, #00756A)'

  return {
    backgroundColor: reduceTransparency ? tokens.primary : tokens.mode === 'dark' ? '#69DEC6' : '#17A995',
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.14)' : 'rgba(255,255,255,0.30)',
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, 'cta'),
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerHomeLiquidButtonSheen(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(100deg, rgba(255,255,255,0), rgba(255,255,255,0.24), rgba(255,255,255,0))'
    : 'linear-gradient(100deg, rgba(255,255,255,0), rgba(255,255,255,0.54), rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.38)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerHomeLiquidSheetSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 86% 10%, rgba(105,222,198,0.08), transparent 28%), linear-gradient(180deg, rgba(22,29,27,0.96), rgba(15,22,21,0.94))'
    : 'radial-gradient(circle at 86% 10%, rgba(23,169,149,0.08), transparent 30%), linear-gradient(180deg, rgba(255,255,255,0.96), rgba(247,248,248,0.94))'

  return {
    backgroundColor: reduceTransparency ? (tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF') : tokens.mode === 'dark' ? 'rgba(22,29,27,0.78)' : 'rgba(255,255,255,0.70)',
    borderColor: reduceTransparency ? tokens.borderStrong : workerLiquidEdgeHighlight(tokens),
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, 'sheet'),
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerJobsSectionWash(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 50% 0%, rgba(105,222,198,0.070), transparent 42%), linear-gradient(180deg, rgba(190,210,205,0.030), rgba(0,0,0,0))'
    : 'radial-gradient(circle at 50% 0%, rgba(76,222,199,0.115), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.52), rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.018)' : 'rgba(255,255,255,0.24)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerJobsSectionReflection(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(105deg, rgba(190,210,205,0), rgba(190,210,205,0.075) 42%, rgba(105,222,198,0.035) 58%, rgba(190,210,205,0))'
    : 'linear-gradient(105deg, rgba(255,255,255,0), rgba(255,255,255,0.62) 42%, rgba(207,255,243,0.25) 58%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.040)' : 'rgba(255,255,255,0.34)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerJobsSectionBottomLens(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 50% 50%, rgba(105,222,198,0.075), transparent 64%)'
    : 'radial-gradient(circle at 50% 50%, rgba(76,222,199,0.13), transparent 64%)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.030)' : 'rgba(76,222,199,0.060)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerJobsSectionCrispShell(tokens: WorkerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.16)' : 'rgba(255,255,255,0.72)',
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.10), inset 0 -1px 0 rgba(105,222,198,0.065), 0 16px 42px rgba(0,0,0,0.18)'
      : 'inset 0 1px 0 rgba(255,255,255,0.86), inset 0 -1px 0 rgba(9,121,106,0.10), 0 16px 38px rgba(20,73,66,0.060)',
  } as any
}

export function workerJobsSectionTopEdge(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(190,210,205,0), rgba(190,210,205,0.17) 22%, rgba(105,222,198,0.095) 58%, rgba(190,210,205,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.86) 22%, rgba(195,255,243,0.42) 58%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.10)' : 'rgba(255,255,255,0.70)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerJobsLiquidCardSurface(tokens: WorkerThemeTokens, tone: WorkerTone = 'base') {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const warm = tone === 'cream' || tone === 'warm'
  const mint = tone === 'mint'
  const cyan = tone === 'cyan'
  const accent = warm
    ? tokens.mode === 'dark' ? 'rgba(224,160,107,0.090)' : 'rgba(255,218,151,0.18)'
    : cyan
      ? tokens.mode === 'dark' ? 'rgba(88,190,196,0.075)' : 'rgba(183,243,247,0.18)'
      : mint
        ? tokens.mode === 'dark' ? 'rgba(105,222,198,0.090)' : 'rgba(76,222,199,0.17)'
        : tokens.mode === 'dark' ? 'rgba(105,222,198,0.060)' : 'rgba(76,222,199,0.105)'
  const gradient = tokens.mode === 'dark'
    ? `radial-gradient(circle at 78% 18%, ${accent}, transparent 34%), radial-gradient(circle at 18% 100%, rgba(190,210,205,0.028), transparent 42%), linear-gradient(180deg, rgba(22,29,27,0.94), rgba(15,23,22,0.88))`
    : `radial-gradient(circle at 78% 18%, ${accent}, transparent 34%), radial-gradient(circle at 18% 100%, rgba(255,255,255,0.66), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.94), rgba(247,249,248,0.84))`

  return {
    backgroundColor: reduceTransparency ? (tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF') : tokens.mode === 'dark' ? 'rgba(22,29,27,0.90)' : 'rgba(255,255,255,0.86)',
    borderColor: reduceTransparency ? tokens.borderStrong : workerLiquidEdgeHighlight(tokens),
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, tone === 'strong' ? 'mapHud' : 'tile'),
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerJobsCardCrispShell(tokens: WorkerThemeTokens, tone: WorkerTone = 'base') {
  const warm = tone === 'cream' || tone === 'warm'
  return {
    borderColor: tokens.mode === 'dark'
      ? warm ? 'rgba(190,210,205,0.18)' : 'rgba(190,210,205,0.20)'
      : warm ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.88)',
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.14), inset 0 -1px 0 rgba(105,222,198,0.055)'
      : 'inset 0 1px 0 rgba(255,255,255,0.92), inset 0 -1px 0 rgba(0,117,106,0.11)',
  } as any
}

export function workerJobsCardInnerInset(tokens: WorkerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.080)' : 'rgba(9,121,106,0.075)',
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.065)'
      : 'inset 0 1px 0 rgba(255,255,255,0.70)',
  } as any
}

export function workerJobsCardBottomEdge(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(0,0,0,0), rgba(105,222,198,0.12) 50%, rgba(0,0,0,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(9,121,106,0.13) 50%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.070)' : 'rgba(9,121,106,0.080)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerJobsCardDepthPlane(tokens: WorkerThemeTokens, tone: WorkerTone = 'base') {
  const warm = tone === 'cream' || tone === 'warm'
  const accent = warm
    ? tokens.mode === 'dark' ? 'rgba(224,160,107,0.08)' : 'rgba(255,218,151,0.16)'
    : tokens.mode === 'dark' ? 'rgba(105,222,198,0.07)' : 'rgba(76,222,199,0.13)'
  const gradient = tokens.mode === 'dark'
    ? `linear-gradient(180deg, rgba(190,210,205,0.070), rgba(190,210,205,0.014) 36%, rgba(0,0,0,0) 68%, ${accent}), radial-gradient(circle at 84% 18%, ${accent}, transparent 32%)`
    : `linear-gradient(180deg, rgba(255,255,255,0.86), rgba(255,255,255,0.20) 36%, rgba(255,255,255,0) 68%, ${accent}), radial-gradient(circle at 84% 18%, ${accent}, transparent 32%)`

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.016)' : 'rgba(255,255,255,0.16)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerJobsCardRefraction(tokens: WorkerThemeTokens, tone: WorkerTone = 'base') {
  const warm = tone === 'cream' || tone === 'warm'
  const color = warm
    ? tokens.mode === 'dark' ? 'rgba(224,160,107,0.13)' : 'rgba(255,218,151,0.24)'
    : tokens.mode === 'dark' ? 'rgba(105,222,198,0.12)' : 'rgba(76,222,199,0.18)'
  const gradient = `radial-gradient(circle at 50% 50%, ${color}, transparent 66%)`

  return {
    backgroundColor: color,
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerJobsCardTopEdge(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(190,210,205,0), rgba(190,210,205,0.16) 24%, rgba(105,222,198,0.10) 58%, rgba(190,210,205,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.88) 24%, rgba(194,255,243,0.42) 58%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.11)' : 'rgba(255,255,255,0.72)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerHomeOperationalTileSurface(tokens: WorkerThemeTokens, tone: WorkerTone = 'base') {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  void tone
  const primaryWeight = 0.026
  const accent = tokens.mode === 'dark'
    ? `rgba(190,210,205,${primaryWeight})`
    : `rgba(255,255,255,0.58)`
  const mintAura = tokens.mode === 'dark'
    ? 'rgba(105,222,198,0.10)'
    : 'rgba(76,222,199,0.10)'
  const gradient = tokens.mode === 'dark'
    ? `radial-gradient(circle at 50% 38%, ${mintAura}, transparent 48%), radial-gradient(circle at 74% 20%, ${accent}, transparent 32%), linear-gradient(180deg, rgba(22,29,27,0.98), rgba(16,24,23,0.92))`
    : `radial-gradient(circle at 50% 38%, ${mintAura}, transparent 48%), radial-gradient(circle at 74% 20%, ${accent}, transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,248,0.94))`

  return {
    backgroundColor: tokens.mode === 'dark' ? '#16211F' : '#FAFFFD',
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.10)' : 'rgba(20,73,66,0.08)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, 'tile'),
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerJobsCompactMapSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 36% 40%, rgba(105,222,198,0.08), transparent 38%), radial-gradient(circle at 76% 18%, rgba(190,210,205,0.055), transparent 30%), linear-gradient(155deg, rgba(22,29,27,0.88), rgba(14,22,21,0.72) 62%, rgba(18,28,26,0.84))'
    : 'radial-gradient(circle at 36% 40%, rgba(23,169,149,0.075), transparent 38%), radial-gradient(circle at 76% 18%, rgba(255,255,255,0.72), transparent 30%), linear-gradient(155deg, rgba(255,255,255,0.78), rgba(241,247,245,0.50) 62%, rgba(255,255,255,0.66))'

  return {
    backgroundColor: reduceTransparency ? (tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF') : tokens.mode === 'dark' ? 'rgba(22,29,27,0.64)' : 'rgba(255,255,255,0.46)',
    borderColor: reduceTransparency ? tokens.borderStrong : workerLiquidEdgeHighlight(tokens),
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, 'map'),
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerJobsMapCrispShell(tokens: WorkerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.19)' : 'rgba(255,255,255,0.88)',
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.14), inset 0 -1px 0 rgba(105,222,198,0.070)'
      : 'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(9,121,106,0.13)',
  } as any
}

export function workerJobsMapTopEdge(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(190,210,205,0), rgba(190,210,205,0.18) 24%, rgba(105,222,198,0.11) 58%, rgba(190,210,205,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.92) 24%, rgba(195,255,243,0.50) 58%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.11)' : 'rgba(255,255,255,0.78)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

export function workerOperationalTileKeyline(tokens: WorkerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.09)' : 'rgba(255,255,255,0.64)',
    boxShadow: tokens.mode === 'dark' ? 'inset 0 1px 0 rgba(190,210,205,0.06)' : 'inset 0 1px 0 rgba(255,255,255,0.70)',
  } as any
}

export function workerOperationalIconStage(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 72% 36%, rgba(105,222,198,0.10), transparent 44%), linear-gradient(145deg, rgba(190,210,205,0.055), rgba(22,29,27,0.08))'
    : 'radial-gradient(circle at 72% 36%, rgba(76,222,199,0.20), transparent 42%), linear-gradient(145deg, rgba(255,255,255,0.94), rgba(241,254,251,0.72))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.035)' : 'rgba(245,255,252,0.72)',
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.07)' : 'rgba(20,117,105,0.08)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? '0 0 0 5px rgba(105,222,198,0.045), 0 10px 22px rgba(0,0,0,0.12), inset 0 1px 0 rgba(190,210,205,0.06)'
        : '0 0 0 5px rgba(76,222,199,0.070), 0 12px 24px rgba(23,169,149,0.080), inset 0 1px 0 rgba(255,255,255,0.82)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function workerOperationalIconAura(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 50% 50%, rgba(105,222,198,0.17), transparent 62%)'
    : 'radial-gradient(circle at 50% 50%, rgba(76,222,199,0.20), transparent 64%)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.06)' : 'rgba(76,222,199,0.08)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}
