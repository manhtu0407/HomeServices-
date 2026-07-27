import { Text as RNText, type ImageSourcePropType, type TextProps } from 'react-native'
import { WorkerV5IconName } from '../dock/types'
import { useState } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { type AppLanguage } from '@/lib/app-language'
import { routeForWorkerV5Screen } from '../dock/routing'
import { requireWorkerV5Screen } from '../dock/screens'
import { workerV5JobsDestinationScreenId } from '../ui/screen-navigation'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { WorkerV5AcceptChecklistCard, WorkerV5AcceptCommitmentCard } from './acceptance-surfaces'
import { WorkerV5ActionRail } from './advisory-surfaces'
import { WorkerV5BoundaryNote } from '../ui/metrics-surfaces'
import { WorkerV5CustomerCaseWideMintAura, WorkerV5CustomerZipMintAura } from '../ui/aura-surfaces'
import { WorkerV5OfferDetailEmptyCard, WorkerV5OfferDetailListCard, WorkerV5OfferDetailSummaryCard } from './offer-surfaces'
import { WorkerV5OpportunityCard, WorkerV5OpportunityEmptyCard } from '../home/opportunity-surfaces'
import { WorkerV5PrimaryButtonFill, WorkerV5SectionHeader } from '../ui/primitives-surfaces'
import { buildWorkerV5AcceptReviewChecks, workerV5CanAcceptOpenOffer } from './acceptance'
import { buildWorkerV5OfferAddressRows, buildWorkerV5OfferRequestRows } from './offer'
import { localizedServiceLabel } from '@/lib/app-language'
import { styles } from '../worker-v5-flow-styles'
import { textByLanguage } from '../ui/format'
import { useRef } from 'react'
import { workerV5DisplayCode } from '../ui/screen-labels'
import { workerV5Icons, workerV5OpportunityServiceIcons } from '../ui/screen-icons'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export const workerV5OfferDetailIcons: Record<WorkerV5IconName, ImageSourcePropType> = {
  ...workerV5Icons,
  clock: require('@/assets/worker-image-icons/offer-acceptance-window.png') as ImageSourcePropType,
  document: require('@/assets/worker-image-icons/offer-scope-modules.png') as ImageSourcePropType,
  map: require('@/assets/worker-image-icons/offer-private-entry.png') as ImageSourcePropType,
  profile: require('@/assets/worker-image-icons/offer-customer-handoff.png') as ImageSourcePropType,
}

export const workerV5OfferDetailEmptyIcon = require('@/assets/worker-image-icons/offer-arrival-signal.png') as ImageSourcePropType

export function WorkerV5OpportunityInboxBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const router = useRouter()
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null)
  const deal = runtime.state.deal
  const currentDeal = workerV5JobsDestinationScreenId(deal) === '2.1-opportunity-inbox' ? null : deal
  const isIncoming = currentDeal?.status === 'broadcasting' && currentDeal.broadcast?.status === 'sent'
  const isCurrentMissionSelected = selectedMissionId === currentDeal?.id
  const openCurrentWork = () => {
    if (!currentDeal) return
    const target = requireWorkerV5Screen(workerV5JobsDestinationScreenId(currentDeal))
    const route = routeForWorkerV5Screen(target)
    const shouldShowArrivalGate = currentDeal.status === 'arrived' && target.id === '2.7-in-progress'
    router.replace((shouldShowArrivalGate ? `${route}&ns_arrival_gate=1` : route) as never)
  }
  const openKaelIntake = () => router.replace('/(worker)/chat?ns_worker_screen=3.2-kael-job-intake' as never)

  return (
    <View style={styles.opportunityInboxStack} testID="worker-v5-opportunity-inbox-handoff">
      <View style={styles.opportunityList} testID="worker-v5-opportunity-list">
        {currentDeal ? (
          <WorkerV5OpportunityCard
            deal={currentDeal}
            fallbackJobIcon={workerV5Icons.jobs}
            language={language}
            onSelect={() => setSelectedMissionId(currentDeal.id)}
            reduceTransparency={reduceTransparency}
            selected={isCurrentMissionSelected}
            serviceIcons={workerV5OpportunityServiceIcons}
          />
        ) : (
          <WorkerV5OpportunityEmptyCard jobIcon={workerV5Icons.jobs} language={language} reduceTransparency={reduceTransparency} tab="matches" />
        )}
      </View>
      <WorkerV5ActionRail
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        primaryButtonFill={WorkerV5PrimaryButtonFill}
        zipAura={WorkerV5CustomerZipMintAura}
        onPrimary={isCurrentMissionSelected ? openCurrentWork : undefined}
        onSecondary={openKaelIntake}
        primary={isIncoming
          ? textByLanguage(language, 'Xem & nhận việc', 'Review and accept')
          : textByLanguage(language, 'Tiếp tục công việc', 'Continue work')}
        primaryDisabled={!currentDeal || !isCurrentMissionSelected}
        primaryTestID="worker-v5-primary-action"
        primaryVariant={isCurrentMissionSelected ? "source" : "default"}
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Kael nhận việc', 'Kael job intake')}
        secondaryTestID="worker-v5-opportunity-kael-action"
      />
    </View>
  )
}

