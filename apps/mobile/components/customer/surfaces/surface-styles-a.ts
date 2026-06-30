// Customer dynamic style helpers (part A), extracted from customer-surfaces.tsx (C4 customer stage 3).
import type { CustomerThemeTokens } from '../customer-theme'
import type { SurfaceTone } from './types'

export function customerReduceTransparency(tokens: CustomerThemeTokens) {
  return tokens.glassHighlight === 'transparent' && tokens.glassShadow === 'none'
}

export function getLayerSurface(tokens: CustomerThemeTokens, tone: SurfaceTone) {
  switch (tone) {
    case 'base':
      return tokens.base
    case 'raised':
      return tokens.raised
    case 'service':
      return tokens.service
    case 'water':
      return tokens.water
    case 'warm':
      return tokens.warm
    case 'depth':
      return tokens.depthSurface
    case 'ghost':
      return tokens.ghost
    case 'disabled':
      return tokens.disabled
  }
}

export function customerSmallChipSurface(tokens: CustomerThemeTokens, tone: SurfaceTone = 'base') {
  const reduceTransparency = customerReduceTransparency(tokens)
  const isWater = tone === 'water'
  const isWarm = tone === 'warm'
  const isService = tone === 'service'

  if (!isWater && !isWarm && !isService) {
    return { backgroundColor: getLayerSurface(tokens, tone), borderColor: tokens.border }
  }

  return {
    backgroundColor: tokens.mode === 'dark'
      ? isWarm ? 'rgba(64,42,24,0.86)' : isWater ? 'rgba(18,60,64,0.82)' : 'rgba(19,64,55,0.82)'
      : isWarm ? 'rgba(255,244,219,0.94)' : isWater ? 'rgba(232,252,253,0.94)' : 'rgba(220,251,243,0.94)',
    borderColor: tokens.mode === 'dark'
      ? isWarm ? 'rgba(224,160,107,0.24)' : 'rgba(105,222,198,0.20)'
      : isWarm ? 'rgba(176,118,44,0.18)' : isWater ? 'rgba(35,156,168,0.18)' : 'rgba(13,134,119,0.18)',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 6px 14px rgba(0,0,0,0.16)' : '0 8px 18px rgba(17,70,61,0.055)',
  }
}

export function customerSmallChipTextColor(tokens: CustomerThemeTokens, tone: SurfaceTone = 'base') {
  if (tone === 'water') return tokens.mode === 'dark' ? '#8AEBD9' : '#08786E'
  if (tone === 'warm') return tokens.mode === 'dark' ? '#F3D7A9' : '#6F4C22'
  if (tone === 'service') return tokens.primary
  return tokens.text
}
export function customerLiquidEdgeHighlight(tokens: CustomerThemeTokens) {
  return tokens.mode === 'dark' ? 'rgba(190,210,205,0.13)' : 'rgba(255,255,255,0.58)'
}

export function customerLiquidShadow(tokens: CustomerThemeTokens, surface: 'control' | 'cta' | 'hero' | 'panel' | 'tile' = 'panel') {
  if (customerReduceTransparency(tokens)) return 'none'
  if (tokens.mode === 'dark') {
    if (surface === 'hero') return '0 22px 56px rgba(0,0,0,0.32), inset 0 1px 0 rgba(190,210,205,0.10)'
    if (surface === 'cta') return '0 16px 32px rgba(0,117,106,0.22), inset 0 1px 0 rgba(190,210,205,0.14)'
    if (surface === 'control') return '0 10px 22px rgba(0,0,0,0.20), inset 0 1px 0 rgba(190,210,205,0.09)'
    return '0 12px 34px rgba(0,0,0,0.28), inset 0 1px 0 rgba(190,210,205,0.08)'
  }
  if (surface === 'hero') return '0 18px 38px rgba(31,92,82,0.05), inset 0 1px 0 rgba(255,255,255,0.84)'
  if (surface === 'cta') return '0 14px 30px rgba(0,117,106,0.18), inset 0 1px 0 rgba(255,255,255,0.62)'
  if (surface === 'control') return '0 10px 22px rgba(31,92,82,0.04), inset 0 1px 0 rgba(255,255,255,0.70)'
  if (surface === 'tile') return '0 10px 22px rgba(31,92,82,0.04), inset 0 1px 0 rgba(255,255,255,0.76)'
  return '0 12px 28px rgba(31,92,82,0.05), inset 0 1px 0 rgba(255,255,255,0.72)'
}
export type CustomerAppleIOS26MaterialRole = 'control' | 'field' | 'hero' | 'panel' | 'tile'

