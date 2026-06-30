// Customer dynamic style helpers (part B), extracted from customer-surfaces.tsx (C4 customer stage 3).
import type { CustomerThemeTokens } from '../customer-theme'
import type { SurfaceTone } from './types'
import { customerAppleIOS26MaterialSurface, customerLiquidShadow, customerReduceTransparency, customerWorkerMintOperationalTileSurface, customerWorkerMintPanelSurface } from './surface-styles-a'

export function customerActivityHeroSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const lightGradient = 'radial-gradient(circle at 86% 14%, rgba(23,169,149,0.12), transparent 31%), linear-gradient(135deg, rgba(255,255,255,0.66), rgba(241,255,251,0.52))'
  const darkGradient = 'radial-gradient(circle at 84% 16%, rgba(105,222,198,0.090), transparent 31%), radial-gradient(circle at 24% 8%, rgba(230,244,240,0.080), transparent 34%), linear-gradient(135deg, rgba(28,36,33,0.70), rgba(12,16,15,0.54))'

  return {
    backgroundColor: reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(22,29,27,0.54)' : 'rgba(255,255,255,0.48)',
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(230,244,240,0.18)' : 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    boxShadow: customerLiquidShadow(tokens, 'hero'),
    background: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

export function customerActivityTimelinePanelSurface(tokens: CustomerThemeTokens) {
  return customerWorkerMintPanelSurface(tokens)
}

export function customerHistoryPanelSurface(tokens: CustomerThemeTokens) {
  return customerWorkerMintPanelSurface(tokens)
}

export function customerHistoryPriceBoxSurface(tokens: CustomerThemeTokens) {
  return customerAppleIOS26MaterialSurface(tokens, 'tile')
}

export function customerHistoryChatBubbleSurface(tokens: CustomerThemeTokens, role: 'kael' | 'other' | 'user') {
  if (role === 'user') {
    return {
      backgroundColor: tokens.mode === 'dark' ? 'rgba(19,70,62,0.90)' : 'rgba(215,251,243,0.94)',
      borderColor: tokens.mode === 'dark' ? tokens.borderStrong : 'rgba(13,134,119,0.16)',
    }
  }

  if (role === 'other') {
    return {
      backgroundColor: tokens.mode === 'dark' ? 'rgba(22,43,40,0.88)' : 'rgba(246,255,252,0.95)',
      borderColor: tokens.mode === 'dark' ? tokens.border : 'rgba(35,96,84,0.16)',
    }
  }

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(30,54,48,0.98)' : 'rgba(255,255,255,0.98)',
    borderColor: tokens.mode === 'dark' ? tokens.borderStrong : 'rgba(8,120,110,0.20)',
  }
}

export function customerHistoryMapViewportSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const lightGradient = 'radial-gradient(circle at 72% 18%, rgba(0,200,179,0.055), transparent 34%), linear-gradient(145deg, rgba(250,255,253,0.98), rgba(247,248,248,0.92))'
  const darkGradient = 'radial-gradient(circle at 72% 18%, rgba(105,222,198,0.050), transparent 34%), linear-gradient(145deg, rgba(19,25,24,0.98), rgba(17,22,21,0.92))'

  return {
    backgroundColor: tokens.mode === 'dark' ? tokens.depthSurface : '#F7F8F8',
    borderColor: tokens.border,
    background: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

export function customerActivityEdgeHighlightSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.14)' : 'rgba(255,255,255,0.78)',
  }
}

export function customerActivityStatusLensSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(145deg, rgba(31,42,40,0.78), rgba(22,29,27,0.62))'
    : 'linear-gradient(145deg, rgba(255,255,255,0.82), rgba(246,248,248,0.62))'

  return {
    ...customerAppleIOS26MaterialSurface(tokens, 'control'),
    backgroundColor: reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(22,29,27,0.70)' : 'rgba(255,255,255,0.70)',
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.15)' : 'rgba(255,255,255,0.72)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function customerActivityTimelineRailSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.11)' : 'rgba(8,120,110,0.09)',
  }
}

