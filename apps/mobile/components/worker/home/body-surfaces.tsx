import type { ComponentType, ReactNode } from 'react'
import { View, type ImageSourcePropType } from 'react-native'
import type { LocalDeal } from '@nestscout/shared'

import { localizedServiceLabel, localizedStatusLabel, type AppLanguage } from '@/lib/app-language'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

import type { WorkerV5IconName } from '../dock/types'
import {
  WorkerV5CustomerCaseWideMintAura,
  WorkerV5CustomerZipMintAura,
} from '../ui/aura-surfaces'
import { WorkerV5SectionHeader } from '../ui/primitives-surfaces'
import {
  canShowWorkerAddress,
  formatWorkerDistrict,
  routeDestinationLabel,
  workerDocumentSummary,
  workerV5ShiftProfileCoverageLabel,
  workerVerificationLabel,
} from '../ui/labels'
import { textByLanguage } from '../ui/format'
import { buildWorkerV5SchedulePlan } from '../jobs/schedule'
import {
  WorkerV5ScheduleSummaryCard,
  WorkerV5ShiftSummaryCard,
  WorkerV5SourceRowList,
} from '../jobs/source-surfaces'
import {
  WorkerV5ScheduleActionRow,
  WorkerV5ScheduleEmptyState,
  WorkerV5ScheduleList,
} from '../jobs/surfaces'
import { WorkerV5KaelBriefCard } from './action-surfaces'
import { styles } from './body-styles'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
type WorkerV5IconMap = Record<WorkerV5IconName, ImageSourcePropType>
type WorkerV5PrimaryFillComponent = ComponentType<{
  disabled: boolean
  variant?: 'default' | 'source'
}>

function buildWorkerV5ShiftSummaryCopy(
  profile: WorkerV5Runtime['workerProfile'],
  deal: LocalDeal | null,
  language: AppLanguage,
  buildDealSummary: (deal: LocalDeal | null, language: AppLanguage) => string,
) {
  if (deal?.broadcast?.status === 'sent') {
    return {
      kicker: textByLanguage(language, 'CƠ HỘI THẬT', 'REAL OPPORTUNITY'),
      meta: buildDealSummary(deal, language),
      title: textByLanguage(language, 'Có cơ hội cần xem', 'Opportunity needs review'),
    }
  }

  if (deal) {
    return {
      meta: buildDealSummary(deal, language),
      title: localizedStatusLabel(deal.status, language),
    }
  }

  if (!profile) {
    return {
      meta: textByLanguage(language, 'Đang nhập tài khoản thợ để tải dữ liệu thật', 'Sign in as a worker to load live data'),
      title: textByLanguage(language, 'Chưa có hồ sơ thợ', 'No worker profile'),
    }
  }

  if (profile.is_suspended) {
    return {
      meta: workerVerificationLabel(profile.verification_status, language),
      title: textByLanguage(language, 'Hồ sơ đang bị tạm ngưng', 'Profile is suspended'),
    }
  }

  if (!profile.is_approved) {
    return {
      meta: workerDocumentSummary(profile, language),
      title: workerVerificationLabel(profile.verification_status, language),
    }
  }

  if (!profile.is_available) {
    return {
      meta: workerV5ShiftProfileCoverageLabel(profile, language),
      title: textByLanguage(language, 'Đang tắt nhận cơ hội', 'Opportunity receiving is off'),
    }
  }

  return {
    meta: workerV5ShiftProfileCoverageLabel(profile, language),
    title: textByLanguage(language, 'Đang mở nhận cơ hội', 'Open for opportunities'),
  }
}

function buildWorkerV5ShiftDemandRow(
  profile: WorkerV5Runtime['workerProfile'],
  deal: LocalDeal | null,
  language: AppLanguage,
  buildDealSummary: (deal: LocalDeal | null, language: AppLanguage) => string,
) {
  if (deal?.broadcast?.status === 'sent') {
    return {
      icon: 'map' as const,
      meta: buildDealSummary(deal, language),
      status: textByLanguage(language, 'Có tín hiệu', 'Signal'),
      title: deal.broadcast.generalArea
        ? textByLanguage(language, `${deal.broadcast.generalArea} có nhu cầu`, `${deal.broadcast.generalArea} has demand`)
        : textByLanguage(language, 'Có cơ hội thật', 'Real opportunity'),
    }
  }

  if (deal) {
    return {
      icon: 'map' as const,
      meta: buildDealSummary(deal, language),
      status: textByLanguage(language, 'Có việc', 'Active'),
      title: localizedStatusLabel(deal.status, language),
    }
  }

  return {
    icon: 'map' as const,
    meta: textByLanguage(language, 'Chỉ hiện mức nhu cầu khi hệ thống có tín hiệu đã xác thực', 'Demand appears only with verified system signals'),
    status: textByLanguage(language, 'Chờ', 'Waiting'),
    title: profile?.districts?.length
      ? textByLanguage(language, `${formatWorkerDistrict(profile.districts[0], language)} trong phạm vi`, `${formatWorkerDistrict(profile.districts[0], language)} in range`)
      : textByLanguage(language, 'Chưa có vùng nhu cầu', 'No demand area'),
  }
}