export function customerAppleIOS26SectionWashSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle, rgba(105,222,198,0.10), rgba(190,210,205,0.026) 44%, transparent 72%)'
    : 'radial-gradient(circle, rgba(76,222,199,0.12), rgba(255,255,255,0.20) 44%, transparent 72%)'

  return {
    backgroundColor: reduceTransparency ? 'transparent' : tokens.mode === 'dark' ? 'rgba(105,222,198,0.055)' : 'rgba(76,222,199,0.075)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
    opacity: reduceTransparency ? 0 : tokens.mode === 'dark' ? 0.055 : 0.070,
  } as any
}

export function customerAppleIOS26MaterialSurface(tokens: CustomerThemeTokens, role: CustomerAppleIOS26MaterialRole = 'panel') {
  const reduceTransparency = customerReduceTransparency(tokens)
  const dark = tokens.mode === 'dark'
  const hero = role === 'hero'
  const control = role === 'control'
  const tile = role === 'tile'
  const field = role === 'field'
  const lightGradient = hero
    ? 'radial-gradient(circle at 72% 10%, rgba(0,200,179,0.080), transparent 31%), linear-gradient(180deg, rgba(255,255,255,0.78), rgba(246,248,248,0.60))'
    : control
      ? 'linear-gradient(145deg, rgba(255,255,255,0.74), rgba(246,248,248,0.58))'
      : field
        ? 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,248,248,0.94))'
        : tile
          ? 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(247,248,248,0.92))'
          : 'linear-gradient(180deg, rgba(255,255,255,0.97), rgba(247,248,248,0.94))'
  const darkGradient = hero
    ? 'radial-gradient(circle at 72% 10%, rgba(105,222,198,0.070), transparent 31%), linear-gradient(180deg, rgba(24,31,29,0.82), rgba(17,22,21,0.68))'
    : control
      ? 'linear-gradient(145deg, rgba(31,42,40,0.74), rgba(22,29,27,0.62))'
      : field
        ? 'linear-gradient(180deg, rgba(24,31,29,0.96), rgba(15,20,19,0.92))'
        : tile
          ? 'linear-gradient(180deg, rgba(23,29,27,0.94), rgba(17,22,21,0.90))'
          : 'linear-gradient(180deg, rgba(22,29,27,0.96), rgba(15,20,19,0.92))'

  return {
    backdropFilter: reduceTransparency || (!hero && !control) ? undefined : dark ? 'blur(18px) saturate(1.18)' : 'blur(20px) saturate(1.42)',
    backgroundColor: reduceTransparency
      ? dark ? '#161D1B' : '#FFFFFF'
      : dark
        ? hero ? 'rgba(22,29,27,0.70)' : control ? 'rgba(22,29,27,0.66)' : field ? 'rgba(24,31,29,0.96)' : 'rgba(22,29,27,0.92)'
        : hero ? 'rgba(255,255,255,0.58)' : control ? 'rgba(255,255,255,0.62)' : field ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.94)',
    borderColor: reduceTransparency
      ? tokens.borderStrong
      : dark
        ? hero || control ? 'rgba(190,210,205,0.14)' : 'rgba(190,210,205,0.10)'
        : hero || control ? 'rgba(255,255,255,0.66)' : 'rgba(20,73,66,0.08)',
    boxShadow: reduceTransparency
      ? 'none'
      : dark
        ? hero
          ? '0 20px 46px rgba(0,0,0,0.30), inset 0 1px 0 rgba(190,210,205,0.10)'
          : control
            ? '0 10px 22px rgba(0,0,0,0.18), inset 0 1px 0 rgba(190,210,205,0.09)'
            : tile
              ? '0 8px 18px rgba(0,0,0,0.18), inset 0 1px 0 rgba(190,210,205,0.055)'
              : '0 12px 28px rgba(0,0,0,0.24), inset 0 1px 0 rgba(190,210,205,0.060)'
        : hero
          ? '0 18px 36px rgba(31,92,82,0.050), inset 0 1px 0 rgba(255,255,255,0.82)'
          : control
            ? '0 10px 20px rgba(31,92,82,0.035), inset 0 1px 0 rgba(255,255,255,0.72)'
            : tile
              ? '0 7px 16px rgba(31,92,82,0.035), inset 0 1px 0 rgba(255,255,255,0.70)'
              : '0 10px 24px rgba(31,92,82,0.045), inset 0 1px 0 rgba(255,255,255,0.72)',
    background: reduceTransparency ? undefined : dark ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : dark ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : dark ? darkGradient : lightGradient,
    WebkitBackdropFilter: reduceTransparency || (!hero && !control) ? undefined : dark ? 'blur(18px) saturate(1.18)' : 'blur(20px) saturate(1.42)',
  } as any
}

