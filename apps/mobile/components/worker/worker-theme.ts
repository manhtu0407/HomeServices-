import type { CustomerThemeTokens } from '@/components/customer/customer-theme'
import { customerTheme } from '@/design/theme'
import { createThemePreferenceStore, type ResolvedThemeMode, type ThemePreference } from '@/lib/theme-preference-store'

const WORKER_THEME_STORAGE_KEY = 'nestscout.worker.theme.mode.v1'

export type WorkerThemeMode = ResolvedThemeMode
export type WorkerThemeTokens = CustomerThemeTokens

const workerThemeStore = createThemePreferenceStore(WORKER_THEME_STORAGE_KEY)

export function getWorkerThemeTokens(mode: WorkerThemeMode): WorkerThemeTokens {
  return mode === 'dark' ? customerTheme.darkLayer : customerTheme.lightLayer
}

export function getReducedTransparencyWorkerTokens(tokens: WorkerThemeTokens): WorkerThemeTokens {
  const reduced = tokens.mode === 'dark'
    ? customerTheme.reducedTransparency.dark
    : customerTheme.reducedTransparency.light

  return {
    ...tokens,
    ghost: reduced.ghost,
    glass: reduced.glass,
    glassBorder: tokens.borderStrong,
    glassFloatShadow: 'none',
    glassHighlight: 'transparent',
    glassShadow: 'none',
    glassStrong: reduced.glassStrong,
    glassWarm: reduced.glassWarm,
  }
}

export function setWorkerThemeMode(next: ThemePreference) {
  return workerThemeStore.setPreference(next)
}

export function getWorkerThemeModeNow(): WorkerThemeMode {
  return workerThemeStore.getResolvedMode()
}

export function useWorkerThemePreference() {
  return workerThemeStore.usePreference()
}

export function useWorkerThemeMode(): WorkerThemeMode {
  return workerThemeStore.useResolvedMode()
}
