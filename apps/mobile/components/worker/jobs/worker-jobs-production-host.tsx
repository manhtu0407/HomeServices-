import { useLocalSearchParams } from 'expo-router'
import { firstRouteParam } from '../dock/routing'
import type { WorkerV5RouteParams } from '../dock/types'
import { WorkerJobsProductionStageEightBody } from './evidence/stage-eight-production-body'
import { WorkerJobsLegacyPrototypeBody, type WorkerJobsLegacyPrototypeBodyProps } from './worker-jobs-zip-prototype-surface'

type WorkerJobsProductionHostProps = Omit<WorkerJobsLegacyPrototypeBodyProps, 'prototypeMode' | 'prototypeStage'>

export function WorkerJobsProductionHost(props: WorkerJobsProductionHostProps) {
  const prototypeStage = firstRouteParam(useLocalSearchParams<WorkerV5RouteParams>().ns_worker_stage)

  if (props.screen.id === '2.10-completion-evidence') {
    return (
      <WorkerJobsProductionStageEightBody
        language={props.language}
        navigateNext={props.navigateNext}
        runtime={props.runtime}
      />
    )
  }

  return (
    <WorkerJobsLegacyPrototypeBody
      {...props}
      prototypeMode={false}
      prototypeStage={prototypeStage === 'payment-confirmed' ? 'payment-confirmed' : undefined}
    />
  )
}