function buildWorkerV5ClientMissionRows(deal: LocalDeal | null, language: AppLanguage) {
  if (!deal) {
    return [
      {
        icon: 'jobs' as const,
        meta: textByLanguage(language, 'Chỉ hiển thị khi có yêu cầu thật từ khách', 'Shown only when a real client request exists'),
        status: textByLanguage(language, 'Chờ', 'Waiting'),
        title: textByLanguage(language, 'Chưa có nhiệm vụ từ khách', 'No client mission yet'),
      },
      {
        icon: 'map' as const,
        meta: textByLanguage(language, 'Đợi khách gửi yêu cầu có điểm hẹn thật', 'Waiting for a client request with a real appointment'),
        status: textByLanguage(language, 'Chưa có', 'None'),
        title: textByLanguage(language, 'Chưa có điểm hẹn', 'No appointment point'),
      },
    ]
  }

  const service = localizedServiceLabel(deal.draft.serviceType, language)
  const problem = deal.broadcast?.problemSummary || deal.draft.problemChips[0] || deal.draft.description
  const destination = routeDestinationLabel(deal, language)
  const addressOpen = canShowWorkerAddress(deal)

  return [
    {
      icon: 'jobs' as const,
      meta: problem,
      status: deal.broadcast?.status === 'sent'
        ? textByLanguage(language, 'Cần xem', 'Review')
        : localizedStatusLabel(deal.status, language),
      title: service,
    },
    {
      icon: addressOpen ? 'map' as const : 'shield' as const,
      meta: destination,
      status: addressOpen
        ? textByLanguage(language, 'Đã mở', 'Open')
        : textByLanguage(language, 'Ẩn chi tiết', 'Hidden'),
      title: addressOpen
        ? textByLanguage(language, 'Điểm hẹn của khách', 'Client appointment')
        : textByLanguage(language, 'Điểm hẹn chưa mở', 'Appointment locked'),
    },
  ]
}

