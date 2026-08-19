import { View } from 'react-native'
import type { WorkerJobsLegacyPrototypeBodyProps } from './worker-jobs-legacy-prototype-contracts'
import { prototypeStyles } from './worker-jobs-legacy-prototype-styles'
import { WorkerJobsLegacyPrototypeOpportunityInboxBody } from './worker-jobs-legacy-prototype-opportunity'
import { WorkerJobsLegacyPrototypeOfferDetailBody, WorkerJobsLegacyPrototypeRouteEtaBody } from './worker-jobs-legacy-prototype-offer-route'
import { WorkerJobsLegacyPrototypeCustomerConfirmationWaitBody, WorkerJobsLegacyPrototypeStageEightBody, WorkerJobsLegacyPrototypeStageFiveBody, WorkerJobsLegacyPrototypeStageNineBody, WorkerJobsLegacyPrototypeStageSevenBody, WorkerJobsLegacyPrototypeStageSixBody } from './worker-jobs-legacy-prototype-stages'
import { WorkerJobsLegacyPrototypePaymentConfirmedBody, WorkerJobsLegacyPrototypeStageTenBody } from './worker-jobs-legacy-prototype-settlement'

export function WorkerJobsLegacyPrototypeBody({
  actionBusy,
  language,
  navigateActiveJobChat,
  navigateJobChat,
  navigateNext,
  navigateToScreen,
  prototypeStage,
  reduceMotion,
  reduceTransparency,
  routePreview,
  runRouteAction,
  runWorkerAction,
  runtime,
  screen,
}: WorkerJobsLegacyPrototypeBodyProps) {
  if (screen.id === '2.12-case-closed' && prototypeStage === 'payment-confirmed') {
    return (
      <WorkerJobsLegacyPrototypePaymentConfirmedBody
        language={language}
        navigateToEarnings={() => navigateToScreen('4.1-earnings-overview')}
        reduceTransparency={reduceTransparency}
        runtime={runtime}
      />
    )
  }

  switch (screen.id) {
    case '2.1-opportunity-inbox':
      return <View style={prototypeStyles.bodyStack}><WorkerJobsLegacyPrototypeOpportunityInboxBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} /></View>
    case '2.2-offer-detail':
      return <WorkerJobsLegacyPrototypeOfferDetailBody actionBusy={actionBusy} language={language} reduceTransparency={reduceTransparency} runWorkerAction={runWorkerAction} runtime={runtime} />
    case '2.3-customer-confirmation-wait':
      return <WorkerJobsLegacyPrototypeCustomerConfirmationWaitBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '2.4-route-eta':
      return <WorkerJobsLegacyPrototypeRouteEtaBody actionBusy={actionBusy} language={language} navigateJobChat={navigateJobChat} reduceTransparency={reduceTransparency} routePreview={routePreview} runRouteAction={runRouteAction} runtime={runtime} />
    case '2.7-in-progress':
      return <WorkerJobsLegacyPrototypeStageFiveBody actionBusy={actionBusy} language={language} navigateActiveJobChat={navigateActiveJobChat} navigateNext={navigateNext} reduceTransparency={reduceTransparency} runRouteAction={runRouteAction} runtime={runtime} />
    case '2.8-scope-change':
      return <WorkerJobsLegacyPrototypeStageSixBody language={language} navigateJobChat={navigateJobChat} navigateNext={navigateNext} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '2.9-approval-wait':
      return <WorkerJobsLegacyPrototypeStageSevenBody language={language} navigateJobChat={navigateJobChat} navigateToScreen={(id) => navigateToScreen(id)} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '2.10-completion-evidence':
      return <WorkerJobsLegacyPrototypeStageEightBody language={language} navigateNext={navigateNext} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '2.11-completion-submitted':
      return (
        <WorkerJobsLegacyPrototypeStageNineBody
          actionBusy={actionBusy}
          language={language}
          navigateNext={navigateNext}
          navigateToEvidence={() => navigateToScreen('2.10-completion-evidence')}
          onRespondToDirectPayment={(received) => void runWorkerAction(
            () => runtime.actions.workerConfirmCashPayment(received),
            { navigateOnSuccess: received },
          )}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
        />
      )
    case '2.12-case-closed':
      return (
        <WorkerJobsLegacyPrototypeStageTenBody
          language={language}
          navigateToEarnings={() => navigateToScreen('4.1-earnings-overview')}
          navigateToRanking={() => navigateToScreen('5.2-worker-ranking')}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
        />
      )
    default:
      return null
  }
}