export function glassSurface(tokens: CustomerThemeTokens, tone: 'default' | 'strong' | 'warm' | 'service' | 'water' | 'depth' = 'default') {
  const reduceTransparency = customerReduceTransparency(tokens)
  const warmAccent = tokens.mode === 'dark' ? 'rgba(224,160,107,0.10)' : 'rgba(187,116,61,0.08)'
  const mintWash = tokens.mode === 'dark' ? 'rgba(105,222,198,0.075)' : 'rgba(23,169,149,0.070)'
  const waterWash = tokens.mode === 'dark' ? 'rgba(130,221,226,0.070)' : 'rgba(81,187,192,0.070)'
  const backgroundColor =
    tone === 'strong'
      ? tokens.glassStrong
      : tone === 'warm'
        ? tokens.glassWarm
        : tone === 'depth'
          ? tokens.mode === 'dark' ? 'rgba(19,25,24,0.70)' : 'rgba(255,255,255,0.62)'
          : tokens.glass
  const experimentalBackgroundImage =
    tokens.mode === 'dark'
      ? tone === 'warm'
        ? `radial-gradient(circle at 86% 16%, ${warmAccent}, transparent 28%), linear-gradient(145deg, rgba(30,37,34,0.66), rgba(22,29,27,0.50))`
        : tone === 'water'
          ? `radial-gradient(circle at 86% 14%, ${waterWash}, transparent 30%), linear-gradient(145deg, rgba(30,38,35,0.62), rgba(22,29,27,0.50))`
          : `radial-gradient(circle at 86% 14%, ${mintWash}, transparent 30%), linear-gradient(145deg, rgba(30,38,35,0.62), rgba(22,29,27,0.50))`
      : tone === 'warm'
        ? `radial-gradient(circle at 86% 16%, ${warmAccent}, transparent 28%), linear-gradient(145deg, rgba(255,255,255,0.72), rgba(246,248,248,0.48))`
        : tone === 'water'
          ? `radial-gradient(circle at 86% 14%, ${waterWash}, transparent 30%), linear-gradient(145deg, rgba(255,255,255,0.74), rgba(246,248,248,0.50))`
          : `radial-gradient(circle at 86% 14%, ${mintWash}, transparent 30%), linear-gradient(145deg, rgba(255,255,255,0.74), rgba(246,248,248,0.50))`

  return {
    backgroundColor,
    borderColor: tokens.glassBorder,
    boxShadow: reduceTransparency ? 'none' : tone === 'default' || tone === 'strong' ? customerLiquidShadow(tokens, 'panel') : 'none',
    experimental_backgroundImage: reduceTransparency ? undefined : experimentalBackgroundImage,
  }
}

export function customerMessageSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(19,43,42,0.96)' : 'rgba(255,253,248,0.96)',
    borderColor: tokens.border,
    boxShadow: 'none',
  }
}