export function customerActivityTimelineDotSurface(tokens: CustomerThemeTokens, active: boolean) {
  return {
    backgroundColor: active ? tokens.primary : tokens.mode === 'dark' ? 'rgba(190,210,205,0.18)' : 'rgba(197,226,220,0.92)',
    borderColor: active ? tokens.mode === 'dark' ? 'rgba(190,210,205,0.18)' : 'rgba(255,255,255,0.86)' : tokens.mode === 'dark' ? 'rgba(190,210,205,0.12)' : 'rgba(255,255,255,0.80)',
    boxShadow: active && !customerReduceTransparency(tokens)
      ? tokens.mode === 'dark' ? '0 0 0 5px rgba(105,222,198,0.070)' : '0 0 0 5px rgba(23,169,149,0.080)'
      : 'none',
  } as any
}

export function customerHomeServiceTileSurface(tokens: CustomerThemeTokens, tone: SurfaceTone = 'service') {
  void tone
  return customerWorkerMintOperationalTileSurface(tokens, 'home')
}

export function customerBookingServiceTileSurface(tokens: CustomerThemeTokens, tone: SurfaceTone = 'service') {
  void tone
  return customerWorkerMintOperationalTileSurface(tokens)
}

export function customerSelectedServiceTileSurface(tokens: CustomerThemeTokens, tone: SurfaceTone = 'service') {
  void tone
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(138,235,217,0.34)' : 'rgba(13,134,119,0.30)',
    boxShadow: tokens.glassHighlight === 'transparent' && tokens.glassShadow === 'none'
      ? 'none'
      : tokens.mode === 'dark'
        ? '0 12px 24px rgba(0,0,0,0.22)'
        : '0 12px 24px rgba(9,121,106,0.12)',
  }
}

export function customerHomeShortcutSurface(tokens: CustomerThemeTokens, tone: SurfaceTone = 'service') {
  void tone
  return customerWorkerMintOperationalTileSurface(tokens, 'home')
}

export function customerMintPillSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  return tokens.mode === 'dark'
    ? { backgroundColor: tokens.service, borderColor: tokens.borderStrong }
    : { backgroundColor: reduceTransparency ? '#DCFBF3' : 'rgba(232,252,247,0.78)', borderColor: 'rgba(23,169,149,0.16)' }
}

export function customerDockInactiveTint(tokens: CustomerThemeTokens) {
  return tokens.mode === 'dark' ? 'rgba(190,210,205,0.62)' : 'rgba(92,106,102,0.72)'
}

export function customerDockMainClusterSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 18% 8%, rgba(190,210,205,0.070), transparent 32%), radial-gradient(circle at 80% 102%, rgba(255,255,255,0.035), transparent 42%), linear-gradient(180deg, rgba(31,42,40,0.24), rgba(22,29,27,0.075))'
    : 'radial-gradient(circle at 18% 8%, rgba(255,255,255,0.36), transparent 34%), radial-gradient(circle at 84% 108%, rgba(255,255,255,0.10), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.060), rgba(255,255,255,0.012))'

  return {
    backdropFilter: reduceTransparency ? undefined : tokens.mode === 'dark' ? 'blur(22px) saturate(1.22) contrast(1.03)' : 'blur(24px) saturate(1.76) contrast(1.04)',
    backgroundColor: reduceTransparency
      ? tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF'
      : tokens.mode === 'dark' ? 'rgba(22,29,27,0.20)' : 'rgba(255,255,255,0.028)',
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.16)' : 'rgba(255,255,255,0.72)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? '0 13px 28px rgba(0,0,0,0.20), inset 0 1px 0 rgba(190,210,205,0.14), inset 0 -1px 0 rgba(190,210,205,0.035)'
        : '0 8px 18px rgba(31,92,82,0.025), 0 2px 8px rgba(255,255,255,0.24), inset 0 1px 0 rgba(255,255,255,0.86), inset 0 -1px 0 rgba(20,73,66,0.025)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
    WebkitBackdropFilter: reduceTransparency ? undefined : tokens.mode === 'dark' ? 'blur(22px) saturate(1.22) contrast(1.03)' : 'blur(24px) saturate(1.76) contrast(1.04)',
  } as any
}

