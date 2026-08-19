import { useLocalSearchParams } from 'expo-router'
import { firstRouteParam } from '../dock/routing'
import type { WorkerV5RouteParams } from '../dock/types'
import { WorkerJobsLegacyPrototypeBody } from './worker-jobs-legacy-prototype-surface'
import type { WorkerJobsLegacyPrototypeBodyProps } from './worker-jobs-legacy-prototype-contracts'

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
