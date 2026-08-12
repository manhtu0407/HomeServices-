import type { Dispatch, SetStateAction } from 'react'

import {
  kaelReasoningReceiptReducer,
  type KaelReasoningReceiptState,
  type KaelReasoningStreamEvent,
} from '@/lib/kael-reasoning-receipt'

type ReasoningReceiptSetter = Dispatch<SetStateAction<KaelReasoningReceiptState>>

export function applyCustomerKaelReasoningEvent(
  event: KaelReasoningStreamEvent,
  isCurrent: () => boolean,
  setReasoningReceipt: ReasoningReceiptSetter,
) {
  if (!isCurrent()) return
  setReasoningReceipt((current) => kaelReasoningReceiptReducer(current, {
    event,
    type: 'event',
  }))
}