export function WorkerV5OfferDetailBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const router = useRouter()
  const [acceptBusy, setAcceptBusy] = useState(false)
  const [declineBusy, setDeclineBusy] = useState(false)
  const decisionBusyRef = useRef(false)
  const deal = runtime.state.deal
  const profile = runtime.workerProfile
  const checks = buildWorkerV5AcceptReviewChecks(deal, profile, language)
  const passedCount = checks.filter((item) => item.state === 'done').length
  const canAccept = workerV5CanAcceptOpenOffer(deal, runtime.state.workerGate)
  const canDecline = deal?.status === 'broadcasting' && deal.broadcast?.status === 'sent'
  const addressRows = buildWorkerV5OfferAddressRows(deal, language)
  const requestRows = buildWorkerV5OfferRequestRows(deal, language)
  const confirmAccept = async () => {
    if (!canAccept || decisionBusyRef.current) return
    decisionBusyRef.current = true
    setAcceptBusy(true)
    try {
      const ok = await runtime.actions.workerAcceptBroadcast()
      if (ok) router.replace('/(worker)/jobs?ns_worker_screen=2.3-customer-confirmation-wait' as never)
    } finally {
      decisionBusyRef.current = false
      setAcceptBusy(false)
    }
  }
  const declineOffer = async () => {
    if (!canDecline || decisionBusyRef.current) return
    decisionBusyRef.current = true
    setDeclineBusy(true)
    try {
      const ok = await runtime.actions.workerDeclineBroadcast()
      if (ok) router.replace('/(worker)/jobs?ns_worker_screen=2.1-opportunity-inbox' as never)
    } finally {
      decisionBusyRef.current = false
      setDeclineBusy(false)
    }
  }

  return (
    <View style={styles.offerDetailStack} testID="worker-v5-offer-detail-handoff">
      {deal ? (
        <WorkerV5OfferDetailSummaryCard
          caseWideAura={WorkerV5CustomerCaseWideMintAura}
          deal={deal}
          jobIcon={workerV5Icons.jobs}
          language={language}
          reduceTransparency={reduceTransparency}
          serviceIcons={workerV5OpportunityServiceIcons}
          zipAura={WorkerV5CustomerZipMintAura}
        />
      ) : (
        <WorkerV5OfferDetailEmptyCard
          caseWideAura={WorkerV5CustomerCaseWideMintAura}
          emptyOfferIcon={workerV5OfferDetailEmptyIcon}
          language={language}
          reduceTransparency={reduceTransparency}
          zipAura={WorkerV5CustomerZipMintAura}
        />
      )}
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Đã xác minh', 'Verified')}
        title={textByLanguage(language, 'Địa chỉ & khách hàng', 'Address and customer')}
      />
      <WorkerV5OfferDetailListCard
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        iconSources={workerV5OfferDetailIcons}
        reduceTransparency={reduceTransparency}
        rows={addressRows}
        scope="OfferAddressList"
        testID="worker-v5-offer-address-list"
        zipAura={WorkerV5CustomerZipMintAura}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Phạm vi hiện tại', 'Current scope')}
        title={textByLanguage(language, 'Yêu cầu', 'Request')}
      />
      <WorkerV5OfferDetailListCard
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        iconSources={workerV5OfferDetailIcons}
        reduceTransparency={reduceTransparency}
        rows={requestRows}
        scope="OfferRequestList"
        testID="worker-v5-offer-request-list"
        zipAura={WorkerV5CustomerZipMintAura}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, `${passedCount}/${checks.length} điều kiện`, `${passedCount}/${checks.length} checks`)}
        title={textByLanguage(language, 'Sẵn sàng nhận việc', 'Ready to accept')}
      />
      <WorkerV5AcceptChecklistCard
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        checks={checks}
        reduceTransparency={reduceTransparency}
        zipAura={WorkerV5CustomerZipMintAura}
      />
      <WorkerV5AcceptCommitmentCard
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        clockIcon={workerV5OfferDetailIcons.clock}
        deal={deal}
        language={language}
        reduceTransparency={reduceTransparency}
        zipAura={WorkerV5CustomerZipMintAura}
      />
      {runtime.state.lastError ? (
        <WorkerV5BoundaryNote
          title={textByLanguage(language, 'Chưa cập nhật được', 'Could not update')}
          body={runtime.state.lastError}
        />
      ) : null}
      <WorkerV5ActionRail
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        primaryButtonFill={WorkerV5PrimaryButtonFill}
        zipAura={WorkerV5CustomerZipMintAura}
        onPrimary={canAccept ? () => void confirmAccept() : undefined}
        onSecondary={canDecline ? () => void declineOffer() : undefined}
        primary={acceptBusy ? textByLanguage(language, 'Đang nhận việc', 'Accepting') : textByLanguage(language, 'Nhận việc', 'Accept job')}
        primaryDisabled={!canAccept || acceptBusy}
        primaryTestID="worker-v5-accept-confirm-action"
        reduceTransparency={reduceTransparency}
        secondary={declineBusy ? textByLanguage(language, 'Đang từ chối', 'Declining') : textByLanguage(language, 'Từ chối', 'Decline')}
        secondaryTestID="worker-v5-offer-decline-action"
      />
    </View>
  )
}