export function customerDockKaelActionSurface(tokens: CustomerThemeTokens, active: boolean) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const gradient = tokens.mode === 'dark'
    ? active
      ? 'radial-gradient(circle at 32% 14%, rgba(190,210,205,0.18), transparent 34%), radial-gradient(circle at 72% 78%, rgba(255,255,255,0.060), transparent 44%), linear-gradient(145deg, rgba(31,42,40,0.22), rgba(22,29,27,0.070))'
      : 'radial-gradient(circle at 32% 14%, rgba(190,210,205,0.14), transparent 34%), radial-gradient(circle at 72% 78%, rgba(255,255,255,0.045), transparent 44%), linear-gradient(145deg, rgba(31,42,40,0.18), rgba(22,29,27,0.060))'
    : active
      ? 'radial-gradient(circle at 30% 12%, rgba(255,255,255,0.94), transparent 36%), radial-gradient(circle at 72% 78%, rgba(255,255,255,0.24), transparent 44%), linear-gradient(145deg, rgba(255,255,255,0.30), rgba(255,255,255,0.080))'
      : 'radial-gradient(circle at 30% 12%, rgba(255,255,255,0.82), transparent 36%), radial-gradient(circle at 72% 78%, rgba(255,255,255,0.18), transparent 44%), linear-gradient(145deg, rgba(255,255,255,0.22), rgba(255,255,255,0.060))'

  return {
    backdropFilter: reduceTransparency ? undefined : tokens.mode === 'dark' ? 'blur(22px) saturate(1.18)' : 'blur(24px) saturate(1.64) contrast(1.04)',
    backgroundColor: reduceTransparency
      ? tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF'
      : tokens.mode === 'dark'
        ? active ? 'rgba(31,42,40,0.22)' : 'rgba(31,42,40,0.18)'
        : active ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.16)',
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: reduceTransparency
      ? tokens.borderStrong
      : tokens.mode === 'dark'
        ? active ? 'rgba(190,210,205,0.24)' : 'rgba(190,210,205,0.18)'
        : active ? 'rgba(255,255,255,0.94)' : 'rgba(255,255,255,0.84)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? '0 14px 26px rgba(0,0,0,0.18), inset 0 1px 0 rgba(190,210,205,0.18), inset 0 -1px 0 rgba(190,210,205,0.04)'
        : '0 0 0 1px rgba(255,255,255,0.58), 0 10px 20px rgba(31,92,82,0.024), 0 2px 10px rgba(255,255,255,0.28), inset 0 1px 0 rgba(255,255,255,0.96), inset 0 -1px 0 rgba(20,73,66,0.035)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
    WebkitBackdropFilter: reduceTransparency ? undefined : tokens.mode === 'dark' ? 'blur(22px) saturate(1.18)' : 'blur(24px) saturate(1.64) contrast(1.04)',
  } as any
}

export function customerDockKaelActionEdgeSurface(tokens: CustomerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.20)' : 'rgba(255,255,255,0.92)',
    boxShadow: tokens.mode === 'dark'
      ? '0 0 0 1px rgba(190,210,205,0.07), inset 0 1px 0 rgba(190,210,205,0.16), inset 0 -1px 0 rgba(190,210,205,0.035)'
      : '0 0 0 1px rgba(255,255,255,0.58), inset 0 1px 0 rgba(255,255,255,0.92), inset 0 -1px 0 rgba(20,73,66,0.030)',
  } as any
}

