import { WorkerJobsProductionStageFour, type StageFourProps } from './worker-jobs-zip-prototype-stage-four'

// Keep the existing route owner stable while the Stage 4 surface changes independently from Stage 5.
export function WorkerJobsLegacyPrototypeRouteEtaBody(props: StageFourProps) {
  return <WorkerJobsProductionStageFour {...props} />
}
