import { StyleSheet } from 'react-native'
import type { Edge } from 'react-native-safe-area-context'

import type { LocalDeal } from '@nestscout/shared'

import { isStageNineRecordEmpty, readStageNineRecordState } from './stage-nine-model'
import { stageNineTokens } from './stage-nine-tokens'

// The empty stage paints behind the status bar and offsets its own header by the top inset.
export const STAGE_NINE_EMPTY_SAFE_AREA_EDGES: readonly Edge[] = ['right', 'bottom', 'left']

export function isStageNineEmptyScreen(screenId: string, deal: LocalDeal | null | undefined): boolean {
  return screenId === '2.11-completion-submitted' && isStageNineRecordEmpty(readStageNineRecordState(deal))
}

export const stageNineHostStyles = StyleSheet.create({
  safeArea: {
    backgroundColor: stageNineTokens.colors.page,
  },
  scrollContent: {
    gap: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
})
