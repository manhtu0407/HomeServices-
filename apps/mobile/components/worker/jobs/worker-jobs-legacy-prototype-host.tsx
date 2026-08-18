import { useLocalSearchParams } from 'expo-router'
import { firstRouteParam } from '../dock/routing'
import type { WorkerV5RouteParams, WorkerV5ScreenId } from '../dock/types'
import { WorkerJobsLegacyPrototypeBody } from './worker-jobs-legacy-prototype-surface'
import type { WorkerJobsLegacyPrototypeBodyProps } from './worker-jobs-legacy-prototype-shared'

const workerJobsRebuildScreenIds = new Set<WorkerV5ScreenId>([
  '2.1-opportunity-inbox',
  '2.2-offer-detail',
  '2.3-customer-confirmation-wait',
  '2.4-route-eta',
  '2.7-in-progress',
  '2.8-scope-change',
  '2.9-approval-wait',
  '2.10-completion-evidence',
  '2.11-completion-submitted',
  '2.12-case-closed',
])

export function isWorkerJobsLegacyPrototypeScreen(screenId: WorkerV5ScreenId) {
  return workerJobsRebuildScreenIds.has(screenId)
}

type WorkerJobsLegacyPrototypeHostProps = Omit<WorkerJobsLegacyPrototypeBodyProps, 'prototypeStage'>

export function WorkerJobsLegacyPrototypeHost(props: WorkerJobsLegacyPrototypeHostProps) {
  const prototypeStage = firstRouteParam(useLocalSearchParams<WorkerV5RouteParams>().ns_worker_stage)

  return (
    <WorkerJobsLegacyPrototypeBody
      {...props}
      prototypeStage={prototypeStage === 'payment-confirmed' ? 'payment-confirmed' : undefined}
    />
  )
}
