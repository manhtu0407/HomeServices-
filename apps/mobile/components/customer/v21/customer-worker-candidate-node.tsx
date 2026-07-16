import { WorkerCandidateReviewCard } from '../kael-chat/worker-candidate-review-card'
import type { useCustomerKaelSurfaceController } from './use-customer-kael-surface-controller'

type Controller = ReturnType<typeof useCustomerKaelSurfaceController>

export function CustomerWorkerCandidateNode({ controller }: { controller: Controller }) {
  const {
    candidateJobId,
    language,
    mode,
    tokens,
    workflow,
  } = controller
  if (mode !== 'case' || !candidateJobId) return null

  return (
    <WorkerCandidateReviewCard
      busy={workflow.customerWorkerCandidateBusy}
      candidate={workflow.customerWorkerCandidate}
      error={workflow.customerWorkerCandidateError}
      language={language}
      onConfirm={() => void workflow.actions.decideWorkerCandidate('confirm')}
      onReject={() => void workflow.actions.decideWorkerCandidate('reject')}
      onRetry={() => void workflow.actions.refreshWorkerCandidate(candidateJobId)}
      onToggleFavorite={(isFavorite) => void workflow.actions.setWorkerCandidateFavorite(isFavorite)}
      tokens={tokens}
    />
  )
}
