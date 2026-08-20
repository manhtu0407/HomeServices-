import { useLocalSearchParams } from 'expo-router'
import { firstRouteParam } from '../dock/routing'
import type { WorkerV5RouteParams } from '../dock/types'
import { WorkerJobsLegacyPrototypeBody, type WorkerJobsLegacyPrototypeBodyProps } from './worker-jobs-zip-prototype-surface'

type WorkerJobsProductionHostProps = Omit<WorkerJobsLegacyPrototypeBodyProps, 'prototypeMode' | 'prototypeStage'>

export function WorkerJobsProductionHost(props: WorkerJobsProductionHostProps) {
  const prototypeStage = firstRouteParam(useLocalSearchParams<WorkerV5RouteParams>().ns_worker_stage)

  return (
    <WorkerJobsLegacyPrototypeBody
      {...props}
      prototypeMode={false}
      prototypeStage={prototypeStage === 'payment-confirmed' ? 'payment-confirmed' : undefined}
    />
  )
}
