import { useEffect, useMemo, useRef, useState } from 'react'

import type { KaelResponseStreamState } from '@/lib/kael-response-stream'
import {
  createKaelRespondStreamPresentationState,
  isKaelRespondStreamPresentationSettled,
  nextKaelRespondStreamPresentationStep,
  reconcileKaelRespondStreamPresentation,
  type KaelRespondStreamItem,
} from '@/lib/kael-respond-stream-presentation'

type KaelRespondStreamItemsOptions = {
  items: readonly KaelRespondStreamItem[]
  onSettled?: (streamId: string) => void
  reduceMotion: boolean
  /**
   * A live reply whose text is already complete when it first paints still reveals and then
   * settles. Without it such a reply shows at once and never reports settled.
   */
  revealOnMount?: boolean
  streamId: string | null
  streaming: boolean
  terminal: boolean
}

export function useKaelRespondStreamItems({
  items,
  onSettled,
  reduceMotion,
  revealOnMount = false,
  streamId,
  streaming,
  terminal,
}: KaelRespondStreamItemsOptions) {
  const revealing = (streaming || (revealOnMount && terminal)) && !reduceMotion
  const itemsSignature = useMemo(
    () => items.map((item) => `${item.id}\u0000${item.text}`).join('\u0001'),
    [items],
  )
  const activeStreamIdRef = useRef<string | null>(revealing ? streamId : null)
  const itemsRef = useRef(items)
  const settledStreamIdRef = useRef<string | null>(null)
  const onSettledRef = useRef(onSettled)
  const [presentation, setPresentation] = useState(() => (
    createKaelRespondStreamPresentationState(items, streamId, !revealing)
  ))

  useEffect(() => {
    onSettledRef.current = onSettled
  }, [onSettled])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    const currentItems = itemsRef.current
    if (!streamId || reduceMotion) {
      activeStreamIdRef.current = null
      setPresentation(createKaelRespondStreamPresentationState(currentItems, streamId, true))
      if (streamId && terminal && settledStreamIdRef.current !== streamId) {
        settledStreamIdRef.current = streamId
        onSettledRef.current?.(streamId)
      }
      return
    }
    if (streaming) {
      if (activeStreamIdRef.current !== streamId) {
        activeStreamIdRef.current = streamId
        settledStreamIdRef.current = null
        setPresentation(createKaelRespondStreamPresentationState(currentItems, streamId, false))
        return
      }
      setPresentation((current) => reconcileKaelRespondStreamPresentation(current, currentItems, streamId))
      return
    }
    if (activeStreamIdRef.current === streamId && terminal) {
      setPresentation((current) => reconcileKaelRespondStreamPresentation(current, currentItems, streamId))
      return
    }
    activeStreamIdRef.current = null
    setPresentation(createKaelRespondStreamPresentationState(currentItems, streamId, true))
  }, [itemsSignature, reduceMotion, streamId, streaming, terminal])

  useEffect(() => {
    const currentItems = itemsRef.current
    const activeStreamId = activeStreamIdRef.current
    if (
      !streamId ||
      presentation.streamId !== streamId ||
      reduceMotion ||
      activeStreamId !== streamId ||
      (!streaming && !terminal)
    ) return
    if (isKaelRespondStreamPresentationSettled(presentation, currentItems, streamId)) {
      if (terminal && settledStreamIdRef.current !== streamId) {
        activeStreamIdRef.current = null
        settledStreamIdRef.current = streamId
        onSettledRef.current?.(streamId)
      }
      return
    }
    const next = nextKaelRespondStreamPresentationStep(presentation, currentItems)
    if (!next) return
    const timer = setTimeout(() => setPresentation(next.state), next.delayMs)
    return () => clearTimeout(timer)
  }, [itemsSignature, presentation, reduceMotion, streamId, streaming, terminal])

  return useMemo(() => items.map((item) => ({
    ...item,
    text: presentation.textById[item.id] ?? '',
  })), [items, presentation])
}

export function useKaelResponseStreamPresentation(
  state: KaelResponseStreamState,
  options: Pick<KaelRespondStreamItemsOptions, 'onSettled' | 'reduceMotion' | 'revealOnMount'>,
) {
  const items = useMemo(() => state.blockOrder.flatMap((blockId) => {
    const block = state.blocks[blockId]
    return block ? [{ id: block.id, text: block.text }] : []
  }), [state.blockOrder, state.blocks])
  const presentedItems = useKaelRespondStreamItems({
    items,
    onSettled: options.onSettled,
    reduceMotion: options.reduceMotion,
    revealOnMount: options.revealOnMount,
    streamId: state.responseId,
    streaming: state.status === 'streaming',
    terminal: state.status === 'completed',
  })
  const textById = useMemo(
    () => Object.fromEntries(presentedItems.map((item) => [item.id, item.text])),
    [presentedItems],
  )

  return useMemo(() => ({
    ...state,
    blocks: Object.fromEntries(state.blockOrder.flatMap((blockId) => {
      const block = state.blocks[blockId]
      return block ? [[blockId, { ...block, text: textById[blockId] ?? '' }]] : []
    })),
  }), [state, textById])
}
