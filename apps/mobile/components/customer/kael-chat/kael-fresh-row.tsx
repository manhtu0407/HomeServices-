import { useMemo, useRef, type ReactNode } from 'react'
import { Platform, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'

import { motionTokens } from '@/components/ui/motion-tokens'

import type { ChatTranscriptRow } from './kael-chat-transcript'

// A thread opens with its history in one batch; only a row that appears alone afterwards is a
// message being sent or answered, so only those rows rise in.
const LIVE_BATCH_LIMIT = 2
const RISE_PX = 10
const RISE_MS = motionTokens.stateChange.durationMs

export function KaelFreshRow({ children }: { children: ReactNode }) {
  // Web entering animations detach the row from FlatList flow and can overlap the next receipt.
  if (Platform.OS === 'web') return <View>{children}</View>
  return (
    <Animated.View
      entering={FadeInDown.duration(RISE_MS).withInitialValues({ opacity: 0, transform: [{ translateY: RISE_PX }] })}
    >
      {children}
    </Animated.View>
  )
}

// A thread is named by its first stored turn; a different first turn means another conversation
// was opened, whose history must open without animation. A new chat has no stored turn yet, so its
// first message is not mistaken for a switch.
function threadScope(rows: readonly ChatTranscriptRow[]) {
  return rows.find((row) => row.key.startsWith('turn-') && !row.key.startsWith('turn-kael-response:'))?.key ?? ''
}

// Once a row is wrapped it stays wrapped, so a streaming reply is never remounted when it settles.
export function useKaelFreshRows(rows: readonly ChatTranscriptRow[], reduceMotion: boolean): ChatTranscriptRow[] {
  const seenRef = useRef<Set<string> | null>(null)
  const freshRef = useRef<Set<string>>(new Set())
  const scopeRef = useRef('')
  return useMemo(() => {
    if (reduceMotion) return rows as ChatTranscriptRow[]
    const scope = threadScope(rows)
    if (scopeRef.current !== '' && scope !== scopeRef.current) {
      seenRef.current = null
      freshRef.current = new Set()
    }
    if (scope !== '') scopeRef.current = scope
    else if (rows.length === 0) scopeRef.current = ''
    const seen = seenRef.current
    const arrived = seen ? rows.filter((row) => !seen.has(row.key)) : []
    if (seen && arrived.length > 0 && arrived.length <= LIVE_BATCH_LIMIT) {
      for (const row of arrived) freshRef.current.add(row.key)
    }
    if (rows.length > 0) seenRef.current = new Set([...(seen ?? []), ...rows.map((row) => row.key)])
    return rows.map((row) => (
      freshRef.current.has(row.key) ? { ...row, node: <KaelFreshRow>{row.node}</KaelFreshRow> } : row
    ))
  }, [reduceMotion, rows])
}