export function customerDockKaelActionAuraSurface(tokens: CustomerThemeTokens, active: boolean) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle, rgba(190,210,205,0.10), rgba(255,255,255,0.026) 48%, transparent 76%)'
    : 'radial-gradient(circle, rgba(255,255,255,0.34), rgba(255,255,255,0.080) 48%, transparent 76%)'

  return {
    backgroundColor: reduceTransparency
      ? 'transparent'
      : tokens.mode === 'dark'
        ? active ? 'rgba(190,210,205,0.070)' : 'rgba(190,210,205,0.045)'
        : active ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.080)',
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function customerProfileHeroSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const lightGradient = 'radial-gradient(circle at 86% 14%, rgba(23,169,149,0.12), transparent 31%), linear-gradient(135deg, rgba(255,255,255,0.66), rgba(241,255,251,0.52))'
  const darkGradient = 'radial-gradient(circle at 84% 16%, rgba(105,222,198,0.090), transparent 31%), radial-gradient(circle at 24% 8%, rgba(230,244,240,0.080), transparent 34%), linear-gradient(135deg, rgba(28,36,33,0.70), rgba(12,16,15,0.54))'

  return {
    backgroundColor: reduceTransparency ? (tokens.mode === 'dark' ? '#161D1B' : '#F8FFFC') : tokens.mode === 'dark' ? 'rgba(22,29,27,0.54)' : 'rgba(255,255,255,0.48)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.18)' : 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : customerLiquidShadow(tokens, 'hero'),
    background: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

export function customerProfilePanelSurface(tokens: CustomerThemeTokens) {
  return customerWorkerMintPanelSurface(tokens)
}

export function customerProfileCareCardSurface(tokens: CustomerThemeTokens) {
  return customerWorkerMintPanelSurface(tokens)
}

export function customerProfileCarePillSurface(tokens: CustomerThemeTokens) {
  return customerProfileRowIconSurface(tokens)
}

export function customerProfileCareStatSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const lightGradient = 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.96), transparent 48%), linear-gradient(145deg, rgba(255,255,255,0.82), rgba(232,255,249,0.48))'
  const darkGradient = 'radial-gradient(circle at 50% 0%, rgba(230,244,240,0.070), transparent 48%), linear-gradient(145deg, rgba(230,244,240,0.055), rgba(13,17,16,0.54))'
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(22,29,27,0.54)' : 'rgba(255,255,255,0.58)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(255,255,255,0.72)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? 'inset 0 1px 0 rgba(230,244,240,0.10), 0 14px 24px rgba(0,0,0,0.26)'
        : 'inset 0 1px 0 rgba(255,255,255,0.86), 0 12px 24px rgba(17,70,61,0.08)',
    background: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

export function customerProfileRowSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const lightGradient = 'linear-gradient(180deg, rgba(255,255,255,0.72), rgba(230,255,248,0.30))'
  const darkGradient = 'linear-gradient(180deg, rgba(230,244,240,0.040), rgba(105,222,198,0.016))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.020)' : 'rgba(255,255,255,0.42)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.065)' : 'rgba(16,131,115,0.070)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? 'inset 0 1px 0 rgba(230,244,240,0.050)' : 'inset 0 1px 0 rgba(255,255,255,0.66)',
    background: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

export function customerProfileRowIconSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 72% 36%, rgba(105,222,198,0.10), transparent 44%), linear-gradient(145deg, rgba(190,210,205,0.055), rgba(22,29,27,0.08))'
    : 'radial-gradient(circle at 72% 36%, rgba(76,222,199,0.20), transparent 42%), linear-gradient(145deg, rgba(255,255,255,0.94), rgba(241,254,251,0.72))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.035)' : 'rgba(245,255,252,0.72)',
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.07)' : 'rgba(20,117,105,0.08)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? '0 0 0 4px rgba(105,222,198,0.040), inset 0 1px 0 rgba(190,210,205,0.06)'
        : '0 0 0 4px rgba(76,222,199,0.060), inset 0 1px 0 rgba(255,255,255,0.82)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function customerProfileInputSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(180deg, rgba(230,244,240,0.040), rgba(105,222,198,0.016))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.72), rgba(230,255,248,0.30))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.024)' : 'rgba(255,255,255,0.50)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.082)' : 'rgba(16,131,115,0.090)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? 'inset 0 1px 0 rgba(230,244,240,0.055)' : 'inset 0 1px 0 rgba(255,255,255,0.66)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function customerProfileSegmentSurface(tokens: CustomerThemeTokens, active: boolean) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const activeGradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 50% 38%, rgba(105,222,198,0.10), transparent 48%), linear-gradient(180deg, rgba(22,29,27,0.98), rgba(16,24,23,0.92))'
    : 'radial-gradient(circle at 50% 38%, rgba(76,222,199,0.10), transparent 48%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,248,0.94))'
  const inactiveGradient = tokens.mode === 'dark'
    ? 'linear-gradient(180deg, rgba(230,244,240,0.024), rgba(105,222,198,0.010))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.54), rgba(230,255,248,0.20))'

  return {
    backgroundColor: active
      ? tokens.mode === 'dark' ? '#16211F' : '#FAFFFD'
      : tokens.mode === 'dark' ? 'rgba(230,244,240,0.020)' : 'rgba(255,255,255,0.42)',
    borderColor: active
      ? tokens.mode === 'dark' ? 'rgba(138,235,217,0.34)' : 'rgba(13,134,119,0.30)'
      : tokens.mode === 'dark' ? 'rgba(230,244,240,0.060)' : 'rgba(16,131,115,0.070)',
    boxShadow: reduceTransparency
      ? 'none'
      : active
        ? tokens.mode === 'dark' ? '0 8px 18px rgba(0,0,0,0.18), inset 0 1px 0 rgba(190,210,205,0.08)' : '0 8px 18px rgba(9,121,106,0.08), inset 0 1px 0 rgba(255,255,255,0.78)'
        : 'none',
    background: reduceTransparency ? undefined : active ? activeGradient : inactiveGradient,
    backgroundImage: reduceTransparency ? undefined : active ? activeGradient : inactiveGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : active ? activeGradient : inactiveGradient,
  } as any
}

