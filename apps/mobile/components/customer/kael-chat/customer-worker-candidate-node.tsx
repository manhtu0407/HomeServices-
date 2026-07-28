import { useCustomerSavedWorkers } from './customer-saved-workers'
import { WorkerCandidateReviewResponse } from './worker-candidate-review-response'
import type { useCustomerKaelSurfaceController } from './use-customer-kael-surface-controller'

type Controller = ReturnType<typeof useCustomerKaelSurfaceController>

export function CustomerWorkerCandidateNode({ controller }: { controller: Controller }) {
  const {
    candidateJobId,
    language,
    mode,
    reduceMotion,
    tokens,
    workflow,
  } = controller
  const savedWorkers = useCustomerSavedWorkers(mode === 'case' ? candidateJobId : null)
  if (mode !== 'case' || !candidateJobId) return null

  return (
    <WorkerCandidateReviewResponse
      busy={workflow.customerWorkerCandidateBusy}
      candidate={workflow.customerWorkerCandidate}
      error={workflow.customerWorkerCandidateError}
      language={language}
      onConfirm={() => void workflow.actions.decideWorkerCandidate('confirm')}
      onReject={() => void workflow.actions.decideWorkerCandidate('reject')}
      onRetry={() => void workflow.actions.refreshWorkerCandidate(candidateJobId)}
      onRetrySavedWorkers={savedWorkers.reload}
      onToggleFavorite={(isFavorite) => {
        void workflow.actions.setWorkerCandidateFavorite(isFavorite).then((updated) => {
          if (updated) savedWorkers.reload()
        })
      }}
      reduceMotion={reduceMotion}
      savedWorkers={savedWorkers.workers}
      savedWorkersStatus={savedWorkers.status}
      tokens={tokens}
    />
  )
}