export function customerOpaqueSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(23,29,27,0.94)' : 'rgba(255,255,255,0.96)',
    borderColor: tokens.border,
    boxShadow: customerLiquidShadow(tokens, 'panel'),
    experimental_backgroundImage:
      tokens.mode === 'dark'
        ? 'linear-gradient(180deg, rgba(23,29,27,0.96), rgba(17,22,21,0.94))'
        : 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(247,248,248,0.92))',
  }
}

export function customerWorkerMintOperationalTileSurface(tokens: CustomerThemeTokens, mintBoost: 'home' | 'standard' = 'standard') {
  const reduceTransparency = customerReduceTransparency(tokens)
  const specularCatch = tokens.mode === 'dark' ? 'rgba(190,210,205,0.026)' : 'rgba(255,255,255,0.58)'
  const homeBoost = mintBoost === 'home'
  const mintAura = tokens.mode === 'dark'
    ? homeBoost ? 'rgba(105,222,198,0.12)' : 'rgba(105,222,198,0.10)'
    : homeBoost ? 'rgba(76,222,199,0.12)' : 'rgba(76,222,199,0.10)'
  const secondaryMintAura = tokens.mode === 'dark'
    ? homeBoost ? 'rgba(105,222,198,0.048)' : 'rgba(105,222,198,0.044)'
    : homeBoost ? 'rgba(76,222,199,0.061)' : 'rgba(76,222,199,0.055)'
  const gradient = tokens.mode === 'dark'
    ? `radial-gradient(circle at 50% 38%, ${mintAura}, transparent 48%), ${homeBoost ? `radial-gradient(circle at 86% 92%, ${secondaryMintAura}, transparent 46%), ` : ''}radial-gradient(circle at 74% 20%, ${specularCatch}, transparent 32%), linear-gradient(180deg, rgba(22,29,27,0.98), rgba(16,24,23,0.92))`
    : `radial-gradient(circle at 50% 38%, ${mintAura}, transparent 48%), ${homeBoost ? `radial-gradient(circle at 86% 92%, ${secondaryMintAura}, transparent 46%), ` : ''}radial-gradient(circle at 74% 20%, ${specularCatch}, transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,248,0.94))`

  return {
    backgroundColor: tokens.mode === 'dark' ? '#16211F' : homeBoost ? '#F8FFFC' : '#FAFFFD',
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.10)' : homeBoost ? 'rgba(20,117,105,0.092)' : 'rgba(20,73,66,0.08)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : customerLiquidShadow(tokens, 'tile'),
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function customerWorkerMintPanelSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
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

export function customerBookingActiveRequestSurface(tokens: CustomerThemeTokens) {
  return customerHomeActiveDealSurface(tokens)
}

export function customerHomeFrameSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const base = customerAppleIOS26MaterialSurface(tokens, 'control')
  const lightGradient = 'radial-gradient(circle at 18% 50%, rgba(76,222,199,0.16), transparent 46%), radial-gradient(circle at 82% 12%, rgba(255,255,255,0.74), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.96), rgba(244,255,251,0.90))'
  const darkGradient = 'radial-gradient(circle at 18% 50%, rgba(105,222,198,0.10), transparent 48%), radial-gradient(circle at 82% 12%, rgba(230,244,240,0.080), transparent 34%), linear-gradient(180deg, rgba(24,31,29,0.82), rgba(17,24,22,0.72))'
  const gradient = tokens.mode === 'dark' ? darkGradient : lightGradient

  return {
    ...base,
    background: reduceTransparency ? undefined : gradient,
    backgroundColor: reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(22,29,27,0.74)' : '#F9FFFC',
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.15)' : 'rgba(255,255,255,0.82)',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark'
      ? '0 12px 26px rgba(0,0,0,0.22), inset 0 1px 0 rgba(190,210,205,0.10)'
      : '0 12px 26px rgba(31,92,82,0.045), inset 0 1px 0 rgba(255,255,255,0.88)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function customerHomeActiveDealSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const lightGradient = 'radial-gradient(circle at 30% 24%, rgba(76,222,199,0.20), transparent 44%), radial-gradient(circle at 88% 84%, rgba(76,222,199,0.10), transparent 48%), radial-gradient(circle at 80% 10%, rgba(255,255,255,0.70), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.97), rgba(244,255,251,0.92))'
  const darkGradient = 'radial-gradient(circle at 30% 24%, rgba(105,222,198,0.13), transparent 44%), radial-gradient(circle at 88% 84%, rgba(105,222,198,0.06), transparent 48%), radial-gradient(circle at 80% 10%, rgba(230,244,240,0.075), transparent 34%), linear-gradient(180deg, rgba(24,31,29,0.86), rgba(17,24,22,0.76))'
  const gradient = tokens.mode === 'dark' ? darkGradient : lightGradient

  return {
    background: reduceTransparency ? undefined : gradient,
    backgroundColor: reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(22,29,27,0.78)' : '#F8FFFC',
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.16)' : 'rgba(20,117,105,0.12)',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark'
      ? '0 13px 28px rgba(0,0,0,0.24), inset 0 1px 0 rgba(190,210,205,0.10)'
      : '0 12px 26px rgba(31,92,82,0.055), inset 0 1px 0 rgba(255,255,255,0.86)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function customerHomeHeroSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const base = customerAppleIOS26MaterialSurface(tokens, 'hero')
  const lightGradient = 'radial-gradient(circle at 82% 8%, rgba(76,222,199,0.12), transparent 34%), radial-gradient(circle at 16% 96%, rgba(255,255,255,0.60), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.74), rgba(244,255,251,0.60))'
  const darkGradient = 'radial-gradient(circle at 82% 8%, rgba(105,222,198,0.085), transparent 34%), radial-gradient(circle at 16% 96%, rgba(190,210,205,0.045), transparent 32%), linear-gradient(180deg, rgba(24,31,29,0.78), rgba(17,22,21,0.66))'
  const gradient = tokens.mode === 'dark' ? darkGradient : lightGradient

  return {
    ...base,
    background: reduceTransparency ? undefined : gradient,
    backgroundColor: reduceTransparency ? base.backgroundColor : tokens.mode === 'dark' ? 'rgba(22,29,27,0.70)' : 'rgba(255,255,255,0.60)',
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.15)' : 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark'
      ? '0 20px 46px rgba(0,0,0,0.30), inset 0 1px 0 rgba(190,210,205,0.10)'
      : '0 18px 38px rgba(31,92,82,0.058), inset 0 1px 0 rgba(255,255,255,0.84)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function customerHomePromptSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const lightGradient = 'radial-gradient(circle at 80% 18%, rgba(76,222,199,0.13), transparent 42%), radial-gradient(circle at 12% 0%, rgba(255,255,255,0.72), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(243,255,251,0.92))'
  const darkGradient = 'radial-gradient(circle at 80% 18%, rgba(105,222,198,0.080), transparent 42%), radial-gradient(circle at 12% 0%, rgba(190,210,205,0.070), transparent 32%), linear-gradient(180deg, rgba(24,31,29,0.96), rgba(15,20,19,0.92))'
  const gradient = tokens.mode === 'dark' ? darkGradient : lightGradient

  return {
    ...customerAppleIOS26MaterialSurface(tokens, 'field'),
    background: reduceTransparency ? undefined : gradient,
    backgroundColor: reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(24,31,29,0.96)' : '#F8FFFC',
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.12)' : 'rgba(15,133,118,0.12)',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark'
      ? '0 8px 18px rgba(0,0,0,0.16), inset 0 1px 0 rgba(190,210,205,0.070)'
      : '0 10px 24px rgba(31,92,82,0.040), inset 0 1px 0 rgba(255,255,255,0.80)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function customerHomeControlSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const lightGradient = 'radial-gradient(circle at 50% 44%, rgba(76,222,199,0.10), transparent 54%), radial-gradient(circle at 34% 8%, rgba(255,255,255,0.72), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(244,252,249,0.92))'
  const darkGradient = 'radial-gradient(circle at 50% 44%, rgba(105,222,198,0.070), transparent 54%), radial-gradient(circle at 34% 8%, rgba(190,210,205,0.090), transparent 34%), linear-gradient(180deg, rgba(25,33,31,0.94), rgba(18,24,22,0.88))'
  const gradient = tokens.mode === 'dark' ? darkGradient : lightGradient

  return {
    ...customerAppleIOS26MaterialSurface(tokens, 'control'),
    background: reduceTransparency ? undefined : gradient,
    backgroundColor: reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(22,29,27,0.66)' : 'rgba(255,255,255,0.66)',
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.13)' : 'rgba(15,133,118,0.11)',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.075)'
      : '0 8px 18px rgba(31,92,82,0.030), inset 0 1px 0 rgba(255,255,255,0.80)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

