import { useGlassAccessibility } from '@/components/ui/accessibility-motion'

import {
  getCustomerThemeTokens,
  getReducedTransparencyCustomerTokens,
  useCustomerThemeMode,
} from '../customer-theme'

export function useV21Theme() {
  const mode = useCustomerThemeMode()
  const glass = useGlassAccessibility()
  const baseTokens = getCustomerThemeTokens(mode)
  const tokens = glass.reduceTransparency
    ? getReducedTransparencyCustomerTokens(baseTokens)
    : baseTokens
  return { ...glass, mode, tokens }
}
