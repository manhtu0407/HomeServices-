import type { KaelReasoningReceiptStatus } from '@/lib/kael-reasoning-receipt'

import type { CustomerKaelMode } from '../ui/types'

export function customerKaelInlineError(
  error: string | null,
  mode: CustomerKaelMode,
  reasoningStatus: KaelReasoningReceiptStatus,
) {
  if (mode === 'normal' && reasoningStatus === 'failed') return null
  return error
}
