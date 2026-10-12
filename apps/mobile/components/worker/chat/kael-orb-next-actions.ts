import type { KaelNextAction } from '@nestscout/shared'

import type { WorkerV5ScreenId } from '../dock/types'

// Worker chips only open screens the worker already uses or send a follow-up question; none
// accepts a job or changes a price for the worker.
export function workerKaelNextActionHandler(input: {
  send: (message: string) => unknown
  pickMedia: () => unknown
  navigateToScreen: (id: WorkerV5ScreenId) => void
}) {
  return (action: KaelNextAction) => {
    if (action.kind === 'send_suggestion') void input.send(action.message ?? action.label)
    else if (action.kind === 'attach_photo') void input.pickMedia()
    else if (action.kind === 'open_scope_change') input.navigateToScreen('2.8-scope-change')
    else if (action.kind === 'open_opportunities') input.navigateToScreen('2.1-opportunity-inbox')
  }
}
