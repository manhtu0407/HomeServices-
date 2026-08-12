import type { Dispatch, SetStateAction } from 'react'

import {
  initialKaelReasoningReceiptState,
  kaelReasoningReceiptReducer,
  type KaelReasoningReceiptState,
  type KaelReasoningStreamEvent,
} from '@/lib/kael-reasoning-receipt'

type ReasoningReceiptSetter = Dispatch<SetStateAction<KaelReasoningReceiptState>>

export function createWorkerKaelReasoningActions(
  setReasoningReceipt: ReasoningReceiptSetter,
  setActiveReasoningReceipt: ReasoningReceiptSetter,
) {
  return {
    applyStreamEvent(event: KaelReasoningStreamEvent) {
      setActiveReasoningReceipt((current) => kaelReasoningReceiptReducer(current, {
        event,
        type: 'event',
      }))
    },
    begin() {
      setReasoningReceipt((current) => kaelReasoningReceiptReducer(current, { type: 'begin' }))
    },
    fail(message: string) {
      setReasoningReceipt((current) => kaelReasoningReceiptReducer(current, {
        message,
        type: 'fail',
      }))
    },
    reset() {
      setReasoningReceipt(initialKaelReasoningReceiptState)
    },
    toggle() {
      setReasoningReceipt((current) => kaelReasoningReceiptReducer(current, { type: 'toggle' }))
    },
  }
}
