import { useWindowDimensions, type TextStyle } from 'react-native'

import type { AppleTypographyRole } from '@/design/theme'

import { stageTypography } from './stage-ratio'

export const stageSixType = {
  action: { role: 'caption1', weight: '600' },
  emptyBody: { role: 'caption1', weight: '500' },
  emptyHint: { role: 'caption2', weight: '500' },
  emptyTitle: { role: 'headline', weight: '600' },
  kicker: { role: 'caption1', weight: '500' },
  label: { role: 'footnote', weight: '500' },
  note: { role: 'caption1', weight: '500' },
  title: { role: 'headline', weight: '600' },
  total: { role: 'title3', weight: '600' },
  value: { role: 'footnote', weight: '600' },
} as const satisfies Record<string, { role: AppleTypographyRole; weight: TextStyle['fontWeight'] }>

export type StageSixTextKind = keyof typeof stageSixType

export function useStageSixText() {
  const { width } = useWindowDimensions()
  return (kind: StageSixTextKind): TextStyle => {
    const spec = stageSixType[kind]
    return { ...stageTypography(spec.role, width), fontWeight: spec.weight }
  }
}