export function customerProfileVerificationSurface(tokens: CustomerThemeTokens) {
  return customerWorkerMintOperationalTileSurface(tokens)
}

export function customerProfilePrimaryButtonSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 36% 8%, rgba(255,255,255,0.16), transparent 35%), linear-gradient(180deg, #63E6D0, #40CDB8)'
    : 'radial-gradient(circle at 36% 8%, rgba(255,255,255,0.34), transparent 35%), linear-gradient(180deg, #0E8D7D, #087F70)'

  return {
    backgroundColor: tokens.mode === 'dark' ? '#63E6D0' : '#087F70',
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.18)' : 'rgba(255,255,255,0.42)',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 10px 22px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.16)' : '0 10px 22px rgba(9,121,106,0.13), inset 0 1px 0 rgba(255,255,255,0.30)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function customerProfileSecondaryButtonSurface(tokens: CustomerThemeTokens) {
  return customerProfileInputSurface(tokens)
}

export function customerIconSurface(tokens: CustomerThemeTokens, tone: SurfaceTone = 'service') {
  void tone
  const reduceTransparency = customerReduceTransparency(tokens)
  const lightGradient = 'radial-gradient(circle at 72% 36%, rgba(76,222,199,0.20), transparent 42%), linear-gradient(145deg, rgba(255,255,255,0.94), rgba(241,254,251,0.72))'
  const darkGradient = 'radial-gradient(circle at 72% 36%, rgba(105,222,198,0.10), transparent 44%), linear-gradient(145deg, rgba(190,210,205,0.055), rgba(22,29,27,0.08))'
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.035)' : 'rgba(245,255,252,0.72)',
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.07)' : 'rgba(20,117,105,0.08)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? '0 0 0 5px rgba(105,222,198,0.045), 0 10px 22px rgba(0,0,0,0.12), inset 0 1px 0 rgba(190,210,205,0.06)'
        : '0 0 0 5px rgba(76,222,199,0.070), 0 12px 24px rgba(23,169,149,0.080), inset 0 1px 0 rgba(255,255,255,0.82)',
    background: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
  } as any
}
export function customerProfileChromeRadius(variant: 'care' | 'hero' | 'panel') {
  if (variant === 'hero') return 30
  return 29
}

export function customerProfileChromeInsetRadius(variant: 'care' | 'hero' | 'panel') {
  return Math.max(customerProfileChromeRadius(variant) - 4, 15)
}

export function customerProfileChromeCrispShellSurface(tokens: CustomerThemeTokens, variant: 'care' | 'hero' | 'panel') {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.19)' : 'rgba(255,255,255,0.88)',
    borderRadius: customerProfileChromeRadius(variant),
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(230,244,240,0.15), inset 0 -1px 0 rgba(105,222,198,0.045)'
      : 'inset 0 1px 0 rgba(255,255,255,0.96), inset 0 -1px 0 rgba(9,121,106,0.13)',
  } as any
}

export function customerProfileChromeInnerInsetSurface(tokens: CustomerThemeTokens, variant: 'care' | 'hero' | 'panel') {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.085)' : 'rgba(9,121,106,0.075)',
    borderRadius: customerProfileChromeInsetRadius(variant),
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.060)'
      : 'inset 0 1px 0 rgba(255,255,255,0.72)',
  } as any
}

export function customerProfileChromeTopEdgeSurface(tokens: CustomerThemeTokens) {
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

export function customerProfileChromeBottomEdgeSurface(tokens: CustomerThemeTokens) {
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
