import { useRef, type ReactNode } from 'react'
import Animated, { FadeInDown } from 'react-native-reanimated'

import { motionTokens } from '@/components/ui/motion-tokens'

import type { ChatTranscriptRow } from './kael-chat-transcript'

// A thread opens with its history in one batch; only a row that appears alone afterwards is a
// message being sent or answered, so only those rows rise in.
const LIVE_BATCH_LIMIT = 2
const RISE_PX = 10
const RISE_MS = motionTokens.stateChange.durationMs

export function KaelFreshRow({ children }: { children: ReactNode }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(RISE_MS).withInitialValues({ opacity: 0, transform: [{ translateY: RISE_PX }] })}
    >
      {children}
    </Animated.View>
  )
}

// Once a row is wrapped it stays wrapped, so a streaming reply is never remounted when it settles.
export function useKaelFreshRows(rows: readonly ChatTranscriptRow[], reduceMotion: boolean): ChatTranscriptRow[] {
  const seenRef = useRef<Set<string> | null>(null)
  const freshRef = useRef<Set<string>>(new Set())
  if (reduceMotion) return rows as ChatTranscriptRow[]
  const seen = seenRef.current
  const arrived = seen ? rows.filter((row) => !seen.has(row.key)) : []
  if (seen && arrived.length > 0 && arrived.length <= LIVE_BATCH_LIMIT) {
    for (const row of arrived) freshRef.current.add(row.key)
  }
  if (rows.length > 0) seenRef.current = new Set([...(seen ?? []), ...rows.map((row) => row.key)])
  return rows.map((row) => (
    freshRef.current.has(row.key) ? { ...row, node: <KaelFreshRow>{row.node}</KaelFreshRow> } : row
  ))
}