export function WorkerV5ShiftBriefBody({
  buildDealSummary,
  icons,
  language,
  reduceTransparency,
  runtime,
}: {
  buildDealSummary: (deal: LocalDeal | null, language: AppLanguage) => string
  icons: WorkerV5IconMap
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const profile = runtime.workerProfile
  const deal = runtime.state.deal
  const summaryCopy = buildWorkerV5ShiftSummaryCopy(profile, deal, language, buildDealSummary)
  const demandRow = buildWorkerV5ShiftDemandRow(profile, deal, language, buildDealSummary)
  const missionRows = buildWorkerV5ClientMissionRows(deal, language)

  return (
    <View style={styles.sectionStack}>
      <WorkerV5ShiftSummaryCard
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        icon="calendar"
        icons={icons}
        meta={summaryCopy.meta}
        reduceTransparency={reduceTransparency}
        title={summaryCopy.title}
        zipAura={WorkerV5CustomerZipMintAura}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Kael tổng hợp', 'Kael summary')}
        title={textByLanguage(language, 'CẢNH BÁO & NHU CẦU', 'ALERTS AND DEMAND')}
      />
      <WorkerV5SourceRowList
        auraTestID="worker-v5-shift-demand-mint-aura"
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        icons={icons}
        scope="ShiftDemand"
        reduceTransparency={reduceTransparency}
        rows={[
          demandRow,
          {
            icon: 'shield',
            meta: textByLanguage(language, 'Chỉ check-in khi có mặt tại điểm hẹn hoặc có bằng chứng thủ công', 'Check in only on site or with manual evidence'),
            status: textByLanguage(language, 'Bắt buộc', 'Required'),
            title: textByLanguage(language, 'Nhắc quy trình check-in', 'Check-in protocol'),
          },
        ]}
        testID="worker-v5-shift-demand-list"
        variant="shift"
        zipAura={WorkerV5CustomerZipMintAura}
      />
      <WorkerV5SectionHeader
        action={deal ? textByLanguage(language, 'Theo việc thật', 'From real work') : textByLanguage(language, 'Chờ nhiệm vụ', 'Waiting mission')}
        title={textByLanguage(language, 'NHIỆM VỤ TỪ KHÁCH', 'CLIENT MISSIONS')}
      />
      <WorkerV5SourceRowList
        auraTestID="worker-v5-shift-priority-mint-aura"
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        icons={icons}
        scope="ShiftPriority"
        reduceTransparency={reduceTransparency}
        rows={missionRows}
        testID="worker-v5-shift-priority-list"
        variant="shift"
        zipAura={WorkerV5CustomerZipMintAura}
      />
    </View>
  )
}

export function WorkerV5ScheduleBody({
  icons,
  language,
  onCustomize,
  onUseSchedule,
  primaryFill,
  reduceTransparency,
  runtime,
}: {
  icons: WorkerV5IconMap
  language: AppLanguage
  onCustomize: () => void
  onUseSchedule: () => void
  primaryFill: WorkerV5PrimaryFillComponent
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const deal = runtime.state.deal
  const schedulePlan = buildWorkerV5SchedulePlan(deal, runtime.workerJobs, language)

  return (
    <View style={styles.sectionStack}>
      <WorkerV5ScheduleSummaryCard
        amount={schedulePlan.amount}
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        lensLabel={schedulePlan.lensLabel}
        lensValue={schedulePlan.lensValue}
        meta={schedulePlan.meta}
        reduceTransparency={reduceTransparency}
        zipAura={WorkerV5CustomerZipMintAura}
      />
      <WorkerV5SectionHeader
        action={schedulePlan.actionLabel}
        title={textByLanguage(language, 'Lịch trình', 'Schedule')}
      />
      {schedulePlan.rows.length > 0 ? (
        <>
          <WorkerV5ScheduleList
            reduceTransparency={reduceTransparency}
            rows={schedulePlan.rows}
          />
          <WorkerV5KaelBriefCard
            auraScope="SmartScheduleKaelBrief"
            body={schedulePlan.kaelBody}
            caseWideAura={WorkerV5CustomerCaseWideMintAura}
            icon="chat"
            icons={icons}
            reduceTransparency={reduceTransparency}
            title={schedulePlan.kaelTitle}
            zipAura={WorkerV5CustomerZipMintAura}
          />
        </>
      ) : (
        <WorkerV5ScheduleSupportAuraGroup reduceTransparency={reduceTransparency}>
          <WorkerV5ScheduleEmptyState
            calendarIcon={icons.calendar}
            caseWideAura={WorkerV5CustomerCaseWideMintAura}
            language={language}
            reduceTransparency={reduceTransparency}
            zipAura={WorkerV5CustomerZipMintAura}
          />
          <WorkerV5KaelBriefCard
            auraScope="SmartScheduleKaelBrief"
            body={schedulePlan.kaelBody}
            caseWideAura={WorkerV5CustomerCaseWideMintAura}
            icon="chat"
            icons={icons}
            reduceTransparency={reduceTransparency}
            title={schedulePlan.kaelTitle}
            zipAura={WorkerV5CustomerZipMintAura}
          />
        </WorkerV5ScheduleSupportAuraGroup>
      )}
      <WorkerV5ScheduleActionRow
        onCustomize={onCustomize}
        onUseSchedule={onUseSchedule}
        primary={textByLanguage(language, 'Dùng lịch này', 'Use this schedule')}
        primaryFill={primaryFill}
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Tùy chỉnh', 'Customize')}
      />
    </View>
  )
}

export function WorkerV5ScheduleSupportAuraGroup({
  children,
  reduceTransparency,
}: {
  children: ReactNode
  reduceTransparency: boolean
}) {
  return (
    <View style={styles.scheduleSupportAuraGroup} testID="worker-v5-schedule-support-aura-group">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura
            scope="SmartScheduleSupportGroup"
            style={styles.scheduleSupportAura}
            testID="worker-v5-schedule-support-mint-aura"
          />
          <WorkerV5CustomerZipMintAura
            scope="SmartScheduleSupportFine"
            style={styles.scheduleSupportZipAura}
            testID="worker-v5-schedule-support-zip-mint-aura"
          />
        </>
      ) : null}
      <View style={styles.scheduleSupportContent}>{children}</View>
    </View>
  )
}
