import type { KaelChatNextAction, KaelChatStatus, WorkflowPhase } from '@nestscout/shared'

export function shouldShowCaseWorkIntakeResponse({
  dealExists,
  evidenceGateActive,
  mode,
  offerReviewActive,
  serverPriceReviewBlocked,
  workIntakeActive,
}: {
  dealExists: boolean
  evidenceGateActive: boolean
  mode: 'case' | 'normal'
  offerReviewActive: boolean
  serverPriceReviewBlocked: boolean
  workIntakeActive: boolean
}) {
  return mode === 'case' &&
    !dealExists &&
    workIntakeActive &&
    !evidenceGateActive &&
    !offerReviewActive &&
    !serverPriceReviewBlocked
}

export function resolveCaseWorkIntakePhase({
  hasSession,
  loading,
}: {
  hasSession: boolean
  loading: boolean
  nextAction: KaelChatNextAction | null
  status: KaelChatStatus | null
}): WorkflowPhase {
  if (!hasSession) return 'intake_started'
  if (loading) return 'kael_estimating'
  return 'kael_collecting'
}
