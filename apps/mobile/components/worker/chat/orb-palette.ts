import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { liquidPillPalette } from '@/components/ui/liquid-pill-button'
import { getNormalChatSendPalette } from '@/components/ui/normal-chat-composer-model'
import { color, customerTheme } from '@/design/theme'

import { getReducedTransparencyWorkerTokens, getWorkerThemeTokens, useWorkerThemeMode, type WorkerThemeMode, type WorkerThemeTokens } from '../worker-theme'

// Colours of the Worker Kael chat for the current appearance. Light keeps the chat's existing
// light-material colours; dark follows the shared neutral dark tokens, matching the Customer chat.
export type WorkerKaelOrbPalette = ReturnType<typeof workerKaelOrbPalette>

export function workerKaelOrbPalette(mode: WorkerThemeMode, tokens: WorkerThemeTokens) {
  if (mode === 'light') {
    return {
      accent: color.brand.primary,
      accentText: color.brand.primaryDark,
      bubbleLeftBorder: 'rgba(216,235,232,0.9)',
      bubbleLeftFill: 'rgba(255,255,255,0.92)',
      canvas: color.surface.base,
      composerBorder: customerTheme.lightLayer.glassBorder,
      composerFill: color.surface.soft,
      headerBorder: liquidPillPalette.light.border,
      headerFill: liquidPillPalette.light.background,
      icon: color.text.primary,
      ink: color.text.strong,
      menuActiveBorder: 'rgba(255,255,255,0.78)',
      menuActiveFill: 'rgba(255,255,255,0.42)',
      menuBorder: 'rgba(255,255,255,0.48)',
      menuFill: 'rgba(255,255,255,0.16)',
      mode,
      muted: color.text.muted,
      opaqueBorder: color.surface.stroke,
      opaqueFill: color.surface.soft,
      secondary: color.text.secondary,
      sendIdle: (sending: boolean) => getNormalChatSendPalette(sending),
      tokens,
    }
  }
  return {
    accent: tokens.primary,
    accentText: tokens.primary,
    bubbleLeftBorder: tokens.border,
    bubbleLeftFill: tokens.raised,
    canvas: tokens.canvas,
    composerBorder: tokens.glassBorder,
    composerFill: tokens.glass,
    headerBorder: liquidPillPalette.dark.border,
    headerFill: liquidPillPalette.dark.background,
    icon: tokens.text,
    ink: tokens.text,
    menuActiveBorder: tokens.borderStrong,
    menuActiveFill: tokens.glassStrong,
    menuBorder: tokens.glassBorder,
    menuFill: tokens.glass,
    mode,
    muted: tokens.muted,
    opaqueBorder: tokens.border,
    opaqueFill: tokens.raised,
    secondary: tokens.muted,
    sendIdle: (sending: boolean) => sending
      ? { background: tokens.primary, foreground: tokens.primaryText }
      : { background: tokens.glassStrong, foreground: tokens.muted },
    tokens,
  }
}

export function useWorkerKaelOrbPalette() {
  const mode = useWorkerThemeMode()
  const { reduceTransparency } = useGlassAccessibility()
  const base = getWorkerThemeTokens(mode)
  return workerKaelOrbPalette(mode, reduceTransparency ? getReducedTransparencyWorkerTokens(base) : base)
}