export function customerHomeIconOnlySurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    boxShadow: 'none',
    experimental_backgroundImage: undefined,
    opacity: tokens.mode === 'dark' ? 0.95 : 1,
  } as any
}

export function customerClientAssetBackingSurface(tokens: CustomerThemeTokens, placement: 'inline' | 'shell') {
  const reduceTransparency = customerReduceTransparency(tokens)
  const shell = placement === 'shell'
  const lightGradient = shell
    ? 'radial-gradient(circle at 72% 36%, rgba(76,222,199,0.20), transparent 42%), linear-gradient(145deg, rgba(255,255,255,0.94), rgba(241,254,251,0.72))'
    : 'radial-gradient(circle at 50% 42%, rgba(255,255,255,0.28), transparent 68%)'
  const darkGradient = shell
    ? 'radial-gradient(circle at 72% 36%, rgba(105,222,198,0.10), transparent 44%), linear-gradient(145deg, rgba(190,210,205,0.055), rgba(22,29,27,0.08))'
    : 'radial-gradient(circle at 50% 42%, rgba(230,244,240,0.13), rgba(190,210,205,0.055) 44%, transparent 72%)'

  return {
    backgroundColor: reduceTransparency
      ? tokens.mode === 'dark' ? '#171D1B' : shell ? '#FFFFFF' : 'transparent'
      : tokens.mode === 'dark'
        ? shell ? 'rgba(190,210,205,0.035)' : 'rgba(230,244,240,0.055)'
        : shell ? 'rgba(245,255,252,0.72)' : 'rgba(255,255,255,0.12)',
    background: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    borderColor: reduceTransparency
      ? tokens.borderStrong
      : tokens.mode === 'dark'
        ? shell ? 'rgba(190,210,205,0.07)' : 'rgba(190,210,205,0.15)'
        : shell ? 'rgba(20,117,105,0.08)' : 'transparent',
    borderWidth: tokens.mode === 'dark' || shell ? 1 : 0,
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? shell
          ? '0 0 0 5px rgba(105,222,198,0.045), 0 10px 22px rgba(0,0,0,0.12), inset 0 1px 0 rgba(190,210,205,0.06)'
          : 'inset 0 1px 0 rgba(230,244,240,0.08)'
        : shell
          ? '0 0 0 5px rgba(76,222,199,0.070), 0 12px 24px rgba(23,169,149,0.080), inset 0 1px 0 rgba(255,255,255,0.82)'
          : 'none',
    experimental_backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

export function customerClientAssetImageTone(tokens: CustomerThemeTokens) {
  return {
    opacity: tokens.mode === 'dark' ? 0.91 : 1,
    transform: [{ scale: tokens.mode === 'dark' ? 0.985 : 1 }],
  } as any
}

export function customerClientAssetSoftenerSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(11,15,14,0.070)' : 'transparent',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.055)' : 'transparent',
  } as any
}

export function customerHomeSendSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const lightGradient = 'linear-gradient(135deg, #17A995, #00756A)'
  const darkGradient = 'linear-gradient(135deg, #69DEC6, #00756A)'

  return {
    backgroundColor: reduceTransparency ? tokens.primary : tokens.mode === 'dark' ? '#69DEC6' : '#17A995',
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.14)' : 'rgba(255,255,255,0.30)',
    boxShadow: customerLiquidShadow(tokens, 'cta'),
    background: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

export function customerBookingDiagnosisSurface(tokens: CustomerThemeTokens) {
  return customerAppleIOS26MaterialSurface(tokens, 'panel')
}

export function customerHistoryHeroSurface(tokens: CustomerThemeTokens) {
  return customerAppleIOS26MaterialSurface(tokens, 'hero')
}
