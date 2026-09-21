import { View } from 'react-native'

import {
  type WorkerJobsLegacyPrototypeBodyProps,
  type WorkerJobsLegacyPrototypeStage,
} from './worker-jobs-zip-prototype-shared'
import { prototypeStyles } from './worker-jobs-zip-prototype-styles'
import { WorkerWaitingRuntime } from './waiting/waiting-runtime'
import {
  WorkerJobsLegacyPrototypeOfferDetailBody,
  WorkerJobsLegacyPrototypeOpportunityInboxBody,
  WorkerJobsLegacyPrototypeRouteEtaBody,
} from './worker-jobs-zip-prototype-early-stages'
import {
  WorkerJobsLegacyPrototypeStageEightBody,
  WorkerJobsLegacyPrototypeStageFiveBody,
  WorkerJobsLegacyPrototypeStageSixBody,
} from './worker-jobs-zip-prototype-work-stages'
import {
  WorkerJobsLegacyPrototypePaymentConfirmedBody,
  WorkerJobsLegacyPrototypeStageNineBody,
  WorkerJobsLegacyPrototypeStageTenBody,
} from './worker-jobs-zip-prototype-settlement-stages'

export type { WorkerJobsLegacyPrototypeBodyProps, WorkerJobsLegacyPrototypeStage }
export { prototypeStyles }

export function WorkerJobsLegacyPrototypeBody(props: WorkerJobsLegacyPrototypeBodyProps) {
  const { prototypeStage, screen } = props

  if (screen.id === '2.12-case-closed' && prototypeStage === 'payment-confirmed') {
    return (
      <WorkerJobsLegacyPrototypePaymentConfirmedBody
        language={props.language}
        navigateToEarnings={() => props.navigateToScreen('4.1-earnings-overview')}
        navigateToHome={() => props.navigateToScreen('1.1-worker-home')}
        navigateToHistory={() => props.navigateToScreen('4.2-ledger-detail')}
        reduceMotion={props.reduceMotion}
        reduceTransparency={props.reduceTransparency}
        runtime={props.runtime}
      />
    )
  }

  switch (screen.id) {
    case '2.1-opportunity-inbox':
      return (
        <View style={prototypeStyles.bodyStack} testID="worker-v5-jobs-rebuild-surface">
          <WorkerJobsLegacyPrototypeOpportunityInboxBody
            language={props.language}
            prototypeMode={props.prototypeMode}
            reduceTransparency={props.reduceTransparency}
            runtime={props.runtime}
          />
        </View>
      )
    case '2.2-offer-detail':
      return (
        <WorkerJobsLegacyPrototypeOfferDetailBody
          actionBusy={props.actionBusy}
          language={props.language}
          prototypeMode={props.prototypeMode}
          reduceTransparency={props.reduceTransparency}
          runWorkerAction={props.runWorkerAction}
          runtime={props.runtime}
        />
      )
    case '2.3-customer-confirmation-wait':
      return (
        <WorkerWaitingRuntime
          kind="customer-confirmation"
          language={props.language}
          runtime={props.runtime}
          reduceMotion={props.reduceMotion}
          onBack={() => props.navigateToScreen('2.1-opportunity-inbox')}
        />
      )
    case '2.4-route-eta':
      return (
        <WorkerJobsLegacyPrototypeRouteEtaBody
          actionBusy={props.actionBusy}
          language={props.language}
          navigateActiveJobChat={props.navigateActiveJobChat}
          navigateJobChat={props.navigateJobChat}
          navigateToScreen={props.navigateToScreen}
          prototypeMode={props.prototypeMode}
          reduceMotion={props.reduceMotion}
          reduceTransparency={props.reduceTransparency}
          routePreview={props.routePreview}
          runRouteAction={props.runRouteAction}
          runtime={props.runtime}
        />
      )
    case '2.7-in-progress':
      return (
        <WorkerJobsLegacyPrototypeStageFiveBody
          actionBusy={props.actionBusy}
          language={props.language}
          navigateActiveJobChat={props.navigateActiveJobChat}
          navigateNext={props.navigateNext}
          reduceTransparency={props.reduceTransparency}
          runRouteAction={props.runRouteAction}
          runtime={props.runtime}
        />
      )
    case '2.8-scope-change':
      return (
        <WorkerJobsLegacyPrototypeStageSixBody
          language={props.language}
          navigateJobChat={props.navigateJobChat}
          navigateNext={props.navigateNext}
          reduceMotion={props.reduceMotion}
          reduceTransparency={props.reduceTransparency}
          runtime={props.runtime}
        />
      )
    case '2.9-approval-wait':
      return (
        <WorkerWaitingRuntime
          kind="scope-approval"
          language={props.language}
          runtime={props.runtime}
          reduceMotion={props.reduceMotion}
          onBack={() => props.navigateToScreen('2.8-scope-change')}
          onMessage={props.navigateJobChat}
          onContinue={props.navigateNext}
        />
      )
    case '2.10-completion-evidence':
      return (
        <WorkerJobsLegacyPrototypeStageEightBody
          language={props.language}
          navigateNext={props.navigateNext}
          reduceTransparency={props.reduceTransparency}
          runtime={props.runtime}
        />
      )
    case '2.11-completion-submitted':
      return (
        <WorkerJobsLegacyPrototypeStageNineBody
          actionBusy={props.actionBusy}
          language={props.language}
          navigateNext={props.navigateNext}
          navigateToEvidence={() => props.navigateToScreen('2.10-completion-evidence')}
          prototypeMode={props.prototypeMode}
          reduceMotion={props.reduceMotion}
          reduceTransparency={props.reduceTransparency}
          runtime={props.runtime}
        />
      )
    case '2.12-case-closed':
      return (
        <WorkerJobsLegacyPrototypeStageTenBody
          language={props.language}
          navigateToEarnings={() => props.navigateToScreen('4.1-earnings-overview')}
          navigateToRanking={() => props.navigateToScreen('5.2-worker-ranking')}
          reduceTransparency={props.reduceTransparency}
          runtime={props.runtime}
        />
      )
    default:
      return null
  }
}