export function WorkerV5CustomerConfirmationWaitBody({
  language,
  runtime,
}: {
  language: AppLanguage
  runtime: WorkerV5Runtime
}) {
  const deal = runtime.state.deal
  const code = workerV5DisplayCode(deal, language)
  const service = deal ? localizedServiceLabel(deal.draft.serviceType, language) : null

  return (
    <View
      accessibilityLiveRegion="polite"
      style={styles.customerConfirmationWait}
      testID="worker-v5-customer-confirmation-wait"
    >
      <View style={styles.customerConfirmationWaitRule} />
      <View style={styles.customerConfirmationWaitStatusRow}>
        <View style={styles.customerConfirmationWaitDot} />
        <Text style={styles.customerConfirmationWaitStatus}>
          {textByLanguage(language, 'Đã gửi nhận việc', 'Acceptance sent')}
        </Text>
      </View>
      <Text style={styles.customerConfirmationWaitTitle}>
        {textByLanguage(
          language,
          'Đang chờ khách xác nhận bạn cho công việc này.',
          'Waiting for the customer to confirm you for this job.',
        )}
      </Text>
      <Text style={styles.customerConfirmationWaitBody}>
        {textByLanguage(
          language,
          'NestScout sẽ tự mở bước di chuyển khi khách chọn bạn. Địa chỉ chi tiết và thao tác thi công vẫn được khóa trong lúc chờ.',
          'NestScout will open travel after the customer chooses you. Exact address and execution actions remain locked while waiting.',
        )}
      </Text>
      {service || code ? (
        <Text style={styles.customerConfirmationWaitMeta}>
          {[service, code ? textByLanguage(language, `Mã việc ${code}`, `Work ${code}`) : null].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </View>
  )
}

